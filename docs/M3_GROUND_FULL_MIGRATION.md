# M3 Ground Full Migration — 3D-земля как единственная

Статус: **полная миграция, без fallback**.
Источник: `docs/ROADMAP_3D.md`, раздел M3.
Дата: 2026-10-30.

## 1. Цель

Сделать 3D-землю единственной землёй в игре и убрать старый 2D-слой:

- 3D-земля всегда включена;
- Phaser-земля удаляется;
- 2D-отрисовка зданий (`BuildingView`) удаляется;
- `groundOccluder` удаляется;
- `?ground3d` и `?render3d` больше не поддерживаются;
- fallback на старый рендер не нужен: 3D — основной путь.

Сервер, протокол, seed, миграции и физика не меняются.

## 2. Что делаем

- `GameScene`:
  - всегда создаёт `World3D`;
  - убирает поля/флаги `render3dEnabled`, `ground3dEnabled`;
  - убирает `ChunkView` и `chunks`;
  - убирает `BuildingView` и `buildingViews`;
  - убирает `updatePhaserGroundVisibility`;
  - при загрузке/выгрузке чанка вызывает `world3d.loadGroundChunk` / `unloadGroundChunk`;
  - при активации 3D синхронизирует дома и землю.
- `World3D`:
  - всегда создаёт `Ground3DWorld`;
  - убирает флаг `ground3dEnabled`;
  - убирает видимость `groundOccluder`.
- `buildingMeshBuilder`:
  - удаляет `groundOccluder` из модели и билдера.
- Удаляются файлы:
  - `client/src/world/chunkView.ts`
  - `client/src/world/buildingView.ts`
  - `client/src/world/interiorView.ts`
  - `client/src/world/stairShaftView.ts`
  - `client/src/render3d/ground3dChunk.ts` (proof-only)
  - `client/src/render3d/ground3dProof.ts` (proof-only)
  - `client/ground3d.html` (proof-only)
- `ground3dShared.ts` и `ground3dWorld.ts` остаются.
- Что не входит: лестницы/коллизии, финальный арт, M2a, мебель, свет, двери/окна.

## 3. Ограничения

- Не трогать `server/`, `shared/`, протокол, seed, миграции.
- Не трогать персонажей, анимации, M1-фиксы, M2a.
- Не делать арт-полировку и новые ассеты.
- Не менять `docs/ROADMAP_3D.md`, `docs/STATUS.md`, `docs/HANDOFF_GEMINI.md`.
- Не ставить «принято»/«signoff»/«готово».
- Не мержить.

## 4. Разрешённые файлы

- `client/src/game/GameScene.ts`
- `client/src/render3d/world3d.ts`
- `client/src/render3d/buildingMeshBuilder.ts`
- `client/src/render3d/ground3dWorld.ts` — только если нужны мелкие правки под всегда-включённый режим.
- Удаление файлов из раздела 2.

Другие файлы не менять. Если нужен ещё файл — остановиться и спросить.

## 5. Критерии приёмки

- Игра запускается без `?ground3d` и без `?render3d`.
- 3D-земля есть всегда.
- Phaser-земли и старых 2D-зданий нет.
- Нет `groundOccluder` и его артефактов.
- Спавн, тестовый дом, подвал, границы чанков работают.
- Загрузка/выгрузка чанков не ломает землю.
- `npm run typecheck`, `npm test`, `npm run build` — зелёные.
- В консоли браузера нет ошибок.
- Метрики: чанки, квады, draw calls, FPS.

## 6. Отчёт

- `git diff --stat`.
- Список удалённых/изменённых файлов.
- Вывод `typecheck/test/build`.
- Метрики и что проверено в браузере.
- Без самостоятельной приёмки и без правок документов статуса.
