import { chromium } from 'playwright-core';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const executablePath =
  process.env.CHROMIUM_PATH ||
  (existsSync('/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome')
    ? '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
    : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');

const outDir = resolve('screenshots/m2a-characters');
mkdirSync(outDir, { recursive: true });

async function run() {
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=d3d11',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-webgl',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' || text.includes('error') || text.includes('3d') || text.includes('Character')) {
      console.log(`[browser:${msg.type()}]`, text);
    }
  });

  page.on('pageerror', (err) => {
    console.error('[pageerror]', err.message);
  });

  console.log('Navigating to http://localhost:5173/?render3d=1 ...');
  await page.goto('http://localhost:5173/?render3d=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Log in as guest
  const saved = await page.evaluate(() => !document.getElementById('auth-saved-box')?.classList.contains('hidden'));
  if (saved) await page.click('#auth-new-guest');
  else await page.click('#auth-guest');

  console.log('Waiting for game to boot and world3d to activate...');
  await page.waitForFunction(
    () => {
      const s = window.__ashfall?.scene;
      return s && s.booted && s.world3dActive;
    },
    null,
    { timeout: 30000 },
  );

  console.log('Waiting for 3D character models and textures...');
  await page.waitForTimeout(3000);

  // Set close-up camera zoom to 2.2x to clearly inspect the 3D humanoid rig, weapon, and animations
  await page.evaluate(() => {
    const scene = window.__ashfall?.scene;
    if (scene) {
      scene.cameras.main.setZoom(2.2);
    }
  });
  await page.waitForTimeout(1000);

  // 1. Idle stance with baseball bat in hand
  await page.screenshot({ path: resolve(outDir, '01-character-idle.png') });
  console.log('Captured 01-character-idle.png');

  // 2. Aim rotation: move mouse to the East (bottom-right)
  await page.mouse.move(720 + 250, 450 + 100);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, '02-character-aim-east.png') });
  console.log('Captured 02-character-aim-east.png');

  // 3. Aim rotation: move mouse to North (top-center)
  await page.mouse.move(720, 450 - 250);
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, '03-character-aim-north.png') });
  console.log('Captured 03-character-aim-north.png');

  // 4. Movement / Walk animation: press D to walk East
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(outDir, '04-character-walk.png') });
  console.log('Captured 04-character-walk.png');

  // 5. Sprint / Run animation: hold Shift
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(outDir, '05-character-run.png') });
  console.log('Captured 05-character-run.png');

  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(400);

  // 6. Attack swing: click left mouse button with baseball bat
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(100);
  await page.mouse.up({ button: 'left' });
  await page.waitForTimeout(220); // capture mid-swing
  await page.screenshot({ path: resolve(outDir, '06-character-attack-swing.png') });
  console.log('Captured 06-character-attack-swing.png');

  // Wait for attack animation to complete and return to idle
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(outDir, '07-character-return-idle.png') });
  console.log('Captured 07-character-return-idle.png');

  // Switch to pistol (hotkey '2') if available
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, '08-character-pistol.png') });
  console.log('Captured 08-character-pistol.png');

  await browser.close();
  console.log('Test completed successfully! All screenshots saved in', outDir);
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
