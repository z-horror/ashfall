# Handoff: Ashfall, контрольная точка 2026-10-27

> Актуальный handoff для Gemini. Существующее имя файла сохранено, чтобы не ломать ссылки в `AGENTS.md` и `README.md`.

Это **не релиз** и не подтверждение визуальной готовности. Зафиксировано незавершённое состояние архитектуры зданий и черновой интеграции сгенерированной графики. Известные дефекты перечислены ниже намеренно.

## 1. Границы и правила продолжения

Продолжай работу в существующем репозитории `ashfall`, от текущего состояния, не создавая проект заново. Не меняй движок и не переписывай архитектуру зданий без доказанной необходимости.

Обязательный порядок:

1. Прочитай этот документ, `git status`, последние коммиты и текущий код графики.
2. Сохрани существующую архитектуру зданий и игровую логику.
3. Исправляй ошибки интеграции ассетов локально, не откатывая большие блоки работы.
4. Не смешивай текстуру угла с текстурой прямой стены. Для каждой геометрической роли должен быть соответствующий ассет.
5. Раздели неподвижную стену/проём и подвижное полотно двери. Не вращай текстуру стены вместе с дверью.
6. Не заменяй оставшиеся плейсхолдеры случайными текстурами. Проверяй соответствие ассета геометрии, ориентации и масштабу.
7. Пока лимит Cloudflare не восстановлен, работай с уже созданными ассетами и процедурной обработкой; не обходи лимит.
8. Не трогай отдельную систему анимации персонажей в рамках этой задачи.
9. Не считай прохождение `typecheck`, тестов и сборки доказательством визуальной корректности. Создавай свежие скриншоты и сообщай о дефектах.
10. Пользователь проверяет игру самостоятельно. Не заявляй, что результат визуально принят без его подтверждения.
11. Не выполняй миграции на реальной БД и не меняй production-инфраструктуру без отдельного задания.
12. Не перезаписывай историю Git и не удаляй существующие ветки.

Приоритет исправлений: сначала неправильное подключение текстур стен и двери, затем угол, вариативность текстур и оставшиеся плейсхолдеры.

## 2. Что реализовано в архитектуре

Монорепозиторий: `client` (Phaser 3/TS/Vite), `server` (Node/ws/pg), `shared` (типы, геометрия, протокол).

### Общая геометрия и здания

- `shared/src/geometry/units.ts`, `projection.ts`: тайл 1.6 м, 40 px/м, изометрическая проекция `worldToScreen`/`sceneToWorld`, `rotateLocal`.
- `shared/src/buildings/types.ts`: `BuildingSpec`, `FloorSpec`, `WallRun`, `OpeningSpec`, `SurfaceSpec`, `RoofSpec`, `StairSpec`, `RoomSpec`, `RoomGeometry`, `DoorState`, `WindowState`, `OpeningStateSnapshot`.
- `shared/src/buildings/geometry.ts`: начало/конец стены, длина в метрах, точка по расстоянию, валидация проёмов, `solidIntervals`, сторона стены.
- `shared/src/buildings/rooms.ts`: маски комнат, bounds, проверка 4-связности, привязка проёмов и лестниц к комнатам.
- `shared/src/buildings/collision.ts`: построение коллизии на этаж из стен, проёмов, лестниц и мебели; закрытая дверь блокирует проход, открытая пропускает; окно всегда блокирует движение.
- `shared/src/buildings/sight.ts`: пересечение линии с участками стен, дверями, окнами и мебелью; `hasFloorSight`, `canAttackAcrossFloor`; атаки между этажами запрещены.
- `shared/src/interiors/types.ts`, `catalog.ts`, `footprint.ts`: шаблоны объектов, размещение `floor`/`wall`/`ceiling`, состояния, повёрнутые footprints, коллизии/видимость мебели.
- В каталоге 15 шаблонов: `bed_double`, `bed_single`, `nightstand`, `wardrobe`, `table`, `chair`, `fridge`, `counter`, `shelf`, `crate`, `utility_box`, `rug`, `picture`, `clock`, `ceiling_light`.

### Сервер

- `server/src/game/buildings/testBuilding.ts`: одно тестовое здание `b:v3:test:28:28`, origin `(28, 28)`, bounds 12×10.
- Этажи: `0` (wood floor, bedroom west + kitchen east, partition arch, south door, east window) и `-1` (concrete storage, elevation −3 м).
- Лестница `s:test:0:-1`: entry `(37,29)`, exit `(37,33)`, hole `(37,30,1,3)`, 15 ступеней, спуск с 0 на −1.
- `World` больше не создаёт городские здания: генерирует только уличную землю, затем добавляет `TEST_BUILDING`, объекты, контейнеры, двери, окна и коллизию по этажам.
- `World.getCollisionGrid(level)`, `isWalkable(x, y, level)`, `roomAt`, `buildingAt`, `nearestStair`, `nearestDoor`, `nearestContainer`.
- `Simulation` хранит `floor` у игроков, зомби и ground items. Движение, LOS, атаки, зомби и взаимодействия учитывают этаж.
- `use_stairs` (`PROTOCOL_VERSION=2`): проверяет живого игрока, cooldown 700 мс, ближайшую лестницу на текущем этаже, наличие целевого этажа и свободный exit; меняет `p.floor`, сохраняет персонажа и отправляет событие `stair`.
- **Ограничение:** в тестовом здании лестница описана только на полу `0`; у basement `stairs: []`. Спуск работает, обратный подъём из подвала сейчас не реализован. Тест проверяет только переход `0 → -1`.
- Зомби floor-aware, но полноценной A*/NavGraph-навигации нет: движение по `moveCircle` и простым эвристикам.

