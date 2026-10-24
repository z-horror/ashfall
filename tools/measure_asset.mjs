import { chromium } from 'playwright-core';
import fs from 'node:fs';

const inputPath = process.argv[2] || 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/wall_brick_south_1792872750820.jpg';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  const b64 = fs.readFileSync(inputPath).toString('base64');
  const isJpg = inputPath.endsWith('.jpg');
  await page.setContent(`<img id="img" src="data:${isJpg ? 'image/jpeg' : 'image/png'};base64,${b64}">`);

  const info = await page.evaluate(() => {
    const img = document.getElementById('img');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    
    // Sample points along the top coping
    // Look at columns from x = 200 to x = 800
    const points = [];
    for (let x = 200; x <= 800; x += 50) {
      for (let y = 50; y < c.height - 50; y++) {
        const i = (y * c.width + x) * 4;
        if (data[i] > 30 || data[i+1] > 30 || data[i+2] > 30) {
          points.push({ x, y });
          break;
        }
      }
    }
    // Calculate slope between first and last sample points
    const p0 = points[0];
    const pEnd = points[points.length - 1];
    const slope = (pEnd.y - p0.y) / (pEnd.x - p0.x);

    return { points, slope, angleDeg: Math.atan(slope) * 180 / Math.PI };
  });

  console.log('Slope analysis:', JSON.stringify(info, null, 2));
  await browser.close();
}

main().catch(console.error);
