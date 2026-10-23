# Сетевой протокол v1

Транспорт: WebSocket, текстовые кадры JSON. HTTP используется только для входа/сессии и health. Версия: `PROTOCOL_VERSION = 1` в `shared/src/constants.ts`.

## 1. Подключение и авторизация

1. Клиент открывает `ws://host/ws` (в dev — через Vite proxy, в prod — через nginx).
2. Первое сообщение обязано быть:

```json
{ "t": "auth", "token": "<session-token>", "v": 1 }
```

3. Сервер проверяет SHA-256 токена в `sessions`, срок действия, затем загружает персонажа и отправляет `welcome` + `inventory` + чанки.
4. Таймаут авторизации — 8 секунд. Неверная/просроченная сессия → `error` с `code=AUTH_FAILED` и закрытие с кодом 4004.
5. `v` необязателен; если передан и не равен 1 → `VERSION`.

Токен выдаётся HTTP-эндпоинтами:

- `POST /api/auth/register` `{username,password}` → `{token,user:{id,name}}`
- `POST /api/auth/login` `{username,password}`
- `POST /api/auth/guest` `{}`
- `GET /api/me` с `Authorization: Bearer <token>`

Ошибки HTTP: 400 (валидация), 401 (неверные данные), 409 (имя занято), 429 (rate limit), 500.

## 2. Общие правила

- Все сообщения клиента валидируются Zod-схемой `clientMessageSchema` (shared/protocol.ts).
- Максимальный размер кадра — `MAX_MESSAGE_BYTES` (16 КиБ). Больше → `TOO_LARGE`.
- Rate limit — token bucket, `MAX_MESSAGES_PER_SEC` (90/с). Превышение → `RATE_LIMIT`, соединение не закрывается.
- `seq` — монотонный номер команды (клиент ведёт отдельный счётчик действий). Для `attack`, `interact`, `open_container`, `close_container`, `pickup`, `drop`, `transfer`, `use`, `equip`, `respawn` сервер отсекает `seq <= lastSeq[action]`. Это защита от повторной обработки при ретраях/дубликатах.
- `input.seq` не дедуплицируется, но обновляет `lastAck` и используется для диагностики.
- Клиент **никогда** не присылает свои координаты, урон, содержимое контейнера или результат атаки.
- Сервер шлёт JSON-сообщения из `ServerMessage` (shared/types.ts).

## 3. Клиент → сервер

| `t` | Поля | Описание |
|---|---|---|
| `auth` | `token`, `v?` | авторизация |
| `input` | `seq, mx, my, aim, sprint` | вектор движения −1..1, угол в радианах, бег |
| `attack` | `seq, aim?` | атака/выстрел; `aim` переопределяет текущий прицел |
| `interact` | `seq` | открыть/закрыть ближайшую дверь; иначе notice |
| `open_container` | `seq, id` | открыть контейнер по id (проверка расстояния ≤2.1) |
| `close_container` | `seq` | закрыть текущий контейнер |
| `pickup` | `seq, id` | поднять предмет с земли (≤1.5 тайла) |
| `drop` | `seq, id, qty` | выбросить 1..qty из своего стека |
| `transfer` | `seq, id, qty, dir` | `take` из контейнера или `put` в него |
| `use` | `seq, id` | съесть/выпить/бинт/таблетки |
| `equip` | `seq, id` | взять оружие в руки |
| `respawn` | `seq` | ручной respawn (сервер делает автоматически по таймеру) |
| `chat` | `text` | сообщение (≤140, rate limit 700 мс) |
| `ping` | `ts` |heartbeat/latency |

Пример:

```json
{ "t": "input", "seq": 4211, "mx": 0.707, "my": -0.707, "aim": 1.2, "sprint": true }
{ "t": "attack", "seq": 14, "aim": 1.15 }
{ "t": "transfer", "seq": 15, "id": "c3d...uuid", "qty": 2, "dir": "take" }
```

## 4. Сервер → клиент

### 4.1 welcome

```json
{
  "t": "welcome", "v": 1, "id": 42, "name": "Survivor_AB12CD",
  "spawn": {"x":48.5,"y":48.5}, "seed": "greywater-01", "time": 1730000000000,
  "characterId": 42,
  "x": 48.5, "y": 48.5, "aim": 0, "hp": 100, "stamina": 100,
  "hunger": 100, "thirst": 100, "status": "alive"
}
```

Клиент использует позицию/статус для инициализации предсказания и камеры. При reconnect welcome приходит повторно; чанки пересылаются.

### 4.2 chunk / chunk_unload

```json
{
  "t": "chunk",
  "chunk": {
    "cx": 1, "cy": 1,
    "tiles": "0:128,6:64,...",       // RLE: value:count, 1024 значения
    "walls": "0:900,1:8,...",         // RLE: 0 none, 1 brick, 2 concrete, 3 industrial, 4 interior
    "buildings": [{"id":"b:..","x":..,"y":..,"w":..,"h":..,"style":0,"name":"...","roof":true,"doorTiles":[{"x":..,"y":..}]}],
    "props": [{"id":"p:..","type":"car","x":..,"y":..,"w":2,"h":1,"variant":1,"blocking":true,"destructible":true,"hp":120,"maxHp":120,"containerId":"c:car:.."}],
    "doors": [{"id":"d:..","x":..,"y":..,"open":false,"locked":false,"hp":100}],
    "containers": [{"id":"c:..","type":"shelf","x":..,"y":..,"label":"Стеллаж"}]
  }
}
{ "t": "chunk_unload", "cx": 0, "cy": 0 }
```

