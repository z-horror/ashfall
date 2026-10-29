import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const outPath = 'C:\\Users\\User\\.gemini\\antigravity\\scratch\\ashfall\\client\\public\\assets\\buildings\\door_leaf.png';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage();

  const leafB64 = await page.evaluate(() => {
    function mulberry32(a) {
      return function () {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const rnd = mulberry32(109283);

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');

    const w = 512;
    const h = 1024;

    // 1. Base metal surface (weathered industrial grey-green steel)
    const baseGrad = ctx.createLinearGradient(0, 0, w, h);
    baseGrad.addColorStop(0, '#535d5b');
    baseGrad.addColorStop(0.5, '#485250');
    baseGrad.addColorStop(1, '#3b4341');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Fine horizontal and vertical rolled-steel grain noise
    for (let y = 0; y < h; y += 2) {
      const alpha = 0.03 + rnd() * 0.05;
      ctx.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
      ctx.fillRect(0, y, w, 2);
    }
    for (let i = 0; i < 4000; i++) {
      const px = rnd() * w;
      const py = rnd() * h;
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.12)';
      ctx.fillRect(px, py, 1 + rnd() * 3, 1 + rnd() * 2);
    }

    // 3. Welded perimeter steel flange / bevel edge
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#292f2e';
    ctx.strokeRect(7, 7, w - 14, h - 14);

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#687472';
    ctx.strokeRect(14, 14, w - 28, h - 28);

    // 4. Heavy corrosion & rust at the bottom (splash zone from rain/ground)
    const rustGrad = ctx.createLinearGradient(0, h * 0.45, 0, h);
    rustGrad.addColorStop(0, 'rgba(84, 43, 20, 0)');
    rustGrad.addColorStop(0.25, 'rgba(98, 48, 22, 0.45)');
    rustGrad.addColorStop(0.65, 'rgba(115, 52, 22, 0.85)');
    rustGrad.addColorStop(1, 'rgba(54, 24, 10, 0.98)');
    ctx.fillStyle = rustGrad;
    ctx.fillRect(0, h * 0.45, w, h * 0.55);

    // Organic rust blotches & patches (using irregular overlapping shapes)
    for (let i = 0; i < 120; i++) {
      const rx = rnd() * w;
      const ry = h * 0.52 + rnd() * (h * 0.48);
      const rw = 15 + rnd() * 65;
      const rh = 10 + rnd() * 45;
      const rVal = 85 + Math.floor(rnd() * 55);
      const gVal = 35 + Math.floor(rnd() * 30);
      const bVal = 12 + Math.floor(rnd() * 15);
      ctx.fillStyle = `rgba(${rVal},${gVal},${bVal},${0.3 + rnd() * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(rx, ry, rw, rh, (rnd() - 0.5) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Edge corrosion creeping inward
    for (let y = h * 0.3; y < h; y += 4) {
      const edgeRustW = 10 + rnd() * 30;
      ctx.fillStyle = 'rgba(75, 34, 14, 0.65)';
      ctx.fillRect(0, y, edgeRustW, 4);
      ctx.fillRect(w - edgeRustW, y, edgeRustW, 4);
    }

    // Rust streaks running down along edges and scratches
    for (let i = 0; i < 35; i++) {
      const sx = 20 + rnd() * (w - 40);
      const sy = 80 + rnd() * (h * 0.7);
      const sLen = 30 + rnd() * 140;
      const sWidth = 1 + rnd() * 4;
      const streakGrad = ctx.createLinearGradient(sx, sy, sx, sy + sLen);
      streakGrad.addColorStop(0, 'rgba(92, 45, 18, 0.7)');
      streakGrad.addColorStop(1, 'rgba(92, 45, 18, 0)');
      ctx.fillStyle = streakGrad;
      ctx.fillRect(sx, sy, sWidth, sLen);
    }

    // 5. RED WARNING / HAZARD PLACARD (like in visual-target.jpg eye-level)
    const signW = 180;
    const signH = 110;
    const signX = (w - signW) / 2;
    const signY = h * 0.22;

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(signX + 3, signY + 3, signW, signH);

    // Red sign plate
    ctx.fillStyle = '#8f2323';
    ctx.fillRect(signX, signY, signW, signH);

    // Weathered sign border
    ctx.strokeStyle = '#d9d1c7';
    ctx.lineWidth = 4;
    ctx.strokeRect(signX + 4, signY + 4, signW - 8, signH - 8);

    // Inner hazard header box
    ctx.fillStyle = '#0f1211';
    ctx.fillRect(signX + 12, signY + 12, signW - 24, 32);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('DANGER', signX + signW / 2, signY + 28);

    ctx.fillStyle = '#f0e6d6';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('RESTRICTED AREA', signX + signW / 2, signY + 62);
    ctx.font = '9px sans-serif';
    ctx.fillText('AUTHORIZED ONLY', signX + signW / 2, signY + 80);

    // Weather the sign with scratches and grime
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = 'rgba(40, 20, 10, 0.6)';
      ctx.lineWidth = 1 + rnd() * 2;
      ctx.beginPath();
      ctx.moveTo(signX + rnd() * signW, signY + rnd() * signH);
      ctx.lineTo(signX + rnd() * signW, signY + rnd() * signH);
      ctx.stroke();
    }

    // 6. Heavy Industrial Handle & Lock Escutcheon (right side mid-height)
    const lockX = w - 85;
    const lockY = h * 0.52;
    const lockW = 46;
    const lockH = 120;

    // Escutcheon plate
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(lockX - 2, lockY - 2, lockW + 4, lockH + 4);
    ctx.fillStyle = '#2d3331';
    ctx.fillRect(lockX, lockY, lockW, lockH);
    ctx.strokeStyle = '#5a6361';
    ctx.lineWidth = 2;
    ctx.strokeRect(lockX, lockY, lockW, lockH);

    // Key cylinder
    ctx.fillStyle = '#111312';
    ctx.beginPath();
    ctx.arc(lockX + lockW / 2, lockY + lockH * 0.72, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d4dcda';
    ctx.fillRect(lockX + lockW / 2 - 2, lockY + lockH * 0.72 - 6, 4, 12);

    // Heavy cast-steel lever handle
    const handleY = lockY + lockH * 0.32;
    const handleGrad = ctx.createLinearGradient(lockX - 45, handleY - 7, lockX + 10, handleY + 7);
    handleGrad.addColorStop(0, '#8c9896');
    handleGrad.addColorStop(0.5, '#4a5351');
    handleGrad.addColorStop(1, '#2b3130');
    ctx.fillStyle = handleGrad;

    // Lever arm
    ctx.beginPath();
    ctx.roundRect(lockX - 55, handleY - 7, 70, 14, 6);
    ctx.fill();
    ctx.strokeStyle = '#9ca8a5';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Lever hub rosette
    ctx.fillStyle = '#39403e';
    ctx.beginPath();
    ctx.arc(lockX + lockW / 2, handleY, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7c8886';
    ctx.stroke();

    return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  });

  await browser.close();
  fs.writeFileSync(outPath, Buffer.from(leafB64, 'base64'));
  console.log('Successfully saved reference door texture to', outPath);
}

main().catch(console.error);
