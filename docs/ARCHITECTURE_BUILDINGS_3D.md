# Архитектура домов на Three.js (spike)

Статус: **spike/three-buildings**, не production. Ветка создана от `main` (`830eff4`). `main` не затрагивается.

## 1. Решение

Выбран вариант **A**: видимая сцена клиента переезжает на Three.js с ортографической изометрической камерой. Сервер, протокол, физика, БД, DOM-HUD, сеть и аудио остаются.

Причина: текущий дом — это 2D-набор `Graphics`/`Image` с ручной сортировкой `floor*10000 + x + y` и магическими `8000/9000/19000`. У такой модели нет настоящей глубины. Она не может одновременно корректно отрисовать террасу, шахту, проём, cutaway и персонажа на террасе. Каждый точечный фикс перекладывает конфликт в другое место.

Three.js даёт:
- настоящий z-buffer;
- clipping planes / скрытие мешей для cutaway;
- произвольную 3D-геометрию дома (плиты с отверстиями, стены, лестницы, крыши, террасы, цоколь);
- поверхностные decals, 3D-трубы, vegetation cards, props;
- материалы, свет, тени;
- billboard-спрайты для текущих 2D-персонажей;
- `AnimationMixer`/GLTF на будущее, если появятся 3D-модели.

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
- Камера — `OrthographicCamera`, `up = (0,0,1)`, орбита вокруг цели; базовый ракурс — юго-восток, 35–45°.
- Стены используют **world-scale UV** (метры / размер текстуры), а не фиксированный `repeat` на бокс. Иначе кирпич растягивается на длинных стенах и разных домах.

## 4. BuildingModel

Единая схема, из которой строятся и меши, и коллизии. Модель не знает о Three.js.

```ts
interface BuildingModel {
  id: string;
  footprint: RectM;
  levels: LevelModel[];
  plinth: PlinthModel;
  slabs: SlabModel[];
  walls: WallModel[];
  stairs: StairModel[];
  fixtures: FixtureModel[];
  decals: DecalModel[];
  pipes: PipeModel[];
  props: PropModel[];
}

interface LevelModel {
  id: string;
  index: number;                 // -1 basement, 0 ground, 1..N upper
  kind: 'basement' | 'ground' | 'upper' | 'mansard' | 'roof';
  elevation: number;             // метры
  clearHeight: number;
  floorThickness: number;
}

interface PlinthModel {
  rect: RectM;
  heightM: number;
  thicknessM: number;
  material: MaterialKey;
}

interface SlabModel {
  id: string;
  levelId: string;
  kind: 'floor' | 'ceiling' | 'roof' | 'terrace' | 'basement';
  rect: RectM;
  zBottom: number;
  zTop: number;
  material: MaterialKey;
  holes?: RectM[];
}

interface WallModel {
  id: string;
  levelId: string;
  axis: 'h' | 'v';
  fixedM: number;
  fromM: number;
  toM: number;
  zBottom: number;
  zTop: number;
  thicknessM: number;
  exterior: boolean;
  material: MaterialKey;
  openings?: OpeningModel[];
}

interface OpeningModel {
  x0: number; x1: number;       // вдоль оси стены
  z0: number; z1: number;       // высота
  kind: 'door' | 'window';
  hinge?: 'left' | 'right';     // для будущего swing
  open?: boolean;
}

interface StairModel {
  id: string;
  levelId: string;
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
  levelId: string;
  kind: 'ac' | 'vent' | 'tank' | 'hatch';
  xM: number; yM: number; zM: number;
  widthM: number; depthM: number; heightM: number;
  yaw?: number;                 // вокруг Z; 0 = фронт +Y
}

type SurfaceRef =
  | { kind: 'wall'; id: string; side: 'front' | 'back' }
  | { kind: 'slab'; id: string }
  | { kind: 'plinth'; side: 'north' | 'south' | 'east' | 'west' };

interface DecalModel {
  id: string;
  host: SurfaceRef;
  u0: number; u1: number;       // вдоль поверхности
  v0: number; v1: number;       // высота / вторая ось
  texture: 'ivy' | 'brickDamage' | 'puddle' | 'tarPatch';
  opacity?: number;
  offsetM?: number;             // отступ от поверхности
}

interface PipeModel {
  id: string;
  host: SurfaceRef;
  points: Vec3M[];              // world-space path
  radiusM: number;
  material: MaterialKey;
}

interface PropModel {
  id: string;
  kind: 'pallet' | 'crate' | 'trash' | 'weeds';
  xM: number; yM: number; zM: number;
  yaw?: number;
  scale?: number;
}
```

Правила:
- Плита с отверстиями строится как набор прямоугольников вокруг hole (без CSG), либо `Shape` + holes; для спайка — прямоугольники.
- Стена с проёмом режется на сегменты; дверь/окно — отдельная 3D-сборка.
- Лестница — настоящие ступени; шахта — отсутствие плиты + видимые внутренние стенки.
- Коллизии берутся из тех же `walls/openings/stairs/fixtures`, не из мешей.
- `levels` — обязательная часть модели; cutaway и скрытие этажей работают по `levelId`, а не по эвристике `z >= 2.4`.

