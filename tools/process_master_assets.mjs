import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const brainDir = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\0afeb043-3b9e-4335-9045-0fb99010db79';
const assetsDir = 'C:\\Users\\User\\.gemini\\antigravity\\scratch\\ashfall\\client\\public\\assets\\buildings';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();

  // Helper to load image to base64
  function b64(filePath) {
    return fs.readFileSync(filePath).toString('base64');
  }

  // 1. Process Brick Wall
  console.log('Processing brick wall...');
  const brickSrc = path.join(brainDir, 'gemini_brick_wall_1793114730710.jpg');
  await page.setContent(`<img id="brick" src="data:image/jpeg;base64,${b64(brickSrc)}">`);
  const brickData = await page.evaluate(() => {
    const img = document.getElementById('brick');
    const w = 512;
    const h = 512;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    // Create plain brick
    const plainB64 = c.toDataURL('image/png').split(',')[1];

    // Create wall_brick_face with top stone coping and bottom concrete plinth
    // Top stone coping: 22px
    ctx.fillStyle = '#48443e';
    ctx.fillRect(0, 0, w, 22);
    ctx.fillStyle = '#635e56';
    ctx.fillRect(0, 1, w, 5);
    ctx.fillStyle = '#322f2b';
    ctx.fillRect(0, 21, w, 2);

    // Bottom concrete plinth: 24px
    ctx.fillStyle = '#3a3a38';
    ctx.fillRect(0, h - 24, w, 24);
    ctx.fillStyle = '#525250';
    ctx.fillRect(0, h - 24, w, 3);
    ctx.fillStyle = '#262624';
    ctx.fillRect(0, h - 3, w, 3);

    const facedB64 = c.toDataURL('image/png').split(',')[1];
    return { plainB64, facedB64 };
  });
  fs.writeFileSync(path.join(assetsDir, 'wall_brick_plain.png'), Buffer.from(brickData.plainB64, 'base64'));
  fs.writeFileSync(path.join(assetsDir, 'wall_brick_face.png'), Buffer.from(brickData.facedB64, 'base64'));

  // 2. Process Floor Wood
  console.log('Processing floor wood...');
  const woodSrc = path.join(brainDir, 'floor_wood_1793114801610.jpg');
  await page.setContent(`<img id="wood" src="data:image/jpeg;base64,${b64(woodSrc)}">`);
  const woodB64 = await page.evaluate(() => {
    const img = document.getElementById('wood');
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 512, 512);
    return c.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(assetsDir, 'floor_wood.png'), Buffer.from(woodB64, 'base64'));

  // 3. Process Floor Concrete
  console.log('Processing floor concrete...');
  const concSrc = path.join(brainDir, 'floor_concrete_1793114817448.jpg');
  await page.setContent(`<img id="conc" src="data:image/jpeg;base64,${b64(concSrc)}">`);
  const concB64 = await page.evaluate(() => {
    const img = document.getElementById('conc');
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 512, 512);
    return c.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(assetsDir, 'floor_concrete.png'), Buffer.from(concB64, 'base64'));

  // 4. Process Roof Tar
  console.log('Processing roof tar...');
  const roofSrc = path.join(brainDir, 'roof_tar_1793114876563.jpg');
  await page.setContent(`<img id="roof" src="data:image/jpeg;base64,${b64(roofSrc)}">`);
  const roofB64 = await page.evaluate(() => {
    const img = document.getElementById('roof');
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 512, 512);
    return c.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(assetsDir, 'roof_tar.png'), Buffer.from(roofB64, 'base64'));

  // 5. Process Window Unit (Chroma key #FF00FF to alpha)
  console.log('Processing window unit...');
  const winSrc = path.join(brainDir, 'window_unit_1793114899359.jpg');
  await page.setContent(`<img id="win" src="data:image/jpeg;base64,${b64(winSrc)}">`);
  const winB64 = await page.evaluate(() => {
    const img = document.getElementById('win');
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const idata = ctx.getImageData(0, 0, w, h);
    const d = idata.data;

    let minX = w, minY = h, maxX = 0, maxY = 0;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      // Magenta detection
      const isMagenta = (r > 130 && b > 130 && g < 110 && (r + b - 2 * g > 60)) || (r > 150 && b > 150 && g < 130);
      if (isMagenta) {
        d[i + 3] = 0;
      } else {
        // Despill edges
        if (r > g && b > g) {
          const maxG = Math.max(g, Math.min(r, b) * 0.8);
          d[i] = Math.min(r, maxG * 1.1);
          d[i + 2] = Math.min(b, maxG * 1.1);
        }
        const px = (i / 4) % w;
        const py = Math.floor((i / 4) / w);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
    ctx.putImageData(idata, 0, 0);

    // Crop to bounding box
    const cw = Math.max(1, maxX - minX + 1);
    const ch = Math.max(1, maxY - minY + 1);
    const cropC = document.createElement('canvas');
    cropC.width = cw;
    cropC.height = ch;
    const cropCtx = cropC.getContext('2d');
    cropCtx.drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);

    return cropC.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(assetsDir, 'window_unit.png'), Buffer.from(winB64, 'base64'));

  // 6. Fix Wardrobe red bottom artifact
  console.log('Fixing wardrobe...');
  const wardSrc = path.join(assetsDir, 'wardrobe.png');
  await page.setContent(`<img id="ward" src="data:image/png;base64,${b64(wardSrc)}">`);
  const wardB64 = await page.evaluate(() => {
    const img = document.getElementById('ward');
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const idata = ctx.getImageData(0, 0, w, h);
    const d = idata.data;

    // Remove red fringe in bottom 25 pixels
    for (let y = h - 25; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        if (r > 100 && g < 60 && b < 60) {
          d[i + 3] = 0;
        }
      }
    }
    ctx.putImageData(idata, 0, 0);
    return c.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(wardSrc, Buffer.from(wardB64, 'base64'));

  // 7. Clean Door Frame: remove outer brick chunks, keep casing, lintel, threshold and transparent opening
  console.log('Cleaning door frame...');
  const doorClosedSrc = path.join(assetsDir, 'door_closed.png');
  await page.setContent(`<img id="dclose" src="data:image/png;base64,${b64(doorClosedSrc)}">`);
  const frameB64 = await page.evaluate(() => {
    const img = document.getElementById('dclose');
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Keep wooden casing: x from 64 to 220, y from 90 to 505
    // Cut out inner doorway portal: x 86 to 199, sloped 2:1
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(86, 164);
    ctx.lineTo(199, 110);
    ctx.lineTo(199, 442);
    ctx.lineTo(86, 496);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Clip away outside of wooden casing so no brick wall remains
    const idata = ctx.getImageData(0, 0, w, h);
    const d = idata.data;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const i = (py * w + px) * 4;
        // Outside the door casing bounds
        if (px < 66 || px > 224 || py < 80 || py > 508) {
          d[i + 3] = 0;
        }
      }
    }
    ctx.putImageData(idata, 0, 0);

    return c.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(assetsDir, 'door_frame.png'), Buffer.from(frameB64, 'base64'));

  console.log('All master assets processed successfully!');
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
