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

  const bounds = await page.evaluate(() => {
    const img = document.getElementById('img');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, c.width, c.height);
    const data = imgData.data;

    // In door_closed.png:
    // Left jamb is the dark vertical wood piece.
    // Lintel is the dark horizontal wood piece across the top.
    // Right jamb is the dark vertical wood piece on the right.
    // The leaf is inside the jambs and under the lintel.
    
    // Let's find the inner door opening polygon / coordinates.
    // At y = 300 (waist/handle height):
    // Let's scan from left to right:
    // Wall brick -> Left jamb -> Door leaf -> Right jamb -> Right wall
    const scan = [];
    for (let x = 0; x < c.width; x++) {
      const i = (300 * c.width + x) * 4;
      scan.push({ x, r: data[i], g: data[i+1], b: data[i+2], a: data[i+3] });
    }

    // Top lintel scan along column x = 140 (middle of door):
    const colScan = [];
    for (let y = 0; y < c.height; y++) {
      const i = (y * c.width + 140) * 4;
      colScan.push({ y, r: data[i], g: data[i+1], b: data[i+2], a: data[i+3] });
    }

    return { scanAtY300: scan.filter(p => p.x % 5 === 0), colScanAtX140: colScan.filter(p => p.y % 10 === 0) };
  });

  console.log('Column scan:', JSON.stringify(bounds.colScanAtX140.filter(p => p.a > 0)));
  console.log('Row scan:', JSON.stringify(bounds.scanAtY300.filter(p => p.a > 0)));
  await browser.close();
}

main().catch(console.error);
