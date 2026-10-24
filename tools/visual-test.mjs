import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const executablePath =
  process.env.CHROMIUM_PATH ||
  (existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');

if (!existsSync(executablePath)) {
  console.error('chromium not found at', executablePath);
  process.exit(1);
}

mkdirSync(resolve('screenshots'), { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
  ],
});
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
const page = await context.newPage();
const errors = [];
const logs = [];
page.on('console', (msg) => {
  const text = `${msg.type()}: ${msg.text()}`;
  logs.push(text);
  console.log(text);
  if (msg.type() === 'error') errors.push(text);
});
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

console.log('opening page...');
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'screenshots/00-auth.png' });

console.log('clicking guest...');
await page.click('#auth-guest');
console.log('waiting for world...');
await page.waitForFunction(
  () => document.getElementById('loading-screen')?.classList.contains('hidden'),
  null,
  { timeout: 180_000 },
).catch(() => console.log('loading screen did not hide in time'));
await page.waitForTimeout(4000);
await page.screenshot({ path: 'screenshots/01-world.png' });
const deadAfterSpawn = await page.evaluate(() => !document.getElementById('death-overlay')?.classList.contains('hidden'));
if (deadAfterSpawn) {
  console.log('player died at spawn, waiting for respawn');
  await page.waitForTimeout(10_000);
  await page.screenshot({ path: 'screenshots/01b-respawn.png' });
}

// Walk south-east for a moment, then look around.
await page.keyboard.down('KeyS');
await page.keyboard.down('KeyD');
await page.waitForTimeout(1300);
await page.keyboard.up('KeyS');
await page.keyboard.up('KeyD');
await page.waitForTimeout(500);
await page.screenshot({ path: 'screenshots/02-walk.png' });

await page.keyboard.press('KeyI');
await page.waitForTimeout(700);
await page.screenshot({ path: 'screenshots/03-inventory.png' });
await page.keyboard.press('Escape');

// Attack toward the screen centre-right.
await page.mouse.move(1000, 420);
await page.mouse.down();
await page.waitForTimeout(500);
await page.mouse.up();
await page.waitForTimeout(350);
await page.screenshot({ path: 'screenshots/04-combat.png' });

const info = await page.evaluate(() => ({
  loadingHidden: document.getElementById('loading-screen')?.classList.contains('hidden'),
  hudVisible: !document.getElementById('hud')?.classList.contains('hidden'),
  name: document.getElementById('hud-name')?.textContent,
  net: document.getElementById('net-status')?.textContent,
  canvas: !!document.querySelector('#game-root canvas'),
  dead: !document.getElementById('death-overlay')?.classList.contains('hidden'),
  events: [...document.querySelectorAll('#event-log .log-line')].map((n) => n.textContent),
}));

console.log(JSON.stringify({ info, errors, logs: logs.slice(-40) }, null, 2));
await browser.close();