## 5. Слои и глубина

Three.js сам сортирует по z-buffer. Ручные depth-константы не нужны.

Слои сцены:
1. ground (земля/чанки как текстуры).
2. building shell (стены, плиты, крыши, террасы, шахты, цоколь).
3. fixtures (AC, вентиляция, люки) — **3D**.
4. attachments: decals (плющ, повреждения, лужи, tar-патчи), pipes (водостоки), vegetation cards.
5. props (паллеты, ящики, мусор) — 3D или фиксированные карточки.
6. entities (персонажи, зомби) — billboard-спрайты.
7. items/effects.
8. DOM-HUD.

### 5.1. Что чем является

- **Твёрдые объекты** (AC, двери, окна, трубы, ящики, паллеты, мусор) — 3D-геометрия с фиксированной ориентацией. Нельзя делать их camera-facing billboard: при смене ракурса угол «поедет».
- **Растительность** — alpha-tested карточки/крест-плоскости с фиксированной ориентацией, `alphaTest`, `depthWrite: true` для листвы; не camera-facing.
- **Персонажи/эффекты** — billboard-спрайты, depth-tested.
- **2.5D isometric-ассеты** (`door_closed.png`, `window_unit.png`, `roof_ac_unit.png`, ivy sheet) имеют запечённую перспективу. Их **нельзя** натягивать на 3D-стены как обычные текстуры. Для 3D нужны либо orthographic/flat face textures, либо геометрия. В PoC двери/окна/AC собраны геометрией; ivy используется как плоский decal (временное решение, финальный арт — flat/leaf cards).

### 5.2. Decals

- Decal привязан к `SurfaceRef` (стена/плита/цоколь), а не к мировым координатам.
- Плоскость ставится на `offsetM` от поверхности, `polygonOffset: true`, `polygonOffsetFactor: -4`, `depthWrite: false`, `alphaTest`.
- `renderOrder` используется только для прозрачных наложений, не для перекрытия геометрии.
- Decal добавляется в группу хоста: скрыли стену/этаж в cutaway — decal скрылся вместе с ней.
- При генерации — seeded RNG + occupancy-маска поверхности, чтобы decals не накладывались друг на друга без правил.

### 5.3. Трубы и крепления

- Водостоки/трубы — `TubeGeometry` по пути, 3D, с хомутами; фиксированная ориентация.
- Труба привязана к стене/хосту и скрывается вместе с ним в cutaway.
- Никаких изометрических спрайтов труб на 3D-стенах.

### 5.4. Цоколь

- Цоколь — непрерывное кольцо (`Shape` с hole + `ExtrudeGeometry`), а не набор сегментов по стенам.
- Это убирает швы/«столбики» на фасаде.
- Верх/низ цоколя — отдельные материалы/trim при необходимости; decals (грязь, плющ) крепятся к его поверхностям.

### 5.5. Крыши и парапеты

- Плита крыши/террасы — тонкая, её верхняя плоскость **ниже** верха стен.
- По периметру идёт парапет (продолжение стены) на 0.3–0.5 м выше крыши; сверху — каменный/бетонный кап.
- Плита не должна выступать за парапет и не должна образовывать горизонтальный «пояс» между стеной и крышей: край плиты скрыт парапетом.
- Для открытой террасы — тот же принцип: поверхность террасы утоплена, по внешнему периметру парапет; северная сторона может примыкать к стене этажа.
- В `RoofSpec` игры есть `parapetM`; конвертер должен строить парапет от верха стен, а не класть плиту сверху.
- В PoC: верхняя крыша 5.4..5.55, парапет 5.4..5.9, кап 5.9..5.96; терраса 2.8..3.05, парапет 2.8..3.35, кап 3.35..3.41.

## 6. Этажи и cutaway

- Все меши сгруппированы по `levelId` (`levelGroups`).
- Активный уровень (например, `ground`) задаёт cutaway:
  - уровни выше активного скрываются;
  - ближние к камере стены активного уровня скрываются;
  - дальние стены и нижние уровни остаются;
  - attachments скрываются вместе с хостом.
- Для интерьера верхних этажей активный уровень меняется на `upper1`/`upper2`; для подвала — `basement`.
- Двери/окна — 3D; при cutaway скрываются вместе со стеной.
- В будущем: полупрозрачность/`clippingPlanes` вместо `visible=false` для плавных переходов.

## 7. Двери, окна, AC

- Дверь: 3D-коробка-полотно + наличники + панели + ручка; `hinge`/`open` — для будущего swing.
- Окно: 3D-рама + стекло + импосты; стекло прозрачное, `depthWrite: false`, отдельный `renderOrder`.
- AC: 3D-корпус + верхний вентилятор + фронтальный/боковой гриль + трубки; `yaw` фиксирует ориентацию.
- Всё это использует **flat-текстуры/материалы**, а не изометрические спрайты.

