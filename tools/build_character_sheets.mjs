import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const DIR_MAPPING = [
  /* 0: E  */ [0, 2],
  /* 1: SE */ [0, 1],
  /* 2: S  */ [0, 0],
  /* 3: SW */ [1, 3],
  /* 4: W  */ [1, 2],
  /* 5: NW */ [1, 1],
  /* 6: N  */ [1, 0],
  /* 7: NE */ [0, 3],
];

const DIR_ANGLES = [
  0,
  Math.PI / 4,
  Math.PI / 2,
  (Math.PI * 3) / 4,
  Math.PI,
  (Math.PI * 5) / 4,
  (Math.PI * 3) / 2,
  (Math.PI * 7) / 4
];

const SOURCES = [
  {
    key: 'p0',
    src: 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/char_survivor_8dir_1792913289644.jpg',
    targetH: 72,
    isZombie: false
  },
  {
    key: 'z0',
    src: 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/char_zombie_walker_8dir_1792913400567.jpg',
    targetH: 71,
    isZombie: true
  },
  {
    key: 'z1',
    src: 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/char_zombie_runner_8dir_1792913495684.jpg',
    targetH: 69,
    isZombie: true
  },
  {
    key: 'z2',
    src: 'C:/Users/User/.gemini/antigravity/brain/e3c92ffc-34cb-4b34-9d32-aebadf56a8af/char_zombie_brute_8dir_1792913533594.jpg',
    targetH: 80,
    isZombie: true
  }
];

