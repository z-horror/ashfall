import { chromium } from 'playwright-core';
import fs from 'node:fs';

const targets = [
  {
    input: 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/car_highwayman_1792855130696.jpg',
    output: 'client/public/assets/cars/car_highwayman.png',
    canvasW: 208,
    canvasH: 136,
    targetH: 124,
    alignY: 0.88,
  },
  {
    input: 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/car_highwayman_v_1792857165415.jpg',
    output: 'client/public/assets/cars/car_highwayman_v.png',
    canvasW: 150,
    canvasH: 196,
    targetH: 176,
    alignY: 0.90,
  },
  {
    input: 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/prop_dumpster_1792857229497.jpg',
    output: 'client/public/assets/props/prop_dumpster.png',
    canvasW: 92,
    canvasH: 92,
    targetH: 80,
    alignY: 0.85,
  },
  {
    input: 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/prop_crate_1792857292094.jpg',
    output: 'client/public/assets/props/prop_crate.png',
    canvasW: 58,
    canvasH: 70,
    targetH: 58,
    alignY: 0.88,
  },
  {
    input: 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/prop_med_1792857347025.jpg',
    output: 'client/public/assets/props/prop_med.png',
    canvasW: 32,
    canvasH: 40,
    targetH: 30,
    alignY: 0.85,
  },
];

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();

  for (const t of targets) {
    const buf = fs.readFileSync(t.input);
    const b64 = buf.toString('base64');
    const isJpg = t.input.endsWith('.jpg');
    await page.setContent(`<img id="img" src="data:${isJpg ? 'image/jpeg' : 'image/png'};base64,${b64}">`);

    const resultB64 = await page.evaluate((cfg) => {
      const img = document.getElementById('img');
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, c.width, c.height);
      const data = imgData.data;

      // Chroma key black background
      const lowThresh = 12;
      const highThresh = 35;
      let minX = c.width, maxX = 0, minY = c.height, maxY = 0;

      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const lum = Math.max(r, g, b);
          if (lum < lowThresh) {
            data[i + 3] = 0;
          } else if (lum < highThresh) {
            const alpha = (lum - lowThresh) / (highThresh - lowThresh);
            data[i + 3] = Math.round(alpha * 255);
          } else {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Add a 2px margin around the crop
      const pad = 2;
      const sx = Math.max(0, minX - pad);
      const sy = Math.max(0, minY - pad);
      const sw = Math.min(c.width - sx, (maxX - minX) + pad * 2);
      const sh = Math.min(c.height - sy, (maxY - minY) + pad * 2);

      // Create target canvas
      const out = document.createElement('canvas');
      out.width = cfg.canvasW;
      out.height = cfg.canvasH;
      const outCtx = out.getContext('2d');
      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'high';

      // Scale to fit target dimensions
      const maxH = cfg.targetH || cfg.canvasH;
      const scale = Math.min(cfg.canvasW / sw, maxH / sh);
      const dw = Math.round(sw * scale);
      const dh = Math.round(sh * scale);
      const dx = Math.round((cfg.canvasW - dw) / 2);
      const dy = Math.round((cfg.canvasH - dh) * (cfg.alignY ?? 0.5));

      outCtx.drawImage(c, sx, sy, sw, sh, dx, dy, dw, dh);
      return out.toDataURL('image/png').split(',')[1];
    }, t);

    fs.writeFileSync(t.output, Buffer.from(resultB64, 'base64'));
    console.log(`Fitted: ${t.output} (${t.canvasW}x${t.canvasH})`);
  }

  await browser.close();
}

main().catch(console.error);
