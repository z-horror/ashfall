import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();

  const buildingsDir = 'client/public/assets/buildings';
  const doorClosedB64 = fs.readFileSync(path.join(buildingsDir, 'door_closed.png')).toString('base64');
  const doorFrameB64 = fs.readFileSync(path.join(buildingsDir, 'door_frame.png')).toString('base64');

  await page.setContent(`
    <img id="doorImg" src="data:image/png;base64,${doorClosedB64}">
    <img id="frameImg" src="data:image/png;base64,${doorFrameB64}">
  `);

  const results = await page.evaluate(() => {
    const frameImg = document.getElementById('frameImg');
    const dw = frameImg.naturalWidth;
    const dh = frameImg.naturalHeight;

    // Cutaway door frame: keeps only the bottom waist-height portion (under y=380)
    // with smooth stone coping across the cut tops of the jambs!
    const cCut = document.createElement('canvas');
    cCut.width = dw;
    cCut.height = dh;
    const ctxC = cCut.getContext('2d');
    ctxC.drawImage(frameImg, 0, 0);

    ctxC.save();
    ctxC.globalCompositeOperation = 'destination-in';
    // Keep from y=390 down
    ctxC.beginPath();
    ctxC.moveTo(0, 420);
    ctxC.lineTo(dw, 420 - 54);
    ctxC.lineTo(dw, dh);
    ctxC.lineTo(0, dh);
    ctxC.closePath();
    ctxC.fill();
    ctxC.restore();

    // Top coping on the cut posts
    ctxC.save();
    ctxC.fillStyle = '#655e54';
    // Left post top
    ctxC.beginPath();
    ctxC.moveTo(0, 420);
    ctxC.lineTo(86, 420 - 22);
    ctxC.lineTo(86, 420 - 18);
    ctxC.lineTo(0, 424);
    ctxC.closePath();
    ctxC.fill();
    // Right post top
    ctxC.beginPath();
    ctxC.moveTo(199, 420 - 50);
    ctxC.lineTo(dw, 420 - 64);
    ctxC.lineTo(dw, 420 - 60);
    ctxC.lineTo(199, 420 - 46);
    ctxC.closePath();
    ctxC.fill();
    ctxC.restore();

    return {
      door_cutaway: cCut.toDataURL('image/png').split(',')[1]
    };
  });

  fs.writeFileSync(path.join(buildingsDir, 'door_cutaway.png'), Buffer.from(results.door_cutaway, 'base64'));
  console.log('door_cutaway.png generated!');
  await browser.close();
}

main().catch(console.error);
