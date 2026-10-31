# M2a — анимационный каркас 3D-персонажей

Статус: **задача на M2a, без финального арт-пасса**.
Источник: `docs/ROADMAP_3D.md`, раздел M2a.
Дата: 2026-10-30.

## 1. Ассеты

Берём только CC0, без покупки:

- KayKit — Character Pack: Adventurers  
  https://kaylousberg.itch.io/kaykit-adventurers  
  Лицензия: CC0. Есть GLTF, rigged/animated, одежда.
- KayKit — Character Animations  
  https://kaylousberg.itch.io/kaykit-character-animations  
  Лицензия: CC0. 150+ humanoid animations, GLTF/FBX, Rig_Medium.

Можно скачать бесплатную версию «Name your own price». Покупать ничего не нужно.

В репозиторий кладём только нужные модели/анимации/текстуры, не весь zip.  
Обязательно добавить:

- `client/public/assets/characters/kaykit/LICENSE.txt` — текст CC0/лицензии;
- `client/public/assets/characters/kaykit/SOURCE.md` — ссылки на обе страницы и дата скачивания.

Mixamo не использовать. Платные ассеты не использовать. Если itch.io недоступен — остановиться и спросить.

## 2. Что делаем

- Один humanoid-риг на игрока и зомби.
- `GLTFLoader` + `AnimationMixer`.
- Клонирование через `SkeletonUtils.clone`.
- Клипы: idle, walk, run, attack, hit, death.
- Без 8 направлений: поворот по aim.
- Без root motion: движение серверное; горизонтальный root motion убрать.
- Сокет оружия в правой руке.
- State machine отдельно от модели.
- Зомби — тот же риг, другой материал/оттенок, без отдельной анимационной системы.
- Билборды остаются только как fallback до загрузки GLTF, затем заменяются.
- Feet/shadow/cutaway: персонаж стоит на земле, не проваливается в стены, скрывается стенами.

## 3. Чего НЕ делаем

- Не делаем M2b: кастомную модель, текстуры в стиле Ashfall, LOD, рюкзак, финальные зомби.
- Не трогаем сервер, протокол, seed, миграции, коллизии, лестницы, cutaway UX.
- Не добавляем новые анимации руками и не покупаем ассеты.
- Не делаем оружие финальным артом — только сокет и простые placeholder-меши.
- Не ставим «принято»/«signoff»/«готово».
- Не мержим.

## 4. Разрешённые файлы

- новые модули в `client/src/render3d/`: `characterModelLoader.ts`, `character3d.ts`, `characterStateMachine.ts`, `weaponMeshBuilder.ts` (или минимальный аналог);
- `client/src/render3d/world3d.ts` — интеграция персонажей;
- `client/src/world/entityView.ts` — только геттеры состояния/aim/weapon;
- `client/src/game/GameScene.ts` — только если нужны вызовы;
- ассеты KayKit в `client/public/assets/characters/kaykit/`.

Другие файлы не менять. Если нужен ещё файл — остановиться и спросить.

## 5. Критерии приёмки

- Игрок и зомби — 3D skinned mesh, не биллборды.
- idle/walk/run/attack/hit/death работают, без застреваний и T-pose.
- Поворот по aim без 8 дискретных направлений.
- Нет root motion: персонаж не уезжает от серверной позиции.
- Оружие в правой руке, скрывается/меняется по текущему weapon.
- Ноги на земле, контактная тень.
- Персонаж не проваливается в стены, скрывается стенами.
- Масштаб совпадает с миром.
- `npm run typecheck`, `npm test`, `npm run build` — зелёные.
- В консоли браузера нет ошибок.
- Производительность: измерить FPS/draw calls на ноутбуке.

## 6. Отчёт

- `git diff --stat`.
- Список файлов и ассетов.
- Ссылки/лицензия.
- Вывод `typecheck/test/build`.
- Что проверено в браузере, метрики.
- Без самостоятельной приёмки и без правок документов статуса.
