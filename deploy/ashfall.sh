#!/usr/bin/env bash
# ==============================================================================
# ASHFALL — Утилита управления сервером и обновлениями
# ==============================================================================

set -euo pipefail

# Каталог установки Ashfall
DIR="/opt/ashfall"
if [ ! -d "$DIR" ] && [ -f "./docker-compose.yml" ]; then
  DIR="$(pwd)"
fi

cd "$DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

help() {
  echo -e "${BOLD}Ashfall Server Management CLI${NC}"
  echo "Использование: ashfall <команда> [параметры]"
  echo ""
  echo "Команды:"
  echo "  status            Проверить статус контейнеров, ресурсов и healthcheck"
  echo "  update            Обновить проект из Git (main), создать бэкап и пересобрать"
  echo "  logs [service]    Смотреть живые логи (caddy, server, client, db)"
  echo "  restart [service] Перезапустить контейнеры"
  echo "  invite [note]     Сгенерировать новый инвайт-код закрытого теста"
  echo "  backup            Создать резервную копию базы данных"
  echo "  restore <file>    Восстановить базу данных из резервной копии"
  echo "  exec <service> .. Выполнить команду внутри контейнера"
  echo "  help              Показать эту справку"
}

CMD="${1:-help}"

case "$CMD" in
  status)
    echo -e "${BOLD}=== Контейнеры Ashfall ===${NC}"
    docker compose ps
    echo ""
    echo -e "${BOLD}=== Проверка Healthcheck ===${NC}"
    if docker compose exec -T server node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2))).catch(e=>{console.error(e.message);process.exit(1)})" 2>/dev/null; then
      echo -e "${GREEN}✓ Сервер активен и работает корректно.${NC}"
    else
      echo -e "${RED}✗ Ошибка проверки сервера! Проверьте логи: ashfall logs server${NC}"
    fi
    echo ""
    echo -e "${BOLD}=== Использование ресурсов ===${NC}"
    docker stats --no-stream $(docker compose ps -q) 2>/dev/null || true
    ;;

  update)
    echo -e "${CYAN}=== Обновление Ashfall ===${NC}"
    # 1. Проверяем локальные незакоммиченные файлы
    if [ -n "$(git status --porcelain)" ]; then
      echo -e "${YELLOW}Внимание: в каталоге есть локальные изменения:${NC}"
      git status -s
      read -r -p "Сбросить локальные изменения (git stash)? [y/N]: " CONFIRM
      if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
        git stash
      else
        echo -e "${RED}Обновление прервано пользователем.${NC}"
        exit 1
      fi
    fi

    # 2. Создаем предварительный бэкап перед обновлением
    echo -e "${CYAN}Создание резервной копии базы перед обновлением...${NC}"
    bash "$DIR/deploy/backup.sh" "pre_update"

    # 3. Подтягиваем свежий код
    echo -e "${CYAN}Получение последних изменений из Git (ветка main)...${NC}"
    git fetch origin main
    git checkout main
    git pull origin main

    # 4. Пересобираем и запускаем контейнеры
    echo -e "${CYAN}Пересборка контейнеров...${NC}"
    docker compose up -d --build

    # 5. Ожидаем готовности
    echo -e "${CYAN}Проверка статуса после обновления...${NC}"
    sleep 5
    if docker compose exec -T server node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
      echo -e "${GREEN}${BOLD}✓ Обновление успешно завершено!${NC}"
      echo -e "Текущий коммит: $(git log -1 --oneline)"
    else
      echo -e "${YELLOW}Сервер ещё перезапускается. Проверьте 'ashfall status' через несколько секунд.${NC}"
    fi
    ;;

  logs)
    SERVICE="${2:-}"
    if [ -n "$SERVICE" ]; then
      docker compose logs -f --tail=100 "$SERVICE"
    else
      docker compose logs -f --tail=100
    fi
    ;;

  restart)
    SERVICE="${2:-}"
    if [ -n "$SERVICE" ]; then
      echo -e "${CYAN}Перезапуск $SERVICE...${NC}"
      docker compose restart "$SERVICE"
    else
      echo -e "${CYAN}Перезапуск всех сервисов...${NC}"
      docker compose restart
    fi
    echo -e "${GREEN}Готово.${NC}"
    ;;

  invite)
    NOTE="${2:-Создан через CLI ashfall}"
    RAND_CODE="ASH-$(openssl rand -hex 2 | tr '[:lower:]' '[:upper:]')-$(openssl rand -hex 2 | tr '[:lower:]' '[:upper:]')"
    docker compose exec -T db psql -U ashfall -d ashfall -c \
      "INSERT INTO invite_codes(code, max_uses, note, expires_at) VALUES ('$RAND_CODE', 1, '$NOTE', now() + interval '30 days');" >/dev/null
    echo -e "${GREEN}${BOLD}Новый инвайт-код создан:${NC} ${BOLD}${RAND_CODE}${NC}"
    echo -e "Примечание: ${NOTE}"
    echo -e "Лимит: 1 использование, действует 30 дней."
    ;;

  backup)
    bash "$DIR/deploy/backup.sh" "manual"
    ;;

  restore)
    FILE="${2:-}"
    if [ -z "$FILE" ]; then
      echo -e "${RED}Укажите путь к файлу бэкапа.${NC}"
      echo "Пример: ashfall restore /var/backups/ashfall/ashfall_backup_20261025.sql.gz"
      exit 1
    fi
    if [ ! -f "$FILE" ]; then
      echo -e "${RED}Файл $FILE не найден!${NC}"
      exit 1
    fi
    echo -e "${YELLOW}${BOLD}ВНИМАНИЕ! Текущая база данных будет перезаписана из архива $FILE.${NC}"
    read -r -p "Вы уверены, что хотите продолжить? [y/N]: " CONFIRM
    if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
      echo "Восстановление отменено."
      exit 0
    fi

    echo -e "${CYAN}Остановка игрового сервера...${NC}"
    docker compose stop server client

    echo -e "${CYAN}Восстановление базы данных...${NC}"
    if [[ "$FILE" == *.gz ]]; then
      gunzip -c "$FILE" | docker compose exec -T db psql -U ashfall -d ashfall
    else
      cat "$FILE" | docker compose exec -T db psql -U ashfall -d ashfall
    fi

    echo -e "${CYAN}Запуск сервисов...${NC}"
    docker compose start server client
    echo -e "${GREEN}База данных успешно восстановлена.${NC}"
    ;;

  exec)
    shift
    docker compose exec "$@"
    ;;

  help|--help|-h)
    help
    ;;

  *)
    echo -e "${RED}Неизвестная команда: $CMD${NC}\n"
    help
    exit 1
    ;;
esac
