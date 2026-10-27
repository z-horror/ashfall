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

  const floorSrc = path.join(brainDir, 'wooden_floor_narrow_planks_1793118217424.jpg');
  await page.setContent(`<img id="fl" src="data:image/jpeg;base64,${b64(floorSrc)}">`);

  // Generate 1: Authentic Weathered Oak (Default floor_wood.png) - NO OVALS!
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

    // Desaturate and tone down to post-apocalyptic aged oak
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      // Desaturate 35%
      r = r * 0.65 + gray * 0.35;
      g = g * 0.65 + gray * 0.35;
      b = b * 0.65 + gray * 0.35;

      // Darken to aged timber
      r = Math.round(r * 0.82);
      g = Math.round(g * 0.78);
      b = Math.round(g * 0.72);

      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    ctx.putImageData(imgData, 0, 0);

    // Subtle atmospheric dust layer (even tint across whole image, NO BLOBS!)
    ctx.fillStyle = 'rgba(25, 22, 18, 0.18)';
    ctx.fillRect(0, 0, w, h);

    // Fine wood grain micro-scratches along plank direction (vertical)
    ctx.strokeStyle = 'rgba(20, 16, 12, 0.25)';
    ctx.lineWidth = 1;
    for (let s = 0; s < 30; s++) {
      const sx = (s * 37) % w;
      const sy = (s * 71) % h;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + ((s % 3) - 1), sy + 18 + (s % 12));
      ctx.stroke();
    }

    // Seamless left-right blending (planks run vertically, so seamless horizontal blending is key)
    const blend = 20;
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

  // Generate 2: Dark Aged Walnut (floor_wood_dark.png)
  const darkB64 = await page.evaluate(() => {
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

    // Dark walnut stain
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = r * 0.5 + gray * 0.5;
      g = g * 0.5 + gray * 0.5;
      b = b * 0.5 + gray * 0.5;

      // Deep dark brown
      r = Math.round(r * 0.58);
      g = Math.round(g * 0.50);
      b = Math.round(b * 0.42);

      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    ctx.putImageData(imgData, 0, 0);

    // Seamless left-right blending
    const blend = 20;
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

  // Generate 3: Scuffed Weathered Light Timber (floor_wood_scuffed.png)
  const scuffedB64 = await page.evaluate(() => {
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

    // Faded, dusty gray-tan timber
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = r * 0.4 + gray * 0.6;
      g = g * 0.4 + gray * 0.6;
      b = b * 0.4 + gray * 0.6;

      r = Math.min(255, Math.round(r * 0.88 + 15));
      g = Math.min(255, Math.round(g * 0.84 + 14));
      b = Math.min(255, Math.round(b * 0.78 + 12));

      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    ctx.putImageData(imgData, 0, 0);

    // Fine scuffs
    ctx.strokeStyle = 'rgba(220, 215, 205, 0.22)';
    ctx.lineWidth = 1;
    for (let s = 0; s < 45; s++) {
      const sx = (s * 41) % w;
      const sy = (s * 67) % h;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + ((s % 5) - 2) * 4, sy + 10 + (s % 8));
      ctx.stroke();
    }

    // Seamless left-right blending
    const blend = 20;
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
  fs.writeFileSync(path.join(assetsDir, 'floor_wood_dark.png'), Buffer.from(darkB64, 'base64'));
  fs.writeFileSync(path.join(assetsDir, 'floor_wood_scuffed.png'), Buffer.from(scuffedB64, 'base64'));
  console.log('Successfully generated clean floor textures without ovals!');

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
