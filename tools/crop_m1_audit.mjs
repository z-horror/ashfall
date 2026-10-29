import { chromium } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const executablePath =
  process.env.CHROMIUM_PATH ||
  (existsSync('/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome')
    ? '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
    : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');

const inDir = resolve('screenshots/m1-audit');
const outDir = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\0afeb043-3b9e-4335-9045-0fb99010db79';
mkdirSync(outDir, { recursive: true });

const crops = [
  { file: '01-exterior-south.png', name: 'm1-crop-01-south.png', crop: { x: 420, y: 150, w: 600, h: 600 } },
  { file: '02-exterior-east.png', name: 'm1-crop-02-east.png', crop: { x: 420, y: 150, w: 600, h: 600 } },
  { file: '03-exterior-north.png', name: 'm1-crop-03-north.png', crop: { x: 420, y: 150, w: 600, h: 600 } },
  { file: '04-exterior-west.png', name: 'm1-crop-04-west.png', crop: { x: 420, y: 150, w: 600, h: 600 } },
  { file: '05-inside-kitchen-stair-floor0.png', name: 'm1-crop-05-kitchen.png', crop: { x: 420, y: 150, w: 600, h: 600 } },
  { file: '06-inside-basement-floor-minus1.png', name: 'm1-crop-06-basement.png', crop: { x: 420, y: 150, w: 600, h: 600 } },
  { file: '07-inside-basement-stair-view.png', name: 'm1-crop-07-basement-stair.png', crop: { x: 420, y: 150, w: 600, h: 600 } },
  { file: '08-player-against-north-wall.png', name: 'm1-crop-08-player-wall.png', crop: { x: 550, y: 300, w: 340, h: 360 } },
  { file: '09-player-against-west-wall.png', name: 'm1-crop-09-player-west.png', crop: { x: 550, y: 300, w: 340, h: 360 } },
  { file: '10-mansard-floor1.png', name: 'm1-crop-10-mansard.png', crop: { x: 420, y: 150, w: 600, h: 600 } },
  { file: '11-terrace-ac-clutter.png', name: 'm1-crop-11-terrace.png', crop: { x: 420, y: 150, w: 600, h: 600 } },
];

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();

for (const item of crops) {
  const fullPath = join(inDir, item.file);
  if (!existsSync(fullPath)) {
    console.log(`Skipping missing ${fullPath}`);
    continue;
  }
  const base64 = readFileSync(fullPath).toString('base64');
  const dataUri = `data:image/png;base64,${base64}`;

  const croppedBase64 = await page.evaluate(async ({ dataUri, crop }) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = crop.w;
        canvas.height = crop.h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
        resolve(canvas.toDataURL('image/png').split(',')[1]);
      };
      img.src = dataUri;
    });
  }, { dataUri, crop: item.crop });

  const destPath = join(outDir, item.name);
  const buf = Buffer.from(croppedBase64, 'base64');
  writeFileSync(destPath, buf);
  console.log(`Saved crop: ${destPath}`);

  const repoDest = resolve('docs/reference/m1-acceptance', item.name);
  writeFileSync(repoDest, buf);
  console.log(`Saved repo copy: ${repoDest}`);
}

await browser.close();
console.log('Done cropping.');
