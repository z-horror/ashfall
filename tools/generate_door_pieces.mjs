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

  await page.setContent(`<img id="doorImg" src="data:image/png;base64,${doorClosedB64}">`);

  const results = await page.evaluate(() => {
    const doorImg = document.getElementById('doorImg');
    const dw = doorImg.naturalWidth;
    const dh = doorImg.naturalHeight;

    // 1. Door Frame
    const cFrame = document.createElement('canvas');
    cFrame.width = dw;
    cFrame.height = dh;
    const ctxF = cFrame.getContext('2d');
    ctxF.drawImage(doorImg, 0, 0);

    // Exact inner opening coordinates:
    // xL = 86, xR = 199
    // yTL = 164, yTR = 110
    // yBL = 496, yBR = 442
    ctxF.save();
    ctxF.globalCompositeOperation = 'destination-out';
    ctxF.beginPath();
    ctxF.moveTo(86, 164);
    ctxF.lineTo(199, 110);
    ctxF.lineTo(199, 442);
    ctxF.lineTo(86, 496);
    ctxF.closePath();
    ctxF.fill();
    ctxF.restore();

    // Inner depth shadows along jambs and lintel so the frame looks thick
    ctxF.save();
    ctxF.strokeStyle = 'rgba(12, 10, 8, 0.95)';
    ctxF.lineWidth = 3;
    ctxF.beginPath();
    ctxF.moveTo(86, 164);
    ctxF.lineTo(86, 496);
    ctxF.stroke();
    ctxF.beginPath();
    ctxF.moveTo(86, 164);
    ctxF.lineTo(199, 110);
    ctxF.stroke();
    ctxF.beginPath();
    ctxF.moveTo(199, 110);
    ctxF.lineTo(199, 442);
    ctxF.stroke();

    // Dark threshold reveal
    ctxF.fillStyle = '#2b2620';
    ctxF.beginPath();
    ctxF.moveTo(86, 496);
    ctxF.lineTo(199, 442);
    ctxF.lineTo(199, 450);
    ctxF.lineTo(86, 504);
    ctxF.closePath();
    ctxF.fill();
    ctxF.restore();

    // 2. Closed Door Leaf
    const cLeaf = document.createElement('canvas');
    cLeaf.width = dw;
    cLeaf.height = dh;
    const ctxL = cLeaf.getContext('2d');
    ctxL.drawImage(doorImg, 0, 0);

    ctxL.save();
    ctxL.globalCompositeOperation = 'destination-in';
    ctxL.beginPath();
    ctxL.moveTo(86, 164);
    ctxL.lineTo(199, 110);
    ctxL.lineTo(199, 442);
    ctxL.lineTo(86, 496);
    ctxL.closePath();
    ctxL.fill();
    ctxL.restore();

    // 3. Open Door Leaf (swung 90 degrees inward into the house)
    const cLeafOpen = document.createElement('canvas');
    cLeafOpen.width = dw;
    cLeafOpen.height = dh;
    const ctxO = cLeafOpen.getContext('2d');

    // Hinge is at the left jamb:
    // Top hinge: (86, 164)
    // Bottom hinge: (86, 496)
    // Inward vector into room: dx = +36, dy = +18
    // Outer edge: (122, 182) down to (122, 514)
    // Thickness: +4 px (126, 184) down to (126, 516)

    // Floor shadow
    ctxO.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctxO.beginPath();
    ctxO.moveTo(86, 496);
    ctxO.lineTo(122, 506);
    ctxO.lineTo(128, 504);
    ctxO.lineTo(92, 494);
    ctxO.closePath();
    ctxO.fill();

    // Door thickness edge
    ctxO.fillStyle = '#261e16';
    ctxO.beginPath();
    ctxO.moveTo(122, 182);
    ctxO.lineTo(126, 184);
    ctxO.lineTo(126, 508);
    ctxO.lineTo(122, 506);
    ctxO.closePath();
    ctxO.fill();

    // Door inner face (weathered wood)
    const gFace = ctxO.createLinearGradient(86, 164, 122, 182);
    gFace.addColorStop(0, '#3a2d21');
    gFace.addColorStop(0.5, '#4a3b2e');
    gFace.addColorStop(1, '#34281c');
    ctxO.fillStyle = gFace;
    ctxO.beginPath();
    ctxO.moveTo(86, 164);
    ctxO.lineTo(122, 182);
    ctxO.lineTo(122, 506);
    ctxO.lineTo(86, 496);
    ctxO.closePath();
    ctxO.fill();

    // Inset panel recesses and weathered vertical grain
    ctxO.strokeStyle = 'rgba(15, 12, 8, 0.65)';
    ctxO.lineWidth = 1.2;
    for (let f of [0.3, 0.7]) {
      const px = 86 + (122 - 86) * f;
      const py0 = 164 + (182 - 164) * f;
      const py1 = 496 + (506 - 496) * f;
      ctxO.beginPath();
      ctxO.moveTo(px, py0 + 12);
      ctxO.lineTo(px, py1 - 12);
      ctxO.stroke();
    }
    // Brass latch
    ctxO.fillStyle = '#bfa25d';
    ctxO.fillRect(120, 335, 4, 12);
    ctxO.fillStyle = '#5c4820';
    ctxO.fillRect(118, 339, 5, 4);

    return {
      door_frame: cFrame.toDataURL('image/png').split(',')[1],
      door_leaf: cLeaf.toDataURL('image/png').split(',')[1],
      door_leaf_open: cLeafOpen.toDataURL('image/png').split(',')[1]
    };
  });

  fs.writeFileSync(path.join(buildingsDir, 'door_frame.png'), Buffer.from(results.door_frame, 'base64'));
  fs.writeFileSync(path.join(buildingsDir, 'door_leaf.png'), Buffer.from(results.door_leaf, 'base64'));
  fs.writeFileSync(path.join(buildingsDir, 'door_leaf_open.png'), Buffer.from(results.door_leaf_open, 'base64'));

  console.log('Door frame and leaf assets updated successfully with correct slope!');
  await browser.close();
}

main().catch(console.error);
