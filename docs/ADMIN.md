# Ashfall: административные права и DEV

## Что именно даёт доступ к DEV

DEV-команды проверяются **на сервере** в `Simulation.isPlayerAdmin()`. Основное разрешение — поле
`users.is_admin` в PostgreSQL. Оно читается при авторизации WebSocket-сессии и передаётся в
`Simulation.join()`.

Отдельно существуют:

- `ALLOW_DEV_ACTIONS=true` — явный серверный аварийный режим, при котором DEV разрешён всем.
  В обычной эксплуатации должен быть `false`.
- `ADMIN_USERS=User1,User2` — устаревший allowlist по имени пользователя. Оставлен для
  совместимости; для выдачи прав используйте `users.is_admin`.
- Пароль `/admin` (`ADMIN_PASSWORD`) — это **только** вход в веб-панель. Он не даёт игровому
  персонажу права DEV.

Публичного endpoint для выдачи `is_admin` нет. Роль назначается CLI-командой с доступом к БД.

## Условия

1. Должна быть доступна реальная PostgreSQL из `DATABASE_URL`.
2. Схема должна быть применена: таблица `users` с колонкой `is_admin` создаётся миграцией
   `002_invites_and_admin.sql`.
3. Пользователь должен уже существовать. CLI не создаёт пользователей и не меняет пароли.
4. В email-поля в текущей схеме нет. Идентификация выполняется по `users.id` или `username`.

CLI отказывается работать с `pg-mem`/in-memory fallback, чтобы не создавать иллюзию выдачи прав.

## Локальная команда

Из корня репозитория:

```bash
npm run admin:role -- --id 42
npm run admin:role -- --username Survivor_ABCDEF
npm run admin:role -- --id 42 --revoke
```

`--id` и `--username` взаимоисключающие; указывать нужно ровно один. Команда печатает
`is_admin=true/false` и завершается с ошибкой, если пользователь не найден или аргументы
некорректны.

Перед запуском локально должен быть доступен PostgreSQL и выполнены миграции:

```bash
docker compose up -d db
npm run migrate
npm run admin:role -- --username Survivor_ABCDEF
```

## Команда на VPS в Docker

Сначала обновите образы/сервер, чтобы в контейнере появился собранный CLI:

```bash
cd /opt/ashfall
ashfall update
```

Затем:

```bash
docker compose exec server node server/dist/cli/admin-role.js --id 42
docker compose exec server node server/dist/cli/admin-role.js --username Survivor_ABCDEF
docker compose exec server node server/dist/cli/admin-role.js --id 42 --revoke
```

Команда использует `DATABASE_URL` контейнера `server`. Не требуется публичный HTTP-endpoint,
пароль или токен в коде.

## Применение роли

После выдачи роли игрок должен **переподключиться**: выйти и войти снова либо перезапустить
клиент. Уже открытая WebSocket-сессия хранит старое значение `isAdmin` до повторного join.

Проверка:

1. Команда CLI выводит `is_admin=true`.
2. После повторного входа в игре открывается DEV-панель.
3. DEV-действие, например «Восстановить здоровье», выполняется без сообщения
   «требуются права администратора».
4. `ALLOW_DEV_ACTIONS` в `.env` должен быть `false`, иначе проверка станет общей для всех.

SQL-проверка (только чтение):

```sql
SELECT id, username, is_admin FROM users WHERE id = 42;
```

## Отзыв и безопасность

- `--revoke` снимает `is_admin`; после переподключения DEV снова запрещён.
- Не включайте `ALLOW_DEV_ACTIONS=true` на публичном сервере.
- Не выдавайте `is_admin` массово и не используйте гостевые аккаунты для постоянных прав.
- CLI не печатает хеши паролей и не меняет другие поля пользователя.
- Если PostgreSQL недоступен, команда завершится ошибкой и не запишет роль в память.
