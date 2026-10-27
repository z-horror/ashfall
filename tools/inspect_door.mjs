import { chromium } from 'playwright-core';
import fs from 'node:fs';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  const b64 = fs.readFileSync('client/public/assets/buildings/door_closed.png').toString('base64');
  await page.setContent(`<img id="img" src="data:image/png;base64,${b64}">`);
  
  const coords = await page.evaluate(() => {
    const img = document.getElementById('img');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Let's sample along horizontal lines at y = 150, 250, 350
    // and find where the door leaf starts and ends
    const samples = [150, 250, 350, 450].map(y => {
      const data = ctx.getImageData(0, y, c.width, 1).data;
      const row = [];
      for (let x = 0; x < c.width; x += 5) {
        const i = x * 4;
        row.push({ x, r: data[i], g: data[i+1], b: data[i+2], a: data[i+3] });
      }
      return { y, row };
    });

    return { width: c.width, height: c.height, samples };
  });

  fs.writeFileSync('tools/door_samples.json', JSON.stringify(coords, null, 2));
  console.log('Door analysis written to tools/door_samples.json');
  await browser.close();
}

main().catch(console.error);
