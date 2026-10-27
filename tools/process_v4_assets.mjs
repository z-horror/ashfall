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

  // 1. Process HVAC unit
  const hvacFiles = fs.readdirSync(brainDir).filter(f => f.startsWith('isometric_rooftop_hvac_unit') && f.endsWith('.jpg'));
  if (hvacFiles.length > 0) {
    const hvacSrc = path.join(brainDir, hvacFiles[0]);
    console.log('Processing HVAC unit:', hvacSrc);
    await page.setContent(`<img id="hvac" src="data:image/jpeg;base64,${b64(hvacSrc)}">`);
    const hvacData = await page.evaluate(() => {
      const img = document.getElementById('hvac');
      const w = img.naturalWidth || 512;
      const h = img.naturalHeight || 512;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;

      // Chroma key removal for magenta
      let minX = w, maxX = 0, minY = h, maxY = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        // Magenta detector
        const isMagenta = r > 130 && b > 130 && g < 115 && (r + b) > g * 2.2;
        if (isMagenta) {
          d[i + 3] = 0;
        } else {
          // Despill magenta fringe
          if (r > g && b > g && (r - g) > 25 && (b - g) > 25) {
            d[i] = Math.round(g * 1.05);
            d[i + 2] = Math.round(g * 1.05);
          }
          const x = (i / 4) % w;
          const y = Math.floor((i / 4) / w);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Crop to content with 4px padding
      minX = Math.max(0, minX - 4);
      minY = Math.max(0, minY - 4);
      maxX = Math.min(w - 1, maxX + 4);
      maxY = Math.min(h - 1, maxY + 4);
      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;

      const c2 = document.createElement('canvas');
      c2.width = cropW;
      c2.height = cropH;
      const ctx2 = c2.getContext('2d');
      ctx2.drawImage(c, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

      return c2.toDataURL('image/png').split(',')[1];
    });
    fs.writeFileSync(path.join(assetsDir, 'roof_ac_unit.png'), Buffer.from(hvacData, 'base64'));
    console.log('Saved roof_ac_unit.png');
  }

  // 2. Process Weathered Brick
  const brickFiles = fs.readdirSync(brainDir).filter(f => f.startsWith('weathered_brick_wall_texture') && f.endsWith('.jpg'));
  if (brickFiles.length > 0) {
    const brickSrc = path.join(brainDir, brickFiles[0]);
    console.log('Processing weathered brick:', brickSrc);
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

      // Horizontal edge blending for seamless tiling
      const blendW = 32;
      const id1 = ctx.getImageData(0, 0, blendW, h);
      const id2 = ctx.getImageData(w - blendW, 0, blendW, h);
      const d1 = id1.data;
      const d2 = id2.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < blendW; x++) {
          const idx = (y * blendW + x) * 4;
          const alpha = x / blendW;
          for (let ch = 0; ch < 3; ch++) {
            const v = Math.round(d2[idx + ch] * (1 - alpha) + d1[idx + ch] * alpha);
            d1[idx + ch] = v;
            d2[idx + ch] = v;
          }
        }
      }
      ctx.putImageData(id1, 0, 0);
      ctx.putImageData(id2, w - blendW, 0);

      const plainB64 = c.toDataURL('image/png').split(',')[1];

      // Add top weathered stone coping (22px) and bottom concrete plinth (26px)
      ctx.fillStyle = '#423e38';
      ctx.fillRect(0, 0, w, 22);
      ctx.fillStyle = '#5c574e';
      ctx.fillRect(0, 1, w, 5);
      ctx.fillStyle = '#2c2925';
      ctx.fillRect(0, 21, w, 2);

      // Bottom concrete plinth: 26px with grunge and moss
      ctx.fillStyle = '#343430';
      ctx.fillRect(0, h - 26, w, 26);
      ctx.fillStyle = '#4a4944';
      ctx.fillRect(0, h - 26, w, 4);
      ctx.fillStyle = '#20201c';
      ctx.fillRect(0, h - 3, w, 3);
      // Dark moss wash along bottom
      ctx.fillStyle = 'rgba(28, 42, 24, 0.45)';
      ctx.fillRect(0, h - 36, w, 14);

      const facedB64 = c.toDataURL('image/png').split(',')[1];
      return { plainB64, facedB64 };
    });
    fs.writeFileSync(path.join(assetsDir, 'wall_brick_weathered_plain.png'), Buffer.from(brickData.plainB64, 'base64'));
    fs.writeFileSync(path.join(assetsDir, 'wall_brick_weathered_face.png'), Buffer.from(brickData.facedB64, 'base64'));
    // Also update main wall_brick_face so existing refs pick up weathered texture
    fs.writeFileSync(path.join(assetsDir, 'wall_brick_plain.png'), Buffer.from(brickData.plainB64, 'base64'));
    fs.writeFileSync(path.join(assetsDir, 'wall_brick_face.png'), Buffer.from(brickData.facedB64, 'base64'));
    console.log('Saved wall_brick_weathered assets');
  }

  // 3. Process Interior Wall Texture (Wallpaper + Crown + Baseboard)
  const interiorFiles = fs.readdirSync(brainDir).filter(f => f.startsWith('post_apocalyptic_interior_wall') && f.endsWith('.jpg'));
  if (interiorFiles.length > 0) {
    const intSrc = path.join(brainDir, interiorFiles[0]);
    console.log('Processing interior wall:', intSrc);
    await page.setContent(`<img id="interior" src="data:image/jpeg;base64,${b64(intSrc)}">`);
    const intData = await page.evaluate(() => {
      const img = document.getElementById('interior');
      const w = 512;
      const h = 512;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      // Seamless horizontal blending
      const blendW = 32;
      const id1 = ctx.getImageData(0, 0, blendW, h);
      const id2 = ctx.getImageData(w - blendW, 0, blendW, h);
      const d1 = id1.data;
      const d2 = id2.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < blendW; x++) {
          const idx = (y * blendW + x) * 4;
          const alpha = x / blendW;
          for (let ch = 0; ch < 3; ch++) {
            const v = Math.round(d2[idx + ch] * (1 - alpha) + d1[idx + ch] * alpha);
            d1[idx + ch] = v;
            d2[idx + ch] = v;
          }
        }
      }
      ctx.putImageData(id1, 0, 0);
      ctx.putImageData(id2, w - blendW, 0);

      return c.toDataURL('image/png').split(',')[1];
    });
    fs.writeFileSync(path.join(assetsDir, 'wall_interior_face.png'), Buffer.from(intData, 'base64'));
    console.log('Saved wall_interior_face.png');
  }

  // 4. Process Fine Residential Wooden Floor
  const floorFiles = fs.readdirSync(brainDir).filter(f => f.startsWith('wooden_floor_narrow_planks') && f.endsWith('.jpg'));
  if (floorFiles.length > 0) {
    const flSrc = path.join(brainDir, floorFiles[0]);
    console.log('Processing fine floor:', flSrc);
    await page.setContent(`<img id="floor" src="data:image/jpeg;base64,${b64(flSrc)}">`);
    const flData = await page.evaluate(() => {
      const img = document.getElementById('floor');
      const w = 512;
      const h = 512;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      // Seamless blending
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
    fs.writeFileSync(path.join(assetsDir, 'floor_wood.png'), Buffer.from(flData, 'base64'));
    console.log('Saved floor_wood.png (narrow residential planks)');
  }

  await browser.close();
  console.log('All v4 assets processed successfully!');
}

main().catch(console.error);
