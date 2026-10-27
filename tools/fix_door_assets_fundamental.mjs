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

  function b64(filePath) {
    return fs.readFileSync(filePath).toString('base64');
  }

  const frameFile = path.join(assetsDir, 'door_frame.png');
  const leafFile = path.join(assetsDir, 'door_leaf.png');

  await page.setContent(`
    <img id="frame" src="data:image/png;base64,${b64(frameFile)}">
    <img id="leaf" src="data:image/png;base64,${b64(leafFile)}">
  `);

  const results = await page.evaluate(() => {
    function cropOpaque(img) {
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
      return { c, minX, maxX, minY, maxY, cropW: maxX - minX + 1, cropH: maxY - minY + 1 };
    }

    const frameCrop = cropOpaque(document.getElementById('frame'));
    const leafCrop = cropOpaque(document.getElementById('leaf'));

    // 1. Create 100% full-bleed door_frame.png (256 x 512)
    // Frame outer edges touch ALL FOUR BORDERS: y=0 (top), y=511 (bottom), x=0 (left), x=255 (right)
    const outFrameW = 256;
    const outFrameH = 512;
    const cFrame = document.createElement('canvas');
    cFrame.width = outFrameW;
    cFrame.height = outFrameH;
    const ctxFrame = cFrame.getContext('2d');

    // Draw cropped frame stretched to exact full borders
    ctxFrame.drawImage(
      frameCrop.c,
      frameCrop.minX, frameCrop.minY, frameCrop.cropW, frameCrop.cropH,
      0, 0, outFrameW, outFrameH
    );

    // Frame jamb width: 28px left, 28px right, 28px top header, 10px bottom threshold
    const jambW = 26;
    const headH = 26;
    const threshH = 10;
    const openingX = jambW;
    const openingY = headH;
    const openingW = outFrameW - jambW * 2;
    const openingH = outFrameH - headH - threshH;

    // Clear opening so interior shows cleanly
    ctxFrame.clearRect(openingX, openingY, openingW, openingH);

    // Reinforce casing edges with authentic wooden bevel and threshold
    ctxFrame.fillStyle = '#3a2a1a';
    ctxFrame.fillRect(0, 0, jambW, outFrameH); // left jamb
    ctxFrame.fillRect(outFrameW - jambW, 0, jambW, outFrameH); // right jamb
    ctxFrame.fillRect(0, 0, outFrameW, headH); // head casing
    // Wooden threshold / sill
    ctxFrame.fillStyle = '#4a3826';
    ctxFrame.fillRect(0, outFrameH - threshH, outFrameW, threshH);
    ctxFrame.fillStyle = '#6a523a';
    ctxFrame.fillRect(0, outFrameH - threshH, outFrameW, 2);

    // Inner shadow in the door rebate / stop
    ctxFrame.fillStyle = 'rgba(10, 8, 6, 0.6)';
    ctxFrame.fillRect(openingX, openingY, 4, openingH);
    ctxFrame.fillRect(openingX, openingY, openingW, 4);

    // 2. Create 100% matching door_leaf.png (fits exact opening)
    const cLeaf = document.createElement('canvas');
    cLeaf.width = openingW;
    cLeaf.height = openingH;
    const ctxLeaf = cLeaf.getContext('2d');

    ctxLeaf.drawImage(
      leafCrop.c,
      leafCrop.minX, leafCrop.minY, leafCrop.cropW, leafCrop.cropH,
      0, 0, openingW, openingH
    );

    // Add door panels and brass knob with shadow
    const knobX = openingW - 18;
    const knobY = openingH * 0.52;
    ctxLeaf.fillStyle = '#d4af37'; // brass plate
    ctxLeaf.fillRect(knobX - 4, knobY - 12, 8, 24);
    ctxLeaf.fillStyle = '#f5c542'; // brass knob
    ctxLeaf.beginPath();
    ctxLeaf.arc(knobX, knobY, 6, 0, Math.PI * 2);
    ctxLeaf.fill();
    ctxLeaf.fillStyle = 'rgba(0,0,0,0.4)';
    ctxLeaf.beginPath();
    ctxLeaf.arc(knobX + 2, knobY + 2, 6, 0, Math.PI * 2);
    ctxLeaf.stroke();

    // 3. Create high-fidelity open door leaf (swung 90 degrees inward)
    // In dimetric isometric view: door thickness 24px, door front/edge viewed at perspective
    const cOpen = document.createElement('canvas');
    cOpen.width = 160;
    cOpen.height = outFrameH;
    const ctxOpen = cOpen.getContext('2d');

    // Swing door leaf: hinged on the left (x=20)
    // Vertical height is 100% openingH from y=headH to y=headH+openingH
    const yTop = headH;
    const yBot = outFrameH - threshH;
    const doorH = yBot - yTop;
    const leafThick = 18;
    const leafSwingW = 100;

    // Contact shadow of open door leaf on floor
    ctxOpen.fillStyle = 'rgba(12, 10, 8, 0.45)';
    ctxOpen.beginPath();
    ctxOpen.moveTo(20, yBot);
    ctxOpen.lineTo(20 + leafSwingW, yBot - 40);
    ctxOpen.lineTo(20 + leafSwingW + 16, yBot - 36);
    ctxOpen.lineTo(20 + 16, yBot + 4);
    ctxOpen.closePath();
    ctxOpen.fill();

    // Open door leaf face (wood grain patina)
    ctxOpen.fillStyle = '#543d28';
    ctxOpen.beginPath();
    ctxOpen.moveTo(20, yTop);
    ctxOpen.lineTo(20 + leafSwingW, yTop - 40);
    ctxOpen.lineTo(20 + leafSwingW, yBot - 40);
    ctxOpen.lineTo(20, yBot);
    ctxOpen.closePath();
    ctxOpen.fill();

    // Wood panels on open door leaf
    ctxOpen.strokeStyle = '#3a2818';
    ctxOpen.lineWidth = 2;
    ctxOpen.stroke();

    // Top edge thickness (visible in isometric!)
    ctxOpen.fillStyle = '#7a5a3a';
    ctxOpen.beginPath();
    ctxOpen.moveTo(20, yTop);
    ctxOpen.lineTo(20 + leafSwingW, yTop - 40);
    ctxOpen.lineTo(20 + leafSwingW + leafThick, yTop - 40 + 8);
    ctxOpen.lineTo(20 + leafThick, yTop + 8);
    ctxOpen.closePath();
    ctxOpen.fill();

    // Outer edge thickness (vertical end face)
    ctxOpen.fillStyle = '#6a4e32';
    ctxOpen.beginPath();
    ctxOpen.moveTo(20 + leafSwingW, yTop - 40);
    ctxOpen.lineTo(20 + leafSwingW + leafThick, yTop - 40 + 8);
    ctxOpen.lineTo(20 + leafSwingW + leafThick, yBot - 40 + 8);
    ctxOpen.lineTo(20 + leafSwingW, yBot - 40);
    ctxOpen.closePath();
    ctxOpen.fill();

    // Brass latch bolt on door edge
    ctxOpen.fillStyle = '#f5c542';
    ctxOpen.fillRect(20 + leafSwingW + 2, yTop + doorH * 0.5 - 6, leafThick - 4, 12);

    // Brass hinges at top and bottom of hinge jamb (x=20)
    ctxOpen.fillStyle = '#c5a030';
    ctxOpen.fillRect(16, yTop + 30, 8, 16);
    ctxOpen.fillRect(16, yBot - 50, 8, 16);

    return {
      frameB64: cFrame.toDataURL('image/png').split(',')[1],
      leafB64: cLeaf.toDataURL('image/png').split(',')[1],
      openB64: cOpen.toDataURL('image/png').split(',')[1],
      openingX, openingY, openingW, openingH, outFrameW, outFrameH
    };
  });

  fs.writeFileSync(path.join(assetsDir, 'door_frame.png'), Buffer.from(results.frameB64, 'base64'));
  fs.writeFileSync(path.join(assetsDir, 'door_leaf.png'), Buffer.from(results.leafB64, 'base64'));
  fs.writeFileSync(path.join(assetsDir, 'door_leaf_open.png'), Buffer.from(results.openB64, 'base64'));
  console.log('Saved fundamental full-bleed door assets:', results);

  await browser.close();
}

main().catch(console.error);
