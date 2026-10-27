import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const brainDir = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\0afeb043-3b9e-4335-9045-0fb99010db79';
const assetsDir = 'C:\\Users\\User\\.gemini\\antigravity\\scratch\\ashfall\\client\\public\\assets\\buildings';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage();

  function b64(filePath) {
    return fs.readFileSync(filePath).toString('base64');
  }

  const damagedSrc = path.join(brainDir, 'post_apocalyptic_wall_texture_1793128601086.jpg');
  const damaskSrc = path.join(brainDir, 'post_apocalyptic_interior_wall_texture_1793118189382.jpg');
  const groundSrc = path.join(brainDir, 'post_apocalyptic_ground_texture_1793128606393.jpg');

  await page.setContent(`
    <img id="damaged" src="data:image/jpeg;base64,${b64(damagedSrc)}">
    <img id="damask" src="data:image/jpeg;base64,${b64(damaskSrc)}">
    <img id="ground" src="data:image/jpeg;base64,${b64(groundSrc)}">
  `);

  const results = await page.evaluate(() => {
    function makeSeamlessH(imgEl, w, h, blendW = 48) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(imgEl, 0, 0, w, h);

      // Blend left edge into right edge for seamless wrap
      const idL = ctx.getImageData(0, 0, blendW, h);
      const idR = ctx.getImageData(w - blendW, 0, blendW, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < blendW; x++) {
          const idx = (y * blendW + x) * 4;
          const a = x / blendW;
          for (let ch = 0; ch < 3; ch++) {
            const blended = Math.round(idR.data[idx + ch] * (1 - a) + idL.data[idx + ch] * a);
            idL.data[idx + ch] = blended;
            idR.data[idx + ch] = blended;
          }
        }
      }
      ctx.putImageData(idL, 0, 0);
      ctx.putImageData(idR, w - blendW, 0);
      return c.toDataURL('image/png').split(',')[1];
    }

    function makeSeamlessTile(imgEl, size, blend = 40) {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const ctx = c.getContext('2d');
      ctx.drawImage(imgEl, 0, 0, size, size);

      // Horizontal blend
      const idL = ctx.getImageData(0, 0, blend, size);
      const idR = ctx.getImageData(size - blend, 0, blend, size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < blend; x++) {
          const idx = (y * blend + x) * 4;
          const a = x / blend;
          for (let ch = 0; ch < 3; ch++) {
            const blended = Math.round(idR.data[idx + ch] * (1 - a) + idL.data[idx + ch] * a);
            idL.data[idx + ch] = blended;
            idR.data[idx + ch] = blended;
          }
        }
      }
      ctx.putImageData(idL, 0, 0);
      ctx.putImageData(idR, size - blend, 0);

      // Vertical blend
      const idT = ctx.getImageData(0, 0, size, blend);
      const idB = ctx.getImageData(0, size - blend, size, blend);
      for (let y = 0; y < blend; y++) {
        const a = y / blend;
        for (let x = 0; x < size; x++) {
          const idx = (y * size + x) * 4;
          for (let ch = 0; ch < 3; ch++) {
            const blended = Math.round(idB.data[idx + ch] * (1 - a) + idT.data[idx + ch] * a);
            idT.data[idx + ch] = blended;
            idB.data[idx + ch] = blended;
          }
        }
      }
      ctx.putImageData(idT, 0, 0);
      ctx.putImageData(idB, 0, size - blend);

      return c.toDataURL('image/png').split(',')[1];
    }

    const damagedImg = document.getElementById('damaged');
    const damaskImg = document.getElementById('damask');
    const groundImg = document.getElementById('ground');

    return {
      damagedB64: makeSeamlessH(damagedImg, 512, 512, 32),
      damaskB64: makeSeamlessH(damaskImg, 512, 512, 32),
      groundB64: makeSeamlessTile(groundImg, 512, 36),
    };
  });

  fs.writeFileSync(path.join(assetsDir, 'wall_interior_damaged.png'), Buffer.from(results.damagedB64, 'base64'));
  fs.writeFileSync(path.join(assetsDir, 'wall_interior_face.png'), Buffer.from(results.damaskB64, 'base64'));
  fs.writeFileSync(path.join(assetsDir, 'ground_postapo.png'), Buffer.from(results.groundB64, 'base64'));
  console.log('Successfully processed and saved seamless wall and ground textures!');

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
