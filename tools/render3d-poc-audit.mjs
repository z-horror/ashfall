import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const executablePath =
  process.env.CHROMIUM_PATH ||
  (existsSync('/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome')
    ? '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
    : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');

if (!existsSync(executablePath)) {
  console.error('Chromium not found at', executablePath);
  process.exit(1);
}

const url = process.env.POC_URL || 'http://127.0.0.1:5176/render3d.html';
const outDir = process.env.POC_OUT || resolve('docs/reference/three-poc');
mkdirSync(outDir, { recursive: true });

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
page.on('pageerror', (error) => {
  console.log(`[pageerror] ${error.message}`);
  errors.push(error.message);
});

async function shot(name) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: resolve(outDir, `${name}.jpg`), type: 'jpeg', quality: 88 });
  console.log('saved', `${name}.jpg`);
}

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__pocReady === true, null, { timeout: 120_000 });

await page.evaluate(() => window.__poc.setView('exterior'));
await shot('01-exterior');
await page.evaluate(() => window.__poc.setView('terrace'));
await shot('02-terrace');
await page.evaluate(() => window.__poc.setView('interior'));
await shot('03-interior-cutaway');

await page.evaluate(() => window.__poc.setCutaway(false));
await shot('04-interior-no-cutaway');

await page.evaluate(() => window.__poc.setView('door'));
await shot('05-door');

await page.evaluate(() => window.__poc.setView('animation'));
await page.waitForTimeout(120);
await page.screenshot({ path: resolve(outDir, '06-animation-a.jpg'), type: 'jpeg', quality: 88 });
await page.waitForTimeout(180);
await page.screenshot({ path: resolve(outDir, '07-animation-b.jpg'), type: 'jpeg', quality: 88 });
console.log('saved animation frames');

await page.evaluate(() => window.__poc.setView('layers'));
await shot('08-layers');

await page.evaluate(() => window.__poc.setView('variant'));
await shot('09-variant');

await page.evaluate(() => {
  window.__poc.setView('exterior');
  window.__poc.setCamera(130, 30);
});
await shot('10-angle');

await page.evaluate(() => window.__poc.setView('corner'));
await shot('11-corner');

const report = {
  url,
  outDir: relative(process.cwd(), outDir),
  errors,
  screenshots: ['01-exterior.jpg', '02-terrace.jpg', '03-interior-cutaway.jpg', '04-interior-no-cutaway.jpg', '05-door.jpg', '06-animation-a.jpg', '07-animation-b.jpg', '08-layers.jpg', '09-variant.jpg', '10-angle.jpg', '11-corner.jpg'],
};
writeFileSync(resolve(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
