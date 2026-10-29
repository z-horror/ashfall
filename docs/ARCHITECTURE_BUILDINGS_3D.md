# Архитектура домов на Three.js (spike)

Статус: **spike/three-buildings**, не production. Ветка создана от `main` (`830eff4`). `main` не затрагивается.

## 1. Решение

Выбран вариант **A**: видимая сцена клиента переезжает на Three.js с ортографической изометрической камерой. Сервер, протокол, физика, БД, DOM-HUD, сеть и аудио остаются.

Причина: текущий дом — это 2D-набор `Graphics`/`Image` с ручной сортировкой `floor*10000 + x + y` и магическими `8000/9000/19000`. У такой модели нет настоящей глубины. Она не может одновременно корректно отрисовать террасу, шахту, проём, cutaway и персонажа на террасе. Каждый точечный фикс перекладывает конфликт в другое место.

Three.js даёт:
- настоящий z-buffer;
- clipping planes для cutaway;
- произвольную 3D-геометрию дома (плиты с отверстиями, стены, лестницы, крыши, террасы);
- материалы, свет, тени, decals;
- billboard-спрайты для текущих 2D-ассетов;
- `AnimationMixer`/GLTF на будущее, если появятся 3D-персонажи.

## 2. Что не меняется

- `server/`, `shared/` physics/protocol, БД, миграции.
- Сетевой слой (`NetClient`, сообщения, snapshot).
- DOM-HUD (`client/src/ui/hud.ts`), аудио, auth.
- Серверная коллизия: она уже строится из `BuildingSpec` (`wallRuns`, `openings`, footprints, fixtures).

Меняется только клиентский слой отрисовки.

## 3. Единицы и координаты

- Внутри 3D-модели — **метры**.
- 1 тайл = `1.6 м`.
- Мир игры: `x/y` в тайлах, `z` в метрах. Конвертация: `xM = (tileX - originX) * 1.6`, `yM = (tileY - originY) * 1.6`, `zM = elevation`.
- Камера — `OrthographicCamera`, `up = (0,0,1)`, взгляд с юго-востока. Положение/зум подбираются под эталонный ракурс.

## 4. BuildingModel

Единая схема, из которой строятся и меши, и коллизии. Черновик:

```ts
interface BuildingModel {
  id: string;
  origin: { x: number; y: number }; // тайлы
  footprint: RectM;                 // метры
  floors: SlabModel[];
  walls: WallModel[];
  stairs: StairModel[];
  roofs: SlabModel[];
  terraces: SlabModel[];
  fixtures: FixtureModel[];
  decals: DecalModel[];
  props: PropModel[];
}

interface SlabModel {
  id: string;
  kind: 'floor' | 'ceiling' | 'roof' | 'terrace' | 'basement';
  rect: RectM;
  zBottom: number;
  zTop: number;
  material: MaterialKey;
  holes?: RectM[];
}

interface WallModel {
  id: string;
  axis: 'h' | 'v';
  fixedM: number;
  fromM: number;
  toM: number;
  zBottom: number;
  zTop: number;
  thicknessM: number;
  exterior: boolean;
  material: MaterialKey;
  openings?: OpeningModel[]; // двери/окна/арки
}

interface StairModel {
  id: string;
  hole: RectM;
  fromZ: number;
  toZ: number;
  widthM: number;
  riseM: number;
  treadM: number;
  steps: number;
  direction: 'up' | 'down';
}

interface FixtureModel {
  id: string;
  kind: 'ac' | 'vent' | 'tank' | 'hatch';
  xM: number;
  yM: number;
  zM: number;
  widthM: number;
  depthM: number;
  heightM: number;
}
```

Правила:
- Плита с отверстиями строится как набор прямоугольников вокруг hole (без CSG), либо `Shape` + holes; для спайка — прямоугольники.
- Стена с проёмом режется на сегменты: слева/справа/сверху (и подоконник для окна).
- Лестница — настоящие ступени-коробки; шахта — отсутствие плиты + видимые внутренние стенки.
- Коллизии берутся из тех же `walls/openings/stairs/fixtures`, не из мешей.
- `decals` (плющ, повреждения, мусор) — плоскости с alpha и `polygonOffset`, чтобы не было z-fighting.

## 5. Слои и глубина

Three.js сам сортирует по z-buffer. Ручные depth-константы не нужны.

Слои сцены:
1. ground (asphalt/grass plane или чанки как текстуры).
2. building shell (стены, плиты, крыши, террасы, шахты).
3. props/fixtures (AC, ящики, мусор).
4. entities (персонажи, зомби) — billboard-спрайты, depth-tested.
5. items/effects (предметы, кровь, вспышки, дым).
6. DOM-HUD (поверх canvas).

