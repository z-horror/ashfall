#!/usr/bin/env bash
# ==============================================================================
# ASHFALL — Автоматический установщик на чистый VPS (Ubuntu LTS)
# 
# Запуск одной командой:
# curl -fsSL https://raw.githubusercontent.com/z-horror/ashfall/main/deploy/install.sh -o install.sh && sudo bash install.sh
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

log_info() { echo -e "${CYAN}[ASHFALL]${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[ПРЕДУПРЕЖДЕНИЕ]${NC} $1"; }
log_err() { echo -e "${RED}[ОШИБКА]${NC} $1" >&2; }

# 1. Проверка прав root
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  log_err "Скрипт должен быть запущен с правами root (используйте sudo bash install.sh)"
  exit 1
fi

echo -e "${BOLD}${BLUE}"
echo "    █████   ██████  ██   ██ ███████  █████  ██      ██     "
echo "   ██   ██ ██       ██   ██ ██      ██   ██ ██      ██     "
echo "   ███████ ███████  ███████ █████   ███████ ██      ██     "
echo "   ██   ██      ██  ██   ██ ██      ██   ██ ██      ██     "
echo "   ██   ██ ██████   ██   ██ ██      ██   ██ ███████ ███████ "
echo -e "${NC}"
echo -e "${BOLD}Установка игрового сервера Ashfall: Серый квартал${NC}\n"

# 2. Проверка операционной системы
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS_NAME="${ID:-unknown}"
  OS_VER="${VERSION_ID:-}"
  log_info "Определена операционная система: $PRETTY_NAME"
else
  log_warn "Не удалось определить дистрибутив. Предполагается Debian/Ubuntu."
  OS_NAME="ubuntu"
fi

if [[ "$OS_NAME" != "ubuntu" && "$OS_NAME" != "debian" ]]; then
  log_warn "Рекомендуется Ubuntu LTS (20.04/22.04/24.04). Продолжаем на $OS_NAME..."
fi

# 3. Проверка доступной оперативной памяти и Swap
TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
log_info "Оперативная память: ${TOTAL_RAM_MB} MB (Swap: ${SWAP_MB} MB)"

if [ "$TOTAL_RAM_MB" -lt 1800 ] && [ "$SWAP_MB" -lt 1024 ]; then
  log_warn "На VPS меньше 2 ГБ RAM. Для надежной сборки Docker создаем swap-файл на 2 ГБ..."
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    if ! grep -q "/swapfile" /etc/fstab; then
      echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    log_ok "Swap-файл 2 ГБ успешно создан и активирован."
  fi
fi

# 4. Проверка занятости портов 80 и 443
for port in 80 443; do
  if ss -tuln | grep -q ":$port "; then
    OCCUPIER=$(ss -tulpn | grep ":$port " | awk '{print $NF}' | head -n1 || true)
    log_warn "Порт $port уже занят ($OCCUPIER). Если это системный nginx/apache, освободите порт:"
    echo "  sudo systemctl stop nginx apache2 2>/dev/null || true"
  fi
done

# 5. Установка необходимых системных утилит
log_info "Обновление списка пакетов и установка зависимостей..."
apt-get update -qq
apt-get install -y -qq curl wget git jq openssl ca-certificates gnupg lsb-release iptables >/dev/null

# 6. Проверка и установка Docker & Docker Compose
if ! command -v docker &> /dev/null; then
  log_info "Docker не найден. Устанавливаем официальный Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  log_ok "Docker установлен."
else
  log_ok "Docker уже установлен: $(docker --version)"
fi

if ! docker compose version &> /dev/null; then
  log_info "Устанавливаем плагин docker-compose-plugin..."
  apt-get install -y -qq docker-compose-plugin >/dev/null || true
  if ! docker compose version &> /dev/null; then
    log_err "Не удалось настроить docker compose."
    exit 1
  fi
fi
log_ok "Docker Compose готов: $(docker compose version)"

# 7. Определение директории проекта
REPO_URL="https://github.com/z-horror/ashfall.git"
BRANCH="main"
INSTALL_DIR="/opt/ashfall"

