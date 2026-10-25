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

function register(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): void {
  if (scene.textures.exists(key)) return;
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
    // Project Zomboid style: dark weathered aggregate asphalt
    const bases = [
      '#202325', '#1c1f21', '#232628', '#1e2123', '#222527',
      '#1a1d1f', '#212426', '#1d2022', '#242729', '#1f2224',
    ];
    fillDiamond(bases[variant % bases.length]);
    // Fine crushed stone and bitumen aggregate texture
    speckle(ctx, 0, 0, 64, 32, 160, ['#141618', '#2d3134', '#383c40', '#181a1c', '#282b2e'], rnd, 1.4);

    // Weathered organic cracks with branching
    const crackCount = variant % 3 === 0 ? 3 : variant % 2 === 0 ? 1 : 0;
    for (let c = 0; c < crackCount; c++) {
      let x = 10 + rnd() * 44;
      let y = 6 + rnd() * 20;
      ctx.strokeStyle = 'rgba(10,11,12,0.6)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const segments = 3 + Math.floor(rnd() * 3);
      for (let s = 0; s < segments; s++) {
        x += (rnd() - 0.5) * 14;
        y += (rnd() - 0.3) * 7;
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Weeds sprouting in cracks (Project Zomboid overgrown nature)
      if (rnd() < 0.45) {
        ctx.fillStyle = 'rgba(46,55,37,0.7)';
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Road surface blemishes: oil stains, bitumen tar patches, tire wear
    if (variant === 3 || variant === 6) {
      // Dark fluid / engine oil leak in center
      ctx.fillStyle = 'rgba(10,11,12,0.38)';
      ctx.beginPath();
      ctx.ellipse(32 + (rnd() - 0.5) * 8, 16 + (rnd() - 0.5) * 4, 10 + rnd() * 6, 4 + rnd() * 2.5, rnd() * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (variant === 5) {
      // Dark bitumen patch (road repair)
      ctx.fillStyle = 'rgba(14,16,18,0.45)';
      ctx.beginPath();
      ctx.ellipse(26, 17, 14, 5, -0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (variant === 8) {
      // Faded weathered road marking
      ctx.strokeStyle = 'rgba(175,160,110,0.28)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(20, 22);
      ctx.lineTo(44, 10);
      ctx.stroke();
    }
  } else if (kind === 'sidewalk') {
    // Project Zomboid style: weathered concrete sidewalk slabs with dark expansion seams
    const bases = ['#54564e', '#4f5149', '#585a52', '#4c4e46'];
    fillDiamond(bases[variant % bases.length]);
    speckle(ctx, 0, 0, 64, 32, 110, ['#3f413a', '#62645c', '#464841', '#6b6d65'], rnd, 1.3);

    // Deep expansion joints along slab edges
    ctx.strokeStyle = 'rgba(22,23,20,0.45)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(32, 1);
    ctx.lineTo(0, 17);
    ctx.moveTo(63, 17);
    ctx.lineTo(32, 33);
    ctx.stroke();

    // Subtle concrete edge bevel highlight
    ctx.strokeStyle = 'rgba(190,195,180,0.12)';
    ctx.beginPath();
    ctx.moveTo(32, 2.5);
    ctx.lineTo(2, 17.5);
    ctx.stroke();

    // Sprouting moss and weeds along seams
    if (rnd() < 0.6) {
      ctx.fillStyle = 'rgba(44,54,34,0.6)';
      for (let i = 0; i < 4; i++) {
        const t = rnd();
        const mx = 32 * (1 - t) + 2 * t;
        const my = 1 * (1 - t) + 17 * t;
        ctx.beginPath();
        ctx.ellipse(mx + (rnd() - 0.5) * 2, my + (rnd() - 0.5) * 1.5, 1.8, 0.9, rnd() * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (kind === 'grass') {
    // Project Zomboid style: deep, muted, overgrown turf with weeds and soil patches
    const bases = ['#2d3623', '#28311f', '#323b27', '#2a3321', '#2f3825'];
    fillDiamond(bases[variant % bases.length]);
    speckle(ctx, 0, 0, 64, 32, 110, ['#1e2417', '#3c472f', '#445135', '#353e2a'], rnd, 1.5);

    // Patches of exposed damp soil (removes checkerboard look)
    if (variant === 1 || variant === 4) {
      ctx.fillStyle = 'rgba(32,27,19,0.4)';
      ctx.beginPath();
      ctx.ellipse(24 + rnd() * 16, 12 + rnd() * 8, 8 + rnd() * 6, 3.5 + rnd() * 2, rnd() * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Natural wild grass blade clusters
    const bladeCount = 35 + Math.floor(rnd() * 30);
    for (let i = 0; i < bladeCount; i++) {
      const x = rnd() * 64;
      const y = rnd() * 32;
      const dark = rnd() < 0.6;
      ctx.strokeStyle = dark ? 'rgba(38,47,30,0.65)' : 'rgba(56,68,44,0.55)';
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const angle = (rnd() - 0.5) * 3;
      ctx.lineTo(x + angle, y - 2 - rnd() * 3);
      ctx.stroke();
    }

    // Weed rosettes / plantain / dried leaves
    if (rnd() < 0.5) {
      ctx.fillStyle = rnd() < 0.5 ? 'rgba(42,52,32,0.6)' : 'rgba(68,58,38,0.45)';
      ctx.beginPath();
      ctx.ellipse(14 + rnd() * 36, 8 + rnd() * 16, 2.8 + rnd() * 2, 1.4 + rnd(), rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
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
  cutHeight?: number,
): void {
  const pal = MATERIALS[mat];
  const light = side === 'left' ? 0.11 : -0.2;
  ctx.save();
  if (side === 'left') ctx.setTransform(0.5, 0.25, 0, 1, 0, 16);
  else ctx.setTransform(0.5, -0.25, 0, 1, 32, 32);

  if (cutHeight) {
    ctx.beginPath();
    ctx.rect(0, 56 - cutHeight, 64, cutHeight);
    ctx.clip();
  }

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

  // windows / doors (full-height walls only; cutaway half-walls stay solid and clean!)
  const windowRoll = (seed + variant * 7) % 10;
  if (!cutHeight && mat !== 'interior' && windowRoll < 7) {
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
  } else if (!cutHeight && mat !== 'interior' && windowRoll === 9) {
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

export type WallOrientation = 'south' | 'east' | 'corner' | 'back' | 'corner_sw' | 'corner_ne';

function makeWallOriented(mat: WallMat, orientation: WallOrientation, variant: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(64, 88);
  const rnd = mulberry(hashString(`${mat}:${orientation}:${variant}`));
  const pal = MATERIALS[mat];

  if (orientation === 'south') {
    // Straight South Wall: runs along +X. Only left face is visible from camera.
    drawWallFace(ctx, mat, 'left', variant, hashString(mat) + variant * 13, rnd);

    // Parapet coping along top edge of wall face (thin, realistic, 4px deep)
    ctx.save();
    ctx.setTransform(0.5, 0.25, -0.5, 0.25, 32, 0);
    ctx.fillStyle = shade(pal.trim, -0.12);
    ctx.fillRect(0, 60, 64, 4);
    ctx.restore();

    // Clean facade outlines: top and bottom seams only, no vertical crease in the middle!
    ctx.strokeStyle = 'rgba(10,11,10,0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(32, 32);
    ctx.moveTo(0, 72);
    ctx.lineTo(32, 88);
    ctx.stroke();
  } else if (orientation === 'east') {
    // Straight East Wall: runs along +Y. Only right face is visible from camera.
    drawWallFace(ctx, mat, 'right', variant, hashString(mat) + variant * 29, rnd);

    // Parapet coping along top edge of wall face (thin, realistic, 4px deep)
    ctx.save();
    ctx.setTransform(0.5, 0.25, -0.5, 0.25, 32, 0);
    ctx.fillStyle = shade(pal.trim, -0.2);
    ctx.fillRect(60, 0, 4, 64);
    ctx.restore();

    // Clean facade outlines: top and bottom seams only, no vertical crease in the middle!
    ctx.strokeStyle = 'rgba(10,11,10,0.32)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(64, 16);
    ctx.moveTo(32, 88);
    ctx.lineTo(64, 72);
    ctx.stroke();
  } else if (orientation === 'corner') {
    // Outside SE corner: meets both front faces at full 56px height
    drawWallFace(ctx, mat, 'left', variant, hashString(mat) + variant * 13, rnd);
    drawWallFace(ctx, mat, 'right', variant, hashString(mat) + variant * 29, rnd);

    // Corner L-shaped thin coping
    ctx.save();
    ctx.setTransform(0.5, 0.25, -0.5, 0.25, 32, 0);
    ctx.fillStyle = shade(pal.trim, -0.15);
    ctx.fillRect(0, 60, 64, 4);
    ctx.fillRect(60, 0, 4, 64);
    ctx.restore();

    // Corner vertical seam
    ctx.strokeStyle = 'rgba(10,11,10,0.38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(32, 32);
    ctx.lineTo(64, 16);
    ctx.moveTo(32, 32);
    ctx.lineTo(32, 88);
    ctx.moveTo(0, 72);
    ctx.lineTo(32, 88);
    ctx.lineTo(64, 72);
    ctx.stroke();
  } else if (orientation === 'corner_sw') {
    // SW corner: West full-height wall meeting the South front wall at (32, 88).
    // Only draws right face (West wall). Never extends past West wall into grass!
    drawWallFace(ctx, mat, 'right', variant, hashString(mat) + variant * 29, rnd);

    ctx.save();
    ctx.setTransform(0.5, 0.25, -0.5, 0.25, 32, 0);
    ctx.fillStyle = shade(pal.trim, -0.2);
    ctx.fillRect(60, 0, 4, 64);
    ctx.restore();

    ctx.strokeStyle = 'rgba(10,11,10,0.38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(64, 16);
    ctx.moveTo(32, 88);
    ctx.lineTo(64, 72);
    ctx.moveTo(32, 32);
    ctx.lineTo(32, 88);
    ctx.stroke();
  } else if (orientation === 'corner_ne') {
    // NE corner: North full-height wall meeting the East front wall at (32, 88).
    // Only draws left face (North wall). Never extends past North wall into street!
    drawWallFace(ctx, mat, 'left', variant, hashString(mat) + variant * 13, rnd);

    ctx.save();
    ctx.setTransform(0.5, 0.25, -0.5, 0.25, 32, 0);
    ctx.fillStyle = shade(pal.trim, -0.12);
    ctx.fillRect(0, 60, 64, 4);
    ctx.restore();

    ctx.strokeStyle = 'rgba(10,11,10,0.38)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(32, 32);
    ctx.moveTo(0, 72);
    ctx.lineTo(32, 88);
    ctx.moveTo(32, 32);
    ctx.lineTo(32, 88);
    ctx.stroke();
  } else {
    // Back corner or enclosure: thin coping (NOT a 64x32 solid block!)
    drawWallFace(ctx, mat, 'left', variant, hashString(mat) + variant * 13, rnd);
    drawWallFace(ctx, mat, 'right', variant, hashString(mat) + variant * 29, rnd);

    ctx.save();
    ctx.setTransform(0.5, 0.25, -0.5, 0.25, 32, 0);
    ctx.fillStyle = shade(pal.trim, -0.16);
    ctx.fillRect(0, 0, 64, 4);
    ctx.fillRect(0, 0, 4, 64);
    ctx.restore();

    ctx.strokeStyle = 'rgba(10,11,10,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 16);
    ctx.lineTo(32, 32);
    ctx.lineTo(64, 16);
    ctx.stroke();
  }

  return canvas;
}

export const CUTAWAY_WALL_HEIGHT = 18;

function makeWallCutaway(mat: WallMat, orientation: WallOrientation, variant: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(64, 88);
  const rnd = mulberry(hashString(`${mat}:cut:${orientation}:${variant}`));
  const pal = MATERIALS[mat];
  const cutH = CUTAWAY_WALL_HEIGHT; // 18px

  if (orientation === 'south') {
    // Cutaway south wall: runs along +X, height 18px
    drawWallFace(ctx, mat, 'left', variant, hashString(mat) + variant * 13, rnd, cutH);

    // Architectural top cut coping / sill (flush on top edge of cut wall)
    ctx.save();
    ctx.setTransform(0.5, 0.25, -0.5, 0.25, 32, 56 - cutH);
    ctx.fillStyle = shade(pal.trim, -0.05);
    ctx.fillRect(0, 60, 64, 4);
    ctx.restore();

    ctx.strokeStyle = 'rgba(10,11,10,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 54);
    ctx.lineTo(32, 70);
    ctx.moveTo(0, 72);
    ctx.lineTo(32, 88);
    ctx.stroke();
  } else if (orientation === 'east') {
    // Cutaway east wall: runs along +Y, height 18px
    drawWallFace(ctx, mat, 'right', variant, hashString(mat) + variant * 29, rnd, cutH);

    // Architectural top cut coping / sill (flush on top edge of cut wall)
    ctx.save();
    ctx.setTransform(0.5, 0.25, -0.5, 0.25, 32, 56 - cutH);
    ctx.fillStyle = shade(pal.trim, -0.1);
    ctx.fillRect(60, 0, 4, 64);
    ctx.restore();

    ctx.strokeStyle = 'rgba(10,11,10,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(32, 70);
    ctx.lineTo(64, 54);
    ctx.moveTo(32, 88);
    ctx.lineTo(64, 72);
    ctx.stroke();
  } else if (orientation === 'corner') {
    // Cutaway SE corner: both front faces meeting at height 18px
    drawWallFace(ctx, mat, 'left', variant, hashString(mat) + variant * 13, rnd, cutH);
    drawWallFace(ctx, mat, 'right', variant, hashString(mat) + variant * 29, rnd, cutH);

    ctx.save();
    ctx.setTransform(0.5, 0.25, -0.5, 0.25, 32, 56 - cutH);
    ctx.fillStyle = shade(pal.trim, -0.08);
    ctx.fillRect(0, 60, 64, 4);
    ctx.fillRect(60, 0, 4, 64);
    ctx.restore();

    ctx.strokeStyle = 'rgba(10,11,10,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 54);
    ctx.lineTo(32, 70);
    ctx.lineTo(64, 54);
    ctx.moveTo(32, 70);
    ctx.lineTo(32, 88);
    ctx.moveTo(0, 72);
    ctx.lineTo(32, 88);
    ctx.lineTo(64, 72);
    ctx.stroke();
  } else if (orientation === 'corner_sw') {
    // Cutaway SW corner:
    // West wall stays full 56px!
    // Meets adjacent 18px South cut half-wall at (32, 70).
    // Only draws right face (West wall). Never extends past West wall into grass!
    drawWallFace(ctx, mat, 'right', variant, hashString(mat) + variant * 29, rnd);

    // Coping for 56px West full wall
    ctx.save();
    ctx.setTransform(0.5, 0.25, -0.5, 0.25, 32, 0);
    ctx.fillStyle = shade(pal.trim, -0.2);
    ctx.fillRect(60, 0, 4, 64);
    ctx.restore();

    // Outlines and solid vertical masonry seam down to 18px South half-wall
    ctx.strokeStyle = 'rgba(10,11,10,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // West full wall top and bottom
    ctx.moveTo(32, 32);
    ctx.lineTo(64, 16);
    ctx.moveTo(32, 88);
    ctx.lineTo(64, 72);
    // Vertical corner front seam connecting 56px West top (32, 32) down to 18px South top (32, 70) and base (32, 88)
    ctx.moveTo(32, 32);
    ctx.lineTo(32, 88);
    // Sill endcap for 18px South wall meeting point
    ctx.moveTo(30, 71);
    ctx.lineTo(32, 70);
    ctx.stroke();
  } else if (orientation === 'corner_ne') {
    // Cutaway NE corner:
    // North wall stays full 56px!
    // Meets adjacent 18px East cut half-wall at (32, 70).
    // Only draws left face (North wall). Never extends past North wall into street (no cardboard window)!
    drawWallFace(ctx, mat, 'left', variant, hashString(mat) + variant * 13, rnd);

    // Coping for 56px North full wall
    ctx.save();
    ctx.setTransform(0.5, 0.25, -0.5, 0.25, 32, 0);
    ctx.fillStyle = shade(pal.trim, -0.12);
    ctx.fillRect(0, 60, 64, 4);
    ctx.restore();

    // Outlines and solid vertical masonry seam down to 18px East half-wall
    ctx.strokeStyle = 'rgba(10,11,10,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // North full wall top and bottom
    ctx.moveTo(0, 16);
    ctx.lineTo(32, 32);
    ctx.moveTo(0, 72);
    ctx.lineTo(32, 88);
    // Vertical corner front seam connecting 56px North top (32, 32) down to 18px East top (32, 70) and base (32, 88)
    ctx.moveTo(32, 32);
    ctx.lineTo(32, 88);
    // Sill endcap for 18px East wall meeting point
    ctx.moveTo(32, 70);
    ctx.lineTo(34, 71);
    ctx.stroke();
  } else {
    // Cutaway back
    drawWallFace(ctx, mat, 'left', variant, hashString(mat) + variant * 13, rnd, cutH);
    drawWallFace(ctx, mat, 'right', variant, hashString(mat) + variant * 29, rnd, cutH);

    ctx.save();
    ctx.setTransform(0.5, 0.25, -0.5, 0.25, 32, 56 - cutH);
    ctx.fillStyle = shade(pal.trim, -0.08);
    ctx.fillRect(0, 0, 64, 4);
    ctx.fillRect(0, 0, 4, 64);
    ctx.restore();

    ctx.strokeStyle = 'rgba(10,11,10,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 54);
    ctx.lineTo(32, 70);
    ctx.lineTo(64, 54);
    ctx.stroke();
  }

  return canvas;
}

function makeWall(mat: WallMat, variant: number): HTMLCanvasElement {
  return makeWallOriented(mat, 'corner', variant);
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
  const W = horizontal ? 196 : 164;
  const H = horizontal ? 140 : 192;
  const { canvas, ctx } = makeCanvas(W, H);
  const rnd = mulberry(2500 + variant * 21 + (horizontal ? 0 : 101));
  const cx = W / 2;
  const baseY = horizontal ? 106 : 148;

  // Fallout 2 Authentic Atomic Cruiser Wrecks:
  // 0: Chryslus Highwayman Classic (deep oxidized atomic cherry / burgundy, chrome trim, tail fins)
  // 1: Corvega Atomic Cruiser (weathered seafoam teal, heavy iron rust, tail fins)
  // 2: Wasteland Cruiser (desert primer tan & raw rusted steel, battered chrome)
  // 3: Chryslus Nuclear Reactor Wreck (gutted hood exposing atomic fusion core & copper coils)
  const isHighwayman = variant === 0;
  const isTeal = variant === 1;
  const isDesert = variant === 2;
  const isWreck = variant === 3;

  const baseBodyColor = isHighwayman
    ? '#44191d'
    : isTeal
      ? '#223c38'
      : isDesert
        ? '#4a3d2e'
        : '#342219';

  const rustColor = '#5c2b18';
  const highlightColor = shade(baseBodyColor, 0.18);
  const shadowColor = shade(baseBodyColor, -0.32);
  const sideColor = shadowColor;

  // Proportions: L = 50 (long low-slung streamliner), Wh = 20 (wide muscular stance)
  const L = 50;
  const Wh = 20;

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

  // 1. Heavy Ground Drop Shadow
  ctx.fillStyle = 'rgba(6, 8, 7, 0.58)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY + (horizontal ? 5 : 7), horizontal ? 68 : 40, horizontal ? 21 : 36, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Far Wheels (v = -0.95, partially sunken in wasteland dirt)
  const drawWheel = (u: number, v: number, isFlat = false) => {
    const pBase = pt(u, v, isFlat ? 1 : 0);
    const pTop = pt(u, v, isFlat ? 8 : 11);
    const radX = horizontal ? 6.5 : 4.8;
    const radY = isFlat ? (horizontal ? 3.5 : 4.5) : (horizontal ? 4.8 : 6.5);
    // Tire rubber
    ctx.fillStyle = '#111314';
    ctx.beginPath();
    ctx.ellipse(pBase.x, (pBase.y + pTop.y) / 2, radX, radY, 0, 0, Math.PI * 2);
    ctx.fill();
    // Rusted steel hub / chrome cap
    ctx.fillStyle = isHighwayman ? '#6c7378' : '#3d342c';
    ctx.beginPath();
    ctx.ellipse(pBase.x, (pBase.y + pTop.y) / 2, radX * 0.55, radY * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  drawWheel(-0.62, -0.95, true);
  drawWheel(0.68, -0.95);

  // 3. Chassis Lower Frame (Low, heavy clearance)
  poly([pt(-1.1, -1, 3), pt(1.05, -1, 3), pt(1.05, 1, 3), pt(-1.1, 1, 3)], '#0c0e0e');

  // Near Side Bodywork (v = 1, facing camera)
  poly([pt(-1.12, 1, 4), pt(1.06, 1, 4), pt(1.04, 1, 17), pt(-1.1, 1, 17)], shadowColor, 'rgba(12,14,13,0.7)', 0.8);

  // Classic 1950s Chrome Side Spear Trim (splitting body and rocker panel)
  const spearColor = isWreck ? '#4c4238' : '#9ea7ad';
  poly([pt(-1.08, 1, 12), pt(1.02, 1, 12), pt(1.01, 1, 13.5), pt(-1.07, 1, 13.5)], spearColor);

  // Fallout 2 Fender Skirt (covers upper half of rear wheel!)
  poly([pt(-0.84, 1.01, 4), pt(-0.4, 1.01, 4), pt(-0.38, 1.01, 15), pt(-0.86, 1.01, 15)], shadowColor, 'rgba(12,14,13,0.6)', 0.7);

  // Near Front Wheel (open wheel arch at u = 0.68)
  drawWheel(0.68, 0.98);
  // Rear wheel peeking out under skirt
  drawWheel(-0.62, 0.96, true);

  // Heavy Rust & Patina streaks across side
  for (let i = 0; i < 5; i++) {
    const ru = -0.9 + i * 0.38 + (rnd() - 0.5) * 0.1;
    poly(
      [pt(ru, 1, 4 + rnd() * 4), pt(ru + 0.18, 1, 4 + rnd() * 4), pt(ru + 0.14, 1, 13), pt(ru - 0.02, 1, 13)],
      rustColor,
    );
  }

  // 4. Fallout 2 Iconic Atomic Tail Fins!
  // Near Fin (rising from u = -0.3 back to u = -1.18, height z = 17 up to 26!)
  poly(
    [pt(-0.35, 1.01, 17), pt(-1.18, 1.01, 26), pt(-1.18, 1.01, 15), pt(-0.35, 1.01, 15)],
    shadowColor,
    'rgba(12,14,13,0.75)',
    0.8,
  );
  // Near Fin top chrome ridge
  poly([pt(-0.35, 1.01, 17), pt(-1.18, 1.01, 26), pt(-1.16, 0.92, 26), pt(-0.35, 0.92, 17)], spearColor);
  // Far Fin (visible behind rear trunk)
  poly(
    [pt(-0.35, -0.98, 17), pt(-1.18, -0.98, 26), pt(-1.18, -0.9, 26), pt(-0.35, -0.9, 17)],
    shade(shadowColor, -0.2),
  );

  // Bullet Rocket Taillights on tips of rear fins!
  const tailNear = pt(-1.18, 1.01, 24);
  const tailFar = pt(-1.18, -0.98, 24);
  const drawRocketTail = (p: { x: number; y: number }) => {
    // Chrome bullet housing
    ctx.fillStyle = '#6a7277';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 2.8, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Glowing ruby red bullet lens
    ctx.fillStyle = '#b81c14';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 1.8, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  drawRocketTail(tailNear);
  drawRocketTail(tailFar);

  // Rear Trunk Deck between fins
  poly([pt(-1.14, -0.92, 16), pt(-0.35, -0.92, 17), pt(-0.35, 0.92, 17), pt(-1.14, 0.92, 16)], highlightColor, 'rgba(12,14,13,0.5)', 0.6);

  // 5. Front Nose & Torpedo Hood
  const frontColor = shade(baseBodyColor, -0.16);
  // Front Face
  poly([pt(1.06, -0.96, 4), pt(1.06, 0.96, 4), pt(1.03, 0.96, 17), pt(1.03, -0.96, 17)], frontColor, 'rgba(12,14,13,0.7)', 0.8);

  // Chryslus Heavy Chrome Bumper with overrider guards
  const bumperMat = isWreck ? '#3c352c' : '#889196';
  poly([pt(1.1, -1.02, 4), pt(1.1, 1.02, 4), pt(1.1, 1.02, 8.5), pt(1.1, -1.02, 8.5)], bumperMat, '#0d0f10', 0.8);
  // Bumper vertical overriders
  const ov1 = pt(1.12, -0.4, 6);
  const ov2 = pt(1.12, 0.4, 6);
  ctx.fillStyle = bumperMat;
  ctx.fillRect(ov1.x - 2, ov1.y - 4, 4, 8);
  ctx.fillRect(ov2.x - 2, ov2.y - 4, 4, 8);

  // Front Chryslus Slotted Grille
  poly([pt(1.07, -0.65, 8.5), pt(1.07, 0.65, 8.5), pt(1.07, 0.65, 14.5), pt(1.07, -0.65, 14.5)], '#131617');
  for (let gy = 10; gy <= 14; gy += 1.8) {
    const gL = pt(1.07, -0.6, gy);
    const gR = pt(1.07, 0.6, gy);
    ctx.strokeStyle = '#687278';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gL.x, gL.y);
    ctx.lineTo(gR.x, gR.y);
    ctx.stroke();
  }

  // Dual Bullet Headlights sunken in hooded pods
  const hlL = pt(1.06, -0.82, 13);
  const hlR = pt(1.06, 0.82, 13);
  const drawAtomicHeadlight = (p: { x: number; y: number }, broken: boolean) => {
    // Hooded chrome bezel
    ctx.fillStyle = '#6e777d';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 4, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Glass reflector
    ctx.fillStyle = broken ? '#261c16' : '#ece5c0';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 2.6, 2.1, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!broken) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(p.x - 0.4, p.y - 0.3, 1.2, 1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  drawAtomicHeadlight(hlL, isWreck || rnd() < 0.3);
  drawAtomicHeadlight(hlR, rnd() < 0.25);

  // Long Torpedo Hood
  if (isWreck) {
    // Stripped / crumpled hood exposing Chryslus Fusion Reactor!
    poly([pt(0.25, -0.94, 17), pt(1.03, -0.94, 17), pt(1.03, 0.94, 17), pt(0.25, 0.94, 17)], '#1a1410');
    // Exposed Fusion Core Engine Block
    const coreP = pt(0.65, 0, 10);
    ctx.fillStyle = '#1e2326';
    ctx.beginPath();
    ctx.ellipse(coreP.x, coreP.y, 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Radioactive blue core glow
    ctx.fillStyle = 'rgba(70, 190, 230, 0.45)';
    ctx.beginPath();
    ctx.ellipse(coreP.x, coreP.y, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Copper manifold conduit coils
    const c1 = pt(0.5, -0.3, 13);
    const c2 = pt(0.8, -0.3, 13);
    ctx.strokeStyle = '#a45728';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.stroke();
    // Crumpled loose hood sheet leaning back
    poly([pt(0.22, -0.9, 17), pt(0.6, -0.9, 23), pt(0.6, 0.7, 23), pt(0.22, 0.7, 17)], rustColor, '#120f0d', 0.8);
  } else {
    // Solid retro-streamliner torpedo hood
    poly([pt(0.24, -0.96, 17), pt(1.03, -0.96, 17), pt(1.03, 0.96, 17), pt(0.24, 0.96, 17)], highlightColor, 'rgba(12,14,13,0.5)', 0.6);
    // Center rocket chrome spine
    poly([pt(0.24, -0.04, 17.5), pt(1.04, -0.04, 17.5), pt(1.04, 0.04, 17.5), pt(0.24, 0.04, 17.5)], spearColor);
    // Hood rust patches
    poly([pt(0.45, 0.2, 17.2), pt(0.72, 0.3, 17.2), pt(0.68, 0.65, 17.2), pt(0.42, 0.55, 17.2)], rustColor);
  }

  // 6. Retro-Futuristic Panoramic Curved Cockpit (Bubble canopy)
  const cabRearU = -0.35;
  const cabFrontU = 0.24;
  const roofRearU = -0.25;
  const roofFrontU = 0.08;

  // Curved Panoramic Windshield
  poly(
    [pt(roofFrontU, -0.78, 29), pt(roofFrontU, 0.78, 29), pt(cabFrontU, 0.86, 17), pt(cabFrontU, -0.86, 17)],
    '#131e21',
    '#0c1214',
    0.8,
  );
  // Glass greenish reflection & spider-crack
  poly([pt(roofFrontU + 0.02, -0.15, 29), pt(roofFrontU + 0.06, 0.15, 29), pt(cabFrontU - 0.04, 0.35, 17.2), pt(cabFrontU - 0.08, 0.05, 17.2)], 'rgba(180, 225, 215, 0.24)');
  if (rnd() < 0.6) {
    // Spiderweb crack on windshield
    const cp = pt(0.16, 0.25, 23);
    ctx.strokeStyle = 'rgba(230, 245, 240, 0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cp.x - 4, cp.y - 3);
    ctx.lineTo(cp.x + 3, cp.y + 2);
    ctx.lineTo(cp.x + 5, cp.y - 4);
    ctx.moveTo(cp.x, cp.y);
    ctx.lineTo(cp.x - 3, cp.y + 5);
    ctx.stroke();
  }

  // Wraparound Rear Window
  poly(
    [pt(roofRearU, 0.78, 29), pt(roofRearU, -0.78, 29), pt(cabRearU, -0.86, 17), pt(cabRearU, 0.86, 17)],
    '#11191c',
    '#0c1214',
    0.8,
  );

  // Near Side Windows
  poly(
    [pt(roofRearU, 0.78, 29), pt(roofFrontU, 0.78, 29), pt(cabFrontU, 0.86, 17), pt(cabRearU, 0.86, 17)],
    '#121b1e',
    'rgba(12,14,13,0.7)',
    0.8,
  );

  // Center Window Pillar
  const pTop = pt((roofRearU + roofFrontU) * 0.5, 0.78, 29);
  const pBot = pt((cabRearU + cabFrontU) * 0.5, 0.86, 17);
  ctx.strokeStyle = sideColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(pTop.x, pTop.y);
  ctx.lineTo(pBot.x, pBot.y);
  ctx.stroke();

  // Teardrop Rounded Roof Deck
  poly(
    [pt(roofRearU, -0.78, 29), pt(roofFrontU, -0.78, 29), pt(roofFrontU, 0.78, 29), pt(roofRearU, 0.78, 29)],
    shade(baseBodyColor, 0.14),
    'rgba(12,14,13,0.6)',
    0.8,
  );
  // Roof rust patches
  poly([pt(-0.12, -0.2, 29.1), pt(0.04, -0.15, 29.1), pt(0.02, 0.25, 29.1), pt(-0.14, 0.15, 29.1)], rustColor);

  // 7. Wasteland Debris & Glass Specks
  speckle(ctx, cx - 48, baseY - 14, 96, 36, 26, ['rgba(195,210,200,0.22)', 'rgba(30,34,32,0.45)', 'rgba(110,85,45,0.28)'], rnd, 1.4);

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
  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(37, 122, 12, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Weathered metal pole
  ctx.fillStyle = '#424845';
  ctx.fillRect(35, 38, 4, 84);
  ctx.fillStyle = '#2e3330';
  ctx.fillRect(37, 38, 2, 84);
  ctx.fillStyle = '#555b57';
  ctx.fillRect(30, 118, 14, 4);

  if (variant === 0) {
    // Blue rectangular One-Way / Street direction sign
    ctx.fillStyle = '#244158';
    ctx.fillRect(10, 14, 54, 32);
    ctx.strokeStyle = '#cdd6de';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(12, 16, 50, 28);
    // White arrow
    ctx.fillStyle = '#e4ebf0';
    ctx.beginPath();
    ctx.moveTo(22, 30);
    ctx.lineTo(42, 30);
    ctx.lineTo(42, 25);
    ctx.lineTo(50, 30);
    ctx.lineTo(42, 35);
    ctx.lineTo(42, 30);
    ctx.closePath();
    ctx.fill();
  } else if (variant === 1) {
    // Weathered Octagonal Red STOP sign
    const cx = 37, cy = 30, r = 20;
    ctx.fillStyle = '#8b201a';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + Math.PI / 8;
      const px = cx + r * Math.cos(a);
      const py = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#e8dcd5';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Letters
    ctx.fillStyle = '#f2ece8';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STOP', cx, cy + 1);
  } else {
    // Yellow diamond warning sign (Road hazard / caution)
    const cx = 37, cy = 30, size = 18;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#c9961a';
    ctx.fillRect(-size, -size, size * 2, size * 2);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.strokeRect(-size + 2, -size + 2, size * 2 - 4, size * 2 - 4);
    ctx.restore();

    // Exclamation mark
    ctx.fillStyle = '#1e1c18';
    ctx.beginPath();
    ctx.fillRect(35, 19, 4, 14);
    ctx.arc(37, 39, 2.5, 0, Math.PI * 2);
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
  // Realistic isometric mattress resting directly on the bed frame
  isoBox(ctx, 52, 51, 35, 17, 6, { top: '#8a8570', left: '#736f5c', right: '#5c5948', outline: 'rgba(25,23,18,0.4)' });
  // Blanket on mattress
  isoBox(ctx, 60, 50, 22, 16, 7, { top: '#4a5342', left: '#3d4436', right: '#2f3429', outline: 'rgba(20,24,18,0.4)' });
  // Pillow on mattress
  isoBox(ctx, 42, 47, 10, 13, 5, { top: '#a8a28e', left: '#8d8876', right: '#706c5d', outline: 'rgba(30,28,22,0.3)' });
  speckle(ctx, 22, 24, 60, 30, 18, ['rgba(50,45,35,0.3)'], rnd, 1.1);
  return canvas;
}

function makeSofa(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(102, 82);
  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(51, 66, 38, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  const pal = {
    baseTop: '#3b2f24', baseLeft: '#2c2218', baseRight: '#1e1710',
    backTop: '#584635', backLeft: '#463729', backRight: '#35291e',
    seatTop: '#634f3c', seatLeft: '#524030', seatRight: '#3e3023',
    seatTopB: '#5c4937', seatLeftB: '#4d3c2c', seatRightB: '#392c1f',
    armTop: '#544232', armLeft: '#443527', armRight: '#33271c',
    armTopB: '#4c3a2b', armLeftB: '#3d2e21', armRightB: '#2c2016',
    crease: 'rgba(25,18,12,0.5)', outline: 'rgba(18,13,8,0.45)'
  };

  // 1. Base frame / lower plinth
  isoBox(ctx, 51, 64, 32, 16, 8, { top: pal.baseTop, left: pal.baseLeft, right: pal.baseRight, outline: pal.outline });

  // 2. Backrest: running along the back (top-left) edge
  isoBox(ctx, 44, 53, 31, 7, 20, { top: pal.backTop, left: pal.backLeft, right: pal.backRight, outline: pal.outline });
  // Backrest vertical tufting seams
  ctx.fillStyle = pal.crease;
  ctx.fillRect(36, 32, 1.2, 14);
  ctx.fillRect(52, 36, 1.2, 14);

  // 3. Seat cushions: resting on base in front of backrest
  // Cushion 1 (left)
  isoBox(ctx, 44, 61, 14, 11, 6, { top: pal.seatTop, left: pal.seatLeft, right: pal.seatRight, outline: pal.outline });
  // Cushion 2 (right)
  isoBox(ctx, 58, 54, 14, 11, 6, { top: pal.seatTopB, left: pal.seatLeftB, right: pal.seatRightB, outline: pal.outline });

  // Cushion center seam / piping
  ctx.strokeStyle = pal.crease;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(51, 52); ctx.lineTo(51, 64);
  ctx.stroke();

  // 4. Armrests on left and right ends
  // Left armrest
  isoBox(ctx, 31, 65, 5, 15, 13, { top: pal.armTop, left: pal.armLeft, right: pal.armRight, outline: pal.outline });
  // Right armrest
  isoBox(ctx, 70, 46, 5, 14, 13, { top: pal.armTopB, left: pal.armLeftB, right: pal.armRightB, outline: pal.outline });

  // Subtle wear highlights / grime
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(40, 52, 6, 2);
  ctx.fillRect(56, 46, 6, 2);
  return canvas;
}

function makeTable(): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(90, 72);
  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(45, 55, 28, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // 4 Wooden legs
  ctx.fillStyle = '#2f241a';
  ctx.fillRect(44, 43, 2.5, 9);
  ctx.fillRect(23, 49, 2.5, 10);
  ctx.fillRect(65, 49, 2.5, 10);
  ctx.fillStyle = '#443425';
  ctx.fillRect(44, 55, 2.5, 10);

  // Elevated tabletop slab
  isoBox(ctx, 45, 44, 25, 12, 3, {
    top: '#634f3b',
    left: '#4e3d2c',
    right: '#3a2d1f',
    outline: 'rgba(22,16,10,0.5)'
  });

  // Tabletop wood planks/grain
  ctx.strokeStyle = 'rgba(35,26,16,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(33, 41); ctx.lineTo(57, 47);
  ctx.moveTo(25, 43); ctx.lineTo(49, 49);
  ctx.stroke();

  // Folded newspaper / magazine on table
  ctx.fillStyle = '#b8b29a';
  ctx.beginPath();
  ctx.moveTo(40, 39); ctx.lineTo(48, 37); ctx.lineTo(52, 42); ctx.lineTo(44, 44);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(40,40,35,0.6)';
  ctx.fillRect(43, 39, 5, 1);
  ctx.fillRect(44, 41, 4, 0.8);

  // Ceramic mug
  ctx.fillStyle = '#8f887b';
  ctx.beginPath();
  ctx.ellipse(36, 42, 2.5, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(34.5, 39, 3, 3);
  ctx.fillStyle = '#2b2319';
  ctx.beginPath();
  ctx.ellipse(36, 39, 1.8, 1, 0, 0, Math.PI * 2);
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
  const lower = name.toLowerCase();
  if (lower.includes('pharmacy') || lower.includes('аптек') || lower.includes('med')) {
    if (scene.textures.exists('sign_pharmacy')) return 'sign_pharmacy';
  } else if (lower.includes('market') || lower.includes('магаз') || lower.includes('продукт') || lower.includes('гастроном')) {
    if (scene.textures.exists('sign_market')) return 'sign_market';
  } else if (lower.includes('diner') || lower.includes('кафе')) {
    if (scene.textures.exists('sign_cafe')) return 'sign_cafe';
  } else if (lower.includes('gun') || lower.includes('охот') || lower.includes('оружи')) {
    if (scene.textures.exists('sign_gun')) return 'sign_gun';
  }

  const cached = signCache.get(name);
  if (cached && scene.textures.exists(cached)) return cached;
  const key = `sign_${hashString(name).toString(36)}`;
  if (scene.textures.exists(key)) {
    signCache.set(name, key);
    return key;
  }
  const { canvas, ctx } = makeCanvas(140, 72);
  const rnd = mulberry(hashString(name));

  let theme: SignTheme;
  if (lower.includes('pharmacy') || lower.includes('аптек') || lower.includes('med')) {
    theme = {
      bgTop: '#1a2b22',
      bgMid: '#121e18',
      bgBot: '#0b130f',
      border: 'rgba(80, 160, 115, 0.65)',
      textColor: '#e0f0e6',
      accentColor: '#3ea872',
      fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
      hasCross: true,
    };
  } else if (lower.includes('market') || lower.includes('магаз') || lower.includes('продукт') || lower.includes('гастроном') || lower.includes('универмаг') || lower.includes('quick stop')) {
    theme = {
      bgTop: '#3e201c',
      bgMid: '#2d1614',
      bgBot: '#1d0d0c',
      border: 'rgba(215, 155, 65, 0.65)',
      textColor: '#fae6cb',
      accentColor: '#cf9535',
      fontFamily: 'Georgia, "Times New Roman", serif',
      hasTrim: true,
    };
  } else if (lower.includes('diner') || lower.includes('кафе') || lower.includes('заря') || lower.includes('рыболов') || lower.includes('laundromat') || lower.includes('tackle')) {
    theme = {
      bgTop: '#332014',
      bgMid: '#24150c',
      bgBot: '#160c07',
      border: 'rgba(220, 135, 45, 0.65)',
      textColor: '#f5d49e',
      accentColor: '#d6751c',
      fontFamily: '"Impact", "Arial Black", sans-serif',
      hasTrim: true,
    };
  } else if (lower.includes('gun') || lower.includes('pawn') || lower.includes('hardware') || lower.includes('оружи') || lower.includes('охот') || lower.includes('хозтовар')) {
    theme = {
      bgTop: '#292e34',
      bgMid: '#1e2226',
      bgBot: '#141619',
      border: 'rgba(165, 170, 180, 0.6)',
      textColor: '#e0e4e8',
      accentColor: '#cca238',
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
      bgTop: '#282622',
      bgMid: '#1d1b18',
      bgBot: '#12110f',
      border: 'rgba(195, 150, 45, 0.65)',
      textColor: '#e4decb',
      accentColor: '#c28e20',
      fontFamily: '"Consolas", monospace, sans-serif',
      hasHazard: true,
    };
  } else {
    theme = {
      bgTop: '#322c22',
      bgMid: '#241e17',
      bgBot: '#16130d',
      border: 'rgba(190, 165, 115, 0.55)',
      textColor: '#e8dcbf',
      accentColor: '#b59253',
      fontFamily: 'Georgia, "Times New Roman", serif',
      hasTrim: true,
    };
  }

  // Draw plaque in ISOMETRIC perspective matching the South facade
  ctx.save();
  ctx.setTransform(0.5, 0.25, 0, 1, 10, 12);

  // Drop shadow against facade
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(2, 4, 118, 32);

  // Enamel metal plaque
  const grad = ctx.createLinearGradient(0, 2, 0, 34);
  grad.addColorStop(0, theme.bgTop);
  grad.addColorStop(0.5, theme.bgMid);
  grad.addColorStop(1, theme.bgBot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 2, 116, 30);

  // Rusted metal frame
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(0, 2, 116, 30);

  if (theme.hasTrim) {
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(3, 5, 110, 24);
  }

  // Mounting bolts
  const bolts = [
    [4, 6],
    [112, 6],
    [4, 28],
    [112, 28],
  ];
  for (const [bx, by] of bolts) {
    ctx.fillStyle = '#111314';
    ctx.beginPath();
    ctx.arc(bx, by, 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#656b6e';
    ctx.beginPath();
    ctx.arc(bx - 0.3, by - 0.3, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  let textX = 58;
  let maxTextW = 100;

  if (theme.hasCross) {
    textX = 64;
    maxTextW = 88;
    ctx.fillStyle = '#3ea872';
    ctx.fillRect(10, 13, 10, 8);
    ctx.fillRect(11.5, 10, 7, 14);
  }

  let cleanTitle = name.toUpperCase();
  if (lower.includes('pharmacy') || lower.includes('аптек') || lower.includes('med')) {
    cleanTitle = 'АПТЕКА';
  } else if (lower.includes('market') || lower.includes('магаз') || lower.includes('продукт') || lower.includes('гастроном')) {
    cleanTitle = 'ПРОДУКТЫ';
  } else if (lower.includes('diner') || lower.includes('кафе')) {
    cleanTitle = 'КАФЕ';
  } else if (lower.includes('gun') || lower.includes('охот') || lower.includes('оружи')) {
    cleanTitle = 'ОХОТНИК';
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let fontSize = 13.5;
  ctx.font = `700 ${fontSize}px ${theme.fontFamily}`;
  while (fontSize > 8.5 && ctx.measureText(cleanTitle).width > maxTextW) {
    fontSize -= 0.6;
    ctx.font = `700 ${fontSize.toFixed(1)}px ${theme.fontFamily}`;
  }

  // Chipped paint text shadow
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillText(cleanTitle, textX + 0.8, 17.8);
  // Stenciled text fill
  ctx.fillStyle = theme.textColor;
  ctx.fillText(cleanTitle, textX, 17);

  // Rust drips running down
  for (let i = 0; i < 4; i++) {
    const rx = 12 + rnd() * 92;
    ctx.fillStyle = 'rgba(100,55,25,0.45)';
    ctx.fillRect(rx, 32, 1.4, 3 + rnd() * 8);
  }
  // Enamel chips
  speckle(ctx, 4, 4, 108, 26, 8, ['rgba(10,12,12,0.4)', 'rgba(90,50,20,0.3)'], rnd, 1);

  ctx.restore();

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

function makeDoor(facing: 'south' | 'east' = 'south', open = false, _cutaway = false): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(64, 88);
  const rnd = mulberry(open ? 402 : 401);

  ctx.save();
  if (facing === 'south') {
    // Left face frame (facing camera along South-East axis)
    ctx.setTransform(0.5, 0.25, 0, 1, 0, 16);
  } else {
    // Right face frame (facing camera along South-West axis)
    ctx.setTransform(0.5, -0.25, 0, 1, 32, 32);
  }

  // Wall surround
  ctx.fillStyle = '#3a342c';
  ctx.fillRect(0, 0, 64, 56);

  // Door opening architrave / jamb
  ctx.fillStyle = '#221e1a';
  ctx.fillRect(14, 2, 36, 54);

  // Lintel highlight
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(14, 2, 36, 2);

  if (!open) {
    // Closed Door leaf
    const wood = ctx.createLinearGradient(16, 0, 48, 0);
    wood.addColorStop(0, '#4a3826');
    wood.addColorStop(0.5, '#5c4630');
    wood.addColorStop(1, '#3a2b1d');
    ctx.fillStyle = wood;
    ctx.fillRect(16, 4, 32, 52);

    // Weathered panels
    ctx.strokeStyle = 'rgba(20,15,10,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 9, 24, 18);
    ctx.strokeRect(20, 31, 24, 21);

    // Brass knob/handle & keyhole
    ctx.fillStyle = '#b39556';
    ctx.beginPath();
    ctx.arc(43, 30, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1a140d';
    ctx.fillRect(42.2, 33, 1.6, 3.5);

    // Weathering/scratches
    speckle(ctx, 16, 4, 32, 52, 12, ['rgba(15,10,6,0.35)', 'rgba(110,75,40,0.25)'], rnd, 1);
  } else {
    // Open doorway: clear opening so interior/exterior and players are visible!
    ctx.clearRect(16, 4, 32, 50);

    // Thin threshold sill on floor
    ctx.fillStyle = '#1e1c18';
    ctx.fillRect(16, 54, 32, 2);

    // Swung open door leaf resting inside along the jamb
    ctx.fillStyle = '#3e2e1e';
    ctx.beginPath();
    ctx.moveTo(16, 4);
    ctx.lineTo(8, 12);
    ctx.lineTo(8, 54);
    ctx.lineTo(16, 56);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,10,5,0.6)';
    ctx.stroke();

    // Swung brass handle
    ctx.fillStyle = '#b39556';
    ctx.beginPath();
    ctx.arc(10, 32, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Thin architectural coping strip along top edge of wall
  ctx.save();
  if (facing === 'south') {
    ctx.setTransform(0.5, 0.25, -0.5, 0.25, 32, 0);
    ctx.fillStyle = '#2f2c27';
    ctx.fillRect(0, 60, 64, 4);
  } else {
    ctx.setTransform(0.5, 0.25, -0.5, 0.25, 32, 0);
    ctx.fillStyle = '#282521';
    ctx.fillRect(60, 0, 4, 64);
  }
  ctx.restore();

  // Subtle clean edge outlines
  ctx.strokeStyle = 'rgba(10,12,11,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (facing === 'south') {
    ctx.moveTo(0, 16);
    ctx.lineTo(32, 32);
    ctx.lineTo(32, 88);
    ctx.lineTo(0, 72);
  } else {
    ctx.moveTo(32, 32);
    ctx.lineTo(64, 16);
    ctx.lineTo(64, 72);
    ctx.lineTo(32, 88);
  }
  ctx.stroke();

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
      for (const ori of ['south', 'east', 'corner', 'back', 'corner_sw', 'corner_ne'] as const) {
        register(scene, `wall_${mat}_${ori}_${v}`, makeWallOriented(mat, ori, v));
        register(scene, `wall_${mat}_${ori}_cut_${v}`, makeWallCutaway(mat, ori, v));
      }
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
  for (const facing of ['south', 'east'] as const) {
    register(scene, `door_${facing}_closed`, makeDoor(facing, false, false));
    register(scene, `door_${facing}_open`, makeDoor(facing, true, false));
    register(scene, `door_${facing}_cut_closed`, makeDoor(facing, false, true));
    register(scene, `door_${facing}_cut_open`, makeDoor(facing, true, true));
  }
  register(scene, 'door_closed', makeDoor('south', false, false));
  register(scene, 'door_open', makeDoor('south', true, false));
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

export function wallTextureKey(
  material: number,
  tx: number,
  ty: number,
  style: number,
  interior: boolean,
  orientation: WallOrientation = 'south',
  cutaway = false,
): string {
  const cut = cutaway ? 'cut_' : '';
  if (material === 4) return `wall_interior_${orientation}_${cut}${Math.floor(hash2(tx, ty, 5) * 3)}`;
  const mat: WallMat = material === 3 ? 'industrial' : material === 2 ? 'concrete' : 'brick';
  const h = hash2(tx, ty, material);
  let variant = 0;
  if (h > 0.42) variant = 1;
  if (h > 0.78) variant = 2;
  if (h > 0.9) variant = 3;
  if (h > 0.95) variant = 4;
  if (style === 1 && h > 0.62 && h < 0.74) variant = 5;
  return `wall_${mat}_${orientation}_${cut}${variant}`;
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
  sign_pharmacy: { ox: 0.5, oy: 1.0 },
  sign_market: { ox: 0.5, oy: 1.0 },
  sign_cafe: { ox: 0.5, oy: 1.0 },
  sign_gun: { ox: 0.5, oy: 1.0 },
};

export function propAnchor(key: string): PropAnchor {
  return ANCHORS[key] ?? { ox: 0.5, oy: 0.8 };
}
