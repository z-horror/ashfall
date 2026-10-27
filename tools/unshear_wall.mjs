import { chromium } from 'playwright-core';
import fs from 'node:fs';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  const b64 = fs.readFileSync('client/public/assets/buildings/wall_straight_h.png').toString('base64');
  await page.setContent(`<img id="src" src="data:image/png;base64,${b64}">`);

  const res = await page.evaluate(() => {
    const src = document.getElementById('src');
    const sw = src.naturalWidth;
    const sh = src.naturalHeight;

    const tw = 256;
    const th = 256;
    const c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    const ctx = c.getContext('2d');

    const srcC = document.createElement('canvas');
    srcC.width = sw;
    srcC.height = sh;
    const sctx = srcC.getContext('2d');
    sctx.drawImage(src, 0, 0);
    const srcData = sctx.getImageData(0, 0, sw, sh).data;

    const outData = ctx.createImageData(tw, th);
    const d = outData.data;

    // Slope is ~0.495
    const slope = 0.495;
    const x0 = 46;
    const x1 = 188;
    const y_start = 125;
    const y_end = 405;

    for (let oy = 0; oy < th; oy++) {
      const v = oy / (th - 1);
      for (let ox = 0; ox < tw; ox++) {
        const u = ox / (tw - 1);
        const sx = x0 + u * (x1 - x0);
        const sy = y_start + v * (y_end - y_start) - (sx - x0) * slope;

        const ix = Math.min(sw - 1, Math.max(0, Math.floor(sx)));
        const iy = Math.min(sh - 1, Math.max(0, Math.floor(sy)));
        const srcIdx = (iy * sw + ix) * 4;
        const outIdx = (oy * tw + ox) * 4;

        d[outIdx] = srcData[srcIdx];
        d[outIdx + 1] = srcData[srcIdx + 1];
        d[outIdx + 2] = srcData[srcIdx + 2];
        d[outIdx + 3] = 255;
      }
    }
    ctx.putImageData(outData, 0, 0);

    // Now make it seamless horizontally by alpha-blending a seam margin (24px)
    const blendMargin = 24;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = tw;
    tempCanvas.height = th;
    const tctx = tempCanvas.getContext('2d');
    tctx.drawImage(c, 0, 0);
    const tData = tctx.getImageData(0, 0, tw, th).data;
    const finalData = ctx.getImageData(0, 0, tw, th);
    const fd = finalData.data;

    for (let y = 0; y < th; y++) {
      for (let x = 0; x < blendMargin; x++) {
        const alpha = x / blendMargin; // 0 at left edge, 1 at blendMargin
        const leftIdx = (y * tw + x) * 4;
        const rightIdx = (y * tw + (tw - blendMargin + x)) * 4;

        // Blend left edge towards right edge so x=0 matches x=tw
        fd[leftIdx] = Math.round(tData[leftIdx] * alpha + tData[rightIdx] * (1 - alpha));
        fd[leftIdx + 1] = Math.round(tData[leftIdx + 1] * alpha + tData[rightIdx + 1] * (1 - alpha));
        fd[leftIdx + 2] = Math.round(tData[leftIdx + 2] * alpha + tData[rightIdx + 2] * (1 - alpha));
      }
    }
    ctx.putImageData(finalData, 0, 0);

    // Add realistic stone coping to the top (top 14px)
    ctx.fillStyle = '#655e54';
    ctx.fillRect(0, 0, tw, 12);
    ctx.fillStyle = '#7d7569';
    ctx.fillRect(0, 0, tw, 3);
    ctx.fillStyle = '#3a342b';
    ctx.fillRect(0, 11, tw, 3);

    // Subtle weathering grime gradient at the top under coping
    const topGrime = ctx.createLinearGradient(0, 14, 0, 50);
    topGrime.addColorStop(0, 'rgba(20, 16, 12, 0.45)');
    topGrime.addColorStop(1, 'rgba(20, 16, 12, 0.0)');
    ctx.fillStyle = topGrime;
    ctx.fillRect(0, 14, tw, 36);

    // Add stone footing / plinth at the bottom (bottom 8px)
    ctx.fillStyle = '#48433a';
    ctx.fillRect(0, th - 8, tw, 8);
    ctx.fillStyle = '#2d2922';
    ctx.fillRect(0, th - 1, tw, 1);

    const botGrime = ctx.createLinearGradient(0, th - 35, 0, th - 8);
    botGrime.addColorStop(0, 'rgba(15, 12, 10, 0.0)');
    botGrime.addColorStop(1, 'rgba(15, 12, 10, 0.5)');
    ctx.fillStyle = botGrime;
    ctx.fillRect(0, th - 35, tw, 27);

    return c.toDataURL('image/png').split(',')[1];
  });

  fs.writeFileSync('client/public/assets/buildings/wall_brick_face.png', Buffer.from(res, 'base64'));
  console.log('wall_brick_face.png generated cleanly!');
  await browser.close();
}

main().catch(console.error);