### Клиент

- `client/src/world/clientWorld.ts`: собирает комнаты, проёмы, коллизию и состояния из чанков; хранит `playerFloor`-совместимые данные.
- `client/src/world/buildingView.ts`: отдельный рендер здания вместо старого рендера в `ChunkView`; стены, двери, окна, лестницы, мебель, крыша, cutaway и скрытие интерьера снаружи.
- `client/src/world/interiorView.ts`: мебель; для `bed_double` и `wardrobe` используется PNG, для остальных — процедурная геометрия.
- `client/src/game/GameScene.ts`: создаёт/удаляет `BuildingView`, обрабатывает `use_stairs`, события дверей/окон/объектов, floor-переходы.
- `client/src/world/chunkView.ts` больше не рисует здания; отвечает за землю/чанки.

### БД

`database/migrations/003_buildings_v3.sql` добавляет:

- `floor` в `characters`, `ground_items`, `world_doors`, `world_props`, `world_zombies`, `world_containers`;
- `building_id`, `room_id`, `object_id` в `world_containers`;
- таблицы `world_windows` и `world_objects`.

Миграция **не применялась** к реальной БД в рамках этой задачи. Тесты с настоящим PostgreSQL пропущены без `ASHFALL_TEST_DATABASE_URL` (2 skip).

## 3. Текущее состояние графики

Cloudflare-генерация остановлена: дневной лимит 10 000 neurons исчерпан, `image_gen` возвращает `used up your daily free allocation`. Новые ассеты не генерировать до восстановления лимита.

### Сгенерированные исходники и обработка

Исходные изображения и промежуточные PNG находятся вне репозитория, в локальном окружении:

- `/tmp/opencode/ashfall-assets/raw/wall_straight_h.png`
- `/tmp/opencode/ashfall-assets/raw/wall_corner.png`
- `/tmp/opencode/ashfall-assets/raw/door_closed.png`
- `/tmp/opencode/ashfall-assets/raw/bed_double.png`
- `/tmp/opencode/ashfall-assets/raw/wardrobe.png`
- `/tmp/opencode/ashfall-assets/processed/` — результаты chroma-key обработки.

В репозиторий включены итоговые PNG:

- `client/public/assets/buildings/wall_straight_h.png`
- `client/public/assets/buildings/wall_corner.png`
- `client/public/assets/buildings/door_closed.png`
- `client/public/assets/buildings/bed_double.png`
- `client/public/assets/buildings/wardrobe.png`
- `client/public/assets/buildings/wall_face.png` — производная от `wall_straight_h.png`: центральный crop + горизонтальное зеркало для повторяемого тайла.

Обработка chroma-key: `tools/process_generated_assets.py` (удаление magenta-фона, despill, erosion, crop, resize). Производство `wall_face.png`: `tools/derive_wall_face.py`.

### Что реально используется

- `wall_face.png` — плоские стены в `BuildingView`; рисуется Canvas-текстурой с повторением.
- `door_closed.png` — только закрытая дверь.
- `bed_double.png` — кровать.
- `wardrobe.png` — шкаф.
- `wall_corner.png` — загружается в каталог `generatedAssets.ts`, но **не назначен ни одной геометрической роли**.
- `wall_straight_h.png` — исходник для `wall_face.png`; как самостоятельный wall-модуль в игре не используется.

Каталог и загрузка: `client/src/art/generatedAssets.ts`. Подключение стен/двери: `client/src/world/buildingView.ts`. Подключение мебели: `client/src/world/interiorView.ts`. Preload: `loadGeneratedAssets` из `GameScene`.

### Известные дефекты графики

1. Интеграция стен не принята. На плоских стенах используется `wall_face.png`, а не полноценный straight-wall модуль; `wall_corner.png` не интегрирован. Пользователь отдельно отмечал, что текстура угла воспринимается на плоских стенах; это не считается корректной финальной интеграцией.
2. `door_closed.png` содержит стену/проём и дверь одним изображением. В коде нет отдельного подвижного полотна: при открытии PNG скрывается целиком, вместо него рисуется процедурная рама. Поэтому нельзя корректно анимировать открывание только полотна; по наблюдению пользователя дверь уходит/поворачивается вместе с частью стены. Нужно разделить статичную стену/проём и leaf.
3. Большая часть мебели — плейсхолдеры процедурной геометрии (`nightstand`, `table`, `chair`, `fridge`, `counter`, `shelf`, `crate`, `utility_box`, декор).
4. У стен заметен повторяющийся/зеркальный рисунок текстуры. `wall_face.png` сделан mirrored-тайлом; вертикальных разрывов меньше, но паттерн очевиден.
5. `wall_corner.png` сгенерирован, но не интегрирован корректно; его ориентация/масштаб не проверены.
6. Cloudflare-лимит исчерпан; новые генерации не выполнять.
7. Визуального подтверждения пользователя нет. Скриншоты — только техническая проверка, не приёмка.

