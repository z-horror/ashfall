import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
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

const outDir = process.env.BUILDING_TEST_OUT || resolve('screenshots/buildings-v3');
const brainDir = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\0afeb043-3b9e-4335-9045-0fb99010db79';
mkdirSync(outDir, { recursive: true });
if (existsSync(brainDir)) mkdirSync(brainDir, { recursive: true });
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

const url = process.env.GAME_URL || 'http://127.0.0.1:5173/?debugBuildings=1&buildingTest=1';
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const saved = await page.evaluate(() => !document.getElementById('auth-saved-box')?.classList.contains('hidden'));
if (saved) await page.click('#auth-new-guest');
else await page.click('#auth-guest');
await page.waitForFunction(() => document.getElementById('loading-screen')?.classList.contains('hidden'), null, { timeout: 180_000 });
await page.waitForFunction(() => (window.__ashfall?.scene?.buildingViews?.size ?? 0) > 0, null, { timeout: 120_000 });
await page.waitForTimeout(3000);

async function dev(action, args) {
  await page.evaluate(({ action, args }) => window.__ashfall.net.action({ t: 'dev_action', action, args }), { action, args });
  await page.waitForTimeout(700);
}
async function shot(name) {
  const p1 = resolve(outDir, name);
  await page.screenshot({ path: p1, timeout: 60_000, animations: 'disabled' });
  if (existsSync(brainDir)) {
    const p2 = resolve(brainDir, name);
    copyFileSync(p1, p2);
  }
}

await dev('godmode', {});
await dev('teleport', { x: 35.0, y: 41.0, floor: 0 });
await page.waitForTimeout(1000);
await shot('01-outside.png');

await dev('teleport', { x: 35.0, y: 38.0, floor: 0 });
await page.waitForTimeout(500);
await page.evaluate(() => window.__ashfall.net.action({ t: 'interact' }));
await page.waitForTimeout(1000);
await shot('02-outside-door-open.png');

await dev('teleport', { x: 31.0, y: 33.0, floor: 0 });
await page.waitForTimeout(1000);
await shot('03-inside-west.png');

await dev('teleport', { x: 38.0, y: 33.0, floor: 0 });
await page.waitForTimeout(1000);
await shot('04-inside-east.png');

await dev('teleport', { x: 33.0, y: 32.5, floor: -1 });
await page.waitForTimeout(1000);
await shot('05-basement.png');

await dev('teleport', { x: 32.0, y: 30.5, floor: 1 });
await page.waitForTimeout(1000);
await shot('06-mansard.png');

const info = await page.evaluate(() => {
  const scene = window.__ashfall?.scene;
  return {
    floor: scene?.playerFloor ?? null,
    buildings: scene?.world?.buildings?.size ?? null,
    views: scene?.buildingViews?.size ?? null,
    loadingHidden: document.getElementById('loading-screen')?.classList.contains('hidden'),
    name: document.getElementById('hud-name')?.textContent,
    fps: scene?.game?.loop?.actualFps ?? null,
  };
});
console.log(JSON.stringify({ info, errors }, null, 2));
await browser.close();
if (errors.length > 0) process.exitCode = 1;
