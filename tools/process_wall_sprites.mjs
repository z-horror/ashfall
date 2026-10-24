import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const fullWallJpg = 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/wall_brick_south_1792872750820.jpg';
const cutWallJpg = 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/wall_brick_east_cut_1792872960739.jpg';
const outDir = 'C:/Users/User/.gemini/antigravity/scratch/ashfall/client/public/assets/walls';

async function main() {
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();

  const fullB64 = fs.readFileSync(fullWallJpg).toString('base64');
  const cutB64 = fs.readFileSync(cutWallJpg).toString('base64');

  await page.setContent(`
    <img id="fullImg" src="data:image/jpeg;base64,${fullB64}">
    <img id="cutImg" src="data:image/jpeg;base64,${cutB64}">
  `);

  const results = await page.evaluate(() => {
    function chromaKey(img) {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, c.width, c.height);
      const data = imgData.data;
      const low = 12, high = 35;
      let minX = c.width, maxX = 0, minY = c.height, maxY = 0;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          const r = data[i], g = data[i+1], b = data[i+2];
          const lum = Math.max(r, g, b);
          if (lum < low) {
            data[i+3] = 0;
          } else if (lum < high) {
            data[i+3] = Math.round(((lum - low) / (high - low)) * 255);
          } else {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
      return { canvas: c, minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }

    const fullKeyed = chromaKey(document.getElementById('fullImg'));
    const cutKeyed = chromaKey(document.getElementById('cutImg'));

    // Helpers to create 64x88 canvases
    function make64x88() {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 88;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      return { c, ctx };
    }

    // A. CUTAWAY WALLS (Height 18px)
    // 1. East Cutaway (right face, runs from bottom-left (32, 88) to top-right (64, 72) at base, and (32, 70) to (64, 54) at top)
    const eastCut = make64x88();
    // Clip to right face
    eastCut.ctx.save();
    eastCut.ctx.beginPath();
    eastCut.ctx.moveTo(32, 70);
    eastCut.ctx.lineTo(64, 54);
    eastCut.ctx.lineTo(64, 72);
    eastCut.ctx.lineTo(32, 88);
    eastCut.ctx.closePath();
    eastCut.ctx.clip();
    // The cutKeyed image slopes up-right naturally. We draw its crop scaled to fit the trapezoid
    // Target trapezoid in eastCut: x from 32 to 64, y from 54 to 88
    eastCut.ctx.drawImage(cutKeyed.canvas, cutKeyed.minX, cutKeyed.minY, cutKeyed.w, cutKeyed.h, 32, 54, 32, 34);
    eastCut.ctx.restore();

    // 2. South Cutaway (left face, runs from (0, 72) to (32, 88) at base, and (0, 54) to (32, 70) at top)
    // Flipped horizontally from east cutaway for exact seamless geometry
    const southCut = make64x88();
    southCut.ctx.save();
    southCut.ctx.beginPath();
    southCut.ctx.moveTo(0, 54);
    southCut.ctx.lineTo(32, 70);
    southCut.ctx.lineTo(32, 88);
    southCut.ctx.lineTo(0, 72);
    southCut.ctx.closePath();
    southCut.ctx.clip();
    // Flip horizontally around center x=16
    southCut.ctx.translate(32, 0);
    southCut.ctx.scale(-1, 1);
    southCut.ctx.drawImage(cutKeyed.canvas, cutKeyed.minX, cutKeyed.minY, cutKeyed.w, cutKeyed.h, 0, 54, 32, 34);
    southCut.ctx.restore();

    // 3. Corner Cutaway (both faces)
    const cornerCut = make64x88();
    cornerCut.ctx.drawImage(southCut.c, 0, 0);
    cornerCut.ctx.drawImage(eastCut.c, 0, 0);

    return {
      wall_brick_east_cut: eastCut.c.toDataURL('image/png').split(',')[1],
      wall_brick_south_cut: southCut.c.toDataURL('image/png').split(',')[1],
      wall_brick_corner_cut: cornerCut.c.toDataURL('image/png').split(',')[1]
    };
  });

  for (const [name, b64] of Object.entries(results)) {
    const p = path.join(outDir, `${name}.png`);
    fs.writeFileSync(p, Buffer.from(b64, 'base64'));
    console.log('Saved:', p);
  }

  await browser.close();
}

main().catch(console.error);
