import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const brainDir = 'C:\\Users\\User\\.gemini\\antigravity\\brain\\0afeb043-3b9e-4335-9045-0fb99010db79';
const assetsDir = 'C:\\Users\\User\\.gemini\\antigravity\\scratch\\ashfall\\client\\public\\assets\\buildings';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage();

  function b64(filePath) {
    return fs.readFileSync(filePath).toString('base64');
  }

  const woodSrc = path.join(brainDir, 'wooden_floor_narrow_planks_1793118217424.jpg');
  await page.setContent(`<img id="wood" src="data:image/jpeg;base64,${b64(woodSrc)}">`);

  const { frameB64, leafB64 } = await page.evaluate(() => {
    const woodImg = document.getElementById('wood');

    // 1. Generate Door Frame (256x512)
    // Left jamb: x=0..26, Right jamb: x=230..256, Top lintel: y=0..26, Bottom sill: y=498..512
    // Center opening: (26, 26, 204, 472) - completely transparent!
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = 256;
    frameCanvas.height = 512;
    const fCtx = frameCanvas.getContext('2d');

    // Draw wood texture into jambs
    const woodPattern = fCtx.createPattern(woodImg, 'repeat');
    fCtx.save();
    // Dark weathered stain for door casing
    fCtx.fillStyle = '#34261a';
    fCtx.fillRect(0, 0, 256, 512);
    fCtx.globalAlpha = 0.45;
    fCtx.fillStyle = woodPattern;
    fCtx.fillRect(0, 0, 256, 512);
    fCtx.restore();

    // Frame depth & bevel styling
    // Outer shadow / edge highlight
    fCtx.strokeStyle = 'rgba(25, 18, 12, 0.9)';
    fCtx.lineWidth = 2;
    fCtx.strokeRect(1, 1, 254, 510);

    // Inner rebate stop (door stop rebate where leaf rests)
    fCtx.strokeStyle = 'rgba(75, 55, 38, 0.85)';
    fCtx.lineWidth = 2;
    fCtx.strokeRect(25, 25, 206, 474);

    // Clear opening
    fCtx.clearRect(26, 26, 204, 472);

    // Dark weathered stone/wood sill at bottom
    fCtx.fillStyle = '#221c17';
    fCtx.fillRect(10, 498, 236, 14);
    fCtx.strokeStyle = '#42372c';
    fCtx.lineWidth = 1.5;
    fCtx.strokeRect(10, 498, 236, 14);

    // 2. Generate Door Leaf (204x472) - 100% Flat Orthogonal 2D Front View
    const leafCanvas = document.createElement('canvas');
    leafCanvas.width = 204;
    leafCanvas.height = 472;
    const lCtx = leafCanvas.getContext('2d');

    // Base dark oak wood
    lCtx.save();
    lCtx.fillStyle = '#453322';
    lCtx.fillRect(0, 0, 204, 472);
    lCtx.globalAlpha = 0.55;
    lCtx.fillStyle = woodPattern;
    lCtx.fillRect(0, 0, 204, 472);
    lCtx.restore();

    // Subtle edge wear / darkness around perimeter
    lCtx.strokeStyle = '#281c12';
    lCtx.lineWidth = 2;
    lCtx.strokeRect(1, 1, 202, 470);

    // 4 Traditional Raised Wood Panels:
    // Top 2 panels: y=24..210, xLeft=18..96, xRight=108..186
    // Mid rail: y=210..240
    // Bottom 2 panels: y=240..436, xLeft=18..96, xRight=108..186
    const panels = [
      { x: 18, y: 24, w: 78, h: 186 },
      { x: 108, y: 24, w: 78, h: 186 },
      { x: 18, y: 244, w: 78, h: 196 },
      { x: 108, y: 244, w: 78, h: 196 },
    ];

    for (const p of panels) {
      // Recessed panel shadow at top/left
      lCtx.fillStyle = 'rgba(20, 14, 10, 0.45)';
      lCtx.fillRect(p.x, p.y, p.w, p.h);

      // Inner bevel highlight on bottom/right
      lCtx.strokeStyle = 'rgba(110, 85, 60, 0.5)';
      lCtx.lineWidth = 2;
      lCtx.strokeRect(p.x + 3, p.y + 3, p.w - 6, p.h - 6);

      // Panel field
      lCtx.fillStyle = 'rgba(58, 42, 28, 0.6)';
      lCtx.fillRect(p.x + 6, p.y + 6, p.w - 12, p.h - 12);
    }

    // Horizontal rails and vertical stiles dividers
    lCtx.strokeStyle = 'rgba(25, 18, 12, 0.65)';
    lCtx.lineWidth = 1.5;
    // Top rail line
    lCtx.beginPath();
    lCtx.moveTo(0, 225);
    lCtx.lineTo(204, 225);
    lCtx.stroke();
    // Center vertical stile
    lCtx.beginPath();
    lCtx.moveTo(102, 10);
    lCtx.lineTo(102, 450);
    lCtx.stroke();

    // Vintage weathered brass door knob & escutcheon plate
    // Placed at ergonomic height on right stile (x=188, y=240)
    const kX = 186;
    const kY = 240;
    // Escutcheon plate
    lCtx.fillStyle = '#6e5828';
    lCtx.fillRect(kX - 8, kY - 22, 16, 44);
    lCtx.strokeStyle = '#382d14';
    lCtx.lineWidth = 1.5;
    lCtx.strokeRect(kX - 8, kY - 22, 16, 44);

    // Brass knob highlight
    lCtx.fillStyle = '#b59242';
    lCtx.beginPath();
    lCtx.arc(kX, kY - 8, 7, 0, Math.PI * 2);
    lCtx.fill();
    lCtx.fillStyle = '#e8c872';
    lCtx.beginPath();
    lCtx.arc(kX - 2, kY - 10, 3, 0, Math.PI * 2);
    lCtx.fill();

    // Keyhole
    lCtx.fillStyle = '#1a1408';
    lCtx.beginPath();
    lCtx.arc(kX, kY + 10, 3, 0, Math.PI * 2);
    lCtx.fill();
    lCtx.fillRect(kX - 1.5, kY + 10, 3, 6);

    // Fine post-apocalyptic scratches & wear
    lCtx.strokeStyle = 'rgba(18, 12, 8, 0.35)';
    lCtx.lineWidth = 1;
    for (let s = 0; s < 25; s++) {
      const sx = (s * 33) % 204;
      const sy = (s * 59) % 472;
      lCtx.beginPath();
      lCtx.moveTo(sx, sy);
      lCtx.lineTo(sx + ((s % 3) - 1) * 3, sy + 14 + (s % 7));
      lCtx.stroke();
    }

    return {
      frameB64: frameCanvas.toDataURL('image/png').split(',')[1],
      leafB64: leafCanvas.toDataURL('image/png').split(',')[1],
    };
  });

  fs.writeFileSync(path.join(assetsDir, 'door_frame.png'), Buffer.from(frameB64, 'base64'));
  fs.writeFileSync(path.join(assetsDir, 'door_leaf.png'), Buffer.from(leafB64, 'base64'));
  console.log('Successfully generated 100% orthogonal door_frame.png and door_leaf.png!');

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