Правила прозрачности:
- персонажи/зомби: `alphaTest`, `depthWrite: true`;
- окна/стёкла: `transparent`, `depthWrite: false`, отдельный `renderOrder`;
- эффекты: additive/alpha, `depthWrite: false`;
- decals: `polygonOffset`, иначе z-fighting.

## 6. Cutaway

Два режима:
- **Экстерьер**: все стены/крыша видны.
- **Интерьер**: скрываются ближние к камере стены (south/east) и крыша/мансардный этаж; дальние стены остаются. Реализация: каждая стена — отдельный mesh/group; `visible=false` или прозрачность.
- **Терраса**: всё видно; персонаж на террасе не перекрывается террасой, потому что z-buffer.

Позже можно добавить полупрозрачность вместо скрытия и clipping planes для сложных сечений.

## 7. Персонажи и анимации

Сейчас анимации — sprite-sheet: 8 направлений, `walk/idle/attack/death`, игрок и зомби.
Перенос 1:1:
- `THREE.Sprite` или плоскость перед камерой;
- атлас `char_p*.png` / `char_z*.png`;
- кадры через `texture.offset/repeat`;
- state machine остаётся нашей (walk/idle/attack/death, направление, tint, weapon, hp bar, label);
- тень — отдельный blob-спрайт/плоскость.

Будущее: `AnimationMixer` + GLTF/SkinnedMesh, если появятся 3D-модели. Текущий 2D-арт можно смешивать с 3D.

## 8. Процедурная генерация

Схема должна позволять собирать дома из модулей:
- комнаты/прямоугольники → стены/проёмы/перегородки;
- этажи/плиты/лестницы;
- крыши/террасы/парапеты;
- fixtures/decals по правилам;
- материалы и decals варьируются, геометрия — из грамматики.

Ограничения (проёмы не режут несущие стены, лестница не пересекает перегородку, footprint внутри участка) проверяются на уровне модели, до рендера. Коллизии и визуал используют один и тот же модель.

## 9. Миграция

Фазы:
1. **PoC** (эта ветка): Three.js, тестовый дом, камера, терраса, шахта, cutaway, 1–2 персонажа-биллборда, 2–3 варианта дома.
2. Ground/chunks → текстуры на плоскостях.
3. Buildings → `BuildingModel` + mesh builder; текущий `BuildingView` остаётся fallback.
4. Entities/items/effects → billboard-слой.
5. Удаление старого рендера после визуальной приёмки.

Флаг: `?render3d=1` (или отдельная страница на спайке). `main` не трогаем до приёмки.

## 10. Приёмка

- Baseline-ракурсы пользователя: позиция, зум, этаж, inside/outside.
- Для каждого пункта — before/after-кроп с **той же** камеры.
- `typecheck/test/build` и `errors: 0` — ворота, но не доказательство визуальной готовности.
- Критерии PoC:
  - персонаж на террасе виден и не перекрыт текстурой террасы;
  - персонаж за стеной корректно скрыт;
  - cutaway открывает интерьер;
  - шахта лестницы — реальный объём, без чёрной дыры;
  - 2–3 варианта дома из одной модели;
  - скриншоты в ракурсах пользователя.

## 11. Риски

- Прозрачность/сортировка спрайтов и эффектов.
- Переходный период: два рендера (Phaser + Three.js), синхронизация камеры/ввода.
- Производительность: много decals/draw calls; нужны merge/instancing и baked AO.
- Ассеты: текущие текстуры 2D, нужен аккуратный UV/repeat; 3D-модели появятся позже.
- AI-агенты: стандартный Three.js проще, но нельзя терять визуальную приёмку.

## 12. PoC: запуск и результат

Запуск:

```bash
npm install
npm -w @ashfall/client run dev -- --port 5176
# http://localhost:5176/render3d.html
```

Скриншоты:

```bash
node tools/render3d-poc-audit.mjs
# результат: docs/reference/three-poc/
```

Что уже проверено в PoC:
- дом 28..40 / 28..37 построен из реальных плит/стен/лестниц/проёмов;
- персонаж на террасе не перекрывается террасой (z-buffer);
- персонаж за стеной скрывается стеной;
- cutaway открывает интерьер;
- шахта лестницы — настоящий проём, под полом виден бетон подвала;
- спрайт-анимация `walk` работает на биллборде;
- AC и окна/двери используют текущие 2D-ассеты.

Ограничения PoC:
- отдельная страница, не подключена к `GameScene`, сети и HUD;
- один тестовый дом, без процедурной генерации;
- упрощённые материалы/пропорции, без decals/parapets/ivy/baked AO;
- нет финального замера производительности.
