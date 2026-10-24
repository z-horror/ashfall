import Phaser from 'phaser';
import { ITEMS, type ItemDef } from '@ashfall/shared';
import {
  applyIsoTransform,
  diamondPath,
  hash2,
  hashString,
  line,
  makeCanvas,
  mulberry,
  rgba,
  roundRect,
  shade,
  speckle,
} from './util.js';

export const WALL_HEIGHT = 56;

const iconUrls = new Map<string, string>();

export const ENV_ATLAS = 'env_atlas';

export interface ArtFrame {
  source: CanvasImageSource;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
}

const pending = new Map<string, HTMLCanvasElement>();
const frames = new Map<string, ArtFrame>();

function register(_scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): void {
  pending.set(key, canvas);
}

function packEnvironmentAtlas(scene: Phaser.Scene): void {
  const entries = [...pending.entries()].sort((a, b) => b[1].height - a[1].height);
  let size = 2048;
  let placements: Array<{ key: string; canvas: HTMLCanvasElement; x: number; y: number }> = [];
  const PADDING = 4;
  for (const attempt of [2048, 4096]) {
    size = attempt;
    placements = [];
    let x = PADDING;
    let y = PADDING;
    let rowH = 0;
    let ok = true;
    for (const [key, canvas] of entries) {
      const w = canvas.width;
      const h = canvas.height;
      if (w + PADDING * 2 > size) {
        ok = false;
        break;
      }
      if (x + w + PADDING > size) {
        x = PADDING;
        y += rowH + PADDING;
        rowH = 0;
      }
      if (y + h + PADDING > size) {
        ok = false;
        break;
      }
      placements.push({ key, canvas, x, y });
      x += w + PADDING;
      rowH = Math.max(rowH, h);
    }
    if (ok) break;
    if (attempt === 4096) throw new Error('environment atlas does not fit');
  }

  const { canvas: atlas, ctx } = makeCanvas(size, size);
  for (const p of placements) {
    ctx.drawImage(p.canvas, p.x, p.y);
  }
  const tex = scene.textures.addCanvas(ENV_ATLAS, atlas);
  if (!tex) throw new Error('failed to create environment atlas');
  for (const p of placements) {
    tex.add(p.key, 0, p.x, p.y, p.canvas.width, p.canvas.height);
    frames.set(p.key, {
      source: atlas,
      x: p.x,
      y: p.y,
      w: p.canvas.width,
      h: p.canvas.height,
      name: p.key,
    });
  }
  pending.clear();
}

export function artImage(scene: Phaser.Scene, x: number, y: number, key: string): Phaser.GameObjects.Image {
  if (frames.has(key)) return scene.add.image(x, y, ENV_ATLAS, key);
  return scene.add.image(x, y, key);
}

export function artSetTexture(image: Phaser.GameObjects.Image, key: string): void {
  if (frames.has(key)) image.setTexture(ENV_ATLAS, key);
  else image.setTexture(key);
}

export function drawArtTexture(
  ctx: CanvasRenderingContext2D,
  key: string,
  dx: number,
  dy: number,
): boolean {
  const frame = frames.get(key);
  if (!frame) return false;
  ctx.drawImage(frame.source, frame.x, frame.y, frame.w, frame.h, dx, dy, frame.w, frame.h);
  return true;
}

/* ------------------------------------------------------------------ */
/* Ground                                                              */
/* ------------------------------------------------------------------ */

type GroundKind = 'asphalt' | 'sidewalk' | 'grass' | 'dirt' | 'wood' | 'tile' | 'concrete' | 'rubble';

