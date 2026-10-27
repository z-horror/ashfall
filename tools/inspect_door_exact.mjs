import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const assetsDir = 'C:\\Users\\User\\.gemini\\antigravity\\scratch\\ashfall\\client\\public\\assets\\buildings';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();

  for (const name of ['door_frame.png', 'door_leaf.png', 'door_leaf_open.png']) {
    const file = path.join(assetsDir, name);
    if (!fs.existsSync(file)) {
      console.log('Not found:', name);
      continue;
    }
    const b64 = fs.readFileSync(file).toString('base64');
    await page.setContent(`<img id="img" src="data:image/png;base64,${b64}">`);
    const bounds = await page.evaluate(() => {
      const img = document.getElementById('img');
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      let minX = w, maxX = 0, minY = h, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const a = data[(y * w + x) * 4 + 3];
          if (a > 20) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      return { w, h, minX, maxX, minY, maxY, visibleW: maxX - minX + 1, visibleH: maxY - minY + 1 };
    });
    console.log(name, bounds);
  }

  await browser.close();
}

main().catch(console.error);
