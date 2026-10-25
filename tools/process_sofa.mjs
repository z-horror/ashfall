import { chromium } from 'playwright-core';
import fs from 'node:fs';

async function main() {
  const srcPath = 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/isometric_leather_sofa_prop_1792920323774.jpg';
  const outPath = 'client/public/assets/props/prop_sofa.png';

  const buf = fs.readFileSync(srcPath);
  const b64 = buf.toString('base64');

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
  await page.setContent(`<img id="src" src="data:image/jpeg;base64,${b64}">`);

  const pngBase64 = await page.evaluate(() => {
    const img = document.getElementById('src');
    const w = img.naturalWidth;
    const h = img.naturalHeight;

    const rawC = document.createElement('canvas');
    rawC.width = w;
    rawC.height = h;
    const rawCtx = rawC.getContext('2d');
    rawCtx.drawImage(img, 0, 0);

    const imgData = rawCtx.getImageData(0, 0, w, h);
    const d = imgData.data;

    // Flood fill from borders to remove background only
    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h * 2);
    let qHead = 0, qTail = 0;

    const push = (x, y) => {
      const idx = y * w + x;
      if (!visited[idx]) {
        visited[idx] = 1;
        queue[qTail++] = x;
        queue[qTail++] = y;
      }
    };

    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

    const bgThresh = 8;
    while (qHead < qTail) {
      const cx = queue[qHead++];
      const cy = queue[qHead++];
      const idx = (cy * w + cx) * 4;
      const lum = Math.max(d[idx], d[idx + 1], d[idx + 2]);

      if (lum <= bgThresh) {
        if (cx > 0) push(cx - 1, cy);
        if (cx < w - 1) push(cx + 1, cy);
        if (cy > 0) push(cx, cy - 1);
        if (cy < h - 1) push(cx, cy + 1);
      }
    }

    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        const idx = p * 4;
        const lum = Math.max(d[idx], d[idx + 1], d[idx + 2]);

        if (visited[p] && lum <= bgThresh) {
          d[idx + 3] = 0;
        } else {
          d[idx + 3] = 255;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    rawCtx.putImageData(imgData, 0, 0);

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;

    // Target game sprite canvas: 104 x 82, anchor ox: 0.5, oy: 0.7805
    // Ground level is at y = 82 * 0.7805 = 64
    const targetW = 104;
    const targetH = 82;
    const groundY = 64;

    const outC = document.createElement('canvas');
    outC.width = targetW;
    outC.height = targetH;
    const outCtx = outC.getContext('2d');
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';

    // 1. Isometric ground drop shadow beneath the sofa
    outCtx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    outCtx.beginPath();
    outCtx.ellipse(52, groundY, 40, 11, -0.05, 0, Math.PI * 2);
    outCtx.fill();

    outCtx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    outCtx.beginPath();
    outCtx.ellipse(52, groundY + 1, 45, 13, -0.05, 0, Math.PI * 2);
    outCtx.fill();

    // 2. Scaled sofa drawing: bottom of feet (maxY) rests precisely at groundY
    const drawW = 94;
    const scale = drawW / cropW;
    const drawH = Math.round(cropH * scale);
    const drawX = Math.round((targetW - drawW) / 2);
    const drawY = Math.round(groundY - drawH + 2); // 2px dip into shadow

    outCtx.drawImage(rawC, minX, minY, cropW, cropH, drawX, drawY, drawW, drawH);

    return outC.toDataURL('image/png').split(',')[1];
  });

  fs.writeFileSync(outPath, Buffer.from(pngBase64, 'base64'));
  fs.writeFileSync('C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/prop_sofa_clean.png', Buffer.from(pngBase64, 'base64'));
  console.log(`Successfully processed sofa to ${outPath}`);

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
