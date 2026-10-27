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

  function b64(filePath) {
    return fs.readFileSync(filePath).toString('base64');
  }

  // Backup clean floor to floor_wood_clean.png
  fs.copyFileSync(path.join(assetsDir, 'floor_wood.png'), path.join(assetsDir, 'floor_wood_clean.png'));

  const floorSrc = path.join(brainDir, 'wooden_floor_narrow_planks_1793118217424.jpg');
  await page.setContent(`<img id="fl" src="data:image/jpeg;base64,${b64(floorSrc)}">`);

  const weatheredB64 = await page.evaluate(() => {
    const img = document.getElementById('fl');
    const w = 512;
    const h = 512;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    // Desaturate and darken to create authentic post-apocalyptic weathered oak
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      // Desaturate 45%
      r = r * 0.55 + gray * 0.45;
      g = g * 0.55 + gray * 0.45;
      b = b * 0.55 + gray * 0.45;

      // Darken and shift towards dusty olive-gray-brown
      r = Math.round(r * 0.72);
      g = Math.round(g * 0.70);
      b = Math.round(b * 0.65);

      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    ctx.putImageData(imgData, 0, 0);

    // Add grime, scuffs, scratches and dark dirt tracks
    ctx.fillStyle = 'rgba(20, 18, 14, 0.25)';
    ctx.fillRect(0, 0, w, h);

    // Weathered water stains
    ctx.fillStyle = 'rgba(15, 12, 10, 0.35)';
    ctx.beginPath();
    ctx.ellipse(120, 180, 70, 45, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(380, 320, 90, 50, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Scuffs and scratches
    ctx.strokeStyle = 'rgba(10, 8, 6, 0.4)';
    ctx.lineWidth = 1;
    for (let s = 0; s < 40; s++) {
      const sx = (s * 47) % w;
      const sy = (s * 83) % h;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + ((s % 5) - 2) * 6, sy + 15 + (s % 10));
      ctx.stroke();
    }

    // Seam blending for seamless tiling
    const blend = 24;
    const idL = ctx.getImageData(0, 0, blend, h);
    const idR = ctx.getImageData(w - blend, 0, blend, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < blend; x++) {
        const idx = (y * blend + x) * 4;
        const a = x / blend;
        for (let ch = 0; ch < 3; ch++) {
          const v = Math.round(idR.data[idx + ch] * (1 - a) + idL.data[idx + ch] * a);
          idL.data[idx + ch] = v;
          idR.data[idx + ch] = v;
        }
      }
    }
    ctx.putImageData(idL, 0, 0);
    ctx.putImageData(idR, w - blend, 0);

    return c.toDataURL('image/png').split(',')[1];
  });

  fs.writeFileSync(path.join(assetsDir, 'floor_wood.png'), Buffer.from(weatheredB64, 'base64'));
  console.log('Saved authentic weathered floor_wood.png and backed up clean floor');

  await browser.close();
}

main().catch(console.error);
