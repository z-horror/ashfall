import Phaser from 'phaser';
import { makeCanvas, rgba, shade } from './util.js';

const FRAME_W = 64;
const FRAME_H = 88;
const COLS = 12;
const DIRS = 8;
export const CHARACTER_ATLAS = 'char_atlas';
const SHEET_W = FRAME_W * COLS;
const SHEET_H = FRAME_H * DIRS;
const ATLAS_COLS = 4;
const ATLAS_ROWS = 2;

interface CharStyle {
  id: string;
  skin: string;
  hair: string;
  jacket: string;
  shirt: string;
  pants: string;
  shoes: string;
  bag?: string;
  hat?: string;
  beard?: boolean;
  scarf?: string;
  zombie?: boolean;
  scale: number;
  gore: number;
}

export const PLAYER_STYLES: CharStyle[] = [
  { id: 'p0', skin: '#a98263', hair: '#2f2620', jacket: '#4d5544', shirt: '#7b7462', pants: '#3d4045', shoes: '#242322', beard: true, scale: 1, gore: 0 },
  { id: 'p1', skin: '#c19a77', hair: '#5a3d28', jacket: '#5d4736', shirt: '#9c8e79', pants: '#4b4a42', shoes: '#2b2724', bag: '#3d3a2f', scale: 1.02, gore: 0 },
  { id: 'p2', skin: '#8f6b4f', hair: '#171a1c', jacket: '#38444f', shirt: '#6f7b80', pants: '#35383b', shoes: '#202020', hat: '#2b3238', scarf: '#7c4b3a', scale: 0.98, gore: 0 },
  { id: 'p3', skin: '#b08a68', hair: '#6d4a2f', jacket: '#5b3436', shirt: '#8a6e5e', pants: '#33322f', shoes: '#1f1d1b', hat: '#3c3428', bag: '#4a4133', scale: 1.01, gore: 0 },
];

export const ZOMBIE_STYLES: CharStyle[] = [
  { id: 'z0', skin: '#7d8b78', hair: '#3a332a', jacket: '#5a5249', shirt: '#786e60', pants: '#3f3e38', shoes: '#272624', zombie: true, scale: 1, gore: 1 },
  { id: 'z1', skin: '#8b8f7d', hair: '#2f2b25', jacket: '#6a4038', shirt: '#8a7c68', pants: '#42403a', shoes: '#262421', zombie: true, scale: 0.94, gore: 1.3 },
  { id: 'z2', skin: '#74806f', hair: '#211f1b', jacket: '#3e4344', shirt: '#6f6a5e', pants: '#353632', shoes: '#20201e', zombie: true, scale: 1.16, gore: 1.6 },
];

const DIR_ANGLES = [0, Math.PI / 4, Math.PI / 2, (Math.PI * 3) / 4, Math.PI, (Math.PI * 5) / 4, (Math.PI * 3) / 2, (Math.PI * 7) / 4];

