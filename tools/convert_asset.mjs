import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

async function processImage(inputPath, outputPath, options = {}) {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  const buf = fs.readFileSync(inputPath);
  const b64 = buf.toString('base64');
  await page.setContent(`<img id="img" src="data:image/jpeg;base64,${b64}">`);

  const pngBase64 = await page.evaluate((opts) => {
    const img = document.getElementById('img');
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, c.width, c.height);
    const data = imgData.data;
    const lowThresh = opts.lowThresh || 12;
    const highThresh = opts.highThresh || 35;

    let minX = c.width, maxX = 0, minY = c.height, maxY = 0;

    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const lum = Math.max(r, g, b);

        if (lum < lowThresh) {
          data[i + 3] = 0;
        } else if (lum < highThresh) {
          const alpha = (lum - lowThresh) / (highThresh - lowThresh);
          data[i + 3] = Math.round(alpha * 255);
        } else {
          // Keep solid
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // If target dimensions specified, crop and scale to target canvas
    if (opts.targetW && opts.targetH) {
      const outCanvas = document.createElement('canvas');
      outCanvas.width = opts.targetW;
      outCanvas.height = opts.targetH;
      const outCtx = outCanvas.getContext('2d');
      outCtx.imageSmoothingEnabled = true;
      outCtx.imageSmoothingQuality = 'high';

      // Source bounding box with a 4px padding
      const pad = 6;
      const sx = Math.max(0, minX - pad);
      const sy = Math.max(0, minY - pad);
      const sw = Math.min(c.width - sx, (maxX - minX) + pad * 2);
      const sh = Math.min(c.height - sy, (maxY - minY) + pad * 2);

      // Fit into target canvas keeping aspect ratio, aligned to bottom
      const scale = Math.min(opts.targetW / sw, opts.targetH / sh);
      const dw = sw * scale;
      const dh = sh * scale;
      const dx = (opts.targetW - dw) / 2;
      const dy = opts.targetH - dh; // bottom align
      outCtx.drawImage(c, sx, sy, sw, sh, dx, dy, dw, dh);
      return outCanvas.toDataURL('image/png').split(',')[1];
    }

    return c.toDataURL('image/png').split(',')[1];
  }, options);

  await browser.close();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(pngBase64, 'base64'));
  console.log(`Saved: ${outputPath}`);
}

const args = process.argv.slice(2);
if (args.length >= 2) {
  const [inp, out, tw, th] = args;
  processImage(inp, out, {
    targetW: tw ? parseInt(tw, 10) : undefined,
    targetH: th ? parseInt(th, 10) : undefined
  }).catch(console.error);
} else {
  console.log('Usage: node tools/convert_asset.mjs <input.jpg> <output.png> [targetW] [targetH]');
}
