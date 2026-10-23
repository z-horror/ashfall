#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker compose ps db --status running >/dev/null 2>&1; then
  echo "[ashfall] starting PostgreSQL..."
  docker compose up -d db
fi

echo "[ashfall] waiting for PostgreSQL..."
for _ in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U "${POSTGRES_USER:-ashfall}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "[ashfall] applying migrations..."
npm run migrate >/dev/null

cleanup() {
  kill "${SERVER_PID:-}" "${CLIENT_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[ashfall] starting server on :${PORT:-3000}"
npm run dev:server &
SERVER_PID=$!

echo "[ashfall] starting client on :5173"
npm run dev:client &
CLIENT_PID=$!

wait -n "$SERVER_PID" "$CLIENT_PID"
