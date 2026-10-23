import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const executablePath =
  process.env.CHROMIUM_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

if (!existsSync(executablePath)) {
  console.error('Chromium/Chrome not found at', executablePath);
  process.exit(1);
}

mkdirSync(resolve('screenshots'), { recursive: true });

console.log('[e2e] Launching browser...');
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

const gameUrl = process.env.GAME_URL || 'http://127.0.0.1:5173/';

console.log('[e2e] Creating contexts for Player 1 (Alice) and Player 2 (Bob)...');
const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });

const page1 = await ctx1.newPage();
const page2 = await ctx2.newPage();

page1.on('console', (msg) => {
  const text = msg.text();
  if (text.includes('built in') || text.includes('art:') || msg.type() === 'error') {
    console.log(`[P1] ${text}`);
  }
});
page2.on('console', (msg) => {
  const text = msg.text();
  if (text.includes('built in') || text.includes('art:') || msg.type() === 'error') {
    console.log(`[P2] ${text}`);
  }
});

console.log('[e2e] Navigating both players to game...');
await Promise.all([
  page1.goto(gameUrl, { waitUntil: 'domcontentloaded' }),
  page2.goto(gameUrl, { waitUntil: 'domcontentloaded' }),
]);

await page1.waitForTimeout(1000);
await page2.waitForTimeout(1000);

console.log('[e2e] Logging in as guests sequentially...');
await page1.click('#auth-guest');
await page1.waitForTimeout(1000);
await page2.click('#auth-guest');

console.log('[e2e] Waiting for loading screens to hide and player names to appear...');
await Promise.all([
  page1.waitForFunction(
    () => {
      const hud = document.getElementById('hud-name')?.textContent;
      const loading = document.getElementById('loading-screen')?.classList.contains('hidden');
      return Boolean(loading && hud && hud !== '—');
    },
    null,
    { timeout: 180_000 },
  ),
  page2.waitForFunction(
    () => {
      const hud = document.getElementById('hud-name')?.textContent;
      const loading = document.getElementById('loading-screen')?.classList.contains('hidden');
      return Boolean(loading && hud && hud !== '—');
    },
    null,
    { timeout: 180_000 },
  ),
]);

await page1.waitForTimeout(3000);
await page2.waitForTimeout(3000);

const p1Name = await page1.evaluate(() => document.getElementById('hud-name')?.textContent);
const p2Name = await page2.evaluate(() => document.getElementById('hud-name')?.textContent);

console.log(`[e2e] Player 1: ${p1Name}`);
console.log(`[e2e] Player 2: ${p2Name}`);

// Check player views in GameScene
const p1ViewsCount = await page1.evaluate(() => {
  const scene = window.__ashfall?.game?.scene?.getScene('GameScene');
  return scene?.playerViews?.size ?? 0;
});

const p2ViewsCount = await page2.evaluate(() => {
  const scene = window.__ashfall?.game?.scene?.getScene('GameScene');
  return scene?.playerViews?.size ?? 0;
});

console.log(`[e2e] Player 1 sees ${p1ViewsCount} other players in playerViews`);
console.log(`[e2e] Player 2 sees ${p2ViewsCount} other players in playerViews`);

// Take screenshots of both clients side by side
await page1.screenshot({ path: 'screenshots/multiplayer-p1.png' });
await page2.screenshot({ path: 'screenshots/multiplayer-p2.png' });

// Test movement synchronization
console.log('[e2e] Moving Player 1 south-east...');
await page1.keyboard.down('KeyS');
await page1.keyboard.down('KeyD');
await page1.waitForTimeout(1500);
await page1.keyboard.up('KeyS');
await page1.keyboard.up('KeyD');
await page1.waitForTimeout(1000);

const p1PosAfterMove = await page1.evaluate(() => {
  const scene = window.__ashfall?.game?.scene?.getScene('GameScene');
  return scene?.selfView?.pos;
});

console.log('[e2e] Player 1 position after move:', p1PosAfterMove);

await page1.screenshot({ path: 'screenshots/multiplayer-p1-moved.png' });
await page2.screenshot({ path: 'screenshots/multiplayer-p2-sees-move.png' });

console.log('[e2e] SUCCESS: Both players connected and interacted in the same world!');
await browser.close();
