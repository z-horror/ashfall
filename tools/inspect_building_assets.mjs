import { chromium } from 'playwright-core';
import fs from 'node:fs';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();

  for (const name of ['wall_straight_h.png', 'wall_corner.png', 'door_closed.png', 'bed_double.png', 'wardrobe.png']) {
    const b64 = fs.readFileSync('client/public/assets/buildings/' + name).toString('base64');
    await page.setContent(`<img id="img" src="data:image/png;base64,${b64}">`);
    const info = await page.evaluate(() => {
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
      return {
        width: c.width,
        height: c.height,
        bbox: { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 }
      };
    });
    console.log(name, JSON.stringify(info));
  }
  await browser.close();
}

main().catch(console.error);
