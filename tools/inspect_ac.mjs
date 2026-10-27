import { chromium } from 'playwright-core';
import fs from 'node:fs';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage();
  const b64 = fs.readFileSync('client/public/assets/buildings/roof_ac_unit.png').toString('base64');
  await page.setContent(`<img id="img" src="data:image/png;base64,${b64}">`);
  const b = await page.evaluate(() => {
    const img = document.getElementById('img');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width, maxX = 0, minY = c.height, maxY = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 20) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { w: c.width, h: c.height, minX, maxX, minY, maxY, bottomPadding: c.height - 1 - maxY };
  });
  console.log('AC Unit bounds:', JSON.stringify(b));
  await browser.close();
}
main();