if [ -f "$(pwd)/docker-compose.yml" ] && [ -d "$(pwd)/server" ]; then
  INSTALL_DIR="$(pwd)"
  log_info "Установка запускается прямо из текущего клона репозитория: $INSTALL_DIR"
else
  if [ ! -d "$INSTALL_DIR" ]; then
    log_info "Клонируем репозиторий Ashfall в $INSTALL_DIR..."
    git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
  else
    log_info "Каталог $INSTALL_DIR уже существует. Обновляем ветку $BRANCH..."
    cd "$INSTALL_DIR"
    git fetch origin "$BRANCH"
    git checkout "$BRANCH"
    git pull origin "$BRANCH"
  fi
fi

cd "$INSTALL_DIR"

# 8. Интерактивный или автоматический опрос параметров
# Определяем внешний IP сервера
PUBLIC_IP=$(curl -s https://api.ipify.org || curl -s https://ifconfig.me || echo "127.0.0.1")

echo ""
echo -e "${BOLD}--- Настройка параметров развёртывания ---${NC}"

# Проверяем, существует ли уже .env
if [ -f "$INSTALL_DIR/.env" ]; then
  log_info "Найден существующий файл .env. Сохраняем текущие пароли и настройки."
  EXISTING_DOMAIN=$(grep -E '^APP_DOMAIN=' .env | cut -d '=' -f2- | tr -d '"' || true)
  EXISTING_ADMIN_PASS=$(grep -E '^ADMIN_PASSWORD=' .env | cut -d '=' -f2- | tr -d '"' || true)
  EXISTING_PG_PASS=$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d '=' -f2- | tr -d '"' || true)
  EXISTING_SEED=$(grep -E '^WORLD_SEED=' .env | cut -d '=' -f2- | tr -d '"' || true)
fi

DEFAULT_DOMAIN="${EXISTING_DOMAIN:-$PUBLIC_IP}"
if [ -t 0 ]; then
  read -r -p "Введите домен для игры (или нажмите Enter для '$DEFAULT_DOMAIN'): " USER_DOMAIN
  APP_DOMAIN="${USER_DOMAIN:-$DEFAULT_DOMAIN}"
else
  APP_DOMAIN="$DEFAULT_DOMAIN"
fi

# Генерируем криптостойкие пароли, если их нет
ADMIN_PASSWORD="${EXISTING_ADMIN_PASS:-$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 18)}"
POSTGRES_PASSWORD="${EXISTING_PG_PASS:-$(openssl rand -hex 16)}"
WORLD_SEED="${EXISTING_SEED:-greywater-$(openssl rand -hex 2)}"

log_info "Формируем конфигурацию .env..."

cat > "$INSTALL_DIR/.env" <<EOF
# Сгенерировано автоматическим установщиком Ashfall
APP_DOMAIN=${APP_DOMAIN}

NODE_ENV=production
PORT=3000

POSTGRES_DB=ashfall
POSTGRES_USER=ashfall
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgres://ashfall:${POSTGRES_PASSWORD}@db:5432/ashfall
MIGRATE_ON_START=true

REQUIRE_INVITES=true
ALLOW_GUEST_LOGIN=false
ADMIN_PASSWORD=${ADMIN_PASSWORD}

WORLD_SEED=${WORLD_SEED}
TICK_HZ=20
SNAPSHOT_HZ=12
AOI_RADIUS=28
CHUNK_RADIUS=1

SESSION_TTL_HOURS=168
MAX_MESSAGE_BYTES=16384
MAX_MESSAGES_PER_SEC=90

TEST_COMBAT_BUFFS=false
ALLOW_DEV_ACTIONS=false
ADMIN_USERS=
EOF

chmod 600 "$INSTALL_DIR/.env"
log_ok "Файл .env создан с защищёнными правами (chmod 600)."

# 9. Установка утилиты управления ashfall в /usr/local/bin
log_info "Устанавливаем CLI-утилиту управления 'ashfall'..."
cp "$INSTALL_DIR/deploy/ashfall.sh" /usr/local/bin/ashfall
chmod +x /usr/local/bin/ashfall
log_ok "Команда 'ashfall' доступна в терминале."

