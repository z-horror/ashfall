import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const executablePath =
  process.env.CHROMIUM_PATH ||
  (existsSync('/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome')
    ? '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
    : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');

if (!existsSync(executablePath)) {
  console.error('Chromium not found at', executablePath);
  process.exit(1);
}

const outDir = process.env.BUILDING_AUDIT_OUT || resolve('screenshots/building-audit');
mkdirSync(outDir, { recursive: true });

const scenes = [
  ['01-outside', 35.0, 41.0, 0],
  ['02-outside-door', 35.0, 38.0, 0],
  ['03-inside-west', 31.0, 33.0, 0],
  ['04-inside-east', 38.0, 33.0, 0],
  ['05-basement', 33.0, 32.5, -1],
  ['06-mansard', 32.0, 30.5, 1],
  ['07-terrace', 35.5, 35.5, 1],
  ['08-mansard-stairs', 34.5, 32.5, 0],
  ['09-basement-stairs', 37.5, 29.5, 0],
];

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (msg) => {
  console.log(`[browser:${msg.type()}] ${msg.text()}`);
  if (msg.type() === 'error') errors.push(msg.text());
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('response', (res) => {
  if (res.status() >= 400) console.log(`[HTTP ${res.status()}] ${res.url()}`);
});

const url = process.env.GAME_URL || 'http://127.0.0.1:5173/?debugBuildings=1&buildingTest=1';
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const saved = await page.evaluate(() => !document.getElementById('auth-saved-box')?.classList.contains('hidden'));
if (saved) await page.click('#auth-new-guest');
else await page.click('#auth-guest');
await page.waitForFunction(() => document.getElementById('loading-screen')?.classList.contains('hidden'), null, { timeout: 180_000 });
await page.waitForFunction(() => (window.__ashfall?.scene?.buildingViews?.size ?? 0) > 0, null, { timeout: 120_000 });
await page.waitForTimeout(2500);

async function dev(action, args) {
  await page.evaluate(({ action, args }) => {
    if (action === 'teleport' && window.__ashfall?.scene && typeof args?.x === 'number') {
      window.__ashfall.scene.predicted.x = args.x;
      window.__ashfall.scene.predicted.y = args.y;
      if (typeof args?.floor === 'number') window.__ashfall.scene.playerFloor = args.floor;
    }
    return window.__ashfall.net.action({ t: 'dev_action', action, args });
  }, { action, args });
  await page.waitForTimeout(750);
}

async function dumpScene() {
  return page.evaluate(() => {
    const scene = window.__ashfall?.scene;
    if (!scene) return null;
    const num = (n) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : n);
    const image = (obj) => obj && {
      visible: obj.visible,
      depth: num(obj.depth),
      alpha: obj.alpha,
      texture: obj.texture?.key ?? null,
      x: num(obj.x),
      y: num(obj.y),
      displayWidth: num(obj.displayWidth),
      displayHeight: num(obj.displayHeight),
    };
    const views = [];
    for (const view of scene.buildingViews?.values?.() ?? []) {
      const floors = [];
      for (const [level, entry] of view.floors ?? []) {
        floors.push({
          level,
          surfaceVisible: entry.floor?.visible,
          surfaceImageVisible: entry.floorImage?.visible ?? null,
          walls: [...(entry.walls ?? [])].map((wall) => ({
            run: wall.run?.id,
            depth: num(wall.depth),
            cut: wall.cutVisible,
            fullVisible: wall.full?.visible,
            imageVisible: wall.image?.visible ?? null,
            imageDepth: image(wall.image)?.depth ?? null,
          })),
          doors: [...(entry.doors ?? [])].map((door) => ({
            run: door.run?.id,
            depth: num(door.depth),
            active: door.active,
            cut: door.cutVisible,
            open: door.state?.open ?? null,
            closedVisible: door.closedImage?.visible ?? null,
            openVisible: door.openImage?.visible ?? null,
            openLeafVisible: door.openImageLeaf?.visible ?? null,
          })),
          windows: [...(entry.windows ?? [])].map((win) => ({
            id: win.opening?.id,
            run: win.run?.id,
            depth: num(win.depth),
            active: win.active,
            cut: win.cutVisible,
            image: image(win.image),
          })),
          stairs: [...(entry.stairs ?? [])].map((stair) => ({
            id: stair.stair?.id,
            fromLevel: stair.stair?.fromLevel,
            toLevel: stair.stair?.toLevel,
            hole: stair.stair?.hole,
            entry: stair.stair?.entry,
            exit: stair.stair?.exit,
            visible: stair.graphics?.visible,
            depth: num(stair.graphics?.depth),
          })),
          furniture: [...(entry.furniture ?? [])].map((item) => ({
            id: item.object?.id,
            template: item.object?.templateId,
            level: item.object?.level,
            image: image(item.image),
            graphicsVisible: item.graphics?.visible,
            graphicsDepth: num(item.graphics?.depth),
          })),
        });
      }
      views.push({
        building: view.building?.id,
        activeFloor: view.activeFloor,
        inside: view.inside,
        roofMansard: (view.mansardRoofObjects ?? []).map((obj) => ({ visible: obj.visible, depth: num(obj.depth) })),
        roofTerrace: (view.terraceRoofObjects ?? []).map((obj) => ({ visible: obj.visible, depth: num(obj.depth) })),
        floors,
      });
    }
    const globalProps = (scene.children?.list ?? [])
      .filter((obj) => typeof obj.texture?.key === 'string' && /^(prop_|gen_)/.test(obj.texture.key))
      .map((obj) => ({ texture: obj.texture.key, ...image(obj) }));
    return {
      player: {
        floor: scene.playerFloor,
        x: num(scene.predicted?.x),
        y: num(scene.predicted?.y),
        elevation: num(scene.selfView?.elevationM),
        currentBuilding: scene.currentBuilding,
      },
      views,
      globalProps,
      textureKeys: scene.textures.getTextureKeys().filter((key) => /ac|roof|prop_ac/i.test(key)),
    };
  });
}

const dumps = [];
await dev('godmode', {});
for (const [name, x, y, floor] of scenes) {
  await dev('teleport', { x, y, floor });
  if (name === '02-outside-door') {
    await page.evaluate(() => {
      for (const view of window.__ashfall?.scene?.buildingViews?.values?.() ?? []) {
        view.setDoor('o:test:0:door', { openingId: 'o:test:0:door', open: true, locked: false, hp: 100, revision: 1 });
        const door = view.doorViews?.get('o:test:0:door');
        if (door) {
          door.state.open = true;
          door.closedImage?.setVisible(false);
          door.openImage?.setVisible(true);
          door.openImageLeaf?.setVisible(true);
        }
      }
    });
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(outDir, `${name}.png`), timeout: 60_000, animations: 'disabled' });
  dumps.push({ name, scene: await dumpScene() });
}

writeFileSync(resolve(outDir, 'scene.json'), JSON.stringify({ dumps, errors }, null, 2));
console.log(JSON.stringify({ outDir, scenes: scenes.length, errors: errors.length }, null, 2));
await browser.close();
if (errors.length > 0) process.exitCode = 1;
