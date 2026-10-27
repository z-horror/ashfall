import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();

  const buildingsDir = 'client/public/assets/buildings';
  const doorClosedB64 = fs.readFileSync(path.join(buildingsDir, 'door_closed.png')).toString('base64');
  const wardrobeB64 = fs.readFileSync(path.join(buildingsDir, 'wardrobe.png')).toString('base64');
  const bedB64 = fs.readFileSync(path.join(buildingsDir, 'bed_double.png')).toString('base64');

  await page.setContent(`
    <img id="doorImg" src="data:image/png;base64,${doorClosedB64}">
    <img id="wardrobeImg" src="data:image/png;base64,${wardrobeB64}">
    <img id="bedImg" src="data:image/png;base64,${bedB64}">
  `);

  const results = await page.evaluate(() => {
    // -------------------------------------------------------------
    // 1. Separate Door: Frame and Leaf
    // -------------------------------------------------------------
    const doorImg = document.getElementById('doorImg');
    const dw = doorImg.naturalWidth;
    const dh = doorImg.naturalHeight;

    // A. Door Frame: Keep wall + casing, make doorway opening transparent
    const cFrame = document.createElement('canvas');
    cFrame.width = dw;
    cFrame.height = dh;
    const ctxFrame = cFrame.getContext('2d');
    ctxFrame.drawImage(doorImg, 0, 0);

    // B. Door Leaf (closed): Isolate just the swinging wooden panel
    const cLeaf = document.createElement('canvas');
    cLeaf.width = dw;
    cLeaf.height = dh;
    const ctxLeaf = cLeaf.getContext('2d');
    ctxLeaf.drawImage(doorImg, 0, 0);

    // In door_closed.png (dw=258, dh=512):
    // Left jamb is along x: 68..86
    // Right jamb is along x: 202..224
    // Top lintel is along y: 110..140 (sloped)
    // Threshold is along y: 460..495 (sloped)
    // The doorway opening polygon in image space:
    // Top-left of opening: (88, 126)
    // Top-right of opening: (200, 182) (slope dy/dx = 56 / 112 = 0.5)
    // Bottom-right of opening: (200, 482)
    // Bottom-left of opening: (88, 426)
    
    // Clear opening in frame
    ctxFrame.save();
    ctxFrame.globalCompositeOperation = 'destination-out';
    ctxFrame.beginPath();
    ctxFrame.moveTo(88, 126);
    ctxFrame.lineTo(200, 182);
    ctxFrame.lineTo(200, 482);
    ctxFrame.lineTo(88, 426);
    ctxFrame.closePath();
    ctxFrame.fill();
    ctxFrame.restore();

    // Darken inner door jamb reveal so the open doorway looks like a deep 3D threshold
    ctxFrame.save();
    ctxFrame.strokeStyle = 'rgba(15, 12, 10, 0.9)';
    ctxFrame.lineWidth = 3;
    ctxFrame.beginPath();
    ctxFrame.moveTo(88, 126);
    ctxFrame.lineTo(88, 426);
    ctxFrame.stroke();
    ctxFrame.beginPath();
    ctxFrame.moveTo(88, 126);
    ctxFrame.lineTo(200, 182);
    ctxFrame.stroke();
    ctxFrame.beginPath();
    ctxFrame.moveTo(200, 182);
    ctxFrame.lineTo(200, 482);
    ctxFrame.stroke();
    // Inner threshold step
    ctxFrame.fillStyle = 'rgba(25, 22, 20, 0.85)';
    ctxFrame.beginPath();
    ctxFrame.moveTo(88, 426);
    ctxFrame.lineTo(200, 482);
    ctxFrame.lineTo(200, 488);
    ctxFrame.lineTo(88, 432);
    ctxFrame.closePath();
    ctxFrame.fill();
    ctxFrame.restore();

    // Clear everything EXCEPT opening in leaf
    ctxLeaf.save();
    ctxLeaf.globalCompositeOperation = 'destination-in';
    ctxLeaf.beginPath();
    ctxLeaf.moveTo(87, 125);
    ctxLeaf.lineTo(201, 182);
    ctxLeaf.lineTo(201, 483);
    ctxLeaf.lineTo(87, 427);
    ctxLeaf.closePath();
    ctxLeaf.fill();
    ctxLeaf.restore();

    // C. Door Leaf (open inward into room):
    // The door is hinged at the left jamb (x=88, y=426 base, y=126 top).
    // When swung 90 degrees inward into the house:
    // In isometric projection, the inward direction (-Y axis) goes up-right:
    // dx = +35 px, dy = -18 px.
    // The door is foreshortened in perspective.
    const cLeafOpen = document.createElement('canvas');
    cLeafOpen.width = dw;
    cLeafOpen.height = dh;
    const ctxLeafOpen = cLeafOpen.getContext('2d');

    // Draw swung door leaf extending into the interior:
    // Hinge line: (88, 126) down to (88, 426)
    // Outer edge: (124, 108) down to (124, 408)
    // Thickness edge: (128, 110) down to (128, 410)
    ctxLeafOpen.save();
    // Shadow of open door on floor
    ctxLeafOpen.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctxLeafOpen.beginPath();
    ctxLeafOpen.moveTo(88, 426);
    ctxLeafOpen.lineTo(124, 408);
    ctxLeafOpen.lineTo(132, 412);
    ctxLeafOpen.lineTo(92, 428);
    ctxLeafOpen.closePath();
    ctxLeafOpen.fill();

    // Door thickness (edge)
    ctxLeafOpen.fillStyle = '#2d241c';
    ctxLeafOpen.beginPath();
    ctxLeafOpen.moveTo(124, 108);
    ctxLeafOpen.lineTo(128, 110);
    ctxLeafOpen.lineTo(128, 410);
    ctxLeafOpen.lineTo(124, 408);
    ctxLeafOpen.closePath();
    ctxLeafOpen.fill();

    // Door inner face (weathered wood)
    const doorGrad = ctxLeafOpen.createLinearGradient(88, 126, 124, 108);
    doorGrad.addColorStop(0, '#3e3226');
    doorGrad.addColorStop(0.5, '#4f4133');
    doorGrad.addColorStop(1, '#3a2f23');
    ctxLeafOpen.fillStyle = doorGrad;
    ctxLeafOpen.beginPath();
    ctxLeafOpen.moveTo(88, 126);
    ctxLeafOpen.lineTo(124, 108);
    ctxLeafOpen.lineTo(124, 408);
    ctxLeafOpen.lineTo(88, 426);
    ctxLeafOpen.closePath();
    ctxLeafOpen.fill();

    // Wood grain lines and panel recesses
    ctxLeafOpen.strokeStyle = 'rgba(20, 15, 10, 0.6)';
    ctxLeafOpen.lineWidth = 1.2;
    for (let f = 0.25; f <= 0.75; f += 0.25) {
      const px = 88 + (124 - 88) * f;
      const py0 = 126 + (108 - 126) * f;
      const py1 = 426 + (408 - 426) * f;
      ctxLeafOpen.beginPath();
      ctxLeafOpen.moveTo(px, py0 + 10);
      ctxLeafOpen.lineTo(px, py1 - 10);
      ctxLeafOpen.stroke();
    }
    // Brass latch / handle on outer edge
    ctxLeafOpen.fillStyle = '#b59a57';
    ctxLeafOpen.fillRect(122, 275, 4, 10);
    ctxLeafOpen.fillStyle = '#6a582e';
    ctxLeafOpen.fillRect(121, 279, 5, 3);

    // Weathering scratches
    ctxLeafOpen.strokeStyle = 'rgba(180, 160, 130, 0.3)';
    ctxLeafOpen.lineWidth = 0.8;
    ctxLeafOpen.beginPath();
    ctxLeafOpen.moveTo(95, 200);
    ctxLeafOpen.lineTo(110, 240);
    ctxLeafOpen.moveTo(100, 310);
    ctxLeafOpen.lineTo(115, 330);
    ctxLeafOpen.stroke();
    ctxLeafOpen.restore();

    // -------------------------------------------------------------
    // 2. Clean Up Red Fringe on Wardrobe & Bed
    // -------------------------------------------------------------
    function cleanFringe(img) {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, c.width, c.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i+1], b = d[i+2], a = d[i+3];
        if (a > 0) {
          // If pure bright red/magenta fringe (high R, low G, low B):
          if (r > 120 && g < 40 && b < 60) {
            d[i+3] = 0; // eliminate chroma artifact
          } else if (r > 100 && r > g * 2.2 && r > b * 2.0) {
            // desaturate residual red spill to neutral shadow tone
            d[i] = Math.round(g * 1.1);
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
      return c.toDataURL('image/png').split(',')[1];
    }

    const wardrobeCleaned = cleanFringe(document.getElementById('wardrobeImg'));
    const bedCleaned = cleanFringe(document.getElementById('bedImg'));

    // -------------------------------------------------------------
    // 3. High-Quality Seamless Brick Wall Texture (512x512)
    // -------------------------------------------------------------
    const cBrick = document.createElement('canvas');
    const W = 512, H = 512;
    cBrick.width = W;
    cBrick.height = H;
    const ctxB = cBrick.getContext('2d');

    // Base background: dark aged mortar
    ctxB.fillStyle = '#22201d';
    ctxB.fillRect(0, 0, W, H);

    // Brick parameters:
    // Rows: 32 rows, each row is 16px high (mortar = 2px, brick = 14px)
    // Brick width: 32px (16 bricks per row, perfectly divides 512)
    const rowH = 16;
    const brickH = 13.5;
    const brickW = 32;
    const numRows = H / rowH;
    const numCols = W / brickW;

    // Palette of realistic weathered brick colors (Project Zomboid / Fallout 2 aesthetic)
    const brickPalette = [
      '#783c2e', '#854232', '#6e3528', '#8a4838', '#633125',
      '#743a2c', '#804030', '#6b3327', '#8e4b3a', '#5f2e22',
      '#7c3f30', '#834333', '#683226', '#874636', '#663024',
      '#72392b', '#7e3e2e', '#653023', '#8b4939', '#5d2b20'
    ];

    // Simple pseudo-random seeded generator
    let seed = 42;
    function rnd() {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    }

    // Draw individual bricks
    for (let r = 0; r < numRows; r++) {
      const y = r * rowH + 1.5;
      const offset = (r % 2 === 0) ? 0 : brickW / 2;
      for (let c = -1; c <= numCols; c++) {
        const x = c * brickW + offset;
        const colorIdx = Math.floor(rnd() * brickPalette.length);
        const col = brickPalette[colorIdx];

        ctxB.fillStyle = col;
        ctxB.fillRect(x + 1, y, brickW - 2, brickH);

        // Brick surface noise / texture
        const numPits = 2 + Math.floor(rnd() * 3);
        for (let p = 0; p < numPits; p++) {
          const px = x + 2 + rnd() * (brickW - 6);
          const py = y + 2 + rnd() * (brickH - 5);
          ctxB.fillStyle = rnd() > 0.5 ? 'rgba(30, 15, 10, 0.45)' : 'rgba(160, 110, 90, 0.35)';
          ctxB.fillRect(px, py, 1.5 + rnd() * 2, 1 + rnd() * 1.5);
        }

        // Top highlight on each brick
        ctxB.fillStyle = 'rgba(255, 230, 200, 0.12)';
        ctxB.fillRect(x + 1, y, brickW - 2, 1.2);

        // Bottom shadow on each brick
        ctxB.fillStyle = 'rgba(10, 8, 6, 0.45)';
        ctxB.fillRect(x + 1, y + brickH - 1.2, brickW - 2, 1.2);
      }
    }

    // Weathering: Peeling plaster / aged stucco patches (non-mirrored, organic)
    // Seamless plaster patches wrapping horizontally across W=512:
    function drawPlasterPatch(cx, cy, rx, ry) {
      ctxB.save();
      ctxB.fillStyle = '#b5aba0';
      ctxB.beginPath();
      const points = 16;
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const noise = 0.75 + rnd() * 0.5;
        const px = cx + Math.cos(angle) * rx * noise;
        const py = cy + Math.sin(angle) * ry * noise;
        if (i === 0) ctxB.moveTo(px, py);
        else ctxB.lineTo(px, py);
      }
      ctxB.closePath();
      ctxB.fill();

      // Plaster cracks and ragged edge shadow
      ctxB.strokeStyle = 'rgba(40, 30, 20, 0.55)';
      ctxB.lineWidth = 1.2;
      ctxB.stroke();

      // Inner plaster shading
      ctxB.fillStyle = 'rgba(50, 40, 30, 0.15)';
      ctxB.fill();
      ctxB.restore();
    }

    // Organic aged plaster patches
    drawPlasterPatch(140, 120, 75, 45);
    drawPlasterPatch(380, 260, 90, 55);

    // Weathered grime gradient (top down and bottom up)
    const topGrime = ctxB.createLinearGradient(0, 0, 0, 90);
    topGrime.addColorStop(0, 'rgba(15, 12, 10, 0.65)');
    topGrime.addColorStop(1, 'rgba(15, 12, 10, 0.0)');
    ctxB.fillStyle = topGrime;
    ctxB.fillRect(0, 0, W, 90);

    const bottomGrime = ctxB.createLinearGradient(0, H - 80, 0, H);
    bottomGrime.addColorStop(0, 'rgba(10, 10, 8, 0.0)');
    bottomGrime.addColorStop(1, 'rgba(10, 10, 8, 0.7)');
    ctxB.fillStyle = bottomGrime;
    ctxB.fillRect(0, H - 80, W, 80);

    // Stone coping header at the very top (first 16px)
    ctxB.fillStyle = '#6e6962';
    ctxB.fillRect(0, 0, W, 12);
    ctxB.fillStyle = '#8a847c';
    ctxB.fillRect(0, 0, W, 2);
    ctxB.fillStyle = '#3a3632';
    ctxB.fillRect(0, 11, W, 3);

    // Stone footing at bottom (last 8px)
    ctxB.fillStyle = '#48443e';
    ctxB.fillRect(0, H - 8, W, 8);
    ctxB.fillStyle = '#22201d';
    ctxB.fillRect(0, H - 1, W, 1);

    // -------------------------------------------------------------
    // 4. Concrete Basement Wall Texture (512x512)
    // -------------------------------------------------------------
    const cConcrete = document.createElement('canvas');
    cConcrete.width = W;
    cConcrete.height = H;
    const ctxC = cConcrete.getContext('2d');

    // Base concrete tone
    ctxC.fillStyle = '#5c5e5b';
    ctxC.fillRect(0, 0, W, H);

    // Aggregate specks
    for (let i = 0; i < 2000; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const s = 1 + rnd() * 2;
      ctxC.fillStyle = rnd() > 0.5 ? 'rgba(30, 32, 30, 0.3)' : 'rgba(130, 135, 130, 0.25)';
      ctxC.fillRect(x, y, s, s);
    }

    // Horizontal formwork panel seams (every 64px)
    for (let y = 64; y < H; y += 64) {
      ctxC.fillStyle = 'rgba(20, 22, 20, 0.6)';
      ctxC.fillRect(0, y, W, 2);
      ctxC.fillStyle = 'rgba(140, 145, 140, 0.25)';
      ctxC.fillRect(0, y + 2, W, 1);

      // Tie-rod holes along each formwork line
      for (let x = 32; x < W; x += 64) {
        ctxC.fillStyle = '#222422';
        ctxC.beginPath();
        ctxC.arc(x, y, 3, 0, Math.PI * 2);
        ctxC.fill();
        ctxC.fillStyle = 'rgba(10, 10, 10, 0.4)';
        ctxC.fillRect(x - 1, y + 3, 2, 8 + rnd() * 12);
      }
    }

    // Water stains and grime dripping down
    for (let i = 0; i < 18; i++) {
      const x = rnd() * W;
      const streakW = 4 + rnd() * 16;
      const streakH = 60 + rnd() * 180;
      const stain = ctxC.createLinearGradient(0, 0, 0, streakH);
      stain.addColorStop(0, 'rgba(20, 24, 20, 0.45)');
      stain.addColorStop(1, 'rgba(20, 24, 20, 0.0)');
      ctxC.fillStyle = stain;
      ctxC.fillRect(x, 0, streakW, streakH);
    }

    // Basement ceiling and floor grime
    const cTopGrime = ctxC.createLinearGradient(0, 0, 0, 50);
    cTopGrime.addColorStop(0, 'rgba(15, 16, 15, 0.7)');
    cTopGrime.addColorStop(1, 'rgba(15, 16, 15, 0.0)');
    ctxC.fillStyle = cTopGrime;
    ctxC.fillRect(0, 0, W, 50);

    const cBotGrime = ctxC.createLinearGradient(0, H - 40, 0, H);
    cBotGrime.addColorStop(0, 'rgba(10, 12, 10, 0.0)');
    cBotGrime.addColorStop(1, 'rgba(10, 12, 10, 0.65)');
    ctxC.fillStyle = cBotGrime;
    ctxC.fillRect(0, H - 40, W, 40);

    // -------------------------------------------------------------
    // 5. Interior Partition Wall Texture (512x512)
    // -------------------------------------------------------------
    const cInterior = document.createElement('canvas');
    cInterior.width = W;
    cInterior.height = H;
    const ctxI = cInterior.getContext('2d');

    // Muted plaster background
    ctxI.fillStyle = '#8b7c6c';
    ctxI.fillRect(0, 0, W, H);

    // Subtle wallpaper vertical stripes
    for (let x = 0; x < W; x += 16) {
      ctxI.fillStyle = 'rgba(60, 50, 40, 0.08)';
      ctxI.fillRect(x, 0, 8, H);
      ctxI.fillStyle = 'rgba(255, 250, 240, 0.04)';
      ctxI.fillRect(x + 8, 0, 8, H);
    }

    // Lower wainscoting / wooden baseboard (bottom 80px)
    ctxI.fillStyle = '#4a3b2c';
    ctxI.fillRect(0, H - 80, W, 80);
    // Wainscoting panels
    for (let x = 8; x < W; x += 64) {
      ctxI.strokeStyle = 'rgba(20, 15, 10, 0.6)';
      ctxI.lineWidth = 2;
      ctxI.strokeRect(x, H - 72, 48, 62);
      ctxI.fillStyle = 'rgba(255, 230, 200, 0.08)';
      ctxI.fillRect(x + 2, H - 70, 44, 58);
    }
    // Wainscoting top rail molding
    ctxI.fillStyle = '#362a1e';
    ctxI.fillRect(0, H - 84, W, 6);
    ctxI.fillStyle = '#634f3c';
    ctxI.fillRect(0, H - 84, W, 2);

    // Plaster stains and peeling wallpaper
    for (let i = 0; i < 12; i++) {
      const x = rnd() * W;
      const y = 50 + rnd() * (H - 180);
      ctxI.fillStyle = `rgba(35, 28, 20, ${0.1 + rnd() * 0.15})`;
      ctxI.beginPath();
      ctxI.ellipse(x, y, 15 + rnd() * 30, 20 + rnd() * 40, 0, 0, Math.PI * 2);
      ctxI.fill();
    }

    return {
      door_frame: cFrame.toDataURL('image/png').split(',')[1],
      door_leaf: cLeaf.toDataURL('image/png').split(',')[1],
      door_leaf_open: cLeafOpen.toDataURL('image/png').split(',')[1],
      wardrobe_clean: wardrobeCleaned,
      bed_clean: bedCleaned,
      wall_brick_face: cBrick.toDataURL('image/png').split(',')[1],
      wall_concrete_face: cConcrete.toDataURL('image/png').split(',')[1],
      wall_interior_face: cInterior.toDataURL('image/png').split(',')[1]
    };
  });

  // Save all generated/processed files
  fs.writeFileSync(path.join(buildingsDir, 'door_frame.png'), Buffer.from(results.door_frame, 'base64'));
  fs.writeFileSync(path.join(buildingsDir, 'door_leaf.png'), Buffer.from(results.door_leaf, 'base64'));
  fs.writeFileSync(path.join(buildingsDir, 'door_leaf_open.png'), Buffer.from(results.door_leaf_open, 'base64'));
  fs.writeFileSync(path.join(buildingsDir, 'wardrobe.png'), Buffer.from(results.wardrobe_clean, 'base64'));
  fs.writeFileSync(path.join(buildingsDir, 'bed_double.png'), Buffer.from(results.bed_clean, 'base64'));
  fs.writeFileSync(path.join(buildingsDir, 'wall_brick_face.png'), Buffer.from(results.wall_brick_face, 'base64'));
  fs.writeFileSync(path.join(buildingsDir, 'wall_concrete_face.png'), Buffer.from(results.wall_concrete_face, 'base64'));
  fs.writeFileSync(path.join(buildingsDir, 'wall_interior_face.png'), Buffer.from(results.wall_interior_face, 'base64'));

  console.log('Successfully generated and updated building assets!');
  await browser.close();
}

main().catch(console.error);
