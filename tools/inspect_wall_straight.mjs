import { chromium } from 'playwright-core';
import fs from 'node:fs';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  const b64 = fs.readFileSync('client/public/assets/buildings/wall_straight_h.png').toString('base64');
  await page.setContent(`<img id="img" src="data:image/png;base64,${b64}">`);

  const info = await page.evaluate(() => {
    const img = document.getElementById('img');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Let's inspect the coping angle, the footing angle, and the mortar lines.
    // In wall_straight_h.png:
    // Left edge has an end face (thickness of wall). Where does that end face end and front brick face begin?
    // Let's find the vertical seam between end-face and front-face.
    const sliceY = 300;
    const data = ctx.getImageData(0, sliceY, c.width, 1).data;
    const colors = [];
    for (let x = 0; x < c.width; x += 4) {
      const i = x * 4;
      colors.push({ x, r: data[i], g: data[i+1], b: data[i+2], a: data[i+3] });
    }
    return { width: c.width, height: c.height, colors };
  });

  fs.writeFileSync('tools/wall_straight_analysis.json', JSON.stringify(info, null, 2));
  console.log('Analysis saved to tools/wall_straight_analysis.json');
  await browser.close();
}

main().catch(console.error);
