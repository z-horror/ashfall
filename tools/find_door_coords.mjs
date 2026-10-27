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
  const pts = await page.evaluate(() => {
    const img = document.getElementById('img');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const leftCol = [];
    const rightCol = [];
    for (let y = 120; y <= 240; y += 4) {
      const dL = ctx.getImageData(90, y, 1, 1).data;
      const dR = ctx.getImageData(195, y, 1, 1).data;
      leftCol.push({ y, r: dL[0], g: dL[1], b: dL[2] });
      rightCol.push({ y, r: dR[0], g: dR[1], b: dR[2] });
    }
    return { leftCol, rightCol };
  });
  console.log('Left col x=90:', JSON.stringify(pts.leftCol));
  console.log('Right col x=195:', JSON.stringify(pts.rightCol));
  await browser.close();
}

main().catch(console.error);
