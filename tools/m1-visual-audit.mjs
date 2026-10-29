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

const outDir = process.env.M1_AUDIT_OUT || resolve('screenshots/m1-audit');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=d3d11',
    '--enable-unsafe-swiftshader',
  ],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const consoleLogs = [];

page.on('console', (msg) => {
  const text = `[browser:${msg.type()}] ${msg.text()}`;
  consoleLogs.push(text);
  if (msg.type() === 'error') {
    console.error(text);
    errors.push(msg.text());
  }
});
page.on('pageerror', (err) => {
  const text = `[pageerror] ${err.message}`;
  console.error(text);
  errors.push(text);
});

const url = process.env.GAME_URL || 'http://127.0.0.1:5173/?render3d=1&buildingTest=1';
console.log('Navigating to', url);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

// Log in as guest
const saved = await page.evaluate(() => !document.getElementById('auth-saved-box')?.classList.contains('hidden'));
if (saved) await page.click('#auth-new-guest');
else await page.click('#auth-guest');

console.log('Waiting for game to boot and world3d to activate...');
await page.waitForFunction(() => {
  const s = window.__ashfall?.scene;
  return s && s.booted && s.world3dActive;
}, null, { timeout: 120_000 });

console.log('World3D activated! Waiting for world stabilization...');
await page.waitForTimeout(3000);

async function teleport(x, y, floor = 0) {
  await page.evaluate(({ x, y, floor }) => {
    const s = window.__ashfall?.scene;
    if (!s) return;
    s.predicted.x = x;
    s.predicted.y = y;
    s.playerFloor = floor;
    return window.__ashfall.net.action({
      t: 'dev_action',
      action: 'teleport',
      args: { x, y, floor },
    });
  }, { x, y, floor });
  await page.waitForTimeout(1200);
}

const auditSteps = [
  { name: '01-exterior-south', x: 35.0, y: 41.0, floor: 0 },
  { name: '02-exterior-east', x: 44.0, y: 32.5, floor: 0 },
  { name: '03-exterior-north', x: 35.0, y: 24.5, floor: 0 },
  { name: '04-exterior-west', x: 24.5, y: 32.5, floor: 0 },
  { name: '05-inside-kitchen-stair-floor0', x: 38.0, y: 33.0, floor: 0 },
  { name: '06-inside-basement-floor-minus1', x: 33.0, y: 32.5, floor: -1 },
  { name: '07-inside-basement-stair-view', x: 37.5, y: 30.5, floor: -1 },
  { name: '08-player-against-north-wall', x: 31.0, y: 28.3, floor: 0 },
  { name: '09-player-against-west-wall', x: 28.3, y: 33.0, floor: 0 },
  { name: '10-mansard-floor1', x: 32.0, y: 30.5, floor: 1 },
  { name: '11-terrace-ac-clutter', x: 35.5, y: 35.5, floor: 1 },
];

for (const step of auditSteps) {
  console.log(`Auditing ${step.name} at (${step.x}, ${step.y}, floor=${step.floor})...`);
  await teleport(step.x, step.y, step.floor);
  await page.waitForTimeout(500);
  const screenshotPath = resolve(outDir, `${step.name}.png`);
  await page.screenshot({ path: screenshotPath, type: 'png' });
  console.log(`Saved screenshot: ${screenshotPath}`);
}

const report = {
  url,
  outDir,
  totalScreenshots: auditSteps.length,
  errors,
  consoleLogsCount: consoleLogs.length,
};

writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log('M1 visual audit finished. Errors:', errors.length);

await browser.close();
if (errors.length > 0) {
  process.exitCode = 1;
}
