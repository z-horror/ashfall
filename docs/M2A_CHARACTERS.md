# M2a — анимационный каркас 3D-персонажей

Статус: **задача на M2a, без финального арт-пасса**.
Источник: `docs/ROADMAP_3D.md`, раздел M2a.
Дата: 2026-10-30.

## 1. Ассеты

Берём только CC0, без покупки:

- Quaternius — Zombie Apocalypse Kit  
  https://quaternius.com/packs/zombieapocalypsekit.html  
  Лицензия: CC0. 4 playable characters, 4 enemies, ~20 animations each, glTF/FBX/OBJ/Blend.
  Скачивание: https://drive.google.com/drive/folders/1mWP6sCHun7OUMHQeDNZLrXTteXlzWg_t?usp=sharing

Покупать ничего не нужно. KayKit не использовать — это фэнтези, не апокалипсис.

В репозиторий кладём только нужные модели/анимации/текстуры, не весь zip.  
Обязательно добавить:

- `client/public/assets/characters/quaternius/LICENSE.txt` — текст CC0/лицензии;
- `client/public/assets/characters/quaternius/SOURCE.md` — ссылка на страницу, Google Drive и дата скачивания.

Mixamo не использовать. Платные ассеты не использовать. Если Google Drive недоступен — остановиться и спросить.

## 2. Что делаем

- 4 модели выживших и 4 модели врагов из пака; варианты игрока и типы зомби должны визуально отличаться.
- `GLTFLoader` + `AnimationMixer`.
- Клонирование через `SkeletonUtils.clone`.
- Клипы: idle, walk, run, attack (melee), attack (pistol/ranged), hit, death.
- Тип атаки зависит от оружия: бита/нож/топор/лом — melee, пистолет — ranged.
- Без 8 направлений спрайтов: поворот модели в 3D.
- Без root motion: движение серверное; горизонтальный root motion убрать.
- Сокет оружия в правой руке; пистолет должен быть виден.
- State machine отдельно от модели.
- One-shot анимации (attack/hit/death) не обрезаются.
- При движении модель смотрит в сторону движения; при атаке/стоя — в сторону aim. Лунной походки быть не должно.
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
- ассеты Quaternius в `client/public/assets/characters/quaternius/`.

Другие файлы не менять. Если нужен ещё файл — остановиться и спросить.

## 5. Критерии приёмки

- Игрок и зомби — 3D skinned mesh, не биллборды; модели отличаются.
- idle/walk/run/attack melee/attack pistol/hit/death работают, без застреваний и T-pose.
- Пистолет виден в руке.
- При движении нет лунной походки.
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
