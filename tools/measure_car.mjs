import { chromium } from 'playwright-core';
import fs from 'node:fs';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  const buf = fs.readFileSync('client/public/assets/cars/car_highwayman.png');
  const b64 = buf.toString('base64');
  await page.setContent(`<img id="img" src="data:image/png;base64,${b64}">`);
  const res = await page.evaluate(() => {
    const img = document.getElementById('img');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width, maxX = 0, minY = c.height, maxY = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const a = data[(y * c.width + x) * 4 + 3];
        if (a > 20) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { w: c.width, h: c.height, minX, maxX, minY, maxY, spriteW: maxX - minX, spriteH: maxY - minY };
  });
  console.log('Result:', JSON.stringify(res));
  await browser.close();
}

main().catch(console.error);
