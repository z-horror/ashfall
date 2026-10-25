#!/usr/bin/env bash
# ==============================================================================
# ASHFALL — Автоматический бэкап PostgreSQL базы данных
# ==============================================================================

set -euo pipefail

BACKUP_DIR="/var/backups/ashfall"
TAG="${1:-daily}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="ashfall_backup_${TAG}_${TIMESTAMP}.sql.gz"
TARGET_PATH="${BACKUP_DIR}/${FILENAME}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

DIR="/opt/ashfall"
if [ ! -d "$DIR" ] && [ -f "./docker-compose.yml" ]; then
  DIR="$(pwd)"
fi

cd "$DIR"

# Проверяем работу контейнера db
if ! docker compose ps | grep -q "db.*Up"; then
  echo "[backup] Ошибка: контейнер базы данных 'db' не запущен!" >&2
  exit 1
fi

echo "[backup] Создание дампа базы данных в $TARGET_PATH..."

docker compose exec -T db pg_dump -U ashfall -d ashfall --clean --if-exists | gzip > "$TARGET_PATH"
chmod 600 "$TARGET_PATH"

SIZE=$(du -h "$TARGET_PATH" | cut -f1)
echo "[backup] Дамп успешно создан. Размер: $SIZE"

# Политика ротации: удаляем бэкапы старше 7 дней
echo "[backup] Очистка бэкапов старше 7 дней..."
find "$BACKUP_DIR" -type f -name "ashfall_backup_*.sql.gz" -mtime +7 -delete

echo "[backup] Готово."
