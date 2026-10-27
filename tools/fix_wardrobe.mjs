import { chromium } from 'playwright-core';
import fs from 'node:fs';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  const file = 'client/public/assets/buildings/wardrobe.png';
  const b64 = fs.readFileSync(file).toString('base64');
  await page.setContent(`<img id="img" src="data:image/png;base64,${b64}">`);

  const res = await page.evaluate(() => {
    const img = document.getElementById('img');
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const idata = ctx.getImageData(0, 0, w, h);
    const d = idata.data;

    const samples = [];
    let count = 0;
    // Check all pixels in bottom 60 rows
    for (let y = h - 60; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
        // Any red-ish tone
        if (a > 0 && r > 70 && r > g * 1.2 && r > b * 1.2) {
          if (samples.length < 10) samples.push({ x, y, r, g, b, a });
          d[i + 3] = 0; // Clear it
          count++;
        }
      }
    }
    ctx.putImageData(idata, 0, 0);
    return { count, samples, b64: c.toDataURL('image/png').split(',')[1] };
  });

  console.log('Result:', res.count, res.samples);
  fs.writeFileSync(file, Buffer.from(res.b64, 'base64'));
  await browser.close();
}

main().catch(console.error);