async function main() {
  const charDir = 'client/public/assets/characters';
  const weaponsDir = 'client/public/assets/weapons';
  if (!fs.existsSync(charDir)) fs.mkdirSync(charDir, { recursive: true });
  if (!fs.existsSync(weaponsDir)) fs.mkdirSync(weaponsDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });

  // Generate each character spritesheet
  for (const item of SOURCES) {
    console.log(`Processing character ${item.key} from ${item.src}...`);
    const buf = fs.readFileSync(item.src);
    const b64 = buf.toString('base64');
    await page.setContent(`<img id="img" src="data:image/jpeg;base64,${b64}">`);

    const result = await page.evaluate(({ dirMapping, dirAngles, targetH, isZombie }) => {
      const img = document.getElementById('img');
      const w = img.naturalWidth;
      const h = img.naturalHeight;

      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = w;
      srcCanvas.height = h;
      const srcCtx = srcCanvas.getContext('2d');
      srcCtx.drawImage(img, 0, 0);

      const cellW = Math.floor(w / 4);
      const cellH = Math.floor(h / 2);

      // Extract 8 clean directional sprites (64x88)
      const dirCanvases = [];

      for (let dir = 0; dir < 8; dir++) {
        const [r, c] = dirMapping[dir];
        const x0 = c * cellW;
        const y0 = r * cellH;
        const cw = cellW;
        const ch = cellH;

        const cellData = srcCtx.getImageData(x0, y0, cw, ch);
        const data = cellData.data;

        // Flood fill from borders to eliminate background
        const visited = new Uint8Array(cw * ch);
        const queue = new Int32Array(cw * ch * 2);
        let qHead = 0, qTail = 0;

        const push = (x, y) => {
          const idx = y * cw + x;
          if (!visited[idx]) {
            visited[idx] = 1;
            queue[qTail++] = x;
            queue[qTail++] = y;
          }
        };

        for (let x = 0; x < cw; x++) { push(x, 0); push(x, ch - 1); }
        for (let y = 0; y < ch; y++) { push(0, y); push(cw - 1, y); }

        const bgThresh = 5;
        while (qHead < qTail) {
          const cx = queue[qHead++];
          const cy = queue[qHead++];
          const idx = (cy * cw + cx) * 4;
          const lum = Math.max(data[idx], data[idx + 1], data[idx + 2]);

          if (lum <= bgThresh) {
            if (cx > 0) push(cx - 1, cy);
            if (cx < cw - 1) push(cx + 1, cy);
            if (cy > 0) push(cx, cy - 1);
            if (cy < ch - 1) push(cx, cy + 1);
          }
        }

        let minX = cw, maxX = 0, minY = ch, maxY = 0;
        for (let y = 0; y < ch; y++) {
          for (let x = 0; x < cw; x++) {
            const p = y * cw + x;
            const idx = p * 4;
            const lum = Math.max(data[idx], data[idx + 1], data[idx + 2]);

            if (visited[p] && lum <= bgThresh) {
              data[idx + 3] = 0;
            } else {
              data[idx + 3] = 255;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        const tempC = document.createElement('canvas');
        tempC.width = cw;
        tempC.height = ch;
        const tempCtx = tempC.getContext('2d');
        tempCtx.putImageData(cellData, 0, 0);

        const figW = maxX - minX + 1;
        const figH = maxY - minY + 1;
        const scale = targetH / figH;
        const drawW = Math.round(figW * scale);
        const drawH = Math.round(figH * scale);

        // Frame canvas (64x88)
        const frameC = document.createElement('canvas');
        frameC.width = 64;
        frameC.height = 88;
        const fCtx = frameC.getContext('2d');
        fCtx.imageSmoothingEnabled = true;
        fCtx.imageSmoothingQuality = 'high';

        const drawX = Math.round(32 - drawW / 2);
        const drawY = Math.round(82 - drawH);
        fCtx.drawImage(tempC, minX, minY, figW, figH, drawX, drawY, drawW, drawH);

        dirCanvases.push(frameC);
      }

      // Build full 12-column x 8-row spritesheet (768 x 704)
      const sheet = document.createElement('canvas');
      sheet.width = 64 * 12; // 768
      sheet.height = 88 * 8; // 704
      const sCtx = sheet.getContext('2d');
      sCtx.imageSmoothingEnabled = true;
      sCtx.imageSmoothingQuality = 'high';

      for (let dir = 0; dir < 8; dir++) {
        const baseFrame = dirCanvases[dir];
        const angle = dirAngles[dir];
        const fx = Math.cos(angle);
        const fy = Math.sin(angle);

        for (let col = 0; col < 12; col++) {
          const destX = col * 64;
          const destY = dir * 88;

          sCtx.save();
          sCtx.translate(destX, destY);

          if (col === 0) {
            // Idle (base stance)
            sCtx.drawImage(baseFrame, 0, 0);
          } else if (col >= 1 && col < 6) {
            // Walk cycle frames 1..5 (frame 0 is base)
            const walkStep = col;
            const phase = (walkStep / 6) * Math.PI * 2;
            const bob = Math.sin(phase * 2) * (isZombie ? 1.4 : 1.8);
            const sway = Math.sin(phase) * (isZombie ? 1.6 : 1.2);
            const scaleY = 1.0 - Math.abs(Math.sin(phase)) * 0.025;

            sCtx.save();
            sCtx.translate(32 + sway, 82);
            sCtx.scale(1.0, scaleY);
            sCtx.translate(-32, -82 + bob);
            sCtx.drawImage(baseFrame, 0, 0);
            sCtx.restore();
          } else if (col >= 6 && col < 9) {
            // Attack animation (cols 6..8)
            const step = col - 6;
            if (step === 0) {
              // Windup: slight crouch and pull back
              sCtx.save();
              sCtx.translate(32 - fx * 2.5, 82);
              sCtx.scale(0.98, 0.98);
              sCtx.translate(-32, -82 + 1);
              sCtx.drawImage(baseFrame, 0, 0);
              sCtx.restore();
            } else if (step === 1) {
              // Strike / lunge: explosive forward lunge
              sCtx.save();
              sCtx.translate(32 + fx * 4.5, 82);
              sCtx.scale(1.02, 1.02);
              sCtx.translate(-32, -82 - 1.5 + fy * 1.5);
              sCtx.drawImage(baseFrame, 0, 0);
              sCtx.restore();
            } else {
              // Recovery: settling forward momentum
              sCtx.save();
              sCtx.translate(32 + fx * 1.8, 82);
              sCtx.translate(-32, -82);
              sCtx.drawImage(baseFrame, 0, 0);
              sCtx.restore();
            }
          } else {
            // Death animation (cols 9..11)
            const step = col - 9;
            if (step === 0) {
              // Stagger back
              sCtx.save();
              sCtx.translate(32 - fx * 2, 82);
              sCtx.rotate(-0.25 * (fx >= 0 ? 1 : -1));
              sCtx.translate(-32, -82);
              sCtx.drawImage(baseFrame, 0, 0);
              sCtx.restore();
            } else if (step === 1) {
              // Buckling fall
              sCtx.save();
              sCtx.translate(32 - fx * 4, 82);
              sCtx.rotate(-0.85 * (fx >= 0 ? 1 : -1));
              sCtx.scale(1.0, 0.65);
              sCtx.translate(-32, -82 + 12);
              sCtx.drawImage(baseFrame, 0, 0);
              sCtx.restore();
            } else {
              // Collapsed on floor
              sCtx.save();
              sCtx.translate(32, 82);
              sCtx.rotate(-1.5 * (fx >= 0 ? 1 : -1));
              sCtx.scale(1.1, 0.45);
              sCtx.translate(-32, -82 + 20);
              sCtx.drawImage(baseFrame, 0, 0);
              sCtx.restore();
            }
          }

          sCtx.restore();
        }
      }

      // Generate a detailed pre-rendered corpse on a 110x70 canvas
      const corpseC = document.createElement('canvas');
      corpseC.width = 110;
      corpseC.height = 70;
      const cCtx = corpseC.getContext('2d');
      // Blood pool
      cCtx.fillStyle = 'rgba(55, 12, 10, 0.72)';
      cCtx.beginPath();
      cCtx.ellipse(55, 44, 34, 13, 0.15, 0, Math.PI * 2);
      cCtx.fill();
      cCtx.fillStyle = 'rgba(80, 16, 12, 0.5)';
      cCtx.beginPath();
      cCtx.ellipse(52, 45, 24, 8, -0.2, 0, Math.PI * 2);
      cCtx.fill();

      // Prone body from baseFrame (South-East angle)
      const fallen = dirCanvases[1]; // SE angle
      cCtx.save();
      cCtx.translate(55, 42);
      cCtx.rotate(-1.42);
      cCtx.scale(0.85, 0.52);
      cCtx.drawImage(fallen, -32, -82);
      cCtx.restore();

      return {
        sheetB64: sheet.toDataURL('image/png').split(',')[1],
        corpseB64: corpseC.toDataURL('image/png').split(',')[1]
      };
    }, {
      dirMapping: DIR_MAPPING,
      dirAngles: DIR_ANGLES,
      targetH: item.targetH,
      isZombie: item.isZombie
    });

    const sheetPath = path.join(charDir, `char_${item.key}.png`);
    const corpsePath = path.join(charDir, `corpse_${item.key}.png`);
    fs.writeFileSync(sheetPath, Buffer.from(result.sheetB64, 'base64'));
    fs.writeFileSync(corpsePath, Buffer.from(result.corpseB64, 'base64'));
    console.log(`Generated: ${sheetPath} and ${corpsePath}`);
  }

  // Create tinted survivor variations p1, p2, p3 from p0
  const p0Buf = fs.readFileSync(path.join(charDir, 'char_p0.png'));
  const p0B64 = p0Buf.toString('base64');
  await page.setContent(`<img id="p0" src="data:image/png;base64,${p0B64}">`);

  const variants = [
    { key: 'p1', tintR: 1.15, tintG: 0.95, tintB: 0.75 }, // warm brown/tan jacket
    { key: 'p2', tintR: 0.85, tintG: 0.95, tintB: 1.15 }, // dark navy/slate jacket
    { key: 'p3', tintR: 1.1, tintG: 0.85, tintB: 0.85 }   // worn burgundy/rust jacket
  ];

  for (const v of variants) {
    const varB64 = await page.evaluate((vCfg) => {
      const img = document.getElementById('p0');
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, c.width, c.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        // Subtle jacket tinting
        d[i] = Math.min(255, Math.round(d[i] * vCfg.tintR));
        d[i + 1] = Math.min(255, Math.round(d[i + 1] * vCfg.tintG));
        d[i + 2] = Math.min(255, Math.round(d[i + 2] * vCfg.tintB));
      }
      ctx.putImageData(imgData, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    }, v);

    const sheetPath = path.join(charDir, `char_${v.key}.png`);
    const corpsePath = path.join(charDir, `corpse_${v.key}.png`);
    fs.writeFileSync(sheetPath, Buffer.from(varB64, 'base64'));
    fs.copyFileSync(path.join(charDir, 'corpse_p0.png'), corpsePath);
    console.log(`Generated survivor variant: ${sheetPath}`);
  }

  // Pre-render discrete weapon sprites for hands overlay
  const weaponsB64 = await page.evaluate(() => {
    const drawBat = (ctx, x, y, angle, spiked = false) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.fillStyle = '#dfd8c8'; ctx.fillRect(0, -1.2, 7, 2.4);
      ctx.fillStyle = '#4a3f35'; ctx.fillRect(-1.5, -1.5, 2, 3);
      ctx.fillStyle = '#b48a56';
      ctx.beginPath(); ctx.moveTo(7, -1.3); ctx.lineTo(24, -2.4);
      ctx.arc(24, 0, 2.4, -Math.PI / 2, Math.PI / 2); ctx.lineTo(7, 1.3);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(8, -1.6, 15, 0.8);
      if (spiked) {
        ctx.fillStyle = '#c0c5c8';
        ctx.fillRect(16, -4.5, 1.2, 3); ctx.fillRect(20, -4.8, 1.2, 3);
        ctx.fillRect(18, 1.8, 1.2, 3); ctx.fillRect(22, 1.8, 1.2, 3);
        ctx.fillStyle = 'rgba(140,30,20,0.6)'; ctx.fillRect(17, -2.2, 6, 4.4);
      }
      ctx.restore();
    };

    const drawKnife = (ctx, x, y, angle) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.fillStyle = '#1e1f20'; ctx.fillRect(-1, -1.2, 6, 2.4);
      ctx.fillStyle = '#555'; ctx.fillRect(5, -1.6, 1, 3.2);
      ctx.fillStyle = '#d0d5d8';
      ctx.beginPath(); ctx.moveTo(6, -1.4); ctx.lineTo(17, -1.4);
      ctx.lineTo(19, 0.5); ctx.lineTo(6, 1.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(6, -1.4, 11, 0.6);
      ctx.restore();
    };

    const drawCrowbar = (ctx, x, y, angle) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.fillStyle = '#8b261e'; ctx.fillRect(0, -1.5, 20, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(0, -1.5, 20, 0.8);
      ctx.fillStyle = '#7a8084'; ctx.fillRect(-3, -1.2, 3, 2.4);
      ctx.beginPath(); ctx.moveTo(20, -1.5); ctx.quadraticCurveTo(25, -2, 27, -7);
      ctx.lineTo(25, -7.5); ctx.quadraticCurveTo(23, -2.5, 20, 1.5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    };

    const drawAxe = (ctx, x, y, angle) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.fillStyle = '#9c7a52'; ctx.fillRect(0, -1.4, 25, 2.8);
      ctx.fillStyle = '#3a2e20'; ctx.fillRect(0, -1.6, 6, 3.2);
      ctx.fillStyle = '#a6241b'; ctx.fillRect(19, -4.5, 5, 9);
      ctx.fillStyle = '#c5cbce';
      ctx.beginPath(); ctx.moveTo(24, -4.5); ctx.lineTo(27, -6); ctx.lineTo(27, 4); ctx.lineTo(24, 2.5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8f9598';
      ctx.beginPath(); ctx.moveTo(19, -3); ctx.lineTo(15, -4); ctx.lineTo(19, -1);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    };

    const drawPistol = (ctx, x, y, angle) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.fillStyle = '#222325';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(3.5, 7); ctx.lineTo(6.5, 6.5); ctx.lineTo(3.5, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#36393d'; ctx.fillRect(0, -3.2, 12, 3.8);
      ctx.fillStyle = '#18191a'; ctx.fillRect(4, -3.2, 3, 1.5);
      ctx.fillStyle = '#4a4f55'; ctx.fillRect(1, -3.2, 11, 0.8);
      ctx.restore();
    };

    const makeIcon = (fn, ...args) => {
      const c = document.createElement('canvas');
      c.width = 48; c.height = 48;
      const ctx = c.getContext('2d');
      fn(ctx, 10, 24, -0.4, ...args);
      return c.toDataURL('image/png').split(',')[1];
    };

    return {
      bat: makeIcon(drawBat),
      spiked_bat: makeIcon(drawBat, true),
      knife: makeIcon(drawKnife),
      crowbar: makeIcon(drawCrowbar),
      axe: makeIcon(drawAxe),
      pistol: makeIcon(drawPistol)
    };
  });

  for (const [wName, wData] of Object.entries(weaponsB64)) {
    const wPath = path.join(weaponsDir, `weapon_${wName}.png`);
    fs.writeFileSync(wPath, Buffer.from(wData, 'base64'));
    console.log(`Generated weapon: ${wPath}`);
  }

  await browser.close();
  console.log('All character sheets and weapon assets built successfully!');
}

main().catch(console.error);