## 4. Проверки и скриншоты

Фактически выполнено в этом окружении:

- `npm run typecheck` — успешно (shared, server, client).
- `npm test` — 38 тестов: 36 pass, 2 skip, 0 fail. Skip: real PostgreSQL без `ASHFALL_TEST_DATABASE_URL`.
- `npm run build` — успешно (client Vite + server esbuild).
- `tools/building-slice-test.mjs` — headless Chromium, 3 скриншота, `errors: []`.

Скриншоты текущего локального окружения:

- `/tmp/opencode/ashfall-assets/trial-game9/01-outside.png`
- `/tmp/opencode/ashfall-assets/trial-game9/03-inside-west.png`
- `/tmp/opencode/ashfall-assets/trial-game9/05-basement.png`

Это локальные файлы. В другом окружении они могут быть недоступны. Для повторного получения запусти сервер и клиент, затем:

```bash
BUILDING_TEST_OUT=/tmp/opencode/ashfall-assets/trial-game9 \
CHROMIUM_PATH=/path/to/chrome \
node tools/building-slice-test.mjs
```

Сценарий использует `http://127.0.0.1:5173/?debugBuildings=1&buildingTest=1`, dev-действия `godmode`/`teleport` и `window.__ashfall.net.action`.

Не проверено: реальный GPU, реальный PostgreSQL, production, мобильные устройства, визуальная приёмка, полноценная анимация двери, обратный подъём из подвала.

## 5. Воспроизведение

```bash
cd ashfall
npm install
npm run typecheck
npm test
npm run build
```

Для тестового мира без PostgreSQL:

```bash
DATABASE_URL=memory NODE_ENV=development PORT=3100 \
WORLD_SEED=ashfall-buildings-v2 ALLOW_GUEST_LOGIN=true REQUIRE_INVITES=false \
node --import tsx server/src/index.ts
```

Клиент:

```bash
npm -w @ashfall/client run dev -- --host 127.0.0.1 --port 5173
```

Тестовое здание — `TEST_BUILDING`, seed `ashfall-buildings-v2`. Не менять seed без очистки/пересоздания мира.

## 6. Известные ограничения архитектуры

- Полноценная A*/NavGraph-навигация не реализована; зомби используют `moveCircle` и простые эвристики.
- Тестовый мир ограничен одним тестовым зданием; городской генератор зданий отключён.
- Нет второго надземного этажа; есть только `0` и `-1`.
- Переход по лестнице — триггерное действие, не физическое перемещение по ступеням.
- Обратный подъём из подвала не реализован (у basement нет `stairs`).
- Видимость подвала скрывает ground layer целиком, а не только footprint здания.
- Двери/окна — упрощённые состояния; нет отдельного leaf-спрайта и анимации.
- Мебель в основном процедурная; часть шаблонов не имеет финальных ассетов.
- Миграция `003_buildings_v3.sql` не применялась к реальной БД.
- Реальный сервер/БД/GPU и production не проверялись.

## 7. Ближайшие задачи для Gemini

1. Исправить стены: отдельная роль для прямой стены и угла; убрать mirrored-паттерн или заменить его корректным tileable-ассетом; проверить масштаб, верхнюю кромку и стыки.
2. Разделить дверь: статичная стена/проём + отдельное полотно, чтобы открывание вращало только полотно.
3. Проверить и интегрировать `wall_corner.png` в углах, не используя его на плоских участках.
4. Добавить/подключить оставшиеся ассеты только при восстановленном лимите Cloudflare; не подменять геометрию случайными текстурами.
5. Сделать свежие скриншоты снаружи, внутри, в подвале и на углах; перечислить дефекты; дождаться проверки пользователя.
6. После изменений повторить `typecheck`, тесты, сборку и визуальный сценарий.


## 10. Промпт для Gemini

Продолжай разработку Ashfall в существующем репозитории от текущего WIP-состояния. Сначала прочитай `docs/HANDOFF_GEMINI.md`, `git status`, последние коммиты, `docs/STATUS.md` и код `client/src/world/buildingView.ts`, `interiorView.ts`, `client/src/art/generatedAssets.ts`. Не переписывай движок и архитектуру зданий. Исправляй в первую очередь неправильную интеграцию стен и двери: не используй угол на плоских стенах, раздели статичную стену/проём и подвижное полотно двери. Не генерируй новые Cloudflare-ассеты до восстановления лимита. Не трогай анимацию персонажей, реальную БД и production. После изменений запусти `npm run typecheck`, `npm test`, `npm run build` и `tools/building-slice-test.mjs`; приложи свежие скриншоты и честно перечисли дефекты. Не заявляй о визуальной готовности без проверки пользователя.
