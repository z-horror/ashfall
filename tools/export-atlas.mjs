import { chromium } from 'playwright-core';
import { writeFileSync, mkdirSync } from 'node:fs';

// Exports the procedural atlases for art review. Requires a running client and
// server plus a guest/registered account; the page signs in as a guest.
const executablePath = process.env.CHROMIUM_PATH || '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome';
mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(process.env.GAME_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.click('#auth-guest');
await page.waitForFunction(() => document.getElementById('loading-screen')?.classList.contains('hidden'), { timeout: 180_000 });
await page.waitForTimeout(1000);
for (const key of ['env_atlas', 'char_atlas']) {
  const data = await page.evaluate((k) => {
    const source = window.__ashfall?.game?.textures?.get(k)?.getSourceImage?.();
    return source && source.toDataURL ? source.toDataURL('image/png') : null;
  }, key);
  if (!data) {
    console.log('missing texture', key);
    continue;
  }
  const path = `screenshots/${key}.png`;
  writeFileSync(path, Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote', path);
}
await browser.close();