function makeGround(kind: GroundKind, variant: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(64, 32);
  const rnd = mulberry(hashString(`${kind}:${variant}`));
  ctx.save();
  // Clip with slight outward expansion (1px) so tile edges never produce black/transparent margins
  diamondPath(ctx, 32, 16, 64, 32, 1);
  ctx.clip();

  const fillDiamond = (color: string) => {
    ctx.fillStyle = color;
    diamondPath(ctx, 32, 16, 66, 34, 1);
    ctx.fill();
  };

  if (kind === 'asphalt') {
    const bases = [
      '#34383b', '#2f3336', '#363a3d', '#313538', '#35393c',
      '#2c3033', '#33373a', '#303437', '#35383b', '#2e3235',
    ];
    fillDiamond(bases[variant % bases.length]);
    speckle(ctx, 0, 0, 64, 32, 130, ['#24282a', '#41464a', '#4a4f50', '#1e2224'], rnd, 1.5);
    // cracks
    const cracks = variant % 3 === 0 ? 3 : variant % 2 === 0 ? 1 : 0;
    for (let c = 0; c < cracks; c++) {
      let x = rnd() * 64;
      let y = rnd() * 32;
      ctx.strokeStyle = rgba('#121415', 0.45);
      ctx.lineWidth = 0.5 + rnd() * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let i = 0; i < 4; i++) {
        x += (rnd() - 0.5) * 12;
        y += (rnd() - 0.35) * 6;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // subtle variations across road tiles
    if (variant === 3) {
      ctx.fillStyle = 'rgba(20,22,24,0.22)';
      ctx.beginPath();
      ctx.ellipse(32, 16, 12, 5, 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (variant === 5) {
      ctx.fillStyle = 'rgba(15,17,19,0.18)';
      ctx.beginPath();
      ctx.ellipse(28, 17, 16, 4, -0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (variant === 7) {
      ctx.strokeStyle = 'rgba(16,18,20,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(14, 25);
      ctx.lineTo(48, 8);
      ctx.stroke();
    } else if (variant === 8) {
      ctx.strokeStyle = 'rgba(195,182,132,0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(22, 21);
      ctx.lineTo(42, 11);
      ctx.stroke();
    } else if (variant === 9) {
      ctx.fillStyle = '#222527';
      ctx.beginPath();
      ctx.ellipse(32, 16, 8.5, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#43484c';
      ctx.lineWidth = 1;
      ctx.stroke();
      for (let i = -5; i <= 5; i += 2.5) {
        line(ctx, 24, 16 + i * 0.5, 40, 16 + i * 0.5, 'rgba(95,100,104,0.35)', 0.55);
      }
    }
  } else if (kind === 'sidewalk') {
    const bases = ['#6a6a60', '#65655b', '#707066', '#616158'];
    fillDiamond(bases[variant % bases.length]);
    speckle(ctx, 0, 0, 64, 32, 90, ['#57574f', '#7a7a6e', '#5e5e55'], rnd, 1.2);
    ctx.strokeStyle = 'rgba(30,30,27,0.2)';
    ctx.lineWidth = 0.6;
    // slab seams aligned with tile edges
    ctx.beginPath();
    ctx.moveTo(32, 1);
    ctx.lineTo(0, 17);
    ctx.moveTo(63, 17);
    ctx.lineTo(32, 33);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(225,220,200,0.06)';
    ctx.beginPath();
    ctx.moveTo(32, 3);
    ctx.lineTo(2, 17.5);
    ctx.stroke();
    for (let i = 0; i < 2; i++) {
      ctx.strokeStyle = 'rgba(32,32,28,0.25)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      const x = 8 + rnd() * 48;
      const y = 8 + rnd() * 16;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 12, y + (rnd() - 0.5) * 6);
      ctx.stroke();
    }
    if (rnd() < 0.25) {
      ctx.fillStyle = 'rgba(75,83,55,0.35)';
      ctx.beginPath();
      ctx.ellipse(14 + rnd() * 34, 12 + rnd() * 10, 4, 1.6, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'grass') {
    const bases = ['#3c4632', '#37412e', '#424b36', '#39442f', '#3f4834'];
    fillDiamond(bases[variant % bases.length]);
    speckle(ctx, 0, 0, 64, 32, 80, ['#2b3425', '#4c573d', '#56603f', '#4a4a33'], rnd, 1.5);
    const blades = 26 + Math.floor(rnd() * 25);
    for (let i = 0; i < blades; i++) {
      const x = rnd() * 64;
      const y = rnd() * 32;
      ctx.strokeStyle = rnd() < 0.55 ? 'rgba(94,108,72,0.5)' : 'rgba(58,71,44,0.6)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 2, y - 1.5 - rnd() * 2.5);
      ctx.stroke();
    }
    if (rnd() < 0.4) {
      ctx.fillStyle = 'rgba(82,72,48,0.35)';
      ctx.beginPath();
      ctx.ellipse(18 + rnd() * 28, 10 + rnd() * 12, 6, 2, 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (rnd() < 0.2) {
      ctx.fillStyle = 'rgba(124,104,52,0.5)';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(18 + rnd() * 28, 12 + rnd() * 10, 1.2, 0.5, rnd() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (kind === 'dirt') {
    const bases = ['#4b4335', '#473f32', '#514838', '#443d31'];
    fillDiamond(bases[variant % bases.length]);
    speckle(ctx, 0, 0, 64, 32, 130, ['#3a3329', '#5d5342', '#6a604b', '#332d25'], rnd, 1.5);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = rnd() < 0.5 ? '#676052' : '#3b352b';
      ctx.beginPath();
      ctx.ellipse(rnd() * 64, rnd() * 32, 0.8 + rnd(), 0.5 + rnd() * 0.5, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (variant === 2) {
      ctx.strokeStyle = 'rgba(34,30,25,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(8, 24);
      ctx.quadraticCurveTo(28, 16, 58, 8);
      ctx.stroke();
    }
  } else if (kind === 'wood') {
    fillDiamond('#4a3a2b');
    ctx.save();
    ctx.setTransform(32, 16, -32, 16, 32, 16);
    for (let i = 0; i < 5; i++) {
      const y = -0.5 + i * 0.2;
      ctx.fillStyle = i % 2 ? '#4c3c2d' : '#453627';
      ctx.fillRect(-0.5, y, 1, 0.2);
      ctx.strokeStyle = 'rgba(28,20,13,0.55)';
      ctx.lineWidth = 0.012;
      ctx.beginPath();
      ctx.moveTo(-0.5, y);
      ctx.lineTo(0.5, y);
      ctx.stroke();
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = 'rgba(30,22,14,0.16)';
        ctx.beginPath();
        const gy = y + 0.03 + rnd() * 0.13;
        ctx.moveTo(-0.5, gy);
        ctx.bezierCurveTo(-0.1, gy + 0.02, 0.2, gy - 0.025, 0.5, gy + 0.01);
        ctx.stroke();
      }
    }
    ctx.restore();
    speckle(ctx, 0, 0, 64, 32, 30, ['#2f2519', '#5c4935'], rnd, 1.2);
  } else if (kind === 'tile') {
    fillDiamond('#5b5b52');
    ctx.save();
    ctx.setTransform(32, 16, -32, 16, 32, 16);
    for (let y = -0.5; y < 0.5; y += 0.25) {
      for (let x = -0.5; x < 0.5; x += 0.25) {
        ctx.fillStyle = (Math.round(x * 8) + Math.round(y * 8)) % 2 ? '#5f5e54' : '#55554c';
        ctx.fillRect(x + 0.006, y + 0.006, 0.238, 0.238);
      }
    }
    ctx.strokeStyle = 'rgba(32,32,28,0.4)';
    ctx.lineWidth = 0.008;
    for (let i = -0.5; i <= 0.5; i += 0.25) {
      ctx.beginPath();
      ctx.moveTo(i, -0.5);
      ctx.lineTo(i, 0.5);
      ctx.moveTo(-0.5, i);
      ctx.lineTo(0.5, i);
      ctx.stroke();
    }
    ctx.restore();
    speckle(ctx, 0, 0, 64, 32, 40, ['#3f3f38', '#6b6a60', '#45453d'], rnd, 1.3);
  } else if (kind === 'concrete') {
    const bases = ['#56564e', '#505049', '#5b5a51'];
    fillDiamond(bases[variant % bases.length]);
    speckle(ctx, 0, 0, 64, 32, 100, ['#474740', '#646359', '#3d3d37'], rnd, 1.3);
    ctx.strokeStyle = 'rgba(30,30,27,0.35)';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) {
      const x = rnd() * 64;
      const y = rnd() * 32;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 5);
      ctx.stroke();
    }
    if (variant === 2) {
      ctx.fillStyle = 'rgba(35,35,32,0.4)';
      ctx.beginPath();
      ctx.ellipse(30, 18, 9, 3.4, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // rubble
    fillDiamond('#4b4b44');
    for (let i = 0; i < 18; i++) {
      const x = rnd() * 64;
      const y = rnd() * 32;
      const s = 1.5 + rnd() * 3.2;
      ctx.fillStyle = rnd() < 0.5 ? '#68675d' : '#3b3b35';
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.5);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x + s * 0.4, y + s * 0.4);
      ctx.lineTo(x - s * 0.5, y + s * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    speckle(ctx, 0, 0, 64, 32, 60, ['#2f2f2a', '#77766a', '#57564d'], rnd, 1.2);
  }

  // ambient occlusion on tile edges: removed per VIS-01 to prevent dark rhombus grid seams across tiles
  ctx.restore();
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Walls                                                               */
/* ------------------------------------------------------------------ */

type WallMat = 'brick' | 'concrete' | 'industrial' | 'interior';

interface MaterialPalette {
  base: string;
  mortar: string;
  brick2: string;
  trim: string;
}

const MATERIALS: Record<WallMat, MaterialPalette> = {
  brick: { base: '#6a3f35', mortar: '#533a32', brick2: '#75483b', trim: '#3f3730' },
  concrete: { base: '#66675e', mortar: '#5a5b53', brick2: '#6e6f64', trim: '#3a3b36' },
  industrial: { base: '#565b58', mortar: '#4b504d', brick2: '#5e6460', trim: '#333734' },
  interior: { base: '#5a4c3b', mortar: '#4b3f31', brick2: '#635444', trim: '#352c22' },
};

function drawWallFace(
  ctx: CanvasRenderingContext2D,
  mat: WallMat,
  side: 'left' | 'right',
  variant: number,
  seed: number,
  rnd: () => number,
): void {
  const pal = MATERIALS[mat];
  const light = side === 'left' ? 0.11 : -0.2;
  ctx.save();
  if (side === 'left') ctx.setTransform(0.5, 0.25, 0, 1, 0, 16);
  else ctx.setTransform(0.5, -0.25, 0, 1, 32, 32);

  ctx.fillStyle = shade(pal.base, light);
  ctx.fillRect(0, 0, 64, 56);

  if (mat === 'brick') {
    for (let row = 0; row < 12; row++) {
      const y = row * 4.7;
      for (let col = -1; col < 9; col++) {
        const bw = 8;
        const x = col * bw + (row % 2 ? 4 : 0);
        if (rnd() < 0.15) continue;
        ctx.fillStyle = shade(rnd() < 0.5 ? pal.base : pal.brick2, light + (rnd() - 0.5) * 0.08);
        ctx.fillRect(x + 0.5, y + 0.5, bw - 1, 3.8);
      }
    }
    ctx.strokeStyle = rgba(shade(pal.mortar, light), 0.45);
    ctx.lineWidth = 0.4;
    for (let row = 0; row <= 12; row++) {
      ctx.beginPath();
      ctx.moveTo(0, row * 4.7);
      ctx.lineTo(64, row * 4.7);
      ctx.stroke();
    }
  } else if (mat === 'industrial') {
    for (let x = 0; x < 64; x += 6) {
      ctx.fillStyle = shade(pal.base, light + (x % 12 ? -0.04 : 0.04));
      ctx.fillRect(x, 0, 5, 56);
      ctx.fillStyle = 'rgba(20,22,20,0.18)';
      ctx.fillRect(x + 4.4, 0, 1.4, 56);
    }
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = 'rgba(120,70,38,0.16)';
      ctx.lineWidth = 1 + rnd();
      ctx.beginPath();
      const x = rnd() * 64;
      ctx.moveTo(x, rnd() * 10);
      ctx.lineTo(x + (rnd() - 0.5) * 2, 40 + rnd() * 16);
      ctx.stroke();
    }
  } else {
    // concrete panels
    for (let y = 0; y < 56; y += 14) {
      for (let x = 0; x < 64; x += 21) {
        ctx.fillStyle = shade(pal.base, light + (rnd() - 0.5) * 0.05);
        ctx.fillRect(x + 0.5, y + 0.5, 20, 13);
      }
    }
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = `rgba(20,22,20,${0.03 + rnd() * 0.08})`;
      ctx.fillRect(rnd() * 64, rnd() * 40, 1 + rnd() * 10, 4 + rnd() * 16);
    }
  }

  // grime from the top and bottom
  const grime = ctx.createLinearGradient(0, 0, 0, 56);
  grime.addColorStop(0, 'rgba(12,14,12,0.32)');
  grime.addColorStop(0.22, 'rgba(12,14,12,0.05)');
  grime.addColorStop(0.74, 'rgba(8,9,8,0.02)');
  grime.addColorStop(1, 'rgba(8,9,8,0.4)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, 0, 64, 56);

  // base trim
  ctx.fillStyle = shade(pal.trim, light);
  ctx.fillRect(0, 51, 64, 5);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(0, 55, 64, 1);

  // windows / doors
  const windowRoll = (seed + variant * 7) % 10;
  if (mat !== 'interior' && windowRoll < 7) {
    const wx = side === 'left' ? 14 : 20;
    const wy = 8;
    const ww = side === 'left' ? 34 : 30;
    const wh = 27;
    const boarded = windowRoll === 5 || variant === 3;
    const broken = windowRoll === 6 || variant === 2;
    // frame shadow
    ctx.fillStyle = 'rgba(8,8,7,0.65)';
    ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 5);
    // sill
    ctx.fillStyle = shade(pal.trim, light + 0.06);
    ctx.fillRect(wx - 3, wy + wh + 1, ww + 6, 2.6);
    if (boarded) {
      ctx.fillStyle = '#4a3e2f';
      ctx.fillRect(wx, wy, ww, wh);
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.translate(wx + ww / 2, wy + wh / 2);
        ctx.rotate((i - 1) * 0.23);
        ctx.fillStyle = i === 1 ? '#5b4c39' : '#4d4030';
        ctx.fillRect(-ww / 2 - 2, -5 + i * 2, ww + 4, 5.4);
        ctx.fillStyle = 'rgba(25,20,14,0.35)';
        ctx.fillRect(-ww / 2 - 2, -2 + i * 2, ww + 4, 1);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(15,15,13,0.45)';
      ctx.fillRect(wx, wy, ww, 4);
    } else {
      const glass = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
      glass.addColorStop(0, '#33403f');
      glass.addColorStop(0.35, '#26312f');
      glass.addColorStop(0.6, broken ? '#171b1a' : '#3c4a46');
      glass.addColorStop(1, '#1c2422');
      ctx.fillStyle = glass;
      ctx.fillRect(wx, wy, ww, wh);
      if (broken) {
        ctx.fillStyle = '#0d100f';
        ctx.beginPath();
        ctx.moveTo(wx + 4, wy + 2);
        ctx.lineTo(wx + ww * 0.55, wy + wh * 0.4);
        ctx.lineTo(wx + ww * 0.35, wy + wh);
        ctx.lineTo(wx + 1, wy + wh * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(160,170,160,0.35)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(wx + ww * 0.55, wy + wh * 0.4);
        ctx.lineTo(wx + ww, wy + wh * 0.2);
        ctx.moveTo(wx + ww * 0.55, wy + wh * 0.4);
        ctx.lineTo(wx + ww * 0.8, wy + wh);
        ctx.stroke();
      }
      // reflections
      ctx.fillStyle = 'rgba(175,185,170,0.09)';
      ctx.beginPath();
      ctx.moveTo(wx + 3, wy + wh);
      ctx.lineTo(wx + ww * 0.5, wy);
      ctx.lineTo(wx + ww * 0.65, wy);
      ctx.lineTo(wx + ww * 0.2, wy + wh);
      ctx.closePath();
      ctx.fill();
      // muntins
      ctx.fillStyle = 'rgba(20,22,20,0.7)';
      ctx.fillRect(wx + ww / 2 - 0.8, wy, 1.6, wh);
      ctx.fillRect(wx, wy + wh / 2 - 0.7, ww, 1.4);
    }
    // frame
    ctx.strokeStyle = 'rgba(28,28,24,0.75)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(wx - 0.5, wy - 0.5, ww + 1, wh + 1);
    // occasional AC unit
    if ((seed + variant) % 7 === 0 && windowRoll === 2) {
      ctx.fillStyle = '#77786d';
      ctx.fillRect(wx + ww / 2 - 5, wy + wh + 1, 10, 5);
      ctx.fillStyle = '#3d3e38';
      ctx.fillRect(wx + ww / 2 - 4, wy + wh + 2, 8, 3);
    }
  } else if (mat !== 'interior' && windowRoll === 9) {
    // storefront shutter
    ctx.fillStyle = '#3f423f';
    ctx.fillRect(10, 10, 44, 38);
    for (let y = 11; y < 47; y += 3) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(11, y, 42, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(11, y + 1, 42, 1);
    }
    ctx.fillStyle = 'rgba(120,60,30,0.2)';
    ctx.fillRect(12, 40, 40, 6);
    // faded sign strip
    ctx.fillStyle = 'rgba(172,146,92,0.14)';
    ctx.fillRect(10, 6, 44, 4);
  }

  if (mat === 'interior') {
    // interior paneling
    for (let x = 0; x < 64; x += 8) {
      ctx.fillStyle = 'rgba(0,0,0,0.09)';
      ctx.fillRect(x, 0, 1, 56);
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(x + 1, 0, 1, 56);
    }
  }

  ctx.restore();
}

function makeWall(mat: WallMat, variant: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(64, 88);
  const rnd = mulberry(hashString(`${mat}:wall:${variant}`));
  const pal = MATERIALS[mat];

  // left face
  drawWallFace(ctx, mat, 'left', variant, hashString(mat) + variant * 13, rnd);
  // right face
  drawWallFace(ctx, mat, 'right', variant, hashString(mat) + variant * 29, rnd);

  // top face
  ctx.save();
  ctx.setTransform(0.5, 0.25, -0.5, 0.25, 32, 0);
  ctx.fillStyle = shade(pal.trim, -0.15);
  ctx.fillRect(0, 0, 64, 32);
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.02 + rnd() * 0.04})`;
    ctx.fillRect(rnd() * 64, rnd() * 32, 2 + rnd() * 6, 1 + rnd() * 3);
  }
  ctx.restore();

  // outlines for readability
  ctx.strokeStyle = 'rgba(10,11,10,0.38)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(32, 32);
  ctx.lineTo(64, 16);
  ctx.moveTo(32, 32);
  ctx.lineTo(32, 88);
  ctx.moveTo(0, 16);
  ctx.lineTo(0, 72);
  ctx.moveTo(64, 16);
  ctx.lineTo(64, 72);
  ctx.stroke();

  return canvas;
}

/* ------------------------------------------------------------------ */
/* Roofs                                                               */
/* ------------------------------------------------------------------ */

function makeRoof(style: number, variant: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(64, 32);
  const rnd = mulberry(hashString(`roof:${style}:${variant}`));
  diamondPath(ctx, 32, 16, 66, 34, 1);
  ctx.clip();
  const palettes = [
    ['#3a3733', '#423e38', '#34312d'],
    ['#403c35', '#4a453c', '#37342e'],
    ['#3d4140', '#474b49', '#343836'],
  ];
  const pal = palettes[Math.min(2, style)];
  ctx.fillStyle = pal[variant % 3];
  ctx.fillRect(0, 0, 64, 32);
  ctx.save();
  ctx.setTransform(32, 16, -32, 16, 32, 16);
  if (style === 2) {
    for (let i = -0.5; i < 0.5; i += 0.125) {
      ctx.fillStyle = i % 0.25 === 0 ? pal[1] : pal[2];
      ctx.fillRect(-0.5, i, 1, 0.115);
      ctx.strokeStyle = 'rgba(20,22,21,0.35)';
      ctx.lineWidth = 0.006;
      ctx.beginPath();
      ctx.moveTo(-0.5, i);
      ctx.lineTo(0.5, i);
      ctx.stroke();
    }
  } else {
    for (let y = -0.5; y < 0.5; y += 0.18) {
      for (let x = -0.5 - (Math.round(y * 5) % 2) * 0.1; x < 0.5; x += 0.2) {
        ctx.fillStyle = shade(pal[0], (rnd() - 0.5) * 0.1);
        ctx.fillRect(x + 0.004, y + 0.004, 0.192, 0.172);
      }
    }
    ctx.strokeStyle = 'rgba(18,19,18,0.3)';
    ctx.lineWidth = 0.008;
    for (let y = -0.5; y < 0.5; y += 0.18) {
      ctx.beginPath();
      ctx.moveTo(-0.5, y);
      ctx.lineTo(0.5, y);
      ctx.stroke();
    }
  }
  ctx.restore();
  speckle(ctx, 0, 0, 64, 32, 40, ['#2e2c29', '#4c4840', '#5a5143'], rnd, 1.3);
  // water stains
  ctx.fillStyle = 'rgba(15,16,15,0.22)';
  ctx.beginPath();
  ctx.ellipse(12 + rnd() * 40, 8 + rnd() * 16, 5 + rnd() * 8, 1.8 + rnd() * 2, rnd(), 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

interface BoxColors {
  top: string;
  left: string;
  right: string;
  outline?: string;
}

function isoBox(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  halfW: number,
  halfH: number,
  height: number,
  colors: BoxColors,
): void {
  const top = { x: cx, y: baseY - halfH - height };
  const left = { x: cx - halfW, y: baseY - height };
  const right = { x: cx + halfW, y: baseY - height };
  const bottom = { x: cx, y: baseY - height + halfH };
  const gLeft = { x: cx - halfW, y: baseY };
  const gRight = { x: cx + halfW, y: baseY };
  const gBottom = { x: cx, y: baseY + halfH };
  // left face
  ctx.fillStyle = colors.left;
  ctx.beginPath();
  ctx.moveTo(left.x, left.y);
  ctx.lineTo(gLeft.x, gLeft.y);
  ctx.lineTo(gBottom.x, gBottom.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.closePath();
  ctx.fill();
  // right face
  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(right.x, right.y);
  ctx.lineTo(gRight.x, gRight.y);
  ctx.lineTo(gBottom.x, gBottom.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.closePath();
  ctx.fill();
  // top
  ctx.fillStyle = colors.top;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(right.x, right.y);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineTo(left.x, left.y);
  ctx.closePath();
  ctx.fill();
  if (colors.outline) {
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(top.x, top.y);
    ctx.lineTo(right.x, right.y);
    ctx.moveTo(gLeft.x, gLeft.y);
    ctx.lineTo(left.x, left.y);
    ctx.moveTo(gRight.x, gRight.y);
    ctx.lineTo(right.x, right.y);
    ctx.moveTo(gBottom.x, gBottom.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.lineTo(left.x, left.y);
    ctx.moveTo(bottom.x, bottom.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
  }
}

function makeCrate(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(58, 70);
  const rnd = mulberry(9182);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(29, 54, 22, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  isoBox(ctx, 29, 52, 20, 10, 34, { top: '#6f5a3d', left: '#5c492f', right: '#463722', outline: 'rgba(25,20,14,0.5)' });
  // planks
  ctx.strokeStyle = 'rgba(35,27,18,0.45)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    line(ctx, 9, 34 + i * 6, 49, 44 - i * 6, 'rgba(35,27,18,0.35)', 0.8);
  }
  // diagonal brace
  ctx.strokeStyle = '#7d6848';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(13, 50);
  ctx.lineTo(43, 24);
  ctx.stroke();
  speckle(ctx, 8, 14, 44, 34, 30, ['#3a2e1f', '#8a7350'], rnd, 1);
  // stencil
  ctx.fillStyle = 'rgba(190,170,120,0.35)';
  ctx.fillRect(22, 32, 12, 1.2);
  ctx.fillRect(24, 35, 8, 1);
  return canvas;
}

function makeBarrel(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(46, 72);
  const rnd = mulberry(3321);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(23, 58, 16, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  const body = ctx.createLinearGradient(7, 0, 40, 0);
  body.addColorStop(0, '#5b3a2a');
  body.addColorStop(0.4, '#7a4a33');
  body.addColorStop(0.7, '#4b3024');
  body.addColorStop(1, '#39251d');
  ctx.fillStyle = body;
  roundRect(ctx, 8, 16, 30, 44, 5);
  ctx.fill();
  ctx.fillStyle = '#3a342d';
  ctx.beginPath();
  ctx.ellipse(23, 17, 15, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4c4438';
  ctx.beginPath();
  ctx.ellipse(23, 17, 12.5, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,18,15,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(23, 29, 15.2, 4, 0, 0, Math.PI);
  ctx.ellipse(23, 50, 15, 4, 0, 0, Math.PI);
  ctx.stroke();
  ctx.fillStyle = 'rgba(150,74,38,0.35)';
  ctx.beginPath();
  ctx.ellipse(15, 38, 3, 7, 0.2, 0, Math.PI * 2);
  ctx.fill();
  speckle(ctx, 9, 20, 28, 38, 20, ['#2c1e16', '#8d5636'], rnd, 1.2);
  ctx.fillStyle = 'rgba(200,180,120,0.2)';
  ctx.fillRect(15, 23, 6, 9);
  return canvas;
}

function makeDumpster(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(92, 92);
  const rnd = mulberry(551);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(46, 68, 32, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  isoBox(ctx, 46, 66, 29, 15, 40, { top: '#3f513f', left: '#354435', right: '#273327', outline: 'rgba(12,16,12,0.55)' });
  ctx.fillStyle = '#4d5f48';
  ctx.beginPath();
  ctx.moveTo(17, 47);
  ctx.lineTo(46, 60);
  ctx.lineTo(75, 47);
  ctx.lineTo(46, 35);
  ctx.closePath();
  ctx.fill();
  // lid seam
  ctx.strokeStyle = 'rgba(20,24,20,0.45)';
  ctx.beginPath();
  ctx.moveTo(18, 45);
  ctx.lineTo(46, 57);
  ctx.lineTo(74, 45);
  ctx.stroke();
  // rust & grime
  speckle(ctx, 18, 38, 56, 25, 35, ['#5c4a2f', '#2b3429', '#74552f'], rnd, 1.5);
  ctx.fillStyle = 'rgba(125,70,35,0.3)';
  ctx.fillRect(24, 55, 3, 10);
  ctx.fillStyle = 'rgba(160,150,90,0.2)';
  ctx.fillRect(30, 58, 20, 1.2);
  // trash peeking
  ctx.fillStyle = '#252521';
  ctx.beginPath();
  ctx.ellipse(58, 42, 8, 3, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#bab29a';
  ctx.beginPath();
  ctx.ellipse(63, 41, 2.4, 1.2, 0.2, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function makeTree(variant: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(190, 230);
  const rnd = mulberry(1000 + variant * 77);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(95, 212, 38, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // trunk
  const trunk = ctx.createLinearGradient(78, 0, 112, 0);
  trunk.addColorStop(0, '#3a2f24');
  trunk.addColorStop(0.45, '#5a4834');
  trunk.addColorStop(0.7, '#473729');
  trunk.addColorStop(1, '#2b2119');
  ctx.fillStyle = trunk;
  ctx.beginPath();
  ctx.moveTo(85, 210);
  ctx.quadraticCurveTo(90, 168, 86, 136);
  ctx.lineTo(98, 118);
  ctx.lineTo(106, 138);
  ctx.quadraticCurveTo(101, 170, 108, 208);
  ctx.closePath();
  ctx.fill();
  // roots
  ctx.strokeStyle = '#3e3025';
  ctx.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(92 + i * 3, 204);
    ctx.quadraticCurveTo(80 + i * 9, 210, 70 + i * 12, 214);
    ctx.stroke();
  }
  // branches
  const branches = 8 + Math.floor(rnd() * 6);
  ctx.strokeStyle = '#423226';
  for (let i = 0; i < branches; i++) {
    const sy = 150 - rnd() * 36;
    const sx = 92 + (rnd() - 0.5) * 28;
    const ex = 30 + rnd() * 130;
    const ey = 40 + rnd() * 80;
    ctx.lineWidth = 1.4 + rnd() * 2;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + (ex - sx) * 0.4, sy - 30 - rnd() * 30, ex, ey);
    ctx.stroke();
  }
  if (variant === 2) {
    // bare dead tree
    ctx.strokeStyle = '#6b604d';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 30; i++) {
      const x = 30 + rnd() * 130;
      const y = 28 + rnd() * 100;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 14, y + (rnd() - 0.5) * 14);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(190,175,130,0.16)';
    ctx.beginPath();
    ctx.ellipse(95, 100, 60, 44, 0, 0, Math.PI * 2);
    ctx.fill();
    return canvas;
  }
  // foliage clusters
  const clusters = 18 + Math.floor(rnd() * 12);
  for (let i = 0; i < clusters; i++) {
    const x = 30 + rnd() * 125;
    const y = 24 + rnd() * 110;
    const r = 12 + rnd() * 22;
    const green = variant === 1 ? ['#52371c', '#684722', '#7e5628', '#422c16'] : ['#25351e', '#2f4227', '#3d5232', '#212d1b'];
    ctx.fillStyle = green[Math.floor(rnd() * green.length)];
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.8, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // lit edges
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = variant === 1 ? 'rgba(215,165,75,0.14)' : 'rgba(120,140,95,0.12)';
    ctx.beginPath();
    ctx.ellipse(38 + rnd() * 110, 26 + rnd() * 70, 4 + rnd() * 8, 2 + rnd() * 5, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // hanging twigs
  ctx.strokeStyle = 'rgba(40,32,24,0.65)';
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 12; i++) {
    const x = 40 + rnd() * 100;
    const y = 80 + rnd() * 50;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 18, y + 8 + rnd() * 16);
    ctx.stroke();
  }
  return canvas;
}

function makeBush(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(94, 84);
  const rnd = mulberry(7717);
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath();
  ctx.ellipse(47, 66, 28, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 24; i++) {
    const x = 18 + rnd() * 58;
    const y = 28 + rnd() * 34;
    const r = 6 + rnd() * 12;
    ctx.fillStyle = ['#2b3a24', '#36472b', '#435433', '#283620'][Math.floor(rnd() * 4)];
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.85, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 6; i++) {
    const x = 25 + rnd() * 44;
    const y = 30 + rnd() * 20;
    ctx.fillStyle = 'rgba(135,120,65,0.35)';
    ctx.beginPath();
    ctx.ellipse(x, y, 1.4, 0.8, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

function makeCar(horizontal: boolean, variant: number): HTMLCanvasElement {
  const W = horizontal ? 152 : 122;
  const H = horizontal ? 116 : 156;
  const { canvas, ctx } = makeCanvas(W, H);
  const rnd = mulberry(2500 + variant * 21 + (horizontal ? 0 : 101));
  const cx = W / 2;
  const baseY = horizontal ? 92 : 126;

  // Variants:
  // 0: Civilian Sedan (drab olive / gray-green)
  // 1: Police Cruiser (navy/black body, white door panel, emergency roof lightbar)
  // 2: City Taxi (yellow body, checkerboard decal, TAXI roof sign)
  // 3: Rusty Pickup (oxidized burnt orange, open cargo bed with scrap)
  const isPolice = variant === 1;
  const isTaxi = variant === 2;
  const isPickup = variant === 3;

  const baseBodyColor = isPolice ? '#1e252d' : isTaxi ? '#d8a528' : isPickup ? '#6d3c26' : '#465243';
  const highlightColor = shade(baseBodyColor, 0.22);
  const shadowColor = shade(baseBodyColor, -0.32);

  // 3D Isometric projection mapping:
  // u in [-1, 1] is length (forward = +1, rear = -1)
  // v in [-1, 1] is lateral (+1 facing player camera, -1 facing away)
  // z >= 0 is vertical elevation in screen pixels
  const L = 33;
  const Wh = 14;

  const pt = (u: number, v: number, z: number) => {
    if (horizontal) {
      // Facing South-East (along +X)
      return {
        x: cx + u * L - v * Wh,
        y: baseY + u * (L * 0.5) + v * (Wh * 0.5) - z,
      };
    } else {
      // Facing South-West (along +Y)
      return {
        x: cx - u * L + v * Wh,
        y: baseY + u * (L * 0.5) + v * (Wh * 0.5) - z,
      };
    }
  };

  const poly = (points: { x: number; y: number }[], fill: string | CanvasGradient, stroke?: string, lw = 1) => {
    if (points.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  };

  // 1. Ground Drop Shadow
  ctx.fillStyle = 'rgba(10, 12, 11, 0.46)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY + (horizontal ? 3 : 5), horizontal ? 45 : 28, horizontal ? 14 : 24, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Far Wheels (v = -0.95, behind vehicle)
  const drawWheel = (u: number, v: number) => {
    const pBase = pt(u, v, 0);
    const pTop = pt(u, v, 8);
    const radX = horizontal ? 4.5 : 3.5;
    const radY = horizontal ? 3.5 : 4.5;
    ctx.fillStyle = '#17191a';
    ctx.beginPath();
    ctx.ellipse(pBase.x, (pBase.y + pTop.y) / 2, radX, radY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#676f75';
    ctx.beginPath();
    ctx.ellipse(pBase.x, (pBase.y + pTop.y) / 2, radX * 0.55, radY * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  drawWheel(-0.62, -0.92);
  drawWheel(0.62, -0.92);

  // 3. Chassis Lower Body
  // Bottom plate (z = 3)
  poly([pt(-1, -1, 3), pt(1, -1, 3), pt(1, 1, 3), pt(-1, 1, 3)], '#121415');

  // Near Side Face (v = 1, facing camera)
  const sideColor = shadowColor;
  poly([pt(-1, 1, 3), pt(1, 1, 3), pt(1, 1, 15), pt(-1, 1, 15)], sideColor, 'rgba(15,18,17,0.7)', 0.8);

  // Police cruiser white door panel
  if (isPolice) {
    poly([pt(-0.45, 1, 4), pt(0.35, 1, 4), pt(0.35, 1, 14.5), pt(-0.45, 1, 14.5)], '#f0f2f3');
    // Mini police star silhouette
    const starP = pt(-0.05, 1, 9.5);
    ctx.fillStyle = '#cca43b';
    ctx.beginPath();
    ctx.arc(starP.x, starP.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Taxi checkerboard stripe along side
  if (isTaxi) {
    for (let cu = -0.7; cu <= 0.6; cu += 0.22) {
      poly([pt(cu, 1, 8.5), pt(cu + 0.1, 1, 8.5), pt(cu + 0.1, 1, 10), pt(cu, 1, 10)], '#18191a');
      poly([pt(cu + 0.1, 1, 8.5), pt(cu + 0.2, 1, 8.5), pt(cu + 0.2, 1, 10), pt(cu + 0.1, 1, 10)], '#f8faf9');
    }
  }

  // Pickup rust patches
  if (isPickup) {
    for (let i = 0; i < 4; i++) {
      const ru = -0.7 + i * 0.4 + (rnd() - 0.5) * 0.1;
      poly([pt(ru, 1, 4 + rnd() * 4), pt(ru + 0.2, 1, 4 + rnd() * 4), pt(ru + 0.15, 1, 11), pt(ru - 0.05, 1, 11)], '#482012');
    }
  }

  // Door seam grooves & handle
  poly([pt(-0.08, 1, 4), pt(-0.05, 1, 4), pt(-0.05, 1, 14.5), pt(-0.08, 1, 14.5)], 'rgba(20,24,22,0.6)');
  poly([pt(0.36, 1, 4), pt(0.39, 1, 4), pt(0.39, 1, 14.5), pt(0.36, 1, 14.5)], 'rgba(20,24,22,0.6)');
  // Handles
  const h1 = pt(-0.25, 1, 12);
  const h2 = pt(0.18, 1, 12);
  ctx.fillStyle = '#8f969a';
  ctx.fillRect(h1.x - 1.5, h1.y - 0.8, 3, 1.4);
  ctx.fillRect(h2.x - 1.5, h2.y - 0.8, 3, 1.4);

  // Front Face (u = 1, facing SE/SW)
  const frontColor = shade(baseBodyColor, -0.15);
  poly([pt(1, -1, 3), pt(1, 1, 3), pt(1, 1, 15), pt(1, -1, 15)], frontColor, 'rgba(15,18,17,0.7)', 0.8);

  // Front Grille
  poly([pt(1, -0.55, 5), pt(1, 0.55, 5), pt(1, 0.55, 11), pt(1, -0.55, 11)], '#161819');
  for (let gy = 6.5; gy <= 10; gy += 1.6) {
    const gL = pt(1, -0.5, gy);
    const gR = pt(1, 0.5, gy);
    ctx.strokeStyle = '#636c72';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(gL.x, gL.y);
    ctx.lineTo(gR.x, gR.y);
    ctx.stroke();
  }

  // Headlights
  const hlL = pt(1, -0.78, 9);
  const hlR = pt(1, 0.78, 9);
  const drawHeadlight = (p: { x: number; y: number }, broken: boolean) => {
    ctx.fillStyle = broken ? '#251b14' : '#fff5b8';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 2.8, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!broken) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 1.4, 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  drawHeadlight(hlL, isPickup);
  drawHeadlight(hlR, false);

  // Front Bumper
  poly([pt(1.04, -0.95, 3), pt(1.04, 0.95, 3), pt(1.04, 0.95, 6), pt(1.04, -0.95, 6)], '#2d3337', '#151718', 0.8);
  if (isPolice) {
    // Bullbar push bumper
    poly([pt(1.08, -0.4, 3), pt(1.08, 0.4, 3), pt(1.08, 0.4, 12), pt(1.08, -0.4, 12)], '#1a1c1e', '#3b4247', 0.8);
  }

  // Rear Taillights (if partially visible on corner)
  const rl = pt(-1, 0.8, 10);
  ctx.fillStyle = '#b81e14';
  ctx.beginPath();
  ctx.ellipse(rl.x, rl.y, 1.8, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // 4. Near Wheels (v = 0.95, in foreground)
  drawWheel(-0.62, 0.95);
  drawWheel(0.62, 0.95);

  // 5. Hood & Trunk (Top body planes at z = 15)
  // Hood (u: 0.25 to 1.0)
  poly([pt(0.25, -0.98, 15), pt(1, -0.98, 15), pt(1, 0.98, 15), pt(0.25, 0.98, 15)], highlightColor, 'rgba(15,18,17,0.5)', 0.6);

  // Hood reflection / highlight strip
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  const hRef1 = pt(0.35, 0.1, 15.2);
  const hRef2 = pt(0.85, 0.1, 15.2);
  ctx.beginPath();
  ctx.moveTo(hRef1.x, hRef1.y);
  ctx.lineTo(hRef2.x, hRef2.y);
  ctx.stroke();

  if (isPickup) {
    // Open cargo bed in the back (u: -1.0 to -0.15)
    // Sunken floor at z = 7
    poly([pt(-0.95, -0.85, 7), pt(-0.15, -0.85, 7), pt(-0.15, 0.85, 7), pt(-0.95, 0.85, 7)], '#201612');
    // Cargo side rim top at z = 15
    poly([pt(-1, 0.85, 15), pt(-0.15, 0.85, 15), pt(-0.15, 0.98, 15), pt(-1, 0.98, 15)], highlightColor);
    // Scrap barrel / tire inside bed
    const scrapP = pt(-0.55, 0.05, 8);
    ctx.fillStyle = '#4a5358';
    ctx.beginPath();
    ctx.ellipse(scrapP.x, scrapP.y, 4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Sedan trunk (u: -1.0 to -0.6)
    poly([pt(-1, -0.95, 15), pt(-0.6, -0.95, 15), pt(-0.6, 0.95, 15), pt(-1, 0.95, 15)], highlightColor, 'rgba(15,18,17,0.5)', 0.6);
  }

  // 6. Cabin / Greenhouse (Extruded z = 15 to 27)
  const cabRearU = isPickup ? -0.15 : -0.6;
  const cabFrontU = 0.25;
  const roofRearU = isPickup ? -0.12 : -0.48;
  const roofFrontU = 0.06;

  // Angled Windshield (from cabFrontU, z=15 to roofFrontU, z=26)
  poly(
    [pt(roofFrontU, -0.8, 26), pt(roofFrontU, 0.8, 26), pt(cabFrontU, 0.88, 15), pt(cabFrontU, -0.88, 15)],
    '#202c30',
    '#111618',
    0.8,
  );
  // Specular sheen streak on windshield
  ctx.fillStyle = 'rgba(215, 238, 248, 0.28)';
  poly([pt(roofFrontU + 0.02, -0.1, 26), pt(roofFrontU + 0.06, 0.2, 26), pt(cabFrontU - 0.04, 0.45, 15.2), pt(cabFrontU - 0.08, 0.15, 15.2)], 'rgba(215, 238, 248, 0.28)');

  // Cabin Near Side Windows & Pillars
  poly(
    [pt(roofRearU, 0.8, 26), pt(roofFrontU, 0.8, 26), pt(cabFrontU, 0.88, 15), pt(cabRearU, 0.88, 15)],
    '#1b2528',
    'rgba(15,18,17,0.7)',
    0.8,
  );
  // Window B-pillar frame
  if (!isPickup) {
    const pillarTop = pt((roofRearU + roofFrontU) * 0.48, 0.8, 26);
    const pillarBot = pt((cabRearU + cabFrontU) * 0.48, 0.88, 15);
    ctx.strokeStyle = sideColor;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(pillarTop.x, pillarTop.y);
    ctx.lineTo(pillarBot.x, pillarBot.y);
    ctx.stroke();
  }

  // Cabin Rear Window (if visible)
  poly(
    [pt(cabRearU, -0.88, 15), pt(cabRearU, 0.88, 15), pt(roofRearU, 0.8, 26), pt(roofRearU, -0.8, 26)],
    '#161f22',
  );

  // Cabin Roof (Top plane at z = 26)
  const roofColor = isPolice ? '#f0f2f3' : shade(baseBodyColor, 0.12);
  poly(
    [pt(roofRearU, -0.8, 26), pt(roofFrontU, -0.8, 26), pt(roofFrontU, 0.8, 26), pt(roofRearU, 0.8, 26)],
    roofColor,
    'rgba(15,18,17,0.6)',
    0.8,
  );

  // 7. Roof Props for Variants
  if (isPolice) {
    // Red & Blue Emergency Lightbar at z = 27..31
    const lbU = (roofRearU + roofFrontU) * 0.5;
    // Base mount
    poly([pt(lbU - 0.04, -0.65, 27), pt(lbU + 0.04, -0.65, 27), pt(lbU + 0.04, 0.65, 27), pt(lbU - 0.04, 0.65, 27)], '#30363a');
    // Left side (Red)
    poly([pt(lbU - 0.04, -0.6, 28), pt(lbU + 0.04, -0.6, 28), pt(lbU + 0.04, -0.05, 28), pt(lbU - 0.04, -0.05, 28)], '#d92518');
    poly([pt(lbU - 0.04, -0.6, 28), pt(lbU + 0.04, -0.6, 28), pt(lbU + 0.04, -0.6, 31), pt(lbU - 0.04, -0.6, 31)], '#ff3d2e');
    // Center siren speaker
    poly([pt(lbU - 0.05, -0.05, 28), pt(lbU + 0.05, -0.05, 28), pt(lbU + 0.05, 0.05, 28), pt(lbU - 0.05, 0.05, 28)], '#b0b8bc');
    // Right side (Blue)
    poly([pt(lbU - 0.04, 0.05, 28), pt(lbU + 0.04, 0.05, 28), pt(lbU + 0.04, 0.6, 28), pt(lbU - 0.04, 0.6, 28)], '#0077c8');
    poly([pt(lbU - 0.04, 0.05, 28), pt(lbU + 0.04, 0.05, 28), pt(lbU + 0.04, 0.05, 31), pt(lbU - 0.04, 0.05, 31)], '#2db2ff');
  } else if (isTaxi) {
    // Yellow illuminated TAXI rooftop sign at z = 27..32
    const txU = (roofRearU + roofFrontU) * 0.5;
    poly([pt(txU - 0.06, -0.32, 27.5), pt(txU + 0.06, -0.32, 27.5), pt(txU + 0.06, 0.32, 27.5), pt(txU - 0.06, 0.32, 27.5)], '#f5d045');
    poly([pt(txU - 0.06, -0.32, 31.5), pt(txU + 0.06, -0.32, 31.5), pt(txU + 0.06, 0.32, 31.5), pt(txU - 0.06, 0.32, 31.5)], '#ffeb78');
    // Side face with TAXI letters
    poly([pt(txU - 0.06, 0.32, 27.5), pt(txU + 0.06, 0.32, 27.5), pt(txU + 0.06, 0.32, 31.5), pt(txU - 0.06, 0.32, 31.5)], '#d9b022', '#222', 0.6);
  }

  // 8. Ground Glass & Debris Specks around vehicle
  speckle(ctx, cx - 38, baseY - 10, 76, 28, 20, ['rgba(190,205,195,0.24)', 'rgba(35,38,34,0.45)', 'rgba(120,95,50,0.25)'], rnd, 1.4);

  return canvas;
}

function makeLamp(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(84, 196);
  const rnd = mulberry(66);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(42, 184, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const metal = ctx.createLinearGradient(38, 0, 50, 0);
  metal.addColorStop(0, '#3a3f3d');
  metal.addColorStop(0.5, '#656b64');
  metal.addColorStop(1, '#2e3331');
  ctx.fillStyle = metal;
  ctx.fillRect(40, 34, 4.5, 150);
  // base
  ctx.fillStyle = '#343936';
  ctx.beginPath();
  ctx.ellipse(42, 184, 9, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(39, 172, 6, 12);
  // arm
  ctx.strokeStyle = '#4b514b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(42, 40);
  ctx.quadraticCurveTo(44, 22, 60, 22);
  ctx.stroke();
  // lamp head
  ctx.fillStyle = '#393e3a';
  ctx.beginPath();
  ctx.moveTo(52, 20);
  ctx.lineTo(70, 22);
  ctx.lineTo(67, 31);
  ctx.lineTo(55, 30);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(196,170,104,0.28)';
  ctx.fillRect(55, 28, 11, 2);
  // rust
  speckle(ctx, 39, 60, 8, 110, 30, ['rgba(118,70,34,0.35)', 'rgba(40,42,38,0.5)'], rnd, 1.2);
  // concrete base grime
  ctx.fillStyle = 'rgba(30,32,28,0.25)';
  ctx.beginPath();
  ctx.ellipse(42, 182, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function makeSign(variant: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(74, 132);
  const rnd = mulberry(992 + variant);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(37, 122, 12, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a504a';
  ctx.fillRect(35, 42, 4, 80);
  ctx.fillStyle = '#3a403b';
  ctx.fillRect(30, 118, 14, 4);
  // sign plate
  const plateColors = ['#5e2a24', '#24413d', '#4f4528'];
  ctx.fillStyle = plateColors[variant % 3];
  ctx.fillRect(8, 10, 58, 40);
  ctx.strokeStyle = 'rgba(210,200,170,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(10, 12, 54, 36);
  ctx.fillStyle = 'rgba(210,200,170,0.55)';
  if (variant === 0) {
    // one way arrow
    ctx.beginPath();
    ctx.moveTo(24, 24);
    ctx.lineTo(50, 24);
    ctx.lineTo(50, 20);
    ctx.lineTo(58, 30);
    ctx.lineTo(50, 40);
    ctx.lineTo(50, 36);
    ctx.lineTo(24, 36);
    ctx.closePath();
    ctx.fill();
  } else if (variant === 1) {
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('STOP', 37, 37);
  } else {
    // biohazard-ish trefoil
    ctx.translate(37, 30);
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.arc(0, -6, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(30,30,26,0.35)';
  ctx.fillRect(12, 44, 52, 3);
  speckle(ctx, 8, 10, 58, 40, 25, ['rgba(20,20,18,0.4)', 'rgba(120,80,40,0.25)'], rnd, 1.3);
  return canvas;
}

function makeFence(vertical: boolean): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(86, 84);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(vertical ? 34 : 43, 68, 26, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  if (vertical) ctx.translate(20, 4);
  const posts = vertical ? [[18, 0], [18, 70]] : [[10, 0], [74, 0]];
  ctx.strokeStyle = '#5a5545';
  ctx.lineWidth = 2.5;
  for (const [x, y] of posts) {
    ctx.beginPath();
    ctx.moveTo(x, y + 10);
    ctx.lineTo(x, y + 66);
    ctx.stroke();
    ctx.fillStyle = '#6b6452';
    ctx.fillRect(x - 2, y + 10, 4, 3);
  }
  // planks / wire
  ctx.strokeStyle = 'rgba(120,116,96,0.55)';
  ctx.lineWidth = 1;
  for (let y = 18; y < 64; y += 8) {
    ctx.beginPath();
    ctx.moveTo(10, y);
    ctx.lineTo(74, y + (vertical ? 10 : 0));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(90,86,70,0.6)';
  ctx.beginPath();
  ctx.moveTo(10, 18);
  ctx.lineTo(74, 62);
  ctx.moveTo(74, 18);
  ctx.lineTo(10, 62);
  ctx.stroke();
  // rust
  const rnd = mulberry(vertical ? 771 : 772);
  speckle(ctx, 8, 12, 68, 50, 35, ['rgba(130,80,40,0.3)', 'rgba(50,48,40,0.4)'], rnd, 1.2);
  ctx.restore();
  return canvas;
}

function makeShelf(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(66, 100);
  const rnd = mulberry(445);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(33, 84, 24, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  isoBox(ctx, 33, 82, 23, 11, 56, { top: '#4b4235', left: '#3e372c', right: '#2f2a22', outline: 'rgba(15,14,12,0.55)' });
  // shelves (front-left face)
  for (let i = 0; i < 3; i++) {
    const y = 40 + i * 13;
    ctx.strokeStyle = '#665a45';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(11, y + 8);
    ctx.lineTo(32, y + 18);
    ctx.stroke();
    // items on shelf
    const colors = ['#8d6a3e', '#7c3f35', '#5c7156', '#b0a382'];
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
      ctx.fillRect(13 + k * 6, y + 5 - k * 1.5, 3.2, 4.5);
    }
  }
  ctx.fillStyle = 'rgba(15,14,12,0.22)';
  ctx.fillRect(11, 64, 43, 3);
  speckle(ctx, 12, 30, 42, 45, 20, ['rgba(120,80,40,0.25)', 'rgba(20,20,18,0.3)'], rnd, 1.1);
  return canvas;
}

function makeFridge(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(64, 108);
  const rnd = mulberry(808);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(32, 92, 22, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  isoBox(ctx, 32, 90, 20, 10, 66, { top: '#a3a49a', left: '#85877e', right: '#666960', outline: 'rgba(35,35,32,0.5)' });
  // door lines
  ctx.strokeStyle = 'rgba(50,52,48,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(13, 58);
  ctx.lineTo(32, 67);
  ctx.stroke();
  ctx.fillStyle = '#4f524c';
  ctx.fillRect(17, 50, 2.5, 9);
  ctx.fillStyle = 'rgba(120,60,30,0.25)';
  ctx.beginPath();
  ctx.ellipse(18, 75, 3, 8, 0.2, 0, Math.PI * 2);
  ctx.fill();
  speckle(ctx, 12, 34, 38, 40, 25, ['rgba(30,30,28,0.3)', 'rgba(150,150,135,0.15)'], rnd, 1.2);
  // note
  ctx.fillStyle = 'rgba(200,190,150,0.4)';
  ctx.fillRect(24, 38, 8, 6);
  return canvas;
}

function makeMedCabinet(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(62, 96);
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath();
  ctx.ellipse(31, 80, 21, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  isoBox(ctx, 31, 78, 20, 10, 52, { top: '#9c9d94', left: '#83857d', right: '#64665f', outline: 'rgba(30,30,28,0.5)' });
  ctx.fillStyle = 'rgba(146, 42, 32, 0.55)';
  ctx.fillRect(27, 30, 9, 3);
  ctx.fillRect(30, 27, 3, 9);
  ctx.strokeStyle = 'rgba(60,62,58,0.5)';
  ctx.strokeRect(15, 28, 32, 28);
  ctx.fillStyle = '#4d504a';
  ctx.fillRect(17, 47, 3, 6);
  return canvas;
}

function makeToolbox(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(62, 60);
  const rnd = mulberry(11);
  ctx.fillStyle = 'rgba(0,0,0,0.27)';
  ctx.beginPath();
  ctx.ellipse(31, 48, 22, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  isoBox(ctx, 31, 46, 21, 10, 22, { top: '#7c3a2c', left: '#6a3025', right: '#4e231b', outline: 'rgba(25,15,12,0.55)' });
  ctx.strokeStyle = '#3a3a36';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(24, 31);
  ctx.quadraticCurveTo(31, 25, 38, 31);
  ctx.stroke();
  ctx.fillStyle = 'rgba(200,190,150,0.25)';
  ctx.fillRect(20, 38, 16, 1.2);
  speckle(ctx, 12, 34, 40, 14, 12, ['rgba(150,80,40,0.3)'], rnd, 1);
  return canvas;
}

function makeBed(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(104, 80);
  const rnd = mulberry(9911);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(52, 63, 39, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  isoBox(ctx, 52, 61, 37, 18, 10, { top: '#4a3c2e', left: '#3e3226', right: '#2f271e', outline: 'rgba(18,15,12,0.5)' });
  // mattress
  ctx.save();
  ctx.translate(0, -9);
  roundRect(ctx, 18, 17, 68, 35, 7);
  ctx.fillStyle = '#8b8674';
  ctx.fill();
  roundRect(ctx, 20, 19, 64, 31, 6);
  ctx.fillStyle = '#9a957f';
  ctx.fill();
  // pillow
  roundRect(ctx, 22, 21, 18, 20, 5);
  ctx.fillStyle = '#b1ab94';
  ctx.fill();
  // blanket
  roundRect(ctx, 45, 22, 37, 25, 4);
  ctx.fillStyle = '#5b5f50';
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,42,36,0.5)';
  ctx.lineWidth = 1;
  for (let x = 50; x < 82; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, 24);
    ctx.lineTo(x, 46);
    ctx.stroke();
  }
  ctx.restore();
  speckle(ctx, 22, 24, 60, 30, 18, ['rgba(50,45,35,0.3)'], rnd, 1.1);
  return canvas;
}

function makeSofa(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(102, 82);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(51, 66, 38, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  isoBox(ctx, 51, 64, 35, 17, 12, { top: '#4d4034', left: '#40342a', right: '#30271f', outline: 'rgba(18,15,12,0.5)' });
  ctx.save();
  ctx.translate(0, -12);
  roundRect(ctx, 18, 20, 66, 32, 8);
  ctx.fillStyle = '#5c4a3d';
  ctx.fill();
  roundRect(ctx, 20, 22, 30, 28, 6);
  ctx.fillStyle = '#6a5546';
  ctx.fill();
  roundRect(ctx, 52, 22, 30, 28, 6);
  ctx.fillStyle = '#655142';
  ctx.fill();
  // backrest
  roundRect(ctx, 18, 10, 66, 14, 6);
  ctx.fillStyle = '#554336';
  ctx.fill();
  ctx.restore();
  return canvas;
}

function makeTable(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(90, 72);
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath();
  ctx.ellipse(45, 56, 32, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  isoBox(ctx, 45, 54, 30, 15, 16, { top: '#5a4936', left: '#4a3b2c', right: '#382c21', outline: 'rgba(20,16,12,0.5)' });
  // legs
  ctx.strokeStyle = '#342a20';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(22, 47);
  ctx.lineTo(22, 60);
  ctx.moveTo(68, 47);
  ctx.lineTo(68, 60);
  ctx.stroke();
  // items on table
  ctx.fillStyle = '#8c815f';
  ctx.beginPath();
  ctx.ellipse(42, 34, 10, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b3a987';
  ctx.beginPath();
  ctx.ellipse(42, 33, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function makeCounter(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(88, 84);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(44, 66, 33, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  isoBox(ctx, 44, 64, 32, 16, 30, { top: '#6b5d49', left: '#554838', right: '#3f362a', outline: 'rgba(20,17,13,0.5)' });
  ctx.fillStyle = '#8a7c63';
  ctx.beginPath();
  ctx.moveTo(12, 34);
  ctx.lineTo(44, 48);
  ctx.lineTo(76, 34);
  ctx.lineTo(44, 20);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,26,20,0.4)';
  ctx.stroke();
  // till / cup
  ctx.fillStyle = '#343a35';
  ctx.fillRect(54, 20, 8, 6);
  ctx.fillStyle = '#9d9a82';
  ctx.beginPath();
  ctx.ellipse(32, 34, 4, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function makeTrash(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(48, 42);
  const rnd = mulberry(44);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(24, 34, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2b27';
  ctx.beginPath();
  ctx.ellipse(24, 26, 12, 9, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#34352f';
  ctx.beginPath();
  ctx.ellipse(19, 20, 8, 7, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5b5747';
  ctx.beginPath();
  ctx.ellipse(30, 27, 5, 3, 0.4, 0, Math.PI * 2);
  ctx.fill();
  speckle(ctx, 10, 16, 28, 18, 15, ['rgba(190,180,140,0.2)'], rnd, 1);
  return canvas;
}

function makeDebris(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(60, 34);
  const rnd = mulberry(388);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(30, 22, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 10; i++) {
    ctx.save();
    ctx.translate(12 + rnd() * 38, 10 + rnd() * 16);
    ctx.rotate(rnd() * 3);
    ctx.fillStyle = ['rgba(170,162,132,0.55)', 'rgba(96,92,76,0.6)', 'rgba(120,95,55,0.4)', 'rgba(60,58,50,0.5)'][Math.floor(rnd() * 4)];
    ctx.fillRect(-4, -2, 8, 4);
    ctx.restore();
  }
  return canvas;
}

function makeBlood(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(88, 48);
  const rnd = mulberry(666);
  ctx.fillStyle = 'rgba(71, 14, 11, 0.55)';
  ctx.beginPath();
  ctx.ellipse(44, 26, 25, 8, 0.1, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(${50 + rnd() * 30},${8 + rnd() * 8},${7 + rnd() * 6},${0.3 + rnd() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(23 + rnd() * 44, 18 + rnd() * 18, 1 + rnd() * 5, 1 + rnd() * 2.5, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 6; i++) {
    const x = 23 + rnd() * 45;
    ctx.beginPath();
    ctx.arc(x, 18 + rnd() * 18, 0.8 + rnd() * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(70,13,10,0.45)';
    ctx.fill();
  }
  return canvas;
}

function makeRoofVent(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(64, 50);
  isoBox(ctx, 32, 40, 16, 8, 16, { top: '#6f726a', left: '#565a52', right: '#3f433d', outline: 'rgba(20,22,20,0.5)' });
  ctx.fillStyle = '#2f322e';
  ctx.beginPath();
  ctx.ellipse(32, 16, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(140,145,130,0.2)';
  ctx.beginPath();
  ctx.ellipse(32, 16, 5.5, 2.4, 0, 0, Math.PI * 2);
  ctx.stroke();
  return canvas;
}

function makeAC(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(74, 62);
  isoBox(ctx, 37, 48, 24, 12, 26, { top: '#8f9288', left: '#74776e', right: '#565a52', outline: 'rgba(25,26,23,0.5)' });
  ctx.fillStyle = 'rgba(40,43,39,0.25)';
  ctx.fillRect(15, 25, 28, 2);
  for (let y = 30; y < 44; y += 4) {
    line(ctx, 15, y, 43, y + 2, 'rgba(30,32,28,0.25)', 0.8);
  }
  ctx.strokeStyle = 'rgba(30,32,28,0.4)';
  ctx.beginPath();
  ctx.arc(48, 34, 6, 0, Math.PI * 2);
  ctx.stroke();
  return canvas;
}

function makeWaterTank(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(76, 96);
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath();
  ctx.ellipse(38, 82, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#4a3b2d';
  ctx.lineWidth = 3;
  for (const x of [24, 52]) {
    ctx.beginPath();
    ctx.moveTo(x, 78);
    ctx.lineTo(x, 44);
    ctx.stroke();
  }
  ctx.fillStyle = '#5a4a36';
  ctx.fillRect(18, 40, 40, 34);
  ctx.fillStyle = '#3e3325';
  ctx.beginPath();
  ctx.ellipse(38, 40, 20, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6a573d';
  ctx.beginPath();
  ctx.ellipse(38, 40, 16, 4.4, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let y = 48; y < 70; y += 7) {
    line(ctx, 19, y, 57, y, 'rgba(30,24,18,0.35)', 1);
  }
  ctx.fillStyle = 'rgba(130,80,40,0.3)';
  ctx.fillRect(26, 52, 4, 14);
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

function drawItemIcon(ctx: CanvasRenderingContext2D, def: ItemDef): void {
  const c = def.color;
  ctx.save();
  ctx.translate(20, 20);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1;
  switch (def.icon) {
    case 'bat': {
      ctx.rotate(-0.65);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(-2, 13);
      ctx.lineTo(2, 13);
      ctx.lineTo(4, -8);
      ctx.quadraticCurveTo(5, -15, 0, -15);
      ctx.quadraticCurveTo(-5, -15, -4, -8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#54402a';
      ctx.fillRect(-2.4, 5, 4.8, 8);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-1.5, 11);
      ctx.lineTo(-2.5, -9);
      ctx.stroke();
      break;
    }
    case 'knife': {
      ctx.rotate(-0.6);
      ctx.fillStyle = '#c5cdd0';
      ctx.beginPath();
      ctx.moveTo(0, -16);
      ctx.quadraticCurveTo(5, -4, 3, 7);
      ctx.lineTo(-2, 7);
      ctx.lineTo(-3, -6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#6a4a2e';
      ctx.fillRect(-3, 7, 6, 9);
      ctx.fillStyle = '#2f2b24';
      ctx.fillRect(-3.5, 13, 7, 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, -13);
      ctx.lineTo(-1, 4);
      ctx.stroke();
      break;
    }
    case 'crowbar': {
      ctx.rotate(-0.5);
      ctx.strokeStyle = c;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-2, 15);
      ctx.lineTo(0, -10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.quadraticCurveTo(2, -17, 8, -14);
      ctx.stroke();
      ctx.fillStyle = '#3a2019';
      ctx.fillRect(-4, 6, 5, 3);
      break;
    }
    case 'axe': {
      ctx.rotate(-0.7);
      ctx.fillStyle = '#7a5432';
      ctx.fillRect(-1.5, -14, 3, 29);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(1, -14);
      ctx.quadraticCurveTo(13, -14, 14, -7);
      ctx.lineTo(3, -4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      break;
    }
    case 'pistol': {
      ctx.rotate(-0.1);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.lineTo(10, -4);
      ctx.lineTo(10, 1);
      ctx.lineTo(2, 2);
      ctx.lineTo(-2, 12);
      ctx.lineTo(-8, 11);
      ctx.lineTo(-6, 2);
      ctx.lineTo(-12, 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#26282a';
      ctx.fillRect(-9, -3, 16, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(-10, -3.4, 18, 1);
      break;
    }
    case 'can': {
      ctx.fillStyle = c;
      roundRect(ctx, -8, -12, 16, 25, 3);
      ctx.fill();
      ctx.fillStyle = '#b9b4a5';
      ctx.beginPath();
      ctx.ellipse(0, -11, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(80, 45, 25, 0.4)';
      ctx.fillRect(-6, 0, 12, 7);
      ctx.fillStyle = 'rgba(230,220,190,0.5)';
      ctx.fillRect(-4, -7, 6, 2);
      break;
    }
    case 'bottle': {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(-4, 12);
      ctx.lineTo(-4, -3);
      ctx.lineTo(-2, -8);
      ctx.lineTo(-2, -14);
      ctx.lineTo(2, -14);
      ctx.lineTo(2, -8);
      ctx.lineTo(4, -3);
      ctx.lineTo(4, 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#a9c6cf';
      ctx.fillRect(-2, -13, 4, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(-2.6, -2, 1.4, 12);
      ctx.fillStyle = 'rgba(220,230,220,0.4)';
      ctx.fillRect(-3, -7, 6, 5);
      break;
    }
    case 'bandage': {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b6b0a0';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,112,96,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0.4, 3.6);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(-3, -3, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'ammo': {
      ctx.fillStyle = '#6c603f';
      ctx.fillRect(-11, -6, 22, 14);
      ctx.fillStyle = c;
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(-8 + i * 4, -12, 2.5, 9);
        ctx.beginPath();
        ctx.arc(-6.7 + i * 4, -12, 1.25, Math.PI, 0);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(200,180,120,0.4)';
      ctx.fillRect(-9, 0, 18, 1.5);
      break;
    }
    case 'scrap': {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(-11, 8);
      ctx.lineTo(-4, -10);
      ctx.lineTo(7, -7);
      ctx.lineTo(11, 2);
      ctx.lineTo(2, 11);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(-4, -9);
      ctx.lineTo(2, 3);
      ctx.lineTo(10, 1);
      ctx.stroke();
      ctx.fillStyle = 'rgba(120,80,40,0.35)';
      ctx.beginPath();
      ctx.arc(4, -3, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'cloth': {
      ctx.fillStyle = c;
      roundRect(ctx, -10, -9, 20, 18, 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,84,68,0.4)';
      for (let y = -5; y <= 5; y += 5) {
        line(ctx, -9, y, 9, y + 1, 'rgba(90,84,68,0.3)', 0.8);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(-8, -8, 16, 3);
      break;
    }
    case 'pill': {
      ctx.rotate(-0.7);
      ctx.fillStyle = c;
      roundRect(ctx, -4, -12, 8, 24, 4);
      ctx.fill();
      ctx.fillStyle = '#a75247';
      roundRect(ctx, -4, -12, 8, 11, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(-2, -10, 1.4, 6);
      break;
    }
  }
  ctx.restore();
}

export function getItemIconUrl(key: string): string | null {
  return iconUrls.get(key) ?? null;
}

/* ------------------------------------------------------------------ */
/* Effects & signs                                                     */
/* ------------------------------------------------------------------ */

function makeLight(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(512, 512);
  const g = ctx.createRadialGradient(256, 256, 10, 256, 256, 250);
  g.addColorStop(0, 'rgba(255, 226, 174, 0.34)');
  g.addColorStop(0.45, 'rgba(240, 205, 150, 0.12)');
  g.addColorStop(1, 'rgba(230, 190, 130, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  return canvas;
}

interface SignTheme {
  bgTop: string;
  bgMid: string;
  bgBot: string;
  border: string;
  textColor: string;
  accentColor: string;
  fontFamily: string;
  hasCross?: boolean;
  hasHazard?: boolean;
  hasTrim?: boolean;
}

const signCache = new Map<string, string>();

export function getBuildingSign(scene: Phaser.Scene, name: string): string {
  const cached = signCache.get(name);
  if (cached && scene.textures.exists(cached)) return cached;
  const key = `sign_${hashString(name).toString(36)}`;
  if (scene.textures.exists(key)) {
    signCache.set(name, key);
    return key;
  }
  const { canvas, ctx } = makeCanvas(180, 52);
  const rnd = mulberry(hashString(name));

  const lower = name.toLowerCase();
  let theme: SignTheme;
  if (lower.includes('pharmacy') || lower.includes('аптек') || lower.includes('med')) {
    theme = {
      bgTop: '#1a372d',
      bgMid: '#122921',
      bgBot: '#0c1b16',
      border: 'rgba(75, 205, 140, 0.45)',
      textColor: '#eafbf3',
      accentColor: '#3ec788',
      fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
      hasCross: true,
    };
  } else if (lower.includes('market') || lower.includes('магаз') || lower.includes('продукт') || lower.includes('гастроном') || lower.includes('универмаг') || lower.includes('quick stop')) {
    theme = {
      bgTop: '#4a221e',
      bgMid: '#361715',
      bgBot: '#260f0e',
      border: 'rgba(235, 180, 80, 0.55)',
      textColor: '#ffebd0',
      accentColor: '#dfa642',
      fontFamily: 'Georgia, "Times New Roman", serif',
      hasTrim: true,
    };
  } else if (lower.includes('diner') || lower.includes('кафе') || lower.includes('заря') || lower.includes('рыболов') || lower.includes('laundromat') || lower.includes('tackle')) {
    theme = {
      bgTop: '#362518',
      bgMid: '#281a10',
      bgBot: '#1d120a',
      border: 'rgba(255, 165, 65, 0.55)',
      textColor: '#ffdda6',
      accentColor: '#f5902b',
      fontFamily: '"Impact", "Arial Black", sans-serif',
      hasTrim: true,
    };
  } else if (lower.includes('gun') || lower.includes('pawn') || lower.includes('hardware') || lower.includes('оружи') || lower.includes('охот') || lower.includes('хозтовар')) {
    theme = {
      bgTop: '#2d333a',
      bgMid: '#22262a',
      bgBot: '#17191d',
      border: 'rgba(185, 190, 200, 0.45)',
      textColor: '#e8ecf0',
      accentColor: '#e5b945',
      fontFamily: '"Arial Black", "Trebuchet MS", sans-serif',
      hasHazard: true,
    };
  } else if (
    lower.includes('warehouse') ||
    lower.includes('garage') ||
    lower.includes('auto') ||
    lower.includes('depot') ||
    lower.includes('shop') ||
    lower.includes('storage') ||
    lower.includes('склад') ||
    lower.includes('автобаз') ||
    lower.includes('кооператив') ||
    lower.includes('комбинат') ||
    lower.includes('мастерск') ||
    lower.includes('терминал')
  ) {
    theme = {
      bgTop: '#2c2a26',
      bgMid: '#211f1c',
      bgBot: '#161514',
      border: 'rgba(220, 175, 55, 0.55)',
      textColor: '#ece6d8',
      accentColor: '#d8a32a',
      fontFamily: '"Consolas", monospace, sans-serif',
      hasHazard: true,
    };
  } else {
    // Apartments, Tenements, Flats, Housing, default
    theme = {
      bgTop: '#3a3429',
      bgMid: '#2c261e',
      bgBot: '#1e1a14',
      border: 'rgba(215, 190, 135, 0.45)',
      textColor: '#f2e6cc',
      accentColor: '#caa96a',
      fontFamily: 'Georgia, "Times New Roman", serif',
      hasTrim: true,
    };
  }

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(ctx, 4, 6, 172, 42, 3);
  ctx.fill();

  // Mounting plate gradient
  const grad = ctx.createLinearGradient(0, 4, 0, 48);
  grad.addColorStop(0, theme.bgTop);
  grad.addColorStop(0.5, theme.bgMid);
  grad.addColorStop(1, theme.bgBot);
  ctx.fillStyle = grad;
  roundRect(ctx, 3, 4, 174, 44, 3);
  ctx.fill();

  // Subtle inner highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(5, 6);
  ctx.lineTo(175, 6);
  ctx.stroke();

  // Border frame
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1.4;
  roundRect(ctx, 3, 4, 174, 44, 3);
  ctx.stroke();

  // Optional decorative inner trim
  if (theme.hasTrim) {
    ctx.strokeStyle = 'rgba(220, 185, 125, 0.2)';
    ctx.lineWidth = 0.8;
    roundRect(ctx, 6, 7, 168, 38, 2);
    ctx.stroke();
  }

  // Corner rivets
  const rivets = [
    [8, 9],
    [172, 9],
    [8, 43],
    [172, 43],
  ];
  for (const [rx, ry] of rivets) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(rx + 0.5, ry + 0.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8e969a';
    ctx.beginPath();
    ctx.arc(rx, ry, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c5ccd0';
    ctx.fillRect(rx - 0.5, ry - 0.5, 1, 1);
  }

  let textX = 90;
  let maxTextW = 152;

  // Green Cross icon for pharmacy
  if (theme.hasCross) {
    textX = 100;
    maxTextW = 136;
    ctx.fillStyle = theme.accentColor;
    ctx.shadowColor = theme.accentColor;
    ctx.shadowBlur = 4;
    ctx.fillRect(14, 21, 14, 10);
    ctx.fillRect(16, 17, 10, 18);
    ctx.shadowBlur = 0;
  }

  // Caution hazard notch for industrial / weapons
  if (theme.hasHazard) {
    ctx.fillStyle = theme.accentColor;
    ctx.beginPath();
    ctx.moveTo(7, 7);
    ctx.lineTo(15, 7);
    ctx.lineTo(7, 15);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(173, 41);
    ctx.lineTo(165, 41);
    ctx.lineTo(173, 33);
    ctx.closePath();
    ctx.fill();
  }

  // Text fitting
  const cleanTitle = name.toUpperCase();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let fontSize = 15;
  ctx.font = `700 ${fontSize}px ${theme.fontFamily}`;
  while (fontSize > 9 && ctx.measureText(cleanTitle).width > maxTextW) {
    fontSize -= 0.8;
    ctx.font = `700 ${fontSize.toFixed(1)}px ${theme.fontFamily}`;
  }

  // Text drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillText(cleanTitle, textX + 1, 26.5);
  // Text main fill
  ctx.fillStyle = theme.textColor;
  ctx.fillText(cleanTitle, textX, 25.5);

  // Weathering specks & scratch lines
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(${rnd() < 0.5 ? '12,14,15' : '110,75,40'},${0.08 + rnd() * 0.18})`;
    ctx.fillRect(8 + rnd() * 164, 8 + rnd() * 36, 1 + rnd() * 6, 1 + rnd() * 1.5);
  }

  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
  signCache.set(name, key);
  return key;
}


/* ------------------------------------------------------------------ */
/* Markings & doors                                                    */
/* ------------------------------------------------------------------ */

function makeLane(alongX: boolean): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(64, 32);
  const x1 = alongX ? 16 : 48;
  const y1 = alongX ? 8 : 8;
  const x2 = alongX ? 48 : 16;
  const y2 = alongX ? 24 : 24;
  ctx.strokeStyle = 'rgba(196, 180, 116, 0.34)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(220, 205, 150, 0.12)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x1, y1 - 0.8);
  ctx.lineTo(x2, y2 - 0.8);
  ctx.stroke();
  // worn paint chips
  const rnd = mulberry(alongX ? 811 : 812);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = 'rgba(48, 52, 50, 0.6)';
    ctx.beginPath();
    ctx.ellipse(x1 + (x2 - x1) * rnd(), y1 + (y2 - y1) * rnd(), 1.3, 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}

function makeCrosswalk(alongX: boolean): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(64, 32);
  ctx.save();
  if (!alongX) {
    ctx.translate(32, 16);
    ctx.rotate(Math.PI / 2);
    ctx.translate(-32, -16);
  }
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.translate(12 + i * 11, 16);
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = 'rgba(198, 192, 172, 0.32)';
    ctx.fillRect(-2.4, -11, 4.8, 22);
    ctx.fillStyle = 'rgba(30, 32, 30, 0.28)';
    ctx.fillRect(-2.4, -3 - i, 4.8, 1.2);
    ctx.restore();
  }
  ctx.restore();
  return canvas;
}

function makeDoor(open: boolean): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(64, 88);
  const rnd = mulberry(open ? 402 : 401);
  ctx.save();
  // left face frame
  ctx.setTransform(0.5, 0.25, 0, 1, 0, 16);
  ctx.fillStyle = '#3f3730';
  ctx.fillRect(0, 0, 64, 56);
  // actual opening
  ctx.fillStyle = open ? '#101412' : '#2c2117';
  ctx.fillRect(15, 4, 34, 52);
  if (!open) {
    const wood = ctx.createLinearGradient(15, 0, 49, 0);
    wood.addColorStop(0, '#4f3b28');
    wood.addColorStop(0.45, '#5f4931');
    wood.addColorStop(1, '#3b2b1d');
    ctx.fillStyle = wood;
    ctx.fillRect(17, 6, 30, 50);
    ctx.strokeStyle = 'rgba(24,17,11,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(21, 12, 22, 16);
    ctx.strokeRect(21, 32, 22, 18);
    ctx.fillStyle = '#8d7a4c';
    ctx.beginPath();
    ctx.arc(43, 31, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(130,80,40,0.3)';
    ctx.fillRect(18, 40, 6, 14);
    ctx.fillStyle = 'rgba(190,170,120,0.18)';
    ctx.fillRect(26, 18, 12, 1);
    speckle(ctx, 18, 8, 28, 46, 16, ['rgba(20,15,10,0.4)', 'rgba(120,80,40,0.3)'], rnd, 1);
  } else {
    // dark interior + swung leaf
    ctx.fillStyle = 'rgba(8,10,9,0.85)';
    ctx.fillRect(17, 6, 30, 50);
    ctx.fillStyle = '#4b3a28';
    ctx.beginPath();
    ctx.moveTo(17, 8);
    ctx.lineTo(6, 16);
    ctx.lineTo(6, 52);
    ctx.lineTo(17, 54);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,15,10,0.5)';
    ctx.stroke();
  }
  ctx.restore();

  // right face frame + opening
  ctx.setTransform(0.5, -0.25, 0, 1, 32, 32);
  ctx.fillStyle = '#332d27';
  ctx.fillRect(0, 0, 64, 56);
  ctx.fillStyle = open ? 'rgba(8,10,9,0.8)' : 'rgba(10,8,6,0.7)';
  ctx.fillRect(16, 4, 32, 52);
  ctx.restore();
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Public builders                                                     */
/* ------------------------------------------------------------------ */

export const GROUND_KEYS: Record<GroundKind, string[]> = {
  asphalt: [],
  sidewalk: [],
  grass: [],
  dirt: [],
  wood: [],
  tile: [],
  concrete: [],
  rubble: [],
};

export function buildEnvironmentArt(scene: Phaser.Scene): void {
  const groundCounts: Array<[GroundKind, number]> = [
    ['asphalt', 10],
    ['sidewalk', 4],
    ['grass', 5],
    ['dirt', 4],
    ['wood', 3],
    ['tile', 3],
    ['concrete', 3],
    ['rubble', 3],
  ];
  for (const [kind, count] of groundCounts) {
    for (let i = 0; i < count; i++) {
      const key = `tile_${kind}_${i}`;
      register(scene, key, makeGround(kind, i));
      GROUND_KEYS[kind].push(key);
    }
  }

  const walls: WallMat[] = ['brick', 'concrete', 'industrial', 'interior'];
  for (const mat of walls) {
    for (let v = 0; v < 6; v++) {
      register(scene, `wall_${mat}_${v}`, makeWall(mat, v));
    }
  }
  for (let style = 0; style < 3; style++) {
    for (let v = 0; v < 3; v++) register(scene, `roof_${style}_${v}`, makeRoof(style, v));
  }

  register(scene, 'prop_crate', makeCrate());
  register(scene, 'prop_barrel', makeBarrel());
  register(scene, 'prop_dumpster', makeDumpster());
  register(scene, 'prop_bush', makeBush());
  for (let v = 0; v < 3; v++) register(scene, `prop_tree_${v}`, makeTree(v));
  for (let v = 0; v < 4; v++) {
    register(scene, `prop_car_h_${v}`, makeCar(true, v));
    register(scene, `prop_car_v_${v}`, makeCar(false, v));
  }
  register(scene, 'prop_lamp', makeLamp());
  for (let v = 0; v < 3; v++) register(scene, `prop_sign_${v}`, makeSign(v));
  register(scene, 'prop_fence_h', makeFence(false));
  register(scene, 'prop_fence_v', makeFence(true));
  register(scene, 'prop_shelf', makeShelf());
  register(scene, 'prop_fridge', makeFridge());
  register(scene, 'prop_med', makeMedCabinet());
  register(scene, 'prop_toolbox', makeToolbox());
  register(scene, 'prop_bed', makeBed());
  register(scene, 'prop_sofa', makeSofa());
  register(scene, 'prop_table', makeTable());
  register(scene, 'prop_counter', makeCounter());
  register(scene, 'prop_trash', makeTrash());
  register(scene, 'prop_debris', makeDebris());
  for (let v = 0; v < 4; v++) register(scene, `prop_blood_${v}`, makeBlood());
  register(scene, 'prop_vent', makeRoofVent());
  register(scene, 'prop_ac', makeAC());
  register(scene, 'prop_tank', makeWaterTank());
  register(scene, 'fx_shadow', (() => {
    const { canvas, ctx } = makeCanvas(64, 26);
    const g = ctx.createRadialGradient(32, 13, 2, 32, 13, 30);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 26);
    return canvas;
  })());
  register(scene, 'fx_light', makeLight());
  register(scene, 'fx_dust', (() => {
    const { canvas, ctx } = makeCanvas(8, 8);
    const g = ctx.createRadialGradient(4, 4, 0.5, 4, 4, 4);
    g.addColorStop(0, 'rgba(220,216,196,0.75)');
    g.addColorStop(0.5, 'rgba(200,196,176,0.22)');
    g.addColorStop(1, 'rgba(200,196,176,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 8);
    return canvas;
  })());
  register(scene, 'mark_lane_h', makeLane(true));
  register(scene, 'mark_lane_v', makeLane(false));
  register(scene, 'mark_cross_h', makeCrosswalk(true));
  register(scene, 'mark_cross_v', makeCrosswalk(false));
  register(scene, 'door_closed', makeDoor(false));
  register(scene, 'door_open', makeDoor(true));
  register(scene, 'item_glow', (() => {
    const { canvas, ctx } = makeCanvas(48, 24);
    const g = ctx.createRadialGradient(24, 12, 1, 24, 12, 22);
    g.addColorStop(0, 'rgba(220, 200, 140, 0.4)');
    g.addColorStop(1, 'rgba(220, 200, 140, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 48, 24);
    return canvas;
  })());

  // Icons for each item definition (used both in-world and in the HUD).
  for (const def of Object.values(ITEMS)) {
    const { canvas, ctx } = makeCanvas(40, 40);
    drawItemIcon(ctx, def);
    register(scene, `icon_${def.key}`, canvas);
    iconUrls.set(def.key, canvas.toDataURL('image/png'));
  }

  console.time('[ashfall] pack environment atlas');
  packEnvironmentAtlas(scene);
  console.timeEnd('[ashfall] pack environment atlas');
}

export function tileTextureKey(tile: number, tx: number, ty: number): string {
  const mapping: GroundKind[] = ['asphalt', 'sidewalk', 'grass', 'dirt', 'wood', 'tile', 'concrete', 'rubble'];
  const kind = mapping[tile] ?? 'concrete';
  const list = GROUND_KEYS[kind];
  if (list.length === 0) return 'tile_concrete_0';
  const hash = hash2(tx, ty, tile);
  return list[Math.floor(hash * list.length) % list.length];
}

export function wallTextureKey(material: number, tx: number, ty: number, style: number, interior: boolean): string {
  if (material === 4) return `wall_interior_${Math.floor(hash2(tx, ty, 5) * 3)}`;
  const mat: WallMat = material === 3 ? 'industrial' : material === 2 ? 'concrete' : 'brick';
  const h = hash2(tx, ty, material);
  let variant = 0;
  if (h > 0.42) variant = 1;
  if (h > 0.78) variant = 2;
  if (h > 0.9) variant = 3;
  if (h > 0.95) variant = 4;
  if (style === 1 && h > 0.62 && h < 0.74) variant = 5;
  return `wall_${mat}_${variant}`;
}

export function roofTextureKey(style: number, tx: number, ty: number): string {
  const roofStyle = style === 2 ? 2 : style === 1 ? 1 : 0;
  return `roof_${roofStyle}_${Math.floor(hash2(tx, ty, 9) * 3)}`;
}

export function propTextureKey(type: string, variant: number, w = 1, h = 1): string {
  switch (type) {
    case 'tree':
      return `prop_tree_${variant % 3}`;
    case 'bush':
      return 'prop_bush';
    case 'car':
      return `prop_car_${w > h ? 'h' : 'v'}_${variant % 4}`;
    case 'dumpster':
      return 'prop_dumpster';
    case 'crate':
      return 'prop_crate';
    case 'barrel':
      return 'prop_barrel';
    case 'lamp':
      return 'prop_lamp';
    case 'sign':
      return `prop_sign_${variant % 3}`;
    case 'fence':
      return h > w ? 'prop_fence_v' : 'prop_fence_h';
    case 'shelf':
      return 'prop_shelf';
    case 'fridge':
      return 'prop_fridge';
    case 'med':
      return 'prop_med';
    case 'toolbox':
      return 'prop_toolbox';
    case 'bed':
      return 'prop_bed';
    case 'sofa':
      return 'prop_sofa';
    case 'table':
      return 'prop_table';
    case 'counter':
      return 'prop_counter';
    case 'trash':
      return 'prop_trash';
    case 'debris':
      return 'prop_debris';
    case 'blood':
      return `prop_blood_${variant % 4}`;
    case 'vent':
      return 'prop_vent';
    case 'ac':
      return 'prop_ac';
    case 'tank':
      return 'prop_tank';
    default:
      return 'prop_crate';
  }
}

export interface PropAnchor {
  ox: number;
  oy: number;
}

const ANCHORS: Record<string, PropAnchor> = {
  prop_tree_0: { ox: 0.5, oy: 0.922 },
  prop_tree_1: { ox: 0.5, oy: 0.922 },
  prop_tree_2: { ox: 0.5, oy: 0.922 },
  prop_bush: { ox: 0.5, oy: 0.786 },
  prop_car_h_0: { ox: 0.5, oy: 0.793 },
  prop_car_h_1: { ox: 0.5, oy: 0.793 },
  prop_car_h_2: { ox: 0.5, oy: 0.793 },
  prop_car_h_3: { ox: 0.5, oy: 0.793 },
  prop_car_v_0: { ox: 0.5, oy: 0.808 },
  prop_car_v_1: { ox: 0.5, oy: 0.808 },
  prop_car_v_2: { ox: 0.5, oy: 0.808 },
  prop_car_v_3: { ox: 0.5, oy: 0.808 },
  prop_dumpster: { ox: 0.5, oy: 0.717 },
  prop_crate: { ox: 0.5, oy: 0.743 },
  prop_barrel: { ox: 0.5, oy: 0.806 },
  prop_lamp: { ox: 0.5, oy: 0.939 },
  prop_sign_0: { ox: 0.5, oy: 0.924 },
  prop_sign_1: { ox: 0.5, oy: 0.924 },
  prop_sign_2: { ox: 0.5, oy: 0.924 },
  prop_fence_h: { ox: 0.5, oy: 0.81 },
  prop_fence_v: { ox: 0.5, oy: 0.81 },
  prop_shelf: { ox: 0.5, oy: 0.82 },
  prop_fridge: { ox: 0.5, oy: 0.833 },
  prop_med: { ox: 0.5, oy: 0.8125 },
  prop_toolbox: { ox: 0.5, oy: 0.766 },
  prop_bed: { ox: 0.5, oy: 0.7625 },
  prop_sofa: { ox: 0.5, oy: 0.7805 },
  prop_table: { ox: 0.5, oy: 0.75 },
  prop_counter: { ox: 0.5, oy: 0.762 },
  prop_trash: { ox: 0.5, oy: 0.81 },
  prop_debris: { ox: 0.5, oy: 0.7 },
  prop_blood_0: { ox: 0.5, oy: 0.54 },
  prop_blood_1: { ox: 0.5, oy: 0.54 },
  prop_blood_2: { ox: 0.5, oy: 0.54 },
  prop_blood_3: { ox: 0.5, oy: 0.54 },
  prop_vent: { ox: 0.5, oy: 0.8 },
  prop_ac: { ox: 0.5, oy: 0.774 },
  prop_tank: { ox: 0.5, oy: 0.854 },
};

export function propAnchor(key: string): PropAnchor {
  return ANCHORS[key] ?? { ox: 0.5, oy: 0.8 };
}
