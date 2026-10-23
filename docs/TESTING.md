# Тестирование и приёмка

## 1. Базовые команды

```bash
npm ci
npm run typecheck
npm test
npm run build

# поднять БД и мир
docker compose up -d db
npm run migrate
npm run dev        # http://localhost:5173
```

Unit-тесты: `server/test/core.test.ts` (Node test runner + tsx).

Покрыто:

- RLE roundtrip (включая пустой ввод);
- блокировка и скольжение у стен (`moveCircle`);
- конус атаки (`inAttackArc`);
- лимит веса/слотов (`canCarry`);
- целостность `LOOT_TABLES` и `ITEMS`;
- детерминизм генерации мира, свободный спавн на асфальте;
- декодируемость чанка;
- различие городов при разных seed.

Команда `npm test` должна завершаться с кодом 0. CI делает то же самое.

## 2. Visual / smoke (Playwright)

```bash
# нужен запущенный клиент (5173) и сервер (3000)
npm run test:visual
```

Скрипт `tools/visual-test.mjs`:

1. открывает клиент;
2. входит как guest;
3. ждёт `#loading-screen.hidden` (waitForFunction);
4. делает скриншоты:
   - `screenshots/00-auth.png`,
   - `01-world.png`,
   - `02-walk.png`,
   - `03-inventory.png`,
   - `04-combat.png`;
5. собирает console errors/pageerrors и печатает JSON.

Ограничения:

- headless Chromium использует SwiftShader (software WebGL) — старт занимает десятки секунд, это не показатель для GPU;
- если игрок умер, скрипт делает `01b-respawn.png`; для чистых скриншотов используйте безопасную зону (спавн);
- в скрипте есть `CHROMIUM_PATH` и `GAME_URL` для переопределения.

Экспорт атласов:

```bash
node tools/export-atlas.mjs
# screenshots/env_atlas.png, screenshots/char_atlas.png
```

`window.__ashfall = { game, scene, net, hud, audio }` доступен в dev для отладки.

## 3. Ручной чек-лист (один клиент)

- [ ] Регистрация, логин, guest; после перезагрузки сессия восстанавливается.
- [ ] Welcome, 9 чанков, HUD, миникарта; нет ошибок в консоли.
- [ ] Движение WASD/стрелки, Shift, коллизии со стенами/машинами/деревьями.
- [ ] Вход в здание: крыша прячется, стены полупрозрачны, интерьер виден; выход — восстановление.
- [ ] Дверь `E`: открывается/закрывается, коллизия меняется, состояние сохраняется после рестарта.
- [ ] Контейнер `E`: панель, лут, `Взять/Положить`, вес/слоты, закрытие.
- [ ] Подбор `E` и выброс, стаки, запрет при перегрузе.
- [ ] Экипировка оружия, быстрые слоты, использование еды/воды/бинта.
- [ ] Бой с зомби: урон, кровь, смерть, лут, звук.
- [ ] Смерть игрока: экран смерти, таймер, дроп, респавн, пустой инвентарь.
- [ ] Безопасная зона: зомби не атакуют и выталкиваются.
- [ ] Чат `T`, лог событий, toast.
- [ ] Ошибки/дисконнект: статус сети, переподключение.

## 4. Два клиента (обязательно для приёмки)

Ручной сценарий (две вкладки/браузера, лучше два Playwright context):

1. Оба guest-логинятся, появляются в одном мире.
2. Игрок A видит B вблизи и в миникарте.
3. A двигается — B видит плавное движение (интерполяция).
4. B поворачивается/атакует — A видит замах/выстрел.
5. A атакует B: у B падает HP, появляется урон/кровь; смерть → труп, дроп.
6. A и B одновременно жмут подобрать один предмет: ровно один получает; в БД нет дубля.
7. A открывает контейнер, B тоже; каждый видит актуальное содержимое; нельзя взять один стек дважды.
8. A закрывает вкладку: B не падает, зомби/мир продолжают работать; A переподключается и возвращается на позицию.
9. Сервер `SIGTERM` → рестарт: персонажи/инвентарь/лут/двери/зомби восстанавливаются; A и B снова видят друг друга.
10. Проверить, что после рестарта нельзя получить второй стартовый набор и старый лут.

### Автоматизация (рекомендуется)

Создать `tools/e2e-multiplayer.mjs`:

- два `browser.newContext()` (разные localStorage);
- guest-логин через UI в обоих;
- управление клавиатурой в page A, ожидание изменения координат в HUD B;
- атака: подвести A к B по координатам (через debug-интерфейс или движение), зажать ЛКМ, ждать `Вы погибли`/HP;
- инвентарь/лут: подойти к контейнеру, открыть, взять;
- рестарт сервера: `docker compose restart server`, дождаться reconnect, проверить позицию/инвентарь;
- сделать скриншоты и сохранить JSON-отчёт.

Полезно добавить в dev-сборку тестовые хуки (не в прод):

- `window.__ashfall.scene.predicted` — координаты;
- `window.__ashfall.net` — отправка команд;
- `window.__ashfall.scene.currentItems` — предметы;
- `window.__ashfall.scene.zombieViews`.
Это уже частично доступно; можно расширить.

## 5. Проверка сохранений и БД

```bash
docker compose exec db psql -U ashfall -d ashfall
```

Полезные запросы:

```sql
select count(*) from characters;
select id, name, x, y, hp, status, dead_until from characters;
select character_id, item_key, qty, equipped from character_items order by character_id;
select id, item_key, qty, x, y from ground_items;
select id, is_open, hp from world_doors;
select container_id, item_key, qty from container_items;
select count(*), alive from world_zombies group by alive;
select * from world_meta;
select * from world_chunks order by last_seen desc limit 10;
```

Сценарий рестарта:

1. Создать guest, взять предмет, открыть дверь/контейнер, убить зомби.
2. Записать координаты/инвентарь/двери.
3. `docker compose restart server` (или `fuser -k 3000/tcp` + запуск).
4. Войти тем же токеном/логином.
5. Сверить: позиция, HP, инвентарь, двери, контейнер (не должен регенерировать лут), зомби (убитые не воскресли).
6. Убедиться, что стартовый набор не выдан повторно (он даётся только при создании персонажа).

Очистка мира:

```bash
docker compose down -v
docker compose up -d db
npm run migrate
```

## 6. Производительность

Метрики на текущем окружении (headless SwiftShader, 2 vCPU):

- env art ~12.4 с (пак атласа ~7.6 с);
- char art ~9.7–13 с;
- чанк ~1.0–2.4 с;
- старт ~40–50 с.

Как измерять на целевом железе:

1. Открыть devtools Performance, записать 10 с в мире.
2. Проверить FPS, время кадра, число draw calls (`renderer.info`), размеры текстур.
3. Замерить `performance.now()` вокруг `buildEnvironmentArt`, `buildCharacterAssets`, `applyChunk` (логи уже есть).
4. В headless использовать `--use-angle=swiftshader`; в реальном Chrome — hardware GL.
5. Сравнить с `deviceScaleFactor` 1 и 2.

Цели: первый интерактивный кадр < 5 с на среднем ПК (GPU), стабильные 60 FPS в городе, без фризов >100 мс при движении между чанками. Если не достигается — приоритет PERF-01.

## 7. Отладка

- `console.time` логи в `GameScene.create` и `applyChunk`.
- `window.__ashfall` в dev.
- `npm run dev:server` / `dev:client` отдельно.
- Логи сервера: `[sim]`, `[db]`, `[ws]`, `[auth]`.
- `curl http://localhost:3000/api/health`.
- Ошибки WebSocket: codes 4001 auth timeout, 4002 too large, 4003 version, 4004 auth failed, 4005 join failed.
- Если мир не совпадает с БД: проверить `world_meta.world_seed`.
- Если чанки не грузятся: проверить `sentChunks`, `CHUNK_RADIUS`, координаты; в консоли — `chunk ... built`.
- Если персонаж «резинит»: сравнить `predicted` и `self.x/y`, проверить клиентскую коллизию (`ClientWorld.rebuildCollision`), закрытые двери.

## 8. Definition of Done для задач

- `npm run typecheck` без ошибок.
- `npm test` зелёный.
- `npm run build` успешно.
- Ручной/визуальный сценарий из задачи пройден, скриншот/лог приложен.
- Обновлены `docs/STATUS.md`, при необходимости `README`/`PROTOCOL`/`ARCHITECTURE`.
- Нет новых console errors, кроме известных (например, внешние 404).
- Нет секретов в diff.