function drawLimb(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w1: number,
  w2: number,
  color: string,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * w1, y1 + ny * w1);
  ctx.lineTo(x2 + nx * w2, y2 + ny * w2);
  ctx.arc(x2, y2, w2, Math.atan2(dy, dx) - Math.PI / 2, Math.atan2(dy, dx) + Math.PI / 2);
  ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
  ctx.arc(x1, y1, w1, Math.atan2(dy, dx) + Math.PI / 2, Math.atan2(dy, dx) + Math.PI * 1.5);
  ctx.closePath();
  ctx.fill();
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  style: CharStyle,
  headX: number,
  headY: number,
  front: number,
  side: number,
  zombie: boolean,
): void {
  const r = style.zombie && style.scale > 1.1 ? 8.6 : 7.6;
  // neck
  ctx.fillStyle = shade(style.skin, -0.3);
  ctx.fillRect(headX - 2.2, headY + 5, 4.6, 6);
  // head base
  const grad = ctx.createLinearGradient(headX - r, headY - r, headX + r, headY + r);
  grad.addColorStop(0, shade(style.skin, 0.16));
  grad.addColorStop(0.55, style.skin);
  grad.addColorStop(1, shade(style.skin, -0.28));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(headX, headY, r * 0.92, r, 0, 0, Math.PI * 2);
  ctx.fill();
  // jaw
  ctx.fillStyle = shade(style.skin, -0.12);
  ctx.beginPath();
  ctx.ellipse(headX + side * 0.8, headY + r * 0.55, r * 0.62, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  if (front > -0.25) {
    // brow and eye sockets
    const eyeY = headY - 1;
    if (front > 0.15) {
      ctx.fillStyle = zombie ? '#181c16' : 'rgba(26,22,18,0.9)';
      ctx.beginPath();
      ctx.ellipse(headX - 2.7 + side * 0.6, eyeY, 1.05, zombie ? 1.25 : 0.8, 0, 0, Math.PI * 2);
      ctx.ellipse(headX + 2.7 + side * 0.6, eyeY, 1.05, zombie ? 1.25 : 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      if (zombie) {
        ctx.fillStyle = 'rgba(120, 28, 20, 0.65)';
        ctx.beginPath();
        ctx.ellipse(headX - 2.7, eyeY + 1.2, 1.1, 0.55, 0, 0, Math.PI * 2);
        ctx.ellipse(headX + 2.7, eyeY + 1.2, 1.1, 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // nose
      ctx.fillStyle = rgba(shade(style.skin, -0.4), 0.75);
      ctx.fillRect(headX + side * 0.4 - 0.5, eyeY + 1.5, 1.1, 2.2);
      // mouth
      ctx.strokeStyle = zombie ? 'rgba(58,14,12,0.9)' : 'rgba(64,38,32,0.7)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(headX - 2 + side * 0.5, headY + 4.2);
      ctx.quadraticCurveTo(headX + side * 0.5, headY + 5.2, headX + 2.3 + side * 0.5, headY + 4);
      ctx.stroke();
      if (zombie) {
        ctx.fillStyle = 'rgba(96,20,16,0.8)';
        ctx.beginPath();
        ctx.ellipse(headX + 1, headY + 5.6, 1.6, 1.1, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      if (style.beard) {
        ctx.fillStyle = rgba(style.hair, 0.85);
        ctx.beginPath();
        ctx.ellipse(headX + side * 0.4, headY + 4.6, 4.2, 2.6, 0, 0, Math.PI);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(24,20,16,0.85)';
      const ex = headX + (side > 0 ? 2.9 : -2.9);
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, 0.9, 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(shade(style.skin, -0.35), 0.7);
      ctx.beginPath();
      ctx.ellipse(headX + side * 7.4, headY + 1, 1.1, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // hair / hat
  if (style.hat) {
    ctx.fillStyle = style.hat;
    ctx.beginPath();
    ctx.ellipse(headX, headY - r * 0.55, r * 0.98, r * 0.55, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(headX - r * 0.98, headY - r * 0.62, r * 1.96, 2);
    ctx.fillStyle = shade(style.hat, 0.12);
    ctx.fillRect(headX - r * 0.78, headY - r * 0.75, r * 1.56, 2.2);
  } else {
    ctx.fillStyle = style.hair;
    ctx.beginPath();
    ctx.ellipse(headX, headY - r * 0.38, r * 0.94, r * 0.7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    if (front < -0.2) {
      ctx.beginPath();
      ctx.ellipse(headX, headY, r * 0.9, r * 0.95, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(headX, headY - r * 0.5, r * 0.9, r * 0.5, 0, 0, Math.PI);
      ctx.fill();
      if (side > 0.2) {
        ctx.beginPath();
        ctx.ellipse(headX - r * 0.8, headY - r * 0.1, 2.2, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (style.scarf) {
    ctx.fillStyle = style.scarf;
    ctx.fillRect(headX - 5.5, headY + 6.5, 11, 3);
    ctx.fillStyle = shade(style.scarf, -0.2);
    ctx.fillRect(headX + 2, headY + 8, 3.5, 5);
  }
  // grime / blood
  if (zombie) {
    ctx.fillStyle = 'rgba(74,16,14,0.55)';
    ctx.beginPath();
    ctx.ellipse(headX - 2 + side * 2, headY + 1.5, 1.4, 0.8, -0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCorpseShape(
  ctx: CanvasRenderingContext2D,
  style: CharStyle,
  alpha = 1,
): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(60, 10, 8, 0.5)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 22, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.rotate(-0.35);
  ctx.fillStyle = shade(style.jacket, -0.2);
  ctx.beginPath();
  ctx.ellipse(2, -4, 15, 6, 0.05, 0, Math.PI * 2);
  ctx.fill();
  drawLimb(ctx, 12, -2, 24, 2, 3, 2.4, style.pants);
  drawLimb(ctx, 11, -5, 23, -8, 2.8, 2.2, style.pants);
  drawLimb(ctx, -9, -5, -20, -1, 2.6, 2, style.jacket);
  ctx.fillStyle = style.skin;
  ctx.beginPath();
  ctx.ellipse(-16, -8, 5.4, 4.8, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = style.hair;
  ctx.beginPath();
  ctx.ellipse(-17, -10, 5, 3.4, 0.2, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  style: CharStyle,
  angle: number,
  frame: number,
): void {
  ctx.clearRect(0, 0, FRAME_W, FRAME_H);
  ctx.save();
  ctx.translate(FRAME_W / 2, 82);
  ctx.scale(style.scale, style.scale);

  const zombie = !!style.zombie;
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  const front = fy;
  const side = fx;
  const walking = frame < 6;
  const attacking = frame >= 6 && frame < 9;
  const dying = frame >= 9;
  const phase = walking ? (frame / 6) * Math.PI * 2 : 0;
  const atk = attacking ? (frame - 6) / 3 : 0;
  const deathT = dying ? (frame - 9) / 3 : 0;
  const bob = walking ? Math.abs(Math.sin(phase)) * 1.4 : Math.sin(Date.now() / 700) * 0.25;

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 10, 4.1, 0, 0, Math.PI * 2);
  ctx.fill();

  if (dying) {
    ctx.save();
    if (deathT > 0.7) {
      drawCorpseShape(ctx, style, 1);
    } else {
      ctx.rotate(deathT * 1.35 * (side >= 0 ? 1 : -1));
      ctx.translate(0, deathT * 6);
      ctx.globalAlpha = 1 - deathT * 0.25;
      drawBody(ctx, style, angle, front, side, phase, bob, 0, true, deathT);
    }
    ctx.restore();
    ctx.restore();
    return;
  }

  drawBody(ctx, style, angle, front, side, phase, bob, attacking ? atk : -1, zombie, 0);
  ctx.restore();
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  style: CharStyle,
  angle: number,
  front: number,
  side: number,
  phase: number,
  bob: number,
  attack: number,
  zombie: boolean,
  deathT: number,
): void {
  const swing = Math.sin(phase) * (zombie ? 2.4 : 4);
  const armSwing = -Math.sin(phase) * (zombie ? 2 : 3);
  const lean = zombie ? 1.5 : 0;
  const atkExtend = attack >= 0 ? Math.sin(Math.min(1, attack) * Math.PI) * 1 : 0;
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  const farLeft = side >= 0;

  // far leg
  const legFarX = (farLeft ? -1 : 1) * 3.4 - swing * fx * 0.8;
  const legFarY = -26 + bob - Math.abs(swing) * 0.2;
  drawLimb(ctx, (farLeft ? -3 : 3), legFarY, legFarX, 0 - Math.abs(swing) * fy * 0.4, 3.1, 2.4, shade(style.pants, -0.16));
  ctx.fillStyle = shade(style.shoes, -0.1);
  ctx.beginPath();
  ctx.ellipse(legFarX, 0 - Math.abs(swing) * fy * 0.4, 3.2, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // near leg
  const legNearX = (farLeft ? 1 : -1) * 3.4 + swing * fx * 0.8;
  const legNearY = -26 + bob;
  drawLimb(ctx, (farLeft ? 3 : -3), legNearY, legNearX, -Math.abs(swing) * fy * 0.4, 3.1, 2.4, style.pants);
  ctx.fillStyle = style.shoes;
  ctx.beginPath();
  ctx.ellipse(legNearX, -Math.abs(swing) * fy * 0.4, 3.4, 1.7, 0, 0, Math.PI * 2);
  ctx.fill();

  // backpack (behind torso)
  if (style.bag && front < 0.4) {
    ctx.fillStyle = style.bag;
    ctx.beginPath();
    ctx.ellipse(-side * 1.5, -42 + bob - lean, 8.2, 10.5, 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(style.bag, -0.25);
    ctx.fillRect(-side * 1.5 - 5, -47 + bob, 10, 4);
  }

  // torso
  const torsoY = -28 + bob - lean;
  const torsoGrad = ctx.createLinearGradient(-10, torsoY - 25, 10, torsoY);
  torsoGrad.addColorStop(0, shade(style.jacket, 0.2));
  torsoGrad.addColorStop(0.5, style.jacket);
  torsoGrad.addColorStop(1, shade(style.jacket, -0.32));
  ctx.fillStyle = torsoGrad;
  ctx.beginPath();
  ctx.moveTo(-9.4, torsoY - 24);
  ctx.quadraticCurveTo(-10.8, torsoY - 12, -6.4, torsoY);
  ctx.quadraticCurveTo(0, torsoY + 2.5, 6.4, torsoY);
  ctx.quadraticCurveTo(10.8, torsoY - 12, 9.4, torsoY - 24);
  ctx.quadraticCurveTo(0, torsoY - 27.5, -9.4, torsoY - 24);
  ctx.closePath();
  ctx.fill();

  // shirt / chest
  ctx.fillStyle = style.shirt;
  ctx.beginPath();
  ctx.moveTo(-3.8, torsoY - 24.5);
  ctx.lineTo(3.8, torsoY - 24.5);
  ctx.lineTo(2, torsoY - 12);
  ctx.lineTo(0, torsoY - 9);
  ctx.lineTo(-2, torsoY - 12);
  ctx.closePath();
  ctx.fill();

  // jacket opening and zipper
  ctx.strokeStyle = shade(style.jacket, -0.42);
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, torsoY - 23);
  ctx.lineTo(0.6, torsoY - 1);
  ctx.stroke();
  ctx.strokeStyle = shade(style.jacket, 0.1);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-7.6, torsoY - 20);
  ctx.quadraticCurveTo(-5, torsoY - 21, -3.4, torsoY - 19);
  ctx.moveTo(7.6, torsoY - 20);
  ctx.quadraticCurveTo(5, torsoY - 21, 3.4, torsoY - 19);
  ctx.stroke();

  // belt
  ctx.fillStyle = '#2b2723';
  ctx.fillRect(-6.2, torsoY - 1.5, 12.4, 2.6);
  ctx.fillStyle = '#8b7a52';
  ctx.fillRect(-1.2, torsoY - 1.6, 2.4, 2.8);

  // pockets
  ctx.fillStyle = shade(style.jacket, -0.18);
  ctx.fillRect(-6.8, torsoY - 8, 4.4, 4.2);
  ctx.fillRect(2.4, torsoY - 8, 4.4, 4.2);

  // blood / grime on clothing
  if (zombie) {
    ctx.fillStyle = `rgba(84,17,14,${0.35 * style.gore})`;
    ctx.beginPath();
    ctx.ellipse(-3 + side * 2, torsoY - 12, 4.2, 2.4, 0.4, 0, Math.PI * 2);
    ctx.ellipse(3, torsoY - 5, 2.6, 1.5, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // far arm
  const shoulderY = torsoY - 22;
  const farSide = farLeft ? -1 : 1;
  const fHandX = farSide * 9 + armSwing * fx;
  const fHandY = shoulderY + 15 + armSwing * fy * 0.5;
  drawLimb(ctx, farSide * 8.6, shoulderY, fHandX, fHandY, 3.1, 2.1, shade(style.jacket, -0.22));
  ctx.fillStyle = shade(style.skin, -0.25);
  ctx.beginPath();
  ctx.arc(fHandX, fHandY + 1, 1.9, 0, Math.PI * 2);
  ctx.fill();

  // near arm
  const nearSide = farLeft ? 1 : -1;
  let nHandX = nearSide * 9.2 - armSwing * fx;
  let nHandY = shoulderY + 15 - armSwing * fy * 0.5;
  if (zombie) {
    nHandX = nearSide * 5 + fx * 9;
    nHandY = shoulderY + 5 + fy * 4;
  }
  if (attack >= 0) {
    nHandX = nearSide * 5 + fx * (9 + atkExtend * 8);
    nHandY = shoulderY + 6 + fy * (5 + atkExtend * 3);
  }
  drawLimb(ctx, nearSide * 8.6, shoulderY, nHandX, nHandY, 3.2, 2.2, style.jacket);
  ctx.fillStyle = style.skin;
  ctx.beginPath();
  ctx.arc(nHandX, nHandY + 1, 2, 0, Math.PI * 2);
  ctx.fill();

  // weapon during attack
  if (attack >= 0) {
    ctx.save();
    ctx.translate(nHandX, nHandY);
    const swingA = attack * 1.1 - 0.55;
    ctx.rotate(Math.atan2(fy, fx) + (side >= 0 ? swingA : -swingA));
    ctx.fillStyle = '#6d5034';
    ctx.fillRect(0, -1.2, 17, 2.7);
    ctx.fillStyle = '#3f2f21';
    ctx.fillRect(-2, -1.6, 4, 3.4);
    ctx.fillStyle = 'rgba(210,210,200,0.12)';
    ctx.fillRect(7, 0.4, 10, 0.8);
    ctx.restore();
  }

  // head
  const headY = torsoY - 30 + bob * 0.2;
  drawHead(ctx, style, fx * 1.4, headY, front, side, zombie);

  // backpack straps when facing the camera
  if (style.bag && front > 0.4) {
    ctx.strokeStyle = shade(style.bag, -0.3);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-6, torsoY - 22);
    ctx.lineTo(-4, torsoY - 4);
    ctx.moveTo(6, torsoY - 22);
    ctx.lineTo(4, torsoY - 4);
    ctx.stroke();
  }
}

function createSheet(style: CharStyle): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(FRAME_W * COLS, FRAME_H * DIRS);
  for (let dir = 0; dir < DIRS; dir++) {
    for (let frame = 0; frame < COLS; frame++) {
      const pair = makeCanvas(FRAME_W, FRAME_H);
      drawCharacter(pair.ctx, style, DIR_ANGLES[dir], frame);
      ctx.drawImage(pair.canvas, frame * FRAME_W, dir * FRAME_H);
    }
  }
  return canvas;
}

export const CORPSE_KEYS = ['corpse_p0', 'corpse_p1', 'corpse_p2', 'corpse_p3', 'corpse_z0', 'corpse_z1', 'corpse_z2'];

export function buildCharacterAssets(scene: Phaser.Scene): void {
  const all = [...PLAYER_STYLES, ...ZOMBIE_STYLES];
  const { canvas: atlas, ctx: atlasCtx } = makeCanvas(SHEET_W * ATLAS_COLS, SHEET_H * ATLAS_ROWS);

  // Draw every frame straight into the atlas. Creating a temporary canvas per
  // frame is surprisingly slow on low-end machines and in software renderers.
  for (let index = 0; index < all.length; index++) {
    const style = all[index];
    const ox = (index % ATLAS_COLS) * SHEET_W;
    const oy = Math.floor(index / ATLAS_COLS) * SHEET_H;

    const sheetKey = `sheet_${style.id}`;
    if (scene.textures.exists(sheetKey)) {
      const srcImg = scene.textures.get(sheetKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      atlasCtx.drawImage(srcImg, ox, oy);
    } else {
      for (let dir = 0; dir < DIRS; dir++) {
        for (let frame = 0; frame < COLS; frame++) {
          atlasCtx.save();
          atlasCtx.translate(ox + frame * FRAME_W, oy + dir * FRAME_H);
          drawCharacter(atlasCtx, style, DIR_ANGLES[dir], frame);
          atlasCtx.restore();
        }
      }
    }

    if (!scene.textures.exists(`corpse_${style.id}`)) {
      const corpse = makeCanvas(110, 70);
      const c = corpse.ctx;
      c.translate(55, 42);
      c.scale(1.7, 1.7);
      drawCorpseShape(c, style, 1);
      scene.textures.addCanvas(`corpse_${style.id}`, corpse.canvas);
    }
  }

  const tex = scene.textures.addCanvas(CHARACTER_ATLAS, atlas);
  if (!tex) {
    console.error('[ashfall] could not create character atlas');
    return;
  }
  for (let index = 0; index < all.length; index++) {
    const style = all[index];
    const ox = (index % ATLAS_COLS) * SHEET_W;
    const oy = Math.floor(index / ATLAS_COLS) * SHEET_H;
    for (let dir = 0; dir < DIRS; dir++) {
      for (let col = 0; col < COLS; col++) {
        tex.add(
          `${style.id}:${dir * COLS + col}`,
          0,
          ox + col * FRAME_W,
          oy + dir * FRAME_H,
          FRAME_W,
          FRAME_H,
        );
      }
    }
  }

  for (const style of all) {
    const key = `char_${style.id}`;
    for (let dir = 0; dir < DIRS; dir++) {
      const base = dir * COLS;
      const frames = (from: number, length: number) =>
        Array.from({ length }, (_, i) => ({ key: CHARACTER_ATLAS, frame: `${style.id}:${base + from + i}` }));
      scene.anims.create({
        key: `${key}-walk-${dir}`,
        frames: frames(0, 6),
        frameRate: style.zombie ? 6 : 9,
        repeat: -1,
      });
      scene.anims.create({
        key: `${key}-idle-${dir}`,
        frames: [{ key: CHARACTER_ATLAS, frame: `${style.id}:${base}` }],
        frameRate: 1,
        repeat: -1,
      });
      scene.anims.create({
        key: `${key}-attack-${dir}`,
        frames: frames(6, 3),
        frameRate: 13,
        repeat: 0,
      });
      scene.anims.create({
        key: `${key}-death-${dir}`,
        frames: frames(9, 3),
        frameRate: 5,
        repeat: 0,
      });
    }
  }
}

export function playerSheetFor(variant: number): string {
  return `char_${PLAYER_STYLES[variant % PLAYER_STYLES.length].id}`;
}

export function initialFrame(sheet: string, dir = 0): string {
  return `${sheet.replace('char_', '')}:${dir * COLS}`;
}

export function zombieSheetFor(type: number, id?: string): string {
  const t = Math.max(0, Math.min(2, Math.floor(type || 0)));
  return `char_${ZOMBIE_STYLES[t].id}`;
}

export function corpseFor(kind: 'player' | 'zombie', typeOrVariant: number, id?: string): string {
  if (kind === 'player') return `corpse_p${typeOrVariant % 4}`;
  const t = Math.max(0, Math.min(2, Math.floor(typeOrVariant || 0)));
  return `corpse_z${t}`;
}