- `tiles`: `TILE` enum (0 asphalt, 1 sidewalk, 2 grass, 3 dirt, 4 wood floor, 5 tile floor, 6 concrete, 7 rubble).
- Содержимое контейнеров **не** передаётся; только позиции/лейблы. Лут приходит через `inventory` после `open_container`.
- Prop может занимать несколько тайлов; `x,y` — верхний левый/опорный тайл. Клиент рендерит по anchor из `client/src/art/textures.ts`.
- Здания могут появляться в нескольких чанках на границе — клиент дедуплицирует по `id`.
- Клиент заменяет существующий чанк при повторном получении (reconnect).

### 4.3 snapshot (12 Гц)

```json
{
  "t": "snapshot", "tick": 12345, "time": 1730000000123, "online": 2,
  "self": {
    "id": 42, "x": 50.1, "y": 49.7, "aim": 1.2,
    "hp": 82, "maxHp": 100, "stamina": 64, "hunger": 97.2, "thirst": 95.8,
    "status": "dead", "respawnIn": 5320, "ack": 4211,
    "weapon": "bat", "equipped": "bat",
    "weight": 4.4, "maxWeight": 26, "slotCount": 6
  },
  "players": [
    {"id":43,"name":"...","x":52,"y":48,"aim":0.4,"hp":100,"maxHp":100,"stamina":90,"status":"alive","moving":true,"sprinting":false,"weapon":"knife","actionAt":1730000000000}
  ],
  "zombies": [
    {"id":"z:1:1:3","type":0,"x":56.2,"y":51.1,"aim":2.1,"hp":45,"maxHp":58,"state":"chase","moving":true,"actionAt":0}
  ],
  "items": [{"id":"uuid","key":"bandage","qty":2,"x":50.4,"y":48.9}],
  "events": [{"t":"hit","targetId":"z:1:1:3","x":56,"y":51,"damage":27,"source":"bat","by":42}]
}
```

- `self` всегда о текущем игроке, даже dead.
- `players` не содержит себя; только в AOI и с активным сокетом.
- `zombies` только в AOI.
- `items` — предметы на земле в AOI.
- `events` — накопленные события с последнего снимка, отфильтрованные по AOI (+12 тайлов). События без координат (chat/notice) приходят всем.
- `ack` — последний обработанный input seq.

### 4.4 inventory

```json
{
  "t": "inventory",
  "inv": {
    "items": [{"id":"uuid","key":"bat","qty":1,"equipped":true,"durability":1}],
    "weight": 4.4, "maxWeight": 26, "slots": 24, "equipped": "bat"
  },
  "container": {
    "id":"c:..","label":"Стеллаж","type":"shelf",
    "items":[{"id":"uuid","key":"canned_food","qty":2,"equipped":false,"durability":1}],
    "maxSlots": 16
  }
}
```

`container` приходит `null`, если контейнер не открыт. Клиент после такого сообщения закрывает панель контейнера.

### 4.5 Прочее

- `{"t":"error","code":"...","message":"..."}` — код и человекочитаемый текст.
- `{"t":"notice","text":"..."}` — уведомление (подбор, ошибка, системное).
- `{"t":"pong","ts":...}` — ответ на ping.

Коды ошибок: `BAD_JSON`, `BAD_MESSAGE`, `TOO_LARGE`, `RATE_LIMIT`, `NOT_AUTHENTICATED`, `AUTH_FAILED`, `AUTH_TIMEOUT`, `VERSION`, `JOIN_FAILED`.

## 5. События (`events[]`)

| `t` | Поля | Значение |
|---|---|---|
| `swing` | `playerId,x,y,aim,weapon` | замах ближнего боя |
| `shot` | `playerId,x,y,aim,weapon` | выстрел |
| `hit` | `targetId,x,y,damage,source,by` | попадание |
| `blood` | `x,y` | декаль крови |
| `death` | `id,kind,x,y,type?,name?,by?,byName?,source?` | смерть игрока/зомби |
| `respawn` | `id,x,y` | возрождение |
| `zombie_attack` | `id,x,y,targetId` | атака зомби |
| `growl` | `id,x,y` | рычание |
| `door` | `id,x,y,open` | дверь переключена |
| `pickup` | `playerId,itemKey,x,y` | подбор |
| `drop` | `playerId,itemKey,x,y` | выброс |
| `use` | `playerId,itemKey,x,y` | использование |
| `equip` | `playerId,itemKey` | экипировка |
| `prop_hit` | `id,x,y,hp` | попадание по пропсу |
| `prop_destroyed` | `id,type,x,y` | разрушение пропса |
| `loot_drop` | `x,y,itemKey` | выпал лут |
| `chat` | `name,playerId,text` | чат |
| `notice` | `text` | системное сообщение |

Клиент обязан игнорировать неизвестные события/поля для обратной совместимости.

## 6. Ограничения и защита

- Сервер валидирует все числа: величина `mx/my`, угол, `qty`, длины строк, id.
- Дистанции взаимодействия: дверь ≤1.55, контейнер ≤1.7 (открыть ≤2.1, перенос ≤2.2), подбор ≤1.5 (+0.4 допуска).
- Атака: кулдаун оружия; для дальнего боя LOS; конус ~0.62π.
- Патроны списываются транзакционно; при отсутствии — notice и короткий кулдаун.
- Смерть/лут/инвентарь — транзакции PostgreSQL.
- Ограничение размера/частоты сообщений, seq-dedupe, rate limit auth.
- Клиент не получает пароли, приватные ключи, содержимое чужих инвентарей или серверные секреты.

## 7. Изменение протокола

1. Добавляйте поля как опциональные, не ломая старых клиентов.
2. Любое несовместимое изменение — `PROTOCOL_VERSION++`, обновить документацию и обе стороны.
3. Новые события должны быть безопасны для игнорирования.
4. Обновлять `docs/PROTOCOL.md` и тесты в том же PR.