## 8. Персонажи и анимации

Сейчас анимации — sprite-sheet: 8 направлений, `walk/idle/attack/death`, игрок и зомби.
Перенос 1:1:
- `THREE.Sprite` или плоскость перед камерой;
- атлас `char_p*.png` / `char_z*.png`;
- кадры через `texture.offset/repeat`;
- state machine остаётся нашей (walk/idle/attack/death, направление, tint, weapon, hp bar, label);
- тень — отдельный blob-спрайт/плоскость.

Будущее: `AnimationMixer` + GLTF/SkinnedMesh, если появятся 3D-модели. Текущий 2D-арт можно смешивать с 3D.

## 9. Процедурная генерация и разные дома

Схема должна позволять собирать дома из модулей:
- уровни/этажи → плиты/стены/лестницы;
- комнаты/прямоугольники → внутренние стены/проёмы;
- крыши/террасы/парапеты/цоколь;
- fixtures/decals/pipes/props по правилам;
- материалы и decals варьируются, геометрия — из грамматики.

Ограничения проверяются на уровне модели, до рендера:
- проёмы не режут несущие стены;
- лестница не пересекает перегородку;
- footprint внутри участка;
- decals/props не пересекают занятые поверхности без разрешения;
- высота этажа/толщина плиты согласованы с уровнями.

Коллизии и визуал используют один и тот же `BuildingModel`. PoC содержит два разных дома: тестовый особняк (basement/ground/mansard) и 3-этажный вариант с плоской крышей/парапетом — чтобы проверить, что рендер не захардкожен под один дом.

## 10. Миграция

Фазы:
1. **PoC** (эта ветка): Three.js, два дома, камера, терраса, шахты, cutaway по уровням, 3D-двери/окна/AC, цоколь, decals/ivy/повреждения/лужи/tar, водосток, props/сорняки, 1–2 персонажа-биллборда.
2. Ground/chunks → текстуры на плоскостях.
3. Buildings → `BuildingModel` + mesh builder; текущий `BuildingView` остаётся fallback.
4. Entities/items/effects → billboard-слой.
5. Удаление старого рендера после визуальной приёмки.

Флаг: `?render3d=1` (или отдельная страница на спайке). `main` не трогаем до приёмки.

## 11. Приёмка

- Baseline-ракурсы пользователя: позиция, зум, этаж, inside/outside.
- Для каждого пункта — before/after-кроп с **той же** камеры.
- `typecheck/test/build` и `errors: 0` — ворота, но не доказательство визуальной готовности.
- Критерии PoC:
  - персонаж на террасе виден и не перекрыт террасой;
  - персонаж за стеной корректно скрыт;
  - cutaway по этажам открывает интерьер;
  - шахта лестницы — реальный объём, без чёрной дыры;
  - 3D-двери/окна/AC корректны с разных ракурсов;
  - цоколь без швов;
- крыши утоплены за парапеты, без «бутерброда» и пояса под крышей;
  - decals/ivy/трубы/props не z-fighting и скрываются с хостом;
  - два разных дома (этажность/крыша/цоколь) из одной модели;
  - скриншоты в ракурсах пользователя.

## 12. Риски

- Прозрачность/сортировка спрайтов, стекла, листвы и эффектов.
- Переходный период: два рендера (Phaser + Three.js), синхронизация камеры/ввода.
- Производительность: decals/draw calls; нужны merge/instancing, атласы, baked AO, LOD.
- Ассеты: изометрические 2.5D-ассеты не годятся как flat-текстуры; нужен flat-арт или геометрия/листовые карточки.
- UV-масштаб: world-scale UV для стен обязателен; иначе разные дома будут с разным размером кирпича.
- AI-агенты: стандартный Three.js проще, но нельзя терять визуальную приёмку.

## 13. PoC: запуск и результат

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

Что проверено в PoC:
- тестовый дом 28..40 / 28..37: плиты/стены/лестницы/проёмы;
- персонаж на террасе не перекрывается террасой (z-buffer);
- персонаж за стеной скрывается стеной;
- cutaway по уровням открывает интерьер;
- шахта лестницы — настоящий проём, под полом виден бетон подвала;
- спрайт-анимация `walk` работает на биллборде;
- 3D-двери, 3D-окна, 3D-AC с фиксированной ориентацией;
- цоколь непрерывным кольцом;
- decals: ivy, brick damage, puddle, tar patch; труба-водосток; props: паллета, ящик, мусор, сорняки;
- второй дом: 3 этажа, плоская крыша с парапетом, свой цоколь, внутренние стены, лестницы, AC на крыше;
- камера орбитой (ЛКМ/колесо), чтобы проверять объекты с разных углов.

Ограничения PoC:
- отдельная страница, не подключена к `GameScene`, сети и HUD;
- арт упрощён; ivy — временный плоский decal из изометрического листа, нужен flat/leaf-card арт;
- swing дверей/окон и интерьерные двери пока без анимации;
- нет финального замера производительности;
- нет процедурного генератора — только две модели, собранные вручную.