# 10. Настройка ежедневных резервных копий
mkdir -p /var/backups/ashfall
chmod 700 /var/backups/ashfall

cat > /etc/cron.d/ashfall-backup <<EOF
# Ежедневный бэкап базы данных Ashfall в 03:00
0 3 * * * root /bin/bash /opt/ashfall/deploy/backup.sh >> /var/log/ashfall-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/ashfall-backup
log_ok "Настроен автоматический ежедневный бэкап в /etc/cron.d/ashfall-backup (хранение 7 дней)."

# 11. Сборка и запуск контейнеров
log_info "Запуск контейнеров через Docker Compose (сборка клиента, сервера и БД)..."
docker compose up -d --build

# 12. Ожидание готовности сервера и проверка healthcheck
log_info "Ожидание запуска игрового сервера..."
READY=false
for i in {1..40}; do
  if docker compose ps | grep -q "server.*Up" && docker compose exec -T server node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    READY=true
    break
  fi
  sleep 2
done

if [ "$READY" = true ]; then
  log_ok "Сервер запущен и успешно отвечает на healthcheck."
else
  log_warn "Сервер стартует дольше обычного. Проверьте логи командой 'ashfall logs'."
fi

# 13. Генерация стартового инвайт-кода
STARTER_CODE="ASH-ALPHA-$(openssl rand -hex 2 | tr '[:lower:]' '[:upper:]')"
docker compose exec -T db psql -U ashfall -d ashfall -c \
  "INSERT INTO invite_codes(code, max_uses, note, expires_at) VALUES ('$STARTER_CODE', 10, 'Стартовый инвайт администратора', now() + interval '30 days') ON CONFLICT (code) DO NOTHING;" >/dev/null 2>&1 || true

# 14. Вывод итогов установки
PROTO="http"
if [[ "$APP_DOMAIN" != "$PUBLIC_IP" && "$APP_DOMAIN" != "localhost" && "$APP_DOMAIN" != "127.0.0.1" ]]; then
  PROTO="https"
fi

echo ""
echo -e "${BOLD}${GREEN}================================================================${NC}"
echo -e "${BOLD}${GREEN}        УСТАНОВКА ASHFALL УСПЕШНО ЗАВЕРШЕНА!                    ${NC}"
echo -e "${BOLD}${GREEN}================================================================${NC}"
echo ""
echo -e "  🌐 Игра доступна по адресу:  ${BOLD}${CYAN}${PROTO}://${APP_DOMAIN}${NC}"
echo -e "  🛡 Панель администратора:     ${BOLD}${CYAN}${PROTO}://${APP_DOMAIN}/admin${NC}"
echo -e "  🔑 Пароль администратора:    ${BOLD}${YELLOW}${ADMIN_PASSWORD}${NC}"
echo -e "  🎟 Стартовый инвайт-код:     ${BOLD}${GREEN}${STARTER_CODE}${NC} (на 10 регистраций)"
echo -e "  📂 Рабочий каталог:          ${INSTALL_DIR}"
echo ""
echo -e "${BOLD}Полезные команды управления сервером:${NC}"
echo -e "  ${BOLD}ashfall status${NC}           — Проверить статус контейнеров"
echo -e "  ${BOLD}ashfall logs${NC}             — Просмотр живых логов сервера"
echo -e "  ${BOLD}ashfall update${NC}           — Обновить игру до последней версии из Git"
echo -e "  ${BOLD}ashfall invite \"для кого\"${NC} — Сгенерировать новый инвайт-код в терминале"
echo -e "  ${BOLD}ashfall backup${NC}           — Создать резервную копию базы данных"
echo -e "  ${BOLD}ashfall restart${NC}          — Перезапустить все сервисы"
echo ""
echo -e "${YELLOW}Сохраните пароль администратора и стартовый инвайт-код!${NC}"
echo -e "${BOLD}${GREEN}================================================================${NC}"
EOF
