import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const outDir = 'screenshots/audit-local';
const cropDir = 'screenshots/audit-crops';
fs.mkdirSync(cropDir, { recursive: true });

const crops = [
  { name: '01-outside', x: 500, y: 250, w: 500, h: 420 },
  { name: '01-outside-door', file: '01-outside', x: 250, y: 450, w: 350, h: 400 },
  { name: '02-outside-door', file: '02-outside-door', x: 250, y: 400, w: 400, h: 420 },
  { name: '03-inside-west', x: 450, y: 300, w: 550, h: 420 },
  { name: '04-inside-east', x: 480, y: 300, w: 550, h: 420 },
  { name: '05-basement', x: 450, y: 260, w: 550, h: 420 },
  { name: '06-mansard', x: 480, y: 280, w: 550, h: 420 },
  { name: '07-terrace', x: 560, y: 350, w: 450, h: 360 },
  { name: '08-mansard-stairs', x: 520, y: 320, w: 450, h: 400 },
  { name: '09-basement-stairs', x: 520, y: 320, w: 450, h: 400 },
];

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  for (const c of crops) {
    const fileName = c.file || c.name;
    const srcPath = path.resolve(outDir, `${fileName}.png`);
    if (!fs.existsSync(srcPath)) continue;
    const b64 = fs.readFileSync(srcPath).toString('base64');
    await page.setContent(`<body style="margin:0;background:#000"><img src="data:image/png;base64,${b64}"></body>`);
    const cropPath = path.resolve(cropDir, `crop-${c.name}.png`);
    await page.screenshot({
      path: cropPath,
      clip: { x: c.x, y: c.y, width: c.w, height: c.h },
    });
    console.log(`Saved ${cropPath}`);
  }

  await browser.close();
}

main().catch(console.error);
