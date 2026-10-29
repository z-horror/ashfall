import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const exe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const inDir = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\0afeb043-3b9e-4335-9045-0fb99010db79';
const outDir = resolve('docs/reference/m1-acceptance');
mkdirSync(outDir, { recursive: true });

const files = [
  'm1-crop-01-south.png',
  'm1-crop-02-east.png',
  'm1-crop-03-north.png',
  'm1-crop-04-west.png',
  'm1-crop-05-kitchen.png',
  'm1-crop-06-basement.png',
  'm1-crop-07-basement-stair.png',
  'm1-crop-08-player-wall.png',
  'm1-crop-09-player-west.png',
  'm1-crop-10-mansard.png',
  'm1-crop-11-terrace.png',
];

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage();

for (const f of files) {
  const p = join(inDir, f);
  if (!existsSync(p)) continue;
  const base64 = readFileSync(p).toString('base64');
  const uri = `data:image/png;base64,${base64}`;
  await page.setContent(`<img id="target" src="${uri}" style="margin:0;padding:0;display:block;">`);
  const img = await page.$('#target');
  const outName = f.replace('.png', '.jpg');
  await img.screenshot({ path: join(outDir, outName), type: 'jpeg', quality: 85 });
  console.log('Saved', outName);
}
await browser.close();
