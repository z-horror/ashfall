import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const targets = [
  {
    input: 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/prop_tree_dead_1792890818120.jpg',
    output: 'client/public/assets/props/prop_tree_0.png',
    canvasW: 190,
    canvasH: 230,
    targetH: 215,
    alignY: 0.92,
  },
  {
    input: 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/prop_barrel_rust_1792890894190.jpg',
    output: 'client/public/assets/props/prop_barrel.png',
    canvasW: 46,
    canvasH: 72,
    targetH: 60,
    alignY: 0.81,
  },
  {
    input: 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/roof_tar_gravel_1792890749712.jpg',
    output: 'client/public/assets/roofs/roof_0.png',
    canvasW: 64,
    canvasH: 32,
    targetH: 32,
    alignY: 0.5,
    isDiamondClip: true,
  },
];

async function main() {
  const roofsDir = 'client/public/assets/roofs';
  if (!fs.existsSync(roofsDir)) {
    fs.mkdirSync(roofsDir, { recursive: true });
  }

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();

  for (const t of targets) {
    if (!fs.existsSync(t.input)) {
      console.warn(`File not found: ${t.input}`);
      continue;
    }
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
      const lowThresh = 14;
      const highThresh = 38;
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

      const pad = 2;
      const sx = Math.max(0, minX - pad);
      const sy = Math.max(0, minY - pad);
      const sw = Math.min(c.width - sx, (maxX - minX) + pad * 2);
      const sh = Math.min(c.height - sy, (maxY - minY) + pad * 2);

      const out = document.createElement('canvas');
      out.width = cfg.canvasW;
      out.height = cfg.canvasH;
      const outCtx = out.getContext('2d');
      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'high';

      if (cfg.isDiamondClip) {
        // Isometric 64x32 diamond clipping
        outCtx.beginPath();
        outCtx.moveTo(cfg.canvasW / 2, 0);
        outCtx.lineTo(cfg.canvasW, cfg.canvasH / 2);
        outCtx.lineTo(cfg.canvasW / 2, cfg.canvasH);
        outCtx.lineTo(0, cfg.canvasH / 2);
        outCtx.closePath();
        outCtx.clip();
      }

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
    console.log(`Processed: ${t.output} (${t.canvasW}x${t.canvasH})`);

    // Duplicate tree variant to tree_1 and tree_2
    if (t.output.includes('prop_tree_0')) {
      const p1 = t.output.replace('prop_tree_0', 'prop_tree_1');
      const p2 = t.output.replace('prop_tree_0', 'prop_tree_2');
      fs.writeFileSync(p1, Buffer.from(resultB64, 'base64'));
      fs.writeFileSync(p2, Buffer.from(resultB64, 'base64'));
      console.log(`Copied to: ${p1}, ${p2}`);
    }
  }

  await browser.close();
}

main().catch(console.error);
