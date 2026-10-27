import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const executablePath =
  process.env.CHROMIUM_PATH ||
  (existsSync('/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome')
    ? '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
    : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();

const images = [
  { id: '01', name: '01-outside.png', title: 'Экстерьер: Кровля, кирпич, окно, фундамент' },
  { id: '02', name: '02-outside-door-open.png', title: 'Открытая дверь: Неподвижная коробка и стена' },
  { id: '03', name: '03-inside-west.png', title: 'Спальня (cutaway): Дощатый пол, шкаф без каймы, настенные объекты' },
  { id: '04', name: '04-inside-east.png', title: 'Кухня: 3D-перегородка, лестничный проём без травы' },
  { id: '05', name: '05-basement.png', title: 'Подвал: Бетонный пол, бетонные стены, лестница' }
];

const results = {};

for (const img of images) {
  const filePath = resolve('screenshots/buildings-v3', img.name);
  const data = readFileSync(filePath);
  const b64 = data.toString('base64');
  
  // Resize to max 1280px and compress to JPEG in browser canvas
  const jpegB64 = await page.evaluate(async ({ b64 }) => {
    return new Promise((resolve) => {
      const i = new Image();
      i.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1280 / i.width);
        canvas.width = Math.round(i.width * scale);
        canvas.height = Math.round(i.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(i, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      i.src = 'data:image/png;base64,' + b64;
    });
  }, { b64 });

  results[img.id] = { ...img, dataUri: jpegB64 };
  console.log(`Processed ${img.name}: data URI length = ${jpegB64.length}`);
}

await browser.close();

writeFileSync('tools/evidence_data.json', JSON.stringify(results));
console.log('Saved tools/evidence_data.json');
