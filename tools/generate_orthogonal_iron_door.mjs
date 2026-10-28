import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const assetsDir = 'C:\\Users\\User\\.gemini\\antigravity\\scratch\\ashfall\\client\\public\\assets\\buildings';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage();

  const { frameB64, leafB64 } = await page.evaluate(() => {
    // Utility helpers for canvas rendering
    function mulberry32(a) {
      return function () {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const rnd = mulberry32(42819);

    function drawRivet(ctx, x, y, radius = 3.5) {
      // Drop shadow
      ctx.fillStyle = 'rgba(10, 10, 10, 0.7)';
      ctx.beginPath();
      ctx.arc(x + 1, y + 1.2, radius, 0, Math.PI * 2);
      ctx.fill();
      // Rivet body (cold steel / iron)
      const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0.5, x, y, radius);
      grad.addColorStop(0, '#757c79');
      grad.addColorStop(0.6, '#464a48');
      grad.addColorStop(1, '#232524');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      // Specular highlight
      ctx.fillStyle = 'rgba(230, 240, 235, 0.65)';
      ctx.beginPath();
      ctx.arc(x - radius * 0.35, y - radius * 0.35, radius * 0.35, 0, Math.PI * 2);
      ctx.fill();
      // Crevice rust ring
      if (rnd() < 0.6) {
        ctx.strokeStyle = 'rgba(92, 48, 22, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, radius + 0.8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function addSteelTexture(ctx, w, h, baseColor = '#343836') {
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, w, h);
      // Horizontal rolled steel grain
      for (let y = 0; y < h; y += 2) {
        const val = Math.floor(40 + (rnd() - 0.5) * 16);
        ctx.fillStyle = `rgba(${val}, ${val + 2}, ${val + 2}, 0.12)`;
        ctx.fillRect(0, y, w, 1.5);
      }
      // Micro-speckle & pitting
      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const noise = (rnd() - 0.5) * 22;
        d[i] = Math.max(0, Math.min(255, d[i] + noise));
        d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + noise));
        d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // =========================================================================
    // 1. HEAVY STEEL DOOR FRAME (256 x 512)
    // =========================================================================
    const cFrame = document.createElement('canvas');
    cFrame.width = 256;
    cFrame.height = 512;
    const fCtx = cFrame.getContext('2d');

    // Welded channel iron casing
    addSteelTexture(fCtx, 256, 512, '#282b29');

    // Inner & outer frame edges
    fCtx.strokeStyle = '#181918';
    fCtx.lineWidth = 2.5;
    fCtx.strokeRect(1, 1, 254, 510);

    // Outer flange bevel highlight
    fCtx.strokeStyle = 'rgba(120, 130, 125, 0.35)';
    fCtx.lineWidth = 1.5;
    fCtx.strokeRect(3, 3, 250, 506);

    // Corner reinforcement gusset plates (triangle iron brackets)
    const gussets = [
      [[0, 0], [45, 0], [0, 45]],
      [[256, 0], [211, 0], [256, 45]],
    ];
    for (const pts of gussets) {
      fCtx.fillStyle = '#202221';
      fCtx.beginPath();
      fCtx.moveTo(pts[0][0], pts[0][1]);
      fCtx.lineTo(pts[1][0], pts[1][1]);
      fCtx.lineTo(pts[2][0], pts[2][1]);
      fCtx.closePath();
      fCtx.fill();
      fCtx.strokeStyle = '#3e4240';
      fCtx.lineWidth = 1.5;
      fCtx.stroke();
    }
    drawRivet(fCtx, 16, 16, 4);
    drawRivet(fCtx, 240, 16, 4);

    // Heavy Industrial Steel Hinges on Left Jamb (x=12..26)
    const hingeYs = [65, 230, 410];
    for (const hy of hingeYs) {
      // Hinge backplate welded to frame
      fCtx.fillStyle = '#1c1e1d';
      fCtx.fillRect(6, hy - 20, 20, 40);
      fCtx.strokeStyle = '#4a504d';
      fCtx.lineWidth = 1.5;
      fCtx.strokeRect(6, hy - 20, 20, 40);
      // Mounting bolts
      drawRivet(fCtx, 16, hy - 12, 3);
      drawRivet(fCtx, 16, hy + 12, 3);
      // Heavy hinge barrel
      fCtx.fillStyle = '#343836';
      fCtx.fillRect(20, hy - 16, 8, 32);
      fCtx.strokeStyle = '#626865';
      fCtx.lineWidth = 1;
      fCtx.strokeRect(20, hy - 16, 8, 32);
      // Grease stain dripping down
      fCtx.fillStyle = 'rgba(15, 12, 8, 0.55)';
      fCtx.beginPath();
      fCtx.ellipse(24, hy + 22, 3, 8, 0, 0, Math.PI * 2);
      fCtx.fill();
    }

    // Heavy Steel Strike Plate on Right Jamb (x=230..250, y=225..275)
    fCtx.fillStyle = '#3a3f3c';
    fCtx.fillRect(230, 225, 18, 54);
    fCtx.strokeStyle = '#5a625e';
    fCtx.lineWidth = 1.5;
    fCtx.strokeRect(230, 225, 18, 54);
    // Deadbolt socket
    fCtx.fillStyle = '#0a0b0a';
    fCtx.fillRect(232, 238, 12, 28);
    drawRivet(fCtx, 239, 231, 2.5);
    drawRivet(fCtx, 239, 272, 2.5);

    // CLEAR DOOR OPENING (26, 26, 204, 472)
    fCtx.clearRect(26, 26, 204, 472);

    // Deep inner jamb recess shadows
    fCtx.fillStyle = 'rgba(8, 8, 8, 0.85)';
    fCtx.fillRect(26, 26, 6, 472); // left inner jamb shadow
    fCtx.fillRect(26, 26, 204, 6); // top header inner shadow
    fCtx.fillStyle = 'rgba(12, 12, 12, 0.65)';
    fCtx.fillRect(224, 26, 6, 472); // right inner jamb shadow

    // Heavy diamond-plate industrial steel threshold at bottom (y=496..512)
    fCtx.fillStyle = '#222423';
    fCtx.fillRect(10, 496, 236, 16);
    fCtx.strokeStyle = '#4e5450';
    fCtx.lineWidth = 1.5;
    fCtx.strokeRect(10, 496, 236, 16);
    // Diamond plate treads
    fCtx.strokeStyle = '#383c3a';
    fCtx.lineWidth = 1;
    for (let tx = 20; tx < 236; tx += 12) {
      fCtx.beginPath();
      fCtx.moveTo(tx, 498);
      fCtx.lineTo(tx + 6, 510);
      fCtx.moveTo(tx + 6, 498);
      fCtx.lineTo(tx, 510);
      fCtx.stroke();
    }

    // =========================================================================
    // 2. REINFORCED HEAVY IRON DOOR LEAF (204 x 472)
    // =========================================================================
    const cLeaf = document.createElement('canvas');
    cLeaf.width = 204;
    cLeaf.height = 472;
    const lCtx = cLeaf.getContext('2d');

    // Base heavy armored plate steel (dark cold-rolled iron with patina)
    addSteelTexture(lCtx, 204, 472, '#313533');

    // Outer perimeter steel bevel
    lCtx.strokeStyle = '#1d201e';
    lCtx.lineWidth = 3;
    lCtx.strokeRect(1, 1, 202, 470);
    lCtx.strokeStyle = 'rgba(115, 125, 120, 0.4)';
    lCtx.lineWidth = 1.5;
    lCtx.strokeRect(3, 3, 198, 466);

    // Perimeter reinforcing steel flange strap (16px wide border)
    lCtx.fillStyle = 'rgba(38, 42, 40, 0.85)';
    lCtx.fillRect(4, 4, 196, 16); // top strap
    lCtx.fillRect(4, 452, 196, 16); // bottom strap
    lCtx.fillRect(4, 4, 16, 464); // left strap
    lCtx.fillRect(184, 4, 16, 464); // right strap

    // Rivets along the perimeter strap
    for (let y = 14; y <= 458; y += 38) {
      drawRivet(lCtx, 12, y, 3.5);
      drawRivet(lCtx, 192, y, 3.5);
    }
    for (let x = 40; x <= 164; x += 40) {
      drawRivet(lCtx, x, 12, 3.5);
      drawRivet(lCtx, x, 460, 3.5);
    }

    // 3 Heavy Horizontal Steel Reinforcement Beams (Швеллеры / полосы жесткости)
    const horizStraps = [
      { y: 55, h: 32 },   // upper beam
      { y: 220, h: 38 },  // middle lock beam
      { y: 380, h: 34 },  // lower kick beam
    ];

    for (const strap of horizStraps) {
      // Drop shadow under strap
      lCtx.fillStyle = 'rgba(8, 8, 8, 0.65)';
      lCtx.fillRect(12, strap.y + strap.h, 180, 4);

      // Strap plate
      lCtx.fillStyle = '#262927';
      lCtx.fillRect(12, strap.y, 180, strap.h);

      // Weld bead / edges
      lCtx.strokeStyle = '#4e5451';
      lCtx.lineWidth = 1.5;
      lCtx.strokeRect(12, strap.y, 180, strap.h);

      // Top specular edge highlight
      lCtx.strokeStyle = 'rgba(140, 150, 145, 0.5)';
      lCtx.lineWidth = 1;
      lCtx.beginPath();
      lCtx.moveTo(12, strap.y + 1);
      lCtx.lineTo(192, strap.y + 1);
      lCtx.stroke();

      // Dual row of heavy iron rivets on each beam
      for (let rx = 32; rx <= 172; rx += 35) {
        drawRivet(lCtx, rx, strap.y + 9, 3);
        drawRivet(lCtx, rx, strap.y + strap.h - 9, 3);
      }
    }

    // Diagonal Cross-Bracing Ribs (Диагональные ребра жесткости в верхнем и нижнем отсеках)
    const diagonals = [
      // Upper bay: from (24, 95) to (180, 215)
      { x0: 24, y0: 95, x1: 180, y1: 215 },
      { x0: 180, y0: 95, x1: 24, y1: 215 },
      // Lower bay: from (24, 265) to (180, 375)
      { x0: 24, y0: 265, x1: 180, y1: 375 },
      { x0: 180, y0: 265, x1: 24, y1: 375 },
    ];

    for (const d of diagonals) {
      lCtx.strokeStyle = '#222523';
      lCtx.lineWidth = 12;
      lCtx.beginPath();
      lCtx.moveTo(d.x0, d.y0);
      lCtx.lineTo(d.x1, d.y1);
      lCtx.stroke();

      lCtx.strokeStyle = '#424744';
      lCtx.lineWidth = 1.5;
      lCtx.beginPath();
      lCtx.moveTo(d.x0, d.y0);
      lCtx.lineTo(d.x1, d.y1);
      lCtx.stroke();
    }

    // ARMORED SPEAKEASY / PEEPHOLE GRILLE (Смотровая амбразура / щель на уровне глаз)
    // Centered at x=102, y=130..175
    const peekX = 66;
    const peekY = 135;
    const peekW = 72;
    const peekH = 42;

    // Heavy armored steel frame
    lCtx.fillStyle = 'rgba(5, 5, 5, 0.85)';
    lCtx.fillRect(peekX - 2, peekY - 2, peekW + 4, peekH + 4);
    lCtx.fillStyle = '#1c1e1d';
    lCtx.fillRect(peekX, peekY, peekW, peekH);
    lCtx.strokeStyle = '#5a625e';
    lCtx.lineWidth = 2.5;
    lCtx.strokeRect(peekX, peekY, peekW, peekH);

    // Frame mounting bolts
    drawRivet(lCtx, peekX + 6, peekY + 6, 2.5);
    drawRivet(lCtx, peekX + peekW - 6, peekY + 6, 2.5);
    drawRivet(lCtx, peekX + 6, peekY + peekH - 6, 2.5);
    drawRivet(lCtx, peekX + peekW - 6, peekY + peekH - 6, 2.5);

    // Inner dark aperture
    lCtx.fillStyle = '#060706';
    lCtx.fillRect(peekX + 12, peekY + 10, peekW - 24, peekH - 20);

    // Heavy iron rebar grille bars
    for (let bx = peekX + 20; bx < peekX + peekW - 14; bx += 9) {
      lCtx.fillStyle = '#3a3e3c';
      lCtx.fillRect(bx, peekY + 10, 4, peekH - 20);
      lCtx.fillStyle = '#6a726e';
      lCtx.fillRect(bx + 1, peekY + 10, 1.5, peekH - 20);
    }

    // Armored sliding visor cover mounted on top
    lCtx.fillStyle = '#262927';
    lCtx.fillRect(peekX + 6, peekY - 10, peekW - 12, 10);
    lCtx.strokeStyle = '#4a504d';
    lCtx.lineWidth = 1;
    lCtx.strokeRect(peekX + 6, peekY - 10, peekW - 12, 10);

    // HEAVY-DUTY INDUSTRIAL LOCKING MECHANISM (Замок, ригели, стальная ручка)
    // Mounted on middle beam at x=154..190, y=215..265
    const lockX = 152;
    const lockY = 216;
    const lockW = 38;
    const lockH = 48;

    // Hardened steel lock housing box
    lCtx.fillStyle = 'rgba(6, 6, 6, 0.7)';
    lCtx.fillRect(lockX - 2, lockY - 2, lockW + 4, lockH + 4);
    lCtx.fillStyle = '#202221';
    lCtx.fillRect(lockX, lockY, lockW, lockH);
    lCtx.strokeStyle = '#5c6460';
    lCtx.lineWidth = 2;
    lCtx.strokeRect(lockX, lockY, lockW, lockH);

    // 4 Corner armor bolts
    drawRivet(lCtx, lockX + 5, lockY + 6, 2.5);
    drawRivet(lCtx, lockX + lockW - 5, lockY + 6, 2.5);
    drawRivet(lCtx, lockX + 5, lockY + lockH - 6, 2.5);
    drawRivet(lCtx, lockX + lockW - 5, lockY + lockH - 6, 2.5);

    // Heavy steel lever handle
    const handlePivotX = lockX + 16;
    const handlePivotY = lockY + 20;

    // Handle escutcheon hub
    lCtx.fillStyle = '#3a3e3c';
    lCtx.beginPath();
    lCtx.arc(handlePivotX, handlePivotY, 7, 0, Math.PI * 2);
    lCtx.fill();
    lCtx.strokeStyle = '#727a76';
    lCtx.lineWidth = 1.5;
    lCtx.stroke();

    // Solid steel lever pointing left
    lCtx.fillStyle = 'rgba(10, 10, 10, 0.6)';
    lCtx.fillRect(handlePivotX - 28, handlePivotY - 1, 28, 8); // shadow
    lCtx.fillStyle = '#68706d';
    lCtx.fillRect(handlePivotX - 28, handlePivotY - 4, 28, 7);
    lCtx.fillStyle = '#8a9490';
    lCtx.fillRect(handlePivotX - 28, handlePivotY - 4, 28, 2); // highlight
    lCtx.strokeStyle = '#323634';
    lCtx.lineWidth = 1;
    lCtx.strokeRect(handlePivotX - 28, handlePivotY - 4, 28, 7);
    // Rounded grip tip
    lCtx.fillStyle = '#565c59';
    lCtx.beginPath();
    lCtx.arc(handlePivotX - 28, handlePivotY - 0.5, 4.5, 0, Math.PI * 2);
    lCtx.fill();

    // Keyhole & deadbolt cylinder
    lCtx.fillStyle = '#101110';
    lCtx.beginPath();
    lCtx.arc(handlePivotX, lockY + 36, 4, 0, Math.PI * 2);
    lCtx.fill();
    lCtx.fillRect(handlePivotX - 1.5, lockY + 36, 3, 6);
    lCtx.strokeStyle = '#626865';
    lCtx.lineWidth = 1;
    lCtx.strokeRect(handlePivotX - 5, lockY + 30, 10, 14);

    // POST-APOCALYPTIC WEATHERING & RUST OXIDATION
    // 1. Rust dripping under rivets and bottom plate
    const rustDrips = [
      [12, 130, 14], [192, 170, 18], [66, 178, 16], [138, 178, 20],
      [40, 258, 24], [105, 258, 30], [175, 258, 18],
      [32, 415, 35], [88, 415, 40], [145, 415, 38],
    ];
    for (const [rx, ry, len] of rustDrips) {
      const rGrad = lCtx.createLinearGradient(rx, ry, rx, ry + len);
      rGrad.addColorStop(0, 'rgba(110, 50, 22, 0.7)');
      rGrad.addColorStop(0.5, 'rgba(85, 38, 16, 0.45)');
      rGrad.addColorStop(1, 'rgba(60, 26, 10, 0)');
      lCtx.fillStyle = rGrad;
      lCtx.beginPath();
      lCtx.moveTo(rx - 3, ry);
      lCtx.lineTo(rx + 3, ry);
      lCtx.lineTo(rx + 1, ry + len);
      lCtx.lineTo(rx - 1, ry + len);
      lCtx.closePath();
      lCtx.fill();
    }

    // 2. Heavy corrosion along bottom plate edge (y=440..470)
    for (let x = 6; x < 198; x += 3) {
      const rustH = 8 + Math.sin(x * 0.15) * 5 + rnd() * 8;
      lCtx.fillStyle = `rgba(${Math.floor(70 + rnd() * 30)}, ${Math.floor(32 + rnd() * 15)}, 14, 0.65)`;
      lCtx.fillRect(x, 472 - rustH, 3.5, rustH);
    }

    // 3. Battle scars & steel scratches exposing raw shiny metal
    for (let s = 0; s < 30; s++) {
      const sx = 20 + rnd() * 164;
      const sy = 30 + rnd() * 410;
      const sLen = 8 + rnd() * 22;
      const angle = (rnd() - 0.5) * 1.5;
      // Dark scratch groove
      lCtx.strokeStyle = 'rgba(10, 12, 11, 0.65)';
      lCtx.lineWidth = 1.2;
      lCtx.beginPath();
      lCtx.moveTo(sx, sy);
      lCtx.lineTo(sx + angle * sLen, sy + sLen);
      lCtx.stroke();
      // Bare metal specular glint
      lCtx.strokeStyle = 'rgba(200, 215, 210, 0.5)';
      lCtx.lineWidth = 0.8;
      lCtx.beginPath();
      lCtx.moveTo(sx + 1, sy + 1);
      lCtx.lineTo(sx + angle * sLen + 1, sy + sLen + 1);
      lCtx.stroke();
    }

    return {
      frameB64: cFrame.toDataURL('image/png').split(',')[1],
      leafB64: cLeaf.toDataURL('image/png').split(',')[1],
    };
  });

  fs.writeFileSync(path.join(assetsDir, 'door_frame.png'), Buffer.from(frameB64, 'base64'));
  fs.writeFileSync(path.join(assetsDir, 'door_leaf.png'), Buffer.from(leafB64, 'base64'));
  console.log('Successfully generated authentic Heavy Iron/Steel Security Door assets!');

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
