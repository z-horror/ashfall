import Phaser from 'phaser';
import { artImage } from '../art/textures.js';
import {
  OBJECT_TEMPLATES,
  PX_PER_METER,
  TILE_SIZE_M,
  openingCenter,
  runPointAtM,
  solidIntervals,
  worldToScreen,
  type BuildingSpec,
  type DoorState,
  type FloorSpec,
  type ObjectInstance,
  type ObjectState,
  type OpeningSpec,
  type WallRun,
  type WindowState,
  type StairSpec,
  TILE_W,
  cutWallIds,
  foundationVisible,
  mansardRoofVisible,
  terraceRoofVisible,
  wallIsExterior,
} from '@ashfall/shared';
import { InteriorView } from './interiorView.js';
import { StairShaftView } from './stairShaftView.js';

const FLOOR_BAND = 10_000;

function imageOccludes(
  img: Phaser.GameObjects.Image | undefined,
  sx: number,
  sy: number,
  depth: number,
): boolean {
  if (!img || !img.visible || img.depth <= depth) return false;
  const bounds = img.getBounds();
  return sx >= bounds.x && sx <= bounds.right && sy >= bounds.y && sy <= bounds.bottom;
}

function materialColors(material: string): { face: number; top: number; cut: number } {
  switch (material) {
    case 'interior':
      return { face: 0x8b7c6c, top: 0x6e5843, cut: 0x5a4a3a };
    case 'concrete':
      return { face: 0x6e706c, top: 0x787a76, cut: 0x4a4c49 };
    case 'industrial':
      return { face: 0x6d7774, top: 0x525b58, cut: 0x5f6965 };
    default:
      // Brick walls: architectural limestone coping cap (0x8c867a) on cutaway tops
      return { face: 0x7c3f30, top: 0x8c867a, cut: 0x5c3628 };
  }
}

function fillQuad(
  g: Phaser.GameObjects.Graphics,
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number },
  color: number,
  alpha = 1,
): void {
  g.fillStyle(color, alpha);
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.lineTo(c.x, c.y);
  g.lineTo(d.x, d.y);
  g.closePath();
  g.fillPath();
}

function drawWallPanel(
  g: Phaser.GameObjects.Graphics,
  run: WallRun,
  startM: number,
  widthM: number,
  zBottom: number,
  zTop: number,
  faceColor: number,
  topColor?: number,
): void {
  const half = run.thicknessM / 2;
  const s = startM / TILE_SIZE_M;
  const e = (startM + widthM) / TILE_SIZE_M;
  const isStart = startM <= 1e-4;
  const isEnd = startM + widthM >= (run.to - run.from) * TILE_SIZE_M - 1e-4;
  if (run.axis === 'h') {
    const x0 = run.from + s - (isStart ? half : 0);
    const x1 = run.from + e + (isEnd ? half : 0);
    const y0 = run.fixed + half;
    const y1 = run.fixed - half;
    const pF0 = worldToScreen(x0, y0, zTop);
    const pF1 = worldToScreen(x1, y0, zTop);
    // Front face
    fillQuad(
      g,
      worldToScreen(x0, y0, zBottom),
      worldToScreen(x1, y0, zBottom),
      pF1,
      pF0,
      faceColor,
    );
    // Top surface across wall thickness (limestone coping)
    fillQuad(
      g,
      worldToScreen(x0, y1, zTop),
      worldToScreen(x1, y1, zTop),
      pF1,
      pF0,
      topColor ?? faceColor,
      0.95,
    );
    // Crisp coping edge highlight
    g.lineStyle(1.5, 0x9e988c, 0.85);
    g.beginPath();
    g.moveTo(pF0.x, pF0.y);
    g.lineTo(pF1.x, pF1.y);
    g.strokePath();
  } else {
    const y0 = run.from + s - (isStart ? half : 0);
    const y1 = run.from + e + (isEnd ? half : 0);
    const x0 = run.fixed + half;
    const x1 = run.fixed - half;
    const pF0 = worldToScreen(x0, y0, zTop);
    const pF1 = worldToScreen(x0, y1, zTop);
    // Front face
    fillQuad(
      g,
      worldToScreen(x0, y0, zBottom),
      worldToScreen(x0, y1, zBottom),
      pF1,
      pF0,
      faceColor,
    );
    // Top surface across wall thickness
    fillQuad(
      g,
      worldToScreen(x1, y0, zTop),
      pF0,
      pF1,
      worldToScreen(x1, y1, zTop),
      topColor ?? faceColor,
      0.95,
    );
    // Crisp coping edge highlight
    g.lineStyle(1.5, 0x9e988c, 0.85);
    g.beginPath();
    g.moveTo(pF0.x, pF0.y);
    g.lineTo(pF1.x, pF1.y);
    g.strokePath();
  }
}

class WallPiece {
  private full: Phaser.GameObjects.Graphics;
  private cut: Phaser.GameObjects.Graphics;
  private image?: Phaser.GameObjects.Image;
  readonly run: WallRun;
  private startM: number;
  private endM: number;
  private floor: FloorSpec;
  private depth: number;
  private cutVisible = false;

  constructor(
    scene: Phaser.Scene,
    floor: FloorSpec,
    run: WallRun,
    startM: number,
    endM: number,
    zBottomM = 0,
    zTopM = run.heightM,
  ) {
    this.floor = floor;
    this.run = run;
    this.startM = startM;
    this.endM = endM;
    const zBot = floor.elevationM + zBottomM;
    const zTop = floor.elevationM + zTopM;
    const start = runPointAtM(run, startM);
    const end = runPointAtM(run, endM);
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    this.depth = midX + midY + FLOOR_BAND * floor.level + 0.35;
    this.full = scene.add.graphics().setDepth(this.depth);
    this.cut = scene.add.graphics().setDepth(this.depth);

    const colors = materialColors(run.material);
    // Draw solid wall panel with top face across thickness
    drawWallPanel(this.full, run, startM, endM - startM, zBot, zTop, colors.face, colors.top);

    // Cutaway base follows the same plinth scale for interior partitions.
    const cutHeight = run.material === 'interior' ? 0.22 : 0.5;
    const cutTop = Math.min(zTop, floor.elevationM + cutHeight);
    if (cutTop > zBot) {
      drawWallPanel(this.cut, run, startM, endM - startM, zBot, cutTop, colors.cut, colors.top);
    }
    this.cut.setVisible(false);

    // Pick texture key based on material and orientation
    let textureKey = 'gen_wall_brick_face';
    if (run.material === 'concrete') {
      textureKey = 'gen_wall_concrete_face';
    } else if (run.material === 'interior') {
      // Dynamic wallpaper variation between rooms:
      // East partition (kitchen/dining) uses peeling damaged wallpaper, west partition uses floral damask
      if (run.id === 'w:test:0:part_east' && scene.textures.exists('gen_wall_interior_damaged')) {
        textureKey = 'gen_wall_interior_damaged';
      } else {
        textureKey = 'gen_wall_interior_face';
      }
    } else {
      // Exterior walls: North wall and West wall face inside into the rooms
      // Their room-facing interior surface uses vintage wallpaper with residential baseboard!
      if (run.axis === 'h' && run.fixed <= 28.5) {
        textureKey = 'gen_wall_interior_face';
      } else if (run.axis === 'v' && run.fixed <= 28.5) {
        textureKey = 'gen_wall_interior_face';
      } else {
        // Dynamic procedural brick variation: weathered mossy brick vs standard weathered brick
        const seed = Math.abs(Math.round(start.x * 3 + start.y * 7 + startM * 11));
        textureKey = seed % 2 === 0 && scene.textures.exists('gen_wall_brick_weathered_face')
          ? 'gen_wall_brick_weathered_face'
          : 'gen_wall_brick_face';
      }
    }

    if (scene.textures.exists(textureKey)) {
      const half = run.thicknessM / 2;
      const x0 = run.axis === 'h' ? run.from + startM / 1.6 : run.fixed + half;
      const x1 = run.axis === 'h' ? run.from + endM / 1.6 : run.fixed + half;
      const y0 = run.axis === 'h' ? run.fixed + half : run.from + startM / 1.6;
      const y1 = run.axis === 'h' ? run.fixed + half : run.from + endM / 1.6;
      const bottom0 = worldToScreen(x0, y0, zBot);
      const bottom1 = worldToScreen(x1, y1, zBot);
      const top0 = worldToScreen(x0, y0, zTop);
      const top1 = worldToScreen(x1, y1, zTop);

      const minX = Math.min(bottom0.x, bottom1.x, top0.x, top1.x);
      const minY = Math.min(bottom0.y, bottom1.y, top0.y, top1.y);
      const maxX = Math.max(bottom0.x, bottom1.x, top0.x, top1.x);
      const maxY = Math.max(bottom0.y, bottom1.y, top0.y, top1.y);
      const width = Math.max(1, Math.ceil(maxX - minX));
      const height = Math.max(1, Math.ceil(maxY - minY));

      const canvasKey = `wall_${run.id}_${Math.round(startM * 100)}_${Math.round(endM * 100)}_${Math.round(zBot * 100)}_${Math.round(zTop * 100)}`;
      if (scene.textures.exists(canvasKey)) scene.textures.remove(canvasKey);
      const texture = scene.textures.createCanvas(canvasKey, width, height);

      if (texture) {
        const ctx = texture.getContext();
        const source = scene.textures.get(textureKey).getSourceImage() as HTMLImageElement;
        ctx.save();

        // Continuous texture mapping along wall run:
        // Instead of restarting u=0 for every 1.6m segment, compute continuous global texture coordinates!
        // This completely eliminates repeating vertical stripes / seams across the room.
        const patternWidthM = run.material === 'interior' ? 3.2 : 1.6;
        const u0 = ((startM % patternWidthM) / patternWidthM) * source.width;
        const uSpan = Math.max(1, ((endM - startM) / patternWidthM) * source.width);

        // Proportional vertical UV slicing:
        // For wall pieces above openings (lintels) or below windows (sills), slice only the corresponding
        // vertical section of the texture so full wallpapers/baseboards are NEVER squashed into lintels!
        const fullH = run.heightM;
        const relTop = zTop - floor.elevationM;
        const relBot = zBot - floor.elevationM;
        const v0 = Math.max(0, Math.min(source.height - 1, Math.round(((fullH - relTop) / fullH) * source.height)));
        const v1 = Math.max(v0 + 1, Math.min(source.height, Math.round(((fullH - relBot) / fullH) * source.height)));
        const vSpan = Math.max(1, v1 - v0);

        const a = (top1.x - top0.x) / uSpan;
        const b = (top1.y - top0.y) / uSpan;
        const c = (bottom0.x - top0.x) / vSpan;
        const d = (bottom0.y - top0.y) / vSpan;

        ctx.setTransform(a, b, c, d, top0.x - minX, top0.y - minY);

        // Draw with seamless horizontal texture wrapping and correct vertical slice
        let curU = u0;
        let drawnSpan = 0;
        while (drawnSpan < uSpan) {
          const sliceW = Math.min(uSpan - drawnSpan, source.width - curU);
          ctx.drawImage(source, curU, v0, sliceW, vSpan, drawnSpan, 0, sliceW, vSpan);
          drawnSpan += sliceW;
          curU = 0;
        }
        ctx.restore();

        // The peeling-wallpaper asset is deliberately dark; lift it a little so
        // interior partitions stay readable under the night lighting.
        if (textureKey === 'gen_wall_interior_damaged') {
          ctx.save();
          ctx.globalCompositeOperation = 'source-atop';
          ctx.fillStyle = 'rgba(176, 158, 124, 0.30)';
          ctx.fillRect(0, 0, width, height);
          ctx.restore();
        }

        // Shading: East-facing walls get subtle ambient shadowing for realistic 3D volume
        if (run.axis === 'v') {
          ctx.fillStyle = run.material === 'interior' ? 'rgba(0, 0, 0, 0.06)' : 'rgba(0, 0, 0, 0.16)';
          ctx.beginPath();
          ctx.moveTo(top0.x - minX, top0.y - minY);
          ctx.lineTo(top1.x - minX, top1.y - minY);
          ctx.lineTo(bottom1.x - minX, bottom1.y - minY);
          ctx.lineTo(bottom0.x - minX, bottom0.y - minY);
          ctx.closePath();
          ctx.fill();
        }

        texture.refresh();
      }

      this.image = scene.add.image(minX, minY, canvasKey).setOrigin(0, 0).setDepth(this.depth + 0.01);
    }
  }

  setCut(cut: boolean): void {
    if (this.cutVisible === cut) return;
    this.cutVisible = cut;
    this.full.setVisible(!cut);
    this.image?.setVisible(!cut);
    this.cut.setVisible(cut);
  }

  setActive(active: boolean): void {
    this.full.setVisible(active && !this.cutVisible);
    this.image?.setVisible(active && !this.cutVisible);
    this.cut.setVisible(active && this.cutVisible);
  }

  occludes(sx: number, sy: number, depth: number): boolean {
    if (this.cutVisible) return false;
    return imageOccludes(this.image, sx, sy, depth);
  }

  destroy(): void {
    this.full.destroy();
    this.cut.destroy();
    this.image?.destroy();
  }
}

class DoorView {
  private graphics: Phaser.GameObjects.Graphics;
  private closedImage?: Phaser.GameObjects.Image;
  private openImage?: Phaser.GameObjects.Image;
  private openImageLeaf?: Phaser.GameObjects.Image;
  private cutawayImage?: Phaser.GameObjects.Image;
  readonly run: WallRun;
  private opening: OpeningSpec;
  private floor: FloorSpec;
  private state: DoorState;
  private depth: number;
  private cutVisible = false;

  constructor(scene: Phaser.Scene, floor: FloorSpec, run: WallRun, opening: OpeningSpec, state: DoorState) {
    this.floor = floor;
    this.run = run;
    this.opening = opening;
    this.state = state;
    const center = openingCenter(run, opening);
    this.depth = center.x + center.y + FLOOR_BAND * floor.level + 0.36;
    this.graphics = scene.add.graphics().setDepth(this.depth);

    const half = run.thicknessM / 2;
    const z0 = floor.elevationM;
    const z1 = floor.elevationM + opening.heightM;
    const s0 = run.from + opening.startM / 1.6;
    const s1 = run.from + (opening.startM + opening.widthM) / 1.6;

    let pBL: { x: number; y: number };
    let pBR: { x: number; y: number };
    let pTL: { x: number; y: number };
    let pTR: { x: number; y: number };

    if (run.axis === 'h') {
      const y = run.fixed + half;
      pBL = worldToScreen(s0, y, z0);
      pBR = worldToScreen(s1, y, z0);
      pTL = worldToScreen(s0, y, z1);
      pTR = worldToScreen(s1, y, z1);
    } else {
      const x = run.fixed + half;
      pBL = worldToScreen(x, s0, z0);
      pBR = worldToScreen(x, s1, z0);
      pTL = worldToScreen(x, s0, z1);
      pTR = worldToScreen(x, s1, z1);
    }

    // 1. Closed Door View: Static casing + 100% orthogonal door leaf mapped to wall quad
    const minX = Math.min(pBL.x, pBR.x, pTL.x, pTR.x) - 4;
    const minY = Math.min(pBL.y, pBR.y, pTL.y, pTR.y) - 4;
    const maxX = Math.max(pBL.x, pBR.x, pTL.x, pTR.x) + 4;
    const maxY = Math.max(pBL.y, pBR.y, pTL.y, pTR.y) + 4;
    const cW = Math.max(1, Math.ceil(maxX - minX));
    const cH = Math.max(1, Math.ceil(maxY - minY));

    const closedKey = `door_closed_aff_${opening.id}`;
    if (scene.textures.exists(closedKey)) scene.textures.remove(closedKey);
    const closedCanvas = scene.textures.createCanvas(closedKey, cW, cH);
    if (closedCanvas && scene.textures.exists('gen_door_frame')) {
      const ctx = closedCanvas.getContext();
      // door_frame.png is 256x512
      const a = (pTR.x - pTL.x) / 256;
      const b = (pTR.y - pTL.y) / 256;
      const c = (pBL.x - pTL.x) / 512;
      const d = (pBL.y - pTL.y) / 512;
      ctx.setTransform(a, b, c, d, pTL.x - minX, pTL.y - minY);

      const frameImg = scene.textures.get('gen_door_frame').getSourceImage() as HTMLImageElement;
      ctx.drawImage(frameImg, 0, 0, 256, 512);

      if (scene.textures.exists('gen_door_leaf')) {
        const leafImg = scene.textures.get('gen_door_leaf').getSourceImage() as HTMLImageElement;
        // In the 256x512 frame, door opening is exactly (26, 26, 204, 472)
        ctx.drawImage(leafImg, 26, 26, 204, 472);
      }
      closedCanvas.refresh();
      this.closedImage = scene.add.image(minX, minY, closedKey).setOrigin(0, 0).setDepth(this.depth + 0.04);
    }

    // 2. Open Door View:
    // Decouple stationary frame from 3D swung leaf so the leaf depth strictly follows its inward position!
    // This guarantees the wall above the doorway naturally covers the top of the swung door.
    const openFrameKey = `door_open_frame_${opening.id}`;
    if (scene.textures.exists(openFrameKey)) scene.textures.remove(openFrameKey);
    const openFrameCanvas = scene.textures.createCanvas(openFrameKey, cW, cH);
    if (openFrameCanvas && scene.textures.exists('gen_door_frame')) {
      const ctx = openFrameCanvas.getContext();
      const a = (pTR.x - pTL.x) / 256;
      const b = (pTR.y - pTL.y) / 256;
      const c = (pBL.x - pTL.x) / 512;
      const d = (pBL.y - pTL.y) / 512;
      ctx.setTransform(a, b, c, d, pTL.x - minX, pTL.y - minY);
      const frameImg = scene.textures.get('gen_door_frame').getSourceImage() as HTMLImageElement;
      ctx.drawImage(frameImg, 0, 0, 256, 512);
      openFrameCanvas.refresh();
      this.openImage = scene.add.image(minX, minY, openFrameKey).setOrigin(0, 0).setDepth(this.depth + 0.04);
      this.openImage.setVisible(false);
    }

    // 3. Swung open door leaf in 3D:
    const inwardDist = (opening.widthM * 0.92) / 1.6;
    const doorThickTiles = 0.05 / 1.6; // 50mm door leaf thickness

    const hx = run.axis === 'h' ? s0 + (26 / 256) * (opening.widthM / 1.6) : run.fixed + half;
    const hy = run.axis === 'h' ? run.fixed + half : s0 + (26 / 256) * (opening.widthM / 1.6);
    const tx = run.axis === 'h' ? hx : hx - inwardDist;
    const ty = run.axis === 'h' ? hy - inwardDist : hy;

    const bHinge = worldToScreen(hx, hy, z0);
    const bTip = worldToScreen(tx, ty, z0);
    const tTip = worldToScreen(tx, ty, z1);
    const tHinge = worldToScreen(hx, hy, z1);

    const bHingeBack = worldToScreen(run.axis === 'h' ? hx + doorThickTiles : hx, run.axis === 'h' ? hy : hy + doorThickTiles, z0);
    const bTipBack = worldToScreen(run.axis === 'h' ? tx + doorThickTiles : tx, run.axis === 'h' ? ty : ty + doorThickTiles, z0);
    const tTipBack = worldToScreen(run.axis === 'h' ? tx + doorThickTiles : tx, run.axis === 'h' ? ty : ty + doorThickTiles, z1);
    const tHingeBack = worldToScreen(run.axis === 'h' ? hx + doorThickTiles : hx, run.axis === 'h' ? hy : hy + doorThickTiles, z1);

    const oMinX = Math.min(bHinge.x, bTip.x, tTip.x, tHinge.x, bTipBack.x, tTipBack.x) - 8;
    const oMinY = Math.min(bHinge.y, bTip.y, tTip.y, tHinge.y, bTipBack.y, tTipBack.y) - 8;
    const oMaxX = Math.max(bHinge.x, bTip.x, tTip.x, tHinge.x, bTipBack.x, tTipBack.x) + 8;
    const oMaxY = Math.max(bHinge.y, bTip.y, tTip.y, tHinge.y, bTipBack.y, tTipBack.y) + 8;
    const oW = Math.max(1, Math.ceil(oMaxX - oMinX));
    const oH = Math.max(1, Math.ceil(oMaxY - oMinY));

    const openLeafKey = `door_open_leaf_${opening.id}`;
    if (scene.textures.exists(openLeafKey)) scene.textures.remove(openLeafKey);
    const openLeafCanvas = scene.textures.createCanvas(openLeafKey, oW, oH);
    if (openLeafCanvas) {
      const ctx = openLeafCanvas.getContext();

      // Floor contact shadow under the swung open door leaf
      ctx.fillStyle = 'rgba(12, 10, 8, 0.45)';
      ctx.beginPath();
      ctx.moveTo(bHinge.x - oMinX, bHinge.y - oMinY);
      ctx.lineTo(bTip.x - oMinX, bTip.y - oMinY);
      ctx.lineTo(bTipBack.x - oMinX + 8, bTipBack.y - oMinY + 4);
      ctx.lineTo(bHingeBack.x - oMinX + 8, bHingeBack.y - oMinY + 4);
      ctx.closePath();
      ctx.fill();

      // Swung open door leaf: texture mapped from gen_door_leaf
      if (scene.textures.exists('gen_door_leaf')) {
        const leafImg = scene.textures.get('gen_door_leaf').getSourceImage() as HTMLImageElement;
        ctx.save();
        const dxH = tTip.x - tHinge.x;
        const dyH = tTip.y - tHinge.y;
        const dxV = bHinge.x - tHinge.x;
        const dyV = bHinge.y - tHinge.y;
        const la = dxH / 204;
        const lb = dyH / 204;
        const lc = dxV / 472;
        const ld = dyV / 472;
        ctx.setTransform(la, lb, lc, ld, tHinge.x - oMinX, tHinge.y - oMinY);
        ctx.drawImage(leafImg, 0, 0, 204, 472);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.fillRect(0, 0, 204, 472);
        ctx.restore();
      } else {
        ctx.fillStyle = '#313533';
        ctx.beginPath();
        ctx.moveTo(bHinge.x - oMinX, bHinge.y - oMinY);
        ctx.lineTo(bTip.x - oMinX, bTip.y - oMinY);
        ctx.lineTo(tTip.x - oMinX, tTip.y - oMinY);
        ctx.lineTo(tHinge.x - oMinX, tHinge.y - oMinY);
        ctx.closePath();
        ctx.fill();
      }

      // Top edge thickness (visible in isometric dimetric perspective!)
      ctx.fillStyle = '#3e4441';
      ctx.beginPath();
      ctx.moveTo(tHinge.x - oMinX, tHinge.y - oMinY);
      ctx.lineTo(tTip.x - oMinX, tTip.y - oMinY);
      ctx.lineTo(tTipBack.x - oMinX, tTipBack.y - oMinY);
      ctx.lineTo(tHingeBack.x - oMinX, tHingeBack.y - oMinY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#5c6460';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Swing end vertical edge face (at tip)
      ctx.fillStyle = '#262928';
      ctx.beginPath();
      ctx.moveTo(bTip.x - oMinX, bTip.y - oMinY);
      ctx.lineTo(bTipBack.x - oMinX, bTipBack.y - oMinY);
      ctx.lineTo(tTipBack.x - oMinX, tTipBack.y - oMinY);
      ctx.lineTo(tTip.x - oMinX, tTip.y - oMinY);
      ctx.closePath();
      ctx.fill();

      // Heavy industrial steel latch & deadbolt on swung edge
      const knobScr = worldToScreen(tx + doorThickTiles * 0.5, ty, z0 + 0.95);
      ctx.fillStyle = '#7e8683';
      ctx.fillRect(knobScr.x - oMinX - 3, knobScr.y - oMinY - 8, 6, 16);
      ctx.fillStyle = '#9fa8a5';
      ctx.beginPath();
      ctx.arc(knobScr.x - oMinX, knobScr.y - oMinY, 4, 0, Math.PI * 2);
      ctx.fill();

      openLeafCanvas.refresh();
      // True 3D depth of inward swung leaf: strictly behind the south wall!
      const leafMidX = (hx + tx) / 2;
      const leafMidY = (hy + ty) / 2;
      const leafDepth = leafMidX + leafMidY + FLOOR_BAND * floor.level + 0.20;
      this.openImageLeaf = scene.add.image(oMinX, oMinY, openLeafKey).setOrigin(0, 0).setDepth(leafDepth);
      this.openImageLeaf.setVisible(false);
    }

    this.draw();
  }

  private draw(): void {
    if (this.cutVisible) {
      this.closedImage?.setVisible(false);
      this.openImage?.setVisible(false);
      this.openImageLeaf?.setVisible(false);
      this.cutawayImage?.setVisible(false);
      this.graphics.setVisible(true);
      const g = this.graphics;
      g.clear();
      const z0 = this.floor.elevationM;
      drawWallPanel(g, this.run, this.opening.startM, 0.06, z0, z0 + 0.5, 0x4e463c);
      drawWallPanel(g, this.run, this.opening.startM + this.opening.widthM - 0.06, 0.06, z0, z0 + 0.5, 0x4e463c);
      return;
    }

    if (this.closedImage && this.openImage) {
      this.closedImage.setVisible(!this.state.open);
      this.openImage.setVisible(this.state.open);
      this.openImageLeaf?.setVisible(this.state.open);
      this.graphics.setVisible(false);
      return;
    }

    // Procedural fallback
    const g = this.graphics;
    g.clear();
    const z0 = this.floor.elevationM;
    const z1 = z0 + Math.min(this.opening.heightM, this.run.heightM);
    drawWallPanel(g, this.run, this.opening.startM, 0.06, z0, z1, 0x2e2a25);
    drawWallPanel(g, this.run, this.opening.startM + this.opening.widthM - 0.06, 0.06, z0, z1, 0x2e2a25);
    drawWallPanel(g, this.run, this.opening.startM, this.opening.widthM, z1 - 0.06, z1, 0x2e2a25);
    if (!this.state.open) {
      drawWallPanel(g, this.run, this.opening.startM + 0.06, this.opening.widthM - 0.12, z0, z1 - 0.06, this.state.locked ? 0x6a3b31 : 0x6c5031);
    }
  }

  setCut(cut: boolean): void {
    if (this.cutVisible === cut) return;
    this.cutVisible = cut;
    this.draw();
  }

  setState(state: DoorState): void {
    this.state = state;
    this.draw();
  }

  setActive(active: boolean): void {
    if (!active) {
      this.closedImage?.setVisible(false);
      this.openImage?.setVisible(false);
      this.openImageLeaf?.setVisible(false);
      this.cutawayImage?.setVisible(false);
      this.graphics.setVisible(false);
    } else {
      this.draw();
    }
  }

  occludes(sx: number, sy: number, depth: number): boolean {
    if (this.cutVisible) return false;
    return imageOccludes(this.closedImage, sx, sy, depth) ||
      imageOccludes(this.openImage, sx, sy, depth) ||
      imageOccludes(this.openImageLeaf, sx, sy, depth) ||
      imageOccludes(this.cutawayImage, sx, sy, depth);
  }

  destroy(): void {
    this.graphics.destroy();
    this.closedImage?.destroy();
    this.openImage?.destroy();
    this.openImageLeaf?.destroy();
    this.cutawayImage?.destroy();
  }
}

class WindowView {
  private graphics: Phaser.GameObjects.Graphics;
  private image?: Phaser.GameObjects.Image;
  readonly run: WallRun;
  private opening: OpeningSpec;
  private floor: FloorSpec;
  private state: WindowState;
  private depth: number;
  private active = true;
  private cutVisible = false;

  constructor(scene: Phaser.Scene, floor: FloorSpec, run: WallRun, opening: OpeningSpec, state: WindowState) {
    this.floor = floor;
    this.run = run;
    this.opening = opening;
    this.state = state;
    const center = openingCenter(run, opening);
    this.depth = center.x + center.y + FLOOR_BAND * floor.level + 0.36;
    this.graphics = scene.add.graphics().setDepth(this.depth + 0.05);

    const sillZ = floor.elevationM + opening.sillM;
    const lintelZ = sillZ + opening.heightM;
    const half = run.thicknessM / 2;

    const startTile = run.from + opening.startM / 1.6;
    const endTile = run.from + (opening.startM + opening.widthM) / 1.6;

    let pBL: { x: number; y: number };
    let pBR: { x: number; y: number };
    let pTL: { x: number; y: number };
    let pTR: { x: number; y: number };

    if (run.axis === 'h') {
      const y = run.fixed + half;
      pBL = worldToScreen(startTile, y, sillZ);
      pBR = worldToScreen(endTile, y, sillZ);
      pTL = worldToScreen(startTile, y, lintelZ);
      pTR = worldToScreen(endTile, y, lintelZ);
    } else {
      const x = run.fixed + half;
      // Match DoorView's run direction; a vertical wall must not mirror its
      // opening relative to the wall segment.
      pBL = worldToScreen(x, startTile, sillZ);
      pBR = worldToScreen(x, endTile, sillZ);
      pTL = worldToScreen(x, startTile, lintelZ);
      pTR = worldToScreen(x, endTile, lintelZ);
    }

    const minX = Math.min(pBL.x, pBR.x, pTL.x, pTR.x) - 4;
    const minY = Math.min(pBL.y, pBR.y, pTL.y, pTR.y) - 4;
    const maxX = Math.max(pBL.x, pBR.x, pTL.x, pTR.x) + 4;
    const maxY = Math.max(pBL.y, pBR.y, pTL.y, pTR.y) + 4;
    const width = Math.max(1, Math.ceil(maxX - minX));
    const height = Math.max(1, Math.ceil(maxY - minY));

    const canvasKey = `window_aff_${opening.id}`;
    if (scene.textures.exists(canvasKey)) scene.textures.remove(canvasKey);
    const canvas = scene.textures.createCanvas(canvasKey, width, height);

    if (canvas && scene.textures.exists('gen_window_unit')) {
      const ctx = canvas.getContext();

      // 1. Warm interior backplate so windows never read as empty black voids
      ctx.fillStyle = '#26221c';
      ctx.beginPath();
      ctx.moveTo(pTL.x - minX, pTL.y - minY);
      ctx.lineTo(pTR.x - minX, pTR.y - minY);
      ctx.lineTo(pBR.x - minX, pBR.y - minY);
      ctx.lineTo(pBL.x - minX, pBL.y - minY);
      ctx.closePath();
      ctx.fill();

      // Subtle warm ambient glow from inside the room
      const intGlow = ctx.createLinearGradient(
        (pBL.x + pBR.x) / 2 - minX, (pBL.y + pBR.y) / 2 - minY,
        (pTL.x + pTR.x) / 2 - minX, (pTL.y + pTR.y) / 2 - minY,
      );
      intGlow.addColorStop(0, 'rgba(84, 68, 48, 0.75)');
      intGlow.addColorStop(1, 'rgba(34, 30, 24, 0.95)');
      ctx.fillStyle = intGlow;
      ctx.fill();

      // 2. Window unit sprite mapped onto wall quad
      const source = scene.textures.get('gen_window_unit').getSourceImage() as HTMLImageElement;
      ctx.save();
      const a = (pTR.x - pTL.x) / source.width;
      const b = (pTR.y - pTL.y) / source.width;
      const c = (pBL.x - pTL.x) / source.height;
      const d = (pBL.y - pTL.y) / source.height;
      ctx.setTransform(a, b, c, d, pTL.x - minX, pTL.y - minY);
      ctx.drawImage(source, 0, 0, source.width, source.height);
      ctx.restore();

      // Sky sheen + faint interior bounce. The raw window texture is almost
      // black at night, which made intact windows read as holes in the wall.
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      const sheen = ctx.createLinearGradient(0, 0, 0, height);
      sheen.addColorStop(0, 'rgba(150, 170, 182, 0.22)');
      sheen.addColorStop(0.5, 'rgba(105, 118, 124, 0.09)');
      sheen.addColorStop(1, 'rgba(30, 30, 28, 0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, width, height);
      const bounce = ctx.createRadialGradient(
        width * 0.5, height * 0.55, 2,
        width * 0.5, height * 0.55, Math.max(width, height) * 0.48,
      );
      bounce.addColorStop(0, 'rgba(198, 172, 125, 0.11)');
      bounce.addColorStop(1, 'rgba(198, 172, 125, 0)');
      ctx.fillStyle = bounce;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // Shading on vertical East-facing wall
      if (run.axis === 'v') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
        ctx.beginPath();
        ctx.moveTo(pTL.x - minX, pTL.y - minY);
        ctx.lineTo(pTR.x - minX, pTR.y - minY);
        ctx.lineTo(pBR.x - minX, pBR.y - minY);
        ctx.lineTo(pBL.x - minX, pBL.y - minY);
        ctx.closePath();
        ctx.fill();
      }

      canvas.refresh();
      this.image = scene.add.image(minX, minY, canvasKey).setOrigin(0, 0).setDepth(this.depth + 0.03);
    }

    this.draw();
  }

  private draw(): void {
    const g = this.graphics;
    g.clear();
    if (this.cutVisible) {
      g.setVisible(false);
      this.image?.setVisible(false);
      return;
    }
    g.setVisible(this.active);
    this.image?.setVisible(this.active);
    if (this.state.boarded) {
      const z0 = this.floor.elevationM + this.opening.sillM;
      drawWallPanel(g, this.run, this.opening.startM + 0.05, this.opening.widthM - 0.1, z0 + 0.25, z0 + 0.35, 0x5a4632);
      drawWallPanel(g, this.run, this.opening.startM + 0.05, this.opening.widthM - 0.1, z0 + 0.65, z0 + 0.75, 0x5a4632);
    }
  }

  setState(state: WindowState): void {
    this.state = state;
    this.draw();
  }

  setActive(active: boolean): void {
    this.active = active;
    this.graphics.setVisible(active && !this.cutVisible);
    this.image?.setVisible(active && !this.cutVisible);
  }

  setCut(cut: boolean): void {
    if (this.cutVisible === cut) return;
    this.cutVisible = cut;
    this.draw();
  }

  occludes(sx: number, sy: number, depth: number): boolean {
    if (this.cutVisible) return false;
    return imageOccludes(this.image, sx, sy, depth);
  }

  destroy(): void {
    this.graphics.destroy();
    this.image?.destroy();
  }
}

class StairView {
  private graphics: Phaser.GameObjects.Graphics;
  private stair: StairSpec;
  private floor: FloorSpec;
  private baseX: number;

  constructor(scene: Phaser.Scene, floor: FloorSpec, stair: StairSpec) {
    this.floor = floor;
    this.stair = stair;
    this.graphics = scene.add.graphics();
    const widthTiles = stair.widthM / TILE_SIZE_M;
    this.baseX = stair.hole.x + (stair.hole.w - widthTiles) / 2;
    this.draw();
  }

  private draw(maxSteps = this.stair.steps): void {
    const g = this.graphics;
    g.clear();
    const widthTiles = this.stair.widthM / TILE_SIZE_M;
    const treadTiles = this.stair.treadM / TILE_SIZE_M;
    const isGoingUp = this.stair.toLevel > this.stair.fromLevel;
    const dirY = (this.stair.exit.y - this.stair.entry.y) < 0 ? -1 : 1;
    const yStart = dirY < 0 ? this.stair.hole.y + this.stair.hole.h - 0.2 : this.stair.hole.y + 0.2;
    const startZ = this.floor.elevationM;
    const x0 = this.baseX;
    const x1 = this.baseX + widthTiles;

    const numSteps = Math.min(maxSteps, this.stair.steps);
    const zRailStart = startZ + (isGoingUp ? this.stair.riseM : -this.stair.riseM);
    const zRailEnd = startZ + numSteps * this.stair.riseM * (isGoingUp ? 1 : -1);
    const yEnd = yStart + numSteps * treadTiles * dirY;
    // An ascending run touches the floor at its lower end; a descending run
    // touches the lower floor at its end. Drawing the contact shadow at the
    // top of an ascending run painted a black patch into the stairwell.
    const shadowZ = isGoingUp ? startZ : zRailEnd;

    // Contact drop shadow on the floor beneath the stairs.
    fillQuad(
      g,
      worldToScreen(x0 - 0.05, yStart, shadowZ),
      worldToScreen(x1 + 0.12, yStart, shadowZ),
      worldToScreen(x1 + 0.12, yEnd + 0.1 * dirY, shadowZ),
      worldToScreen(x0 - 0.05, yEnd + 0.1 * dirY, shadowZ),
      0x0c0b0a,
      0.45,
    );

    // Steel landing floor baseplate anchoring at exit
    fillQuad(
      g,
      worldToScreen(x0 - 0.06, yEnd - 0.08 * dirY, zRailEnd),
      worldToScreen(x1 + 0.06, yEnd - 0.08 * dirY, zRailEnd),
      worldToScreen(x1 + 0.06, yEnd + 0.12 * dirY, zRailEnd),
      worldToScreen(x0 - 0.06, yEnd + 0.12 * dirY, zRailEnd),
      0x242220,
    );

    // Solid side structural stringers (dark stained timber)
    fillQuad(
      g,
      worldToScreen(x0, yStart, zRailStart),
      worldToScreen(x0 + 0.08, yStart, zRailStart),
      worldToScreen(x0 + 0.08, yEnd, zRailEnd),
      worldToScreen(x0, yEnd, zRailEnd),
      0x3e3022,
    );
    fillQuad(
      g,
      worldToScreen(x1 - 0.08, yStart, zRailStart),
      worldToScreen(x1, yStart, zRailStart),
      worldToScreen(x1, yEnd, zRailEnd),
      worldToScreen(x1 - 0.08, yEnd, zRailEnd),
      0x3e3022,
    );

    // Steps
    for (let i = 0; i < numSteps; i++) {
      const y0 = yStart + i * treadTiles * dirY;
      const y1 = y0 + treadTiles * dirY;
      const zTop = startZ + (i + 1) * this.stair.riseM * (isGoingUp ? 1 : -1);
      const zBottom = zTop - 0.16;

      const p = (x: number, y: number, z: number) => worldToScreen(x, y, z);
      const top0 = p(x0, y0, zTop);
      const top1 = p(x1, y0, zTop);
      const top2 = p(x1, y1, zTop);
      const top3 = p(x0, y1, zTop);

      // Tread top surface with wood grain patina
      fillQuad(g, top0, top1, top2, top3, i % 2 ? 0x684e36 : 0x74583e);

      // Tread front nosing edge highlight
      g.lineStyle(1.5, 0x8e6e4c, 0.95);
      g.beginPath();
      g.moveTo(top0.x, top0.y);
      g.lineTo(top1.x, top1.y);
      g.strokePath();

      // Riser vertical face facing south (isometric viewer)
      const yRiser = dirY < 0 ? y0 : y1;
      fillQuad(g, p(x0, yRiser, zTop), p(x1, yRiser, zTop), p(x1, yRiser, zBottom), p(x0, yRiser, zBottom), 0x2e241a);

      // Step right edge thickness
      fillQuad(g, p(x1, y0, zTop), p(x1, y1, zTop), p(x1, y1, zBottom), p(x1, y0, zBottom), 0x483828);

      // Wooden Baluster Post on open side (every 2 steps)
      if (i % 2 === 0 || i === numSteps - 1) {
        const yMid = (y0 + y1) / 2;
        const postBase = p(x1 - 0.04, yMid, zTop);
        const postTop = p(x1 - 0.04, yMid, zTop + 0.82);
        g.lineStyle(2.5, 0x5a4028, 0.95);
        g.beginPath();
        g.moveTo(postBase.x, postBase.y);
        g.lineTo(postTop.x, postTop.y);
        g.strokePath();
      }
    }

    // Wooden handrail running down the open side
    const railTopStart = worldToScreen(x1 - 0.04, yStart, zRailStart + 0.82);
    const railTopEnd = worldToScreen(x1 - 0.04, yEnd, zRailEnd + 0.82);
    g.lineStyle(2.5, 0x7c5a3a, 1);
    g.beginPath();
    g.moveTo(railTopStart.x, railTopStart.y);
    g.lineTo(railTopEnd.x, railTopEnd.y);
    g.strokePath();
    g.lineStyle(1, 0x8e6e4c, 0.9);
    g.beginPath();
    g.moveTo(railTopStart.x, railTopStart.y - 1.5);
    g.lineTo(railTopEnd.x, railTopEnd.y - 1.5);
    g.strokePath();
  }

  setActive(activeFloor: number): void {
    const active = activeFloor === this.stair.fromLevel || activeFloor === this.stair.toLevel;
    this.graphics.setVisible(active);
    if (active) {
      const widthTiles = this.stair.widthM / TILE_SIZE_M;
      const midX = this.baseX + widthTiles / 2;
      const isGoingUp = this.stair.toLevel > this.stair.fromLevel;
      const yMid = this.stair.hole.y + this.stair.hole.h / 2;
      this.graphics.setDepth(midX + yMid + 0.3 + FLOOR_BAND * activeFloor);
      // Draw the whole run: the shaft walls now contain it, and truncating it
      // left the rest of the opening as a black void.
      this.draw();
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}

export class BuildingView {
  readonly building: BuildingSpec;
  private scene: Phaser.Scene;
  private floors = new Map<
    number,
    {
      floor: Phaser.GameObjects.Graphics;
      floorImage?: Phaser.GameObjects.Image;
      stairHole?: Phaser.GameObjects.Graphics;
      walls: WallPiece[];
      doors: DoorView[];
      windows: WindowView[];
      furniture: InteriorView[];
      stairs: StairView[];
      shafts: StairShaftView[];
      joints: Phaser.GameObjects.Graphics[];
    }
  >();
  private subfloor?: Phaser.GameObjects.Graphics;
  private foundationCurbs: Phaser.GameObjects.Graphics[] = [];
  private mansardRoofObjects: (Phaser.GameObjects.Graphics | Phaser.GameObjects.Image)[] = [];
  private terraceRoofObjects: (Phaser.GameObjects.Graphics | Phaser.GameObjects.Image)[] = [];
  private activeFloor = 0;
  private inside = false;
  private local = { x: 0, y: 0 };
  private doorViews = new Map<string, DoorView>();
  private windowViews = new Map<string, WindowView>();
  private furnitureViews = new Map<string, InteriorView>();

  constructor(
    scene: Phaser.Scene,
    building: BuildingSpec,
    objects: ObjectInstance[],
    states: Record<string, ObjectState>,
    doorStates: DoorState[],
    windowStates: WindowState[],
  ) {
    this.scene = scene;
    this.building = building;

    // Solid foundation subfloor follows the ground-floor footprint from data.
    const subfloor = scene.add.graphics().setDepth(-500_000);
    const groundFloor = building.floors.find((floor) => floor.level === 0);
    let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
    for (const cell of groundFloor?.floor.cells ?? []) {
      bMinX = Math.min(bMinX, cell.x);
      bMaxX = Math.max(bMaxX, cell.x + cell.w);
      bMinY = Math.min(bMinY, cell.y);
      bMaxY = Math.max(bMaxY, cell.y + cell.h);
    }
    if (!Number.isFinite(bMinX)) {
      bMinX = 0; bMaxX = 0; bMinY = 0; bMaxY = 0;
    }
    fillQuad(
      subfloor,
      worldToScreen(bMinX, bMinY, -0.05),
      worldToScreen(bMaxX, bMinY, -0.05),
      worldToScreen(bMaxX, bMaxY, -0.05),
      worldToScreen(bMinX, bMaxY, -0.05),
      0x1c1c1a,
    );
    this.subfloor = subfloor;

    const zGround = 0.0;
    const zPlinthTop = 0.22;
    const zWaterTable = 0.26;

    const drawPlinthSegment = (
      g: Phaser.GameObjects.Graphics,
      axis: 'h' | 'v',
      fixed: number,
      from: number,
      to: number,
      facing: 'north' | 'south' | 'east' | 'west',
    ) => {
      const half = 0.1;
      const sign = facing === 'north' || facing === 'west' ? -1 : 1;
      const baseColor = facing === 'south' ? 0x4a463e : facing === 'east' ? 0x403c35 : 0x3a3630;
      const topColor = facing === 'south' ? 0x625b4f : facing === 'east' ? 0x544e44 : 0x4a463e;

      if (axis === 'h') {
        const yFace = fixed + sign * half;
        const yLedge = yFace - sign * 0.08;
        const pBL = worldToScreen(from, yFace, zGround);
        const pBR = worldToScreen(to, yFace, zGround);
        const pTR = worldToScreen(to, yFace, zPlinthTop);
        const pTL = worldToScreen(from, yFace, zPlinthTop);
        const pTR_ledge = worldToScreen(to, yLedge, zWaterTable);
        const pTL_ledge = worldToScreen(from, yLedge, zWaterTable);

        fillQuad(g, pTL, pTR, pBR, pBL, baseColor);
        fillQuad(g, pTL_ledge, pTR_ledge, pTR, pTL, topColor);

        g.lineStyle(1.5, 0x221e1a, 0.7);
        const pMidL = worldToScreen(from, yFace, zGround + 0.11);
        const pMidR = worldToScreen(to, yFace, zGround + 0.11);
        g.beginPath();
        g.moveTo(pMidL.x, pMidL.y);
        g.lineTo(pMidR.x, pMidR.y);
        g.strokePath();

        for (let x = from + 0.6; x < to - 0.2; x += 0.8) {
          const jBot = worldToScreen(x, yFace, zGround);
          const jTop = worldToScreen(x, yFace, zPlinthTop);
          g.beginPath();
          g.moveTo(jBot.x, jBot.y);
          g.lineTo(jTop.x, jTop.y);
          g.strokePath();
        }
      } else {
        const xFace = fixed + sign * half;
        const xLedge = xFace - sign * 0.08;
        const pBL = worldToScreen(xFace, to, zGround);
        const pBR = worldToScreen(xFace, from, zGround);
        const pTR = worldToScreen(xFace, from, zPlinthTop);
        const pTL = worldToScreen(xFace, to, zPlinthTop);
        const pTR_ledge = worldToScreen(xLedge, from, zWaterTable);
        const pTL_ledge = worldToScreen(xLedge, to, zWaterTable);

        fillQuad(g, pTL, pTR, pBR, pBL, baseColor);
        fillQuad(g, pTL_ledge, pTR_ledge, pTR, pTL, topColor);

        g.lineStyle(1.5, 0x1c1a16, 0.7);
        const pMidL = worldToScreen(xFace, to, zGround + 0.11);
        const pMidR = worldToScreen(xFace, from, zGround + 0.11);
        g.beginPath();
        g.moveTo(pMidL.x, pMidL.y);
        g.lineTo(pMidR.x, pMidR.y);
        g.strokePath();
      }
    };

    const drawDoorstep = (g: Phaser.GameObjects.Graphics, x0: number, x1: number, y: number) => {
      const p0 = worldToScreen(x0, y + 0.12, 0.0);
      const p1 = worldToScreen(x1, y + 0.12, 0.0);
      const p2 = worldToScreen(x1, y - 0.12, 0.03);
      const p3 = worldToScreen(x0, y - 0.12, 0.03);
      fillQuad(g, p0, p1, p2, p3, 0x5c544a);
      g.lineStyle(1.5, 0x3a342c, 0.9);
      g.beginPath();
      g.moveTo(p0.x, p0.y);
      g.lineTo(p1.x, p1.y);
      g.strokePath();
    };

    // Plinth is segmented by 1.6m steps matching WallPiece so each section has its exact local depth!
    // This prevents long 12m walls from drawing in front of the plinth on one end and behind on the other.
    for (const run of groundFloor?.wallRuns ?? []) {
      const exterior =
        run.axis === 'h'
          ? run.fixed <= bMinY + 1e-6 || run.fixed >= bMaxY - 1e-6
          : run.fixed <= bMinX + 1e-6 || run.fixed >= bMaxX - 1e-6;
      if (!exterior) continue;
      const facing: 'north' | 'south' | 'east' | 'west' =
        run.axis === 'h'
          ? run.fixed <= bMinY + 1e-6 ? 'north' : 'south'
          : run.fixed <= bMinX + 1e-6 ? 'west' : 'east';
      const near = facing === 'south' || facing === 'east';

      const step = 1.6;
      const totalLen = (run.to - run.from) * 1.6;
      for (let s = 0; s < totalLen - 1e-4; s += step) {
        const e = Math.min(totalLen, s + step);
        const fromTile = run.from + s / 1.6;
        const toTile = run.from + e / 1.6;
        const midTile = (fromTile + toTile) / 2;
        const localWallDepth = (run.axis === 'h' ? midTile + run.fixed : run.fixed + midTile) + 0.35;
        const depth = localWallDepth + (near ? 0.02 : -0.02);
        const g = scene.add.graphics().setDepth(depth);
        this.foundationCurbs.push(g);
        drawPlinthSegment(g, run.axis, run.fixed, fromTile, toTile, facing);
      }
    }
    for (const opening of groundFloor?.openings ?? []) {
      if (opening.kind !== 'door') continue;
      const run = groundFloor?.wallRuns.find((candidate) => candidate.id === opening.wallRunId);
      if (!run || run.axis !== 'h') continue;
      const x0 = run.from + opening.startM / 1.6;
      const x1 = run.from + (opening.startM + opening.widthM) / 1.6;
      const doorstepDepth = (x0 + x1) / 2 + run.fixed + 0.37;
      const g = scene.add.graphics().setDepth(doorstepDepth);
      this.foundationCurbs.push(g);
      drawDoorstep(g, x0, x1, run.fixed);
    }


    for (const floor of building.floors) {
      this.buildFloor(floor, objects, states, doorStates, windowStates);
    }
    this.buildRoof();
  }

  private buildFloor(
    floor: FloorSpec,
    objects: ObjectInstance[],
    states: Record<string, ObjectState>,
    doorStates: DoorState[],
    windowStates: WindowState[],
  ): void {
    const floorGraphics = this.scene.add.graphics().setDepth(FLOOR_BAND * floor.level - 1000);
    const stairHoles = floor.floor.holes ?? [];
    // The stair hole underlay belongs to the floor below and must stay beneath
    // raised slabs (the terrace) while still covering the lower floor surface.
    const stairHoleGraphics = stairHoles.length > 0
      ? this.scene.add.graphics().setDepth(FLOOR_BAND * (floor.level - 1) + 100)
      : undefined;
    const floorTextureKey = floor.floor.material === 'concrete' ? 'gen_floor_concrete' : 'gen_floor_wood';

    let fMinX = Infinity, fMaxX = -Infinity, fMinY = Infinity, fMaxY = -Infinity;
    for (const rect of floor.floor.cells) {
      fMinX = Math.min(fMinX, rect.x);
      fMaxX = Math.max(fMaxX, rect.x + rect.w);
      fMinY = Math.min(fMinY, rect.y);
      fMaxY = Math.max(fMaxY, rect.y + rect.h);
    }

    const scrP0 = worldToScreen(fMinX, fMaxY, floor.elevationM);
    const scrP1 = worldToScreen(fMaxX, fMinY, floor.elevationM);
    const scrP2 = worldToScreen(fMinX, fMinY, floor.elevationM);
    const scrP3 = worldToScreen(fMaxX, fMaxY, floor.elevationM);

    const minScrX = Math.min(scrP0.x, scrP1.x, scrP2.x, scrP3.x);
    const minScrY = Math.min(scrP0.y, scrP1.y, scrP2.y, scrP3.y);
    const maxScrX = Math.max(scrP0.x, scrP1.x, scrP2.x, scrP3.x);
    const maxScrY = Math.max(scrP0.y, scrP1.y, scrP2.y, scrP3.y);

    const floorW = Math.max(1, Math.ceil(maxScrX - minScrX));
    const floorH = Math.max(1, Math.ceil(maxScrY - minScrY));

    let floorImage: Phaser.GameObjects.Image | undefined;
    const floorCanvasKey = `floor_canvas_${floor.level}`;
    if (this.scene.textures.exists(floorCanvasKey)) this.scene.textures.remove(floorCanvasKey);

    if (this.scene.textures.exists(floorTextureKey)) {
      const canvas = this.scene.textures.createCanvas(floorCanvasKey, floorW, floorH);
      if (canvas) {
        const ctx = canvas.getContext();
        const sourceImg = this.scene.textures.get(floorTextureKey).getSourceImage() as HTMLImageElement;
        const pattern = ctx.createPattern(sourceImg, 'repeat');
        if (pattern && typeof DOMMatrix !== 'undefined') {
          // Narrow planks: scale 0.22 gives ~14 narrow planks per 1-meter floor tile
          const scale = floor.floor.material === 'wood' ? 0.22 : 0.45;
          pattern.setTransform(new DOMMatrix().scale(scale, scale));
        }

        for (const rect of floor.floor.cells) {
          for (let y = rect.y; y < rect.y + rect.h; y++) {
            for (let x = rect.x; x < rect.x + rect.w; x++) {
              const isHole = (floor.floor.holes ?? []).some((h) => x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h);
              if (isHole) continue;

              const p0 = worldToScreen(x, y, floor.elevationM + 0.02);
              const p1 = worldToScreen(x + 1, y, floor.elevationM + 0.02);
              const p2 = worldToScreen(x + 1, y + 1, floor.elevationM + 0.02);
              const p3 = worldToScreen(x, y + 1, floor.elevationM + 0.02);

              ctx.save();
              ctx.beginPath();
              ctx.moveTo(p0.x - minScrX, p0.y - minScrY);
              ctx.lineTo(p1.x - minScrX, p1.y - minScrY);
              ctx.lineTo(p2.x - minScrX, p2.y - minScrY);
              ctx.lineTo(p3.x - minScrX, p3.y - minScrY);
              ctx.closePath();
              ctx.clip();

              ctx.fillStyle = pattern!;
              ctx.fillRect(Math.min(p0.x, p3.x) - minScrX, Math.min(p0.y, p1.y) - minScrY, 66, 34);

              if (floor.floor.material === 'concrete') {
                ctx.strokeStyle = 'rgba(40, 42, 40, 0.35)';
                ctx.lineWidth = 1;
                ctx.stroke();
              }
              ctx.restore();
            }
          }
        }
        canvas.refresh();
        floorImage = this.scene.add.image(minScrX, minScrY, floorCanvasKey).setOrigin(0, 0).setDepth(FLOOR_BAND * floor.level - 1000);
      }
    } else {
      for (const rect of floor.floor.cells) {
        for (let y = rect.y; y < rect.y + rect.h; y++) {
          for (let x = rect.x; x < rect.x + rect.w; x++) {
            if ((floor.floor.holes ?? []).some((hole) => x >= hole.x && x < hole.x + hole.w && y >= hole.y && y < hole.y + hole.h)) continue;
            const points = [
              worldToScreen(x, y, floor.elevationM + 0.02),
              worldToScreen(x + 1, y, floor.elevationM + 0.02),
              worldToScreen(x + 1, y + 1, floor.elevationM + 0.02),
              worldToScreen(x, y + 1, floor.elevationM + 0.02),
            ];
            fillQuad(floorGraphics, points[0], points[1], points[2], points[3], floor.floor.material === 'concrete' ? 0x6e706b : 0x826c50);
          }
        }
      }
    }

    // Floor 0 stair hole: draw deep basement concrete floor beneath hole + bullnose edge trim
    if (floor.level === 0 && stairHoleGraphics) {
      for (const hole of stairHoles) {
        for (let y = hole.y; y < hole.y + hole.h; y++) {
          for (let x = hole.x; x < hole.x + hole.w; x++) {
            const b0 = worldToScreen(x, y, -3.0);
            const b1 = worldToScreen(x + 1, y, -3.0);
            const b2 = worldToScreen(x + 1, y + 1, -3.0);
            const b3 = worldToScreen(x, y + 1, -3.0);
            fillQuad(stairHoleGraphics, b0, b1, b2, b3, 0x2c2d2c);
          }
        }
        const hTL = worldToScreen(hole.x, hole.y, floor.elevationM + 0.03);
        const hTR = worldToScreen(hole.x + hole.w, hole.y, floor.elevationM + 0.03);
        const hBR = worldToScreen(hole.x + hole.w, hole.y + hole.h, floor.elevationM + 0.03);
        const hBL = worldToScreen(hole.x, hole.y + hole.h, floor.elevationM + 0.03);
        stairHoleGraphics.lineStyle(3, 0x543c24, 1);
        stairHoleGraphics.beginPath();
        stairHoleGraphics.moveTo(hTL.x, hTL.y);
        stairHoleGraphics.lineTo(hTR.x, hTR.y);
        stairHoleGraphics.lineTo(hBR.x, hBR.y);
        stairHoleGraphics.lineTo(hBL.x, hBL.y);
        stairHoleGraphics.closePath();
        stairHoleGraphics.strokePath();
      }
    }

    // Floor 1 stair hole: draw Floor 0 foyer floor beneath hole so outdoor grass NEVER shows through!
    if (floor.level === 1 && stairHoleGraphics) {
      for (const hole of stairHoles) {
        for (let y = hole.y; y < hole.y + hole.h; y++) {
          for (let x = hole.x; x < hole.x + hole.w; x++) {
            const b0 = worldToScreen(x, y, 0.0);
            const b1 = worldToScreen(x + 1, y, 0.0);
            const b2 = worldToScreen(x + 1, y + 1, 0.0);
            const b3 = worldToScreen(x, y + 1, 0.0);
            fillQuad(stairHoleGraphics, b0, b1, b2, b3, 0x5a4832);
          }
        }
        const hTL = worldToScreen(hole.x, hole.y, floor.elevationM + 0.03);
        const hTR = worldToScreen(hole.x + hole.w, hole.y, floor.elevationM + 0.03);
        const hBR = worldToScreen(hole.x + hole.w, hole.y + hole.h, floor.elevationM + 0.03);
        const hBL = worldToScreen(hole.x, hole.y + hole.h, floor.elevationM + 0.03);
        stairHoleGraphics.lineStyle(3, 0x543c24, 1);
        stairHoleGraphics.beginPath();
        stairHoleGraphics.moveTo(hTL.x, hTL.y);
        stairHoleGraphics.lineTo(hTR.x, hTR.y);
        stairHoleGraphics.lineTo(hBR.x, hBR.y);
        stairHoleGraphics.lineTo(hBL.x, hBL.y);
        stairHoleGraphics.closePath();
        stairHoleGraphics.strokePath();
      }
    }

    const walls: WallPiece[] = [];
    for (const run of floor.wallRuns) {
      const intervals = solidIntervals(run, floor.openings);
      for (const interval of intervals) {
        const step = 1.6;
        for (let s = interval.startM; s < interval.endM - 1e-4; s += step) {
          const e = Math.min(interval.endM, s + step);
          walls.push(new WallPiece(this.scene, floor, run, s, e));
        }
      }
      for (const opening of floor.openings.filter((o) => o.wallRunId === run.id)) {
        if (opening.kind === 'door') {
          walls.push(new WallPiece(this.scene, floor, run, opening.startM, opening.startM + opening.widthM, opening.heightM, run.heightM));
        } else if (opening.kind === 'window') {
          walls.push(new WallPiece(this.scene, floor, run, opening.startM, opening.startM + opening.widthM, 0, opening.sillM));
          walls.push(new WallPiece(this.scene, floor, run, opening.startM, opening.startM + opening.widthM, opening.sillM + opening.heightM, run.heightM));
        } else if (opening.kind === 'arch') {
          walls.push(new WallPiece(this.scene, floor, run, opening.startM, opening.startM + opening.widthM, opening.heightM, run.heightM));
        }
      }
    }

    const doors: DoorView[] = [];
    const windows: WindowView[] = [];
    for (const opening of floor.openings) {
      const run = floor.wallRuns.find((candidate) => candidate.id === opening.wallRunId);
      if (!run) continue;
      if (opening.kind === 'door') {
        const state = doorStates.find((entry) => entry.openingId === opening.id) ?? { openingId: opening.id, open: false, locked: false, hp: 100, revision: 0 };
        const view = new DoorView(this.scene, floor, run, opening, state);
        doors.push(view);
        this.doorViews.set(opening.id, view);
      } else if (opening.kind === 'window') {
        const state = windowStates.find((entry) => entry.openingId === opening.id) ?? { openingId: opening.id, broken: false, boarded: false, hp: 100, revision: 0 };
        const view = new WindowView(this.scene, floor, run, opening, state);
        windows.push(view);
        this.windowViews.set(opening.id, view);
      }
    }

    const furniture: InteriorView[] = [];
    for (const object of objects.filter((candidate) => candidate.level === floor.level)) {
      const view = new InteriorView(this.scene, this.building, floor, object, states[object.id]);
      furniture.push(view);
      this.furnitureViews.set(object.id, view);
    }

    const stairs = floor.stairs.map((stair) => new StairView(this.scene, floor, stair));
    const lowerFloor = this.building.floors.find((candidate) => candidate.level === floor.level - 1);
    const lowerZ = lowerFloor?.elevationM ?? floor.elevationM - 3.0;
    const shafts = stairHoles.map((hole) => new StairShaftView(this.scene, floor, hole, lowerZ));

    // Fill texture seam where two exterior wall canvases meet at building corners.
    // Kept strictly beneath the wall face (+0.34 < +0.35) so it never paints over exterior corner pilasters!
    const joints: Phaser.GameObjects.Graphics[] = [];
    if (floor.level >= 0) {
      const seen = new Set<string>();
      for (const run of floor.wallRuns) {
        if (!wallIsExterior(run, floor)) continue;
        const endpoints = run.axis === 'h'
          ? [{ x: run.from, y: run.fixed }, { x: run.to, y: run.fixed }]
          : [{ x: run.fixed, y: run.from }, { x: run.fixed, y: run.to }];
        for (const point of endpoints) {
          const key = `${point.x},${point.y}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const g = this.scene.add.graphics()
            .setDepth(point.x + point.y + FLOOR_BAND * floor.level + 0.34);
          const z0 = floor.elevationM;
          const z1 = z0 + run.heightM;
          const half = run.thicknessM / 2;
          const p = (px: number, py: number, pz: number) => worldToScreen(px, py, pz);
          // Brick corner seam filler: uses wall brick/mortar tone, never black!
          if (run.axis === 'h') {
            fillQuad(g, p(point.x, point.y - half, z0), p(point.x, point.y + half, z0), p(point.x, point.y + half, z1), p(point.x, point.y - half, z1), 0x5a483e);
          } else {
            fillQuad(g, p(point.x - half, point.y, z0), p(point.x + half, point.y, z0), p(point.x + half, point.y, z1), p(point.x - half, point.y, z1), 0x524238);
          }
          joints.push(g);
        }
      }
    }

    this.floors.set(floor.level, {
      floor: floorGraphics,
      floorImage,
      stairHole: stairHoleGraphics,
      walls,
      doors,
      windows,
      furniture,
      stairs,
      shafts,
      joints,
    });
  }

  private buildRoof(): void {
    if (!this.building.roof) return;

    const buildRoofSlab = (
      key: string,
      minX: number,
      maxX: number,
      minY: number,
      maxY: number,
      zBase: number,
      zTop: number,
      depth: number,
      withDetails: boolean,
    ): Phaser.GameObjects.Image | undefined => {
      const roofP0 = worldToScreen(minX, minY, zTop);
      const roofP1 = worldToScreen(maxX, minY, zTop);
      const roofP2 = worldToScreen(maxX, maxY, zTop);
      const roofP3 = worldToScreen(minX, maxY, zTop);

      const minScrX = Math.min(roofP0.x, roofP1.x, roofP2.x, roofP3.x) - 16;
      const minScrY = Math.min(roofP0.y, roofP1.y, roofP2.y, roofP3.y) - 16;
      const maxScrX = Math.max(roofP0.x, roofP1.x, roofP2.x, roofP3.x) + 16;
      const maxScrY = Math.max(roofP0.y, roofP1.y, roofP2.y, roofP3.y) + 16;
      const rW = Math.max(1, Math.ceil(maxScrX - minScrX));
      const rH = Math.max(1, Math.ceil(maxScrY - minScrY));

      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
      const roofCanvas = this.scene.textures.createCanvas(key, rW, rH);
      if (!roofCanvas) return undefined;

      const ctx = roofCanvas.getContext();

      // South vertical fascia
      const s0 = worldToScreen(minX, maxY, zTop);
      const s1 = worldToScreen(maxX, maxY, zTop);
      const s2 = worldToScreen(maxX, maxY, zBase);
      const s3 = worldToScreen(minX, maxY, zBase);
      ctx.fillStyle = '#2c2925';
      ctx.beginPath();
      ctx.moveTo(s0.x - minScrX, s0.y - minScrY);
      ctx.lineTo(s1.x - minScrX, s1.y - minScrY);
      ctx.lineTo(s2.x - minScrX, s2.y - minScrY);
      ctx.lineTo(s3.x - minScrX, s3.y - minScrY);
      ctx.closePath();
      ctx.fill();

      // East vertical fascia
      const e0 = worldToScreen(maxX, minY, zTop);
      const e1 = worldToScreen(maxX, maxY, zTop);
      const e2 = worldToScreen(maxX, maxY, zBase);
      const e3 = worldToScreen(maxX, minY, zBase);
      ctx.fillStyle = '#201e1c';
      ctx.beginPath();
      ctx.moveTo(e0.x - minScrX, e0.y - minScrY);
      ctx.lineTo(e1.x - minScrX, e1.y - minScrY);
      ctx.lineTo(e2.x - minScrX, e2.y - minScrY);
      ctx.lineTo(e3.x - minScrX, e3.y - minScrY);
      ctx.closePath();
      ctx.fill();

      // Top roof surface
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(roofP0.x - minScrX, roofP0.y - minScrY);
      ctx.lineTo(roofP1.x - minScrX, roofP1.y - minScrY);
      ctx.lineTo(roofP2.x - minScrX, roofP2.y - minScrY);
      ctx.lineTo(roofP3.x - minScrX, roofP3.y - minScrY);
      ctx.closePath();
      ctx.clip();

      if (this.scene.textures.exists('gen_roof_tar')) {
        const tarImg = this.scene.textures.get('gen_roof_tar').getSourceImage() as HTMLImageElement;
        const a = (roofP1.x - roofP0.x) / (tarImg.width * 2.2);
        const b = (roofP1.y - roofP0.y) / (tarImg.width * 2.2);
        const c = (roofP3.x - roofP0.x) / (tarImg.height * 2.2);
        const d = (roofP3.y - roofP0.y) / (tarImg.height * 2.2);
        ctx.setTransform(a, b, c, d, roofP0.x - minScrX, roofP0.y - minScrY);
        for (let tx = 0; tx < 3; tx++) {
          for (let ty = 0; ty < 3; ty++) {
            ctx.drawImage(tarImg, tx * tarImg.width, ty * tarImg.height);
          }
        }
      } else {
        ctx.fillStyle = '#2b2c2a';
        ctx.fillRect(0, 0, rW, rH);
      }
      ctx.restore();

      // Bituminous seams
      ctx.strokeStyle = 'rgba(15, 15, 12, 0.75)';
      ctx.lineWidth = 2.5;
      for (let offset = 0.22; offset < 0.95; offset += 0.28) {
        const lx0 = roofP0.x + (roofP3.x - roofP0.x) * offset;
        const ly0 = roofP0.y + (roofP3.y - roofP0.y) * offset;
        const lx1 = roofP1.x + (roofP2.x - roofP1.x) * offset;
        const ly1 = roofP1.y + (roofP2.y - roofP1.y) * offset;
        ctx.beginPath();
        ctx.moveTo(lx0 - minScrX, ly0 - minScrY);
        ctx.lineTo(lx1 - minScrX, ly1 - minScrY);
        ctx.stroke();
      }

      if (withDetails) {
        // Roof maintenance access hatch at (37.0, 30.0)
        const hTL = worldToScreen(36.5, 30.0, zTop);
        const hTR = worldToScreen(37.5, 30.0, zTop);
        const hBR = worldToScreen(37.5, 31.0, zTop);
        const hBL = worldToScreen(36.5, 31.0, zTop);
        ctx.fillStyle = '#1c1b18';
        ctx.beginPath();
        ctx.moveTo(hTL.x - minScrX, hTL.y - minScrY);
        ctx.lineTo(hTR.x - minScrX, hTR.y - minScrY);
        ctx.lineTo(hBR.x - minScrX, hBR.y - minScrY);
        ctx.lineTo(hBL.x - minScrX, hBL.y - minScrY);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#4a443b';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Exhaust vent pipe with shadow at (32.5, 30.5)
        const ventBase = worldToScreen(32.5, 30.5, zTop);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.beginPath();
        ctx.ellipse(ventBase.x - minScrX + 4, ventBase.y - minScrY + 2, 7, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3a3a36';
        ctx.fillRect(ventBase.x - minScrX - 3, ventBase.y - minScrY - 14, 6, 14);
        ctx.fillStyle = '#5c5850';
        ctx.beginPath();
        ctx.arc(ventBase.x - minScrX, ventBase.y - minScrY - 14, 6, Math.PI, 0);
        ctx.fill();
      }

      // Parapet stone coping cap on outer edges
      ctx.strokeStyle = '#5a5448';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      if (withDetails) {
        // Mansard roof: all four sides
        ctx.moveTo(roofP0.x - minScrX, roofP0.y - minScrY);
        ctx.lineTo(roofP1.x - minScrX, roofP1.y - minScrY);
        ctx.lineTo(roofP2.x - minScrX, roofP2.y - minScrY);
        ctx.lineTo(roofP3.x - minScrX, roofP3.y - minScrY);
        ctx.closePath();
      } else {
        // Terrace: only exterior edges (West -> South -> East), omitting the North edge touching the brick wall!
        ctx.moveTo(roofP0.x - minScrX, roofP0.y - minScrY);
        ctx.lineTo(roofP3.x - minScrX, roofP3.y - minScrY);
        ctx.lineTo(roofP2.x - minScrX, roofP2.y - minScrY);
        ctx.lineTo(roofP1.x - minScrX, roofP1.y - minScrY);
      }
      ctx.stroke();

      // Stone coping outer bevel highlight
      ctx.strokeStyle = '#7c7465';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(roofP3.x - minScrX, roofP3.y - minScrY);
      ctx.lineTo(roofP2.x - minScrX, roofP2.y - minScrY);
      ctx.lineTo(roofP1.x - minScrX, roofP1.y - minScrY);
      ctx.stroke();

      // Lower fascia drip edge shadow
      ctx.strokeStyle = '#100f0e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s3.x - minScrX, s3.y - minScrY);
      ctx.lineTo(s2.x - minScrX, s2.y - minScrY);
      ctx.lineTo(e2.x - minScrX, e2.y - minScrY);
      ctx.stroke();

      roofCanvas.refresh();
      return this.scene.add.image(minScrX, minScrY, key)
        .setOrigin(0, 0)
        .setDepth(depth);
    };

    const mansardFloor = this.building.floors.find((floor) => floor.level === 1);
    const roof = this.building.roof;
    if (roof && mansardFloor) {
      const bounds = (cells: typeof roof.cells) => {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const cell of cells) {
          minX = Math.min(minX, cell.x);
          maxX = Math.max(maxX, cell.x + cell.w);
          minY = Math.min(minY, cell.y);
          maxY = Math.max(maxY, cell.y + cell.h);
        }
        return { minX, maxX, minY, maxY };
      };
      const roofBounds = bounds(roof.cells);
      const roofBase = mansardFloor.elevationM + mansardFloor.clearHeightM;
      const roofTop = roofBase + Math.max(0.1, roof.thicknessM);
      const mansardRoof = buildRoofSlab(
        'roof_mansard',
        roofBounds.minX,
        roofBounds.maxX,
        roofBounds.minY,
        roofBounds.maxY,
        roofBase,
        roofTop,
        FLOOR_BAND * 1 + 9000,
        true,
      );
      if (mansardRoof) this.mansardRoofObjects.push(mansardRoof);

      // Raised open surfaces (the terrace) are data, not a second hardcoded roof.
      // Must have depth above level 0 stairs (10064) so rising stairs NEVER poke through terrace floor!
      (mansardFloor.walkable ?? []).forEach((region, index) => {
        const key = index === 0 ? 'terrace_front' : `terrace_${index}`;
        const base = region.elevationM - (region.thicknessM ?? 0.25);
        const terrace = buildRoofSlab(
          key,
          region.x,
          region.x + region.w,
          region.y,
          region.y + region.h,
          base,
          region.elevationM,
          FLOOR_BAND * 1 + 8000,
          false,
        );
        if (terrace) this.terraceRoofObjects.push(terrace);
      });

      // Roof equipment: HVAC unit firmly grounded on mounting rails with contact shadow
      for (const fixture of this.building.fixtures ?? []) {
        const pos = worldToScreen(fixture.x, fixture.y, fixture.elevationM);
        const fixtureDepth = FLOOR_BAND * fixture.level + 8050 + fixture.x + fixture.y;
        const shadow = this.scene.add.graphics().setDepth(fixtureDepth - 1);

        // Dark rectangular footprint contact shadow on tar surface
        const halfW = (fixture.widthM ?? 1.0) * 0.55 / 1.6;
        const halfD = (fixture.depthM ?? 0.9) * 0.55 / 1.6;
        const pR0 = worldToScreen(fixture.x - halfW, fixture.y - halfD, fixture.elevationM);
        const pR1 = worldToScreen(fixture.x + halfW, fixture.y - halfD, fixture.elevationM);
        const pR2 = worldToScreen(fixture.x + halfW, fixture.y + halfD, fixture.elevationM);
        const pR3 = worldToScreen(fixture.x - halfW, fixture.y + halfD, fixture.elevationM);
        shadow.fillStyle(0x060605, 0.45);
        shadow.fillPoints([pR0, pR1, pR2, pR3], true);

        // Two steel mounting channel rails directly under unit feet
        shadow.fillStyle(0x282b29, 0.95);
        const rW = 0.08 / 1.6;
        // Left mounting rail
        const l0 = worldToScreen(fixture.x - halfW * 0.75, fixture.y - halfD * 0.9, fixture.elevationM);
        const l1 = worldToScreen(fixture.x - halfW * 0.75 + rW, fixture.y - halfD * 0.9, fixture.elevationM);
        const l2 = worldToScreen(fixture.x - halfW * 0.75 + rW, fixture.y + halfD * 0.9, fixture.elevationM);
        const l3 = worldToScreen(fixture.x - halfW * 0.75, fixture.y + halfD * 0.9, fixture.elevationM);
        shadow.fillPoints([l0, l1, l2, l3], true);

        // Right mounting rail
        const r0 = worldToScreen(fixture.x + halfW * 0.75 - rW, fixture.y - halfD * 0.9, fixture.elevationM);
        const r1 = worldToScreen(fixture.x + halfW * 0.75, fixture.y - halfD * 0.9, fixture.elevationM);
        const r2 = worldToScreen(fixture.x + halfW * 0.75, fixture.y + halfD * 0.9, fixture.elevationM);
        const r3 = worldToScreen(fixture.x + halfW * 0.75 - rW, fixture.y + halfD * 0.9, fixture.elevationM);
        shadow.fillPoints([r0, r1, r2, r3], true);

        this.terraceRoofObjects.push(shadow);

        const fixtureImage = artImage(this.scene, pos.x, pos.y, fixture.textureKey)
          .setOrigin(0.5, 0.98)
          .setDepth(fixtureDepth)
          .setDisplaySize(fixture.widthPx ?? 80, fixture.heightPx ?? 80);
        this.terraceRoofObjects.push(fixtureImage);
      }
    }
  }

  /** True when a visible building surface covers the given scene point at a
   * depth greater than `depth` (used for the through-wall player outline). */
  occludesPoint(sx: number, sy: number, depth: number): boolean {
    for (const entry of this.floors.values()) {
      for (const wall of entry.walls) if (wall.occludes(sx, sy, depth)) return true;
      for (const door of entry.doors) if (door.occludes(sx, sy, depth)) return true;
      for (const window of entry.windows) if (window.occludes(sx, sy, depth)) return true;
    }
    for (const obj of this.mansardRoofObjects) {
      if (obj instanceof Phaser.GameObjects.Image && imageOccludes(obj, sx, sy, depth)) return true;
    }
    for (const obj of this.terraceRoofObjects) {
      if (obj instanceof Phaser.GameObjects.Image && imageOccludes(obj, sx, sy, depth)) return true;
    }
    return false;
  }

  setDoor(id: string, state: DoorState): void {
    this.doorViews.get(id)?.setState(state);
    const view = this.doorViews.get(id);
    for (const entry of this.floors.values()) {
      for (const door of entry.doors) if (door === view) door.setState(state);
    }
  }

  setWindow(id: string, state: WindowState): void {
    this.windowViews.get(id)?.setState(state);
  }

  setObjectState(id: string, state: ObjectState): void {
    this.furnitureViews.get(id)?.setState(state);
  }

  private stairVisibilityFloor(floor: number): number {
    // Stairs are interior geometry. Hide them from the exterior shell and from
    // the open terrace; keep them visible on the basement/current interior.
    return this.inside || floor === -1 ? floor : 999;
  }

  private roomHere(x: number, y: number, floor: number): boolean {
    const spec = this.building.floors.find((candidate) => candidate.level === floor);
    if (!spec) return false;
    const buildingRooms = spec.rooms;
    for (const room of buildingRooms) {
      for (const rect of room.rects) {
        if (x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h) return true;
      }
    }
    return false;
  }

  updateLocal(x: number, y: number, floor: number, isInside: boolean): void {
    this.local = { x, y };
    this.activeFloor = floor;
    this.inside = isInside && this.roomHere(x, y, floor);

    // Plinth (curb) & subfloor: strictly visible when activeFloor >= 0 AND player is outside; completely hidden inside and in basement
    const curbVisible = floor >= 0 && !this.inside;
    for (const curb of this.foundationCurbs) curb.setVisible(curbVisible);
    this.subfloor?.setVisible(foundationVisible(floor) && !this.inside);

    for (const [level, entry] of this.floors) {
      if (level === -1) {
        // Basement: only active when player is on floor -1
        const active = floor === -1;
        entry.floor.setVisible(active);
        entry.floorImage?.setVisible(active);
        for (const wall of entry.walls) wall.setActive(active);
        for (const door of entry.doors) door.setActive(active);
        for (const window of entry.windows) window.setActive(active);
        for (const furniture of entry.furniture) furniture.setVisible(active);
        for (const stair of entry.stairs) stair.setActive(this.stairVisibilityFloor(floor));
      } else if (level === 0) {
        // Ground floor
        if (floor === -1) {
          // Inside basement: ground floor is completely hidden
          entry.floor.setVisible(false);
          entry.floorImage?.setVisible(false);
          for (const wall of entry.walls) wall.setActive(false);
          for (const door of entry.doors) door.setActive(false);
          for (const window of entry.windows) window.setActive(false);
          for (const furniture of entry.furniture) furniture.setVisible(false);
          for (const stair of entry.stairs) stair.setActive(this.stairVisibilityFloor(floor));
        } else if (floor === 0) {
          // On ground floor
          const active = true;
          entry.floor.setVisible(active && (!this.inside || level === floor));
          entry.floorImage?.setVisible(active && (!this.inside || level === floor));
          for (const wall of entry.walls) wall.setActive(active);
          for (const door of entry.doors) door.setActive(active);
          for (const window of entry.windows) window.setActive(active);
          for (const furniture of entry.furniture) furniture.setVisible(this.inside);
          for (const stair of entry.stairs) stair.setActive(this.stairVisibilityFloor(floor));
        } else if (floor === 1) {
          // On 2nd floor (Mansard): Floor 0 exterior walls/windows stay visible from outside!
          entry.floor.setVisible(false);
          entry.floorImage?.setVisible(false);
          const ground = this.building.floors.find((candidate) => candidate.level === 0);
          for (const wall of entry.walls) {
            const isExterior = ground ? wallIsExterior(wall.run, ground) : false;
            wall.setActive(isExterior);
            if (isExterior) wall.setCut(false);
          }
          for (const door of entry.doors) {
            door.setActive(true);
            door.setCut(false);
          }
          for (const window of entry.windows) {
            window.setActive(true);
            window.setCut(false);
          }
          for (const furniture of entry.furniture) furniture.setVisible(false);
          for (const stair of entry.stairs) stair.setActive(this.stairVisibilityFloor(floor));
        }
      } else if (level === 1) {
        // Mansard / 2nd floor
        if (floor === -1) {
          // Inside basement: 2nd floor is hidden
          entry.floor.setVisible(false);
          entry.floorImage?.setVisible(false);
          for (const wall of entry.walls) wall.setActive(false);
          for (const door of entry.doors) door.setActive(false);
          for (const window of entry.windows) window.setActive(false);
          for (const furniture of entry.furniture) furniture.setVisible(false);
          for (const stair of entry.stairs) stair.setActive(this.stairVisibilityFloor(floor));
        } else if (floor === 0) {
          // On ground floor: 2nd floor exterior visible from outside, hidden when inside
          const active = !this.inside;
          entry.floor.setVisible(active);
          entry.floorImage?.setVisible(active);
          for (const wall of entry.walls) wall.setActive(active);
          for (const door of entry.doors) door.setActive(active);
          for (const window of entry.windows) window.setActive(active);
          for (const furniture of entry.furniture) furniture.setVisible(false);
          for (const stair of entry.stairs) stair.setActive(this.stairVisibilityFloor(floor));
        } else if (floor === 1) {
          // On 2nd floor
          const active = true;
          entry.floor.setVisible(active);
          entry.floorImage?.setVisible(active);
          for (const wall of entry.walls) wall.setActive(active);
          for (const door of entry.doors) door.setActive(active);
          for (const window of entry.windows) window.setActive(active);
          for (const furniture of entry.furniture) furniture.setVisible(this.inside);
          for (const stair of entry.stairs) stair.setActive(this.stairVisibilityFloor(floor));
        }
      }
    }

    // Stair-hole underlays follow their floor's visibility so they never
    // linger over exposed lower surfaces when the floor is hidden.
    for (const entry of this.floors.values()) entry.stairHole?.setVisible(entry.floor.visible);
    for (const [level, entry] of this.floors) {
      const shaftActive = level === 0 ? floor === 0 : level === 1 ? floor === 1 && this.inside : false;
      for (const shaft of entry.shafts) shaft.setActive(shaftActive);
      for (const joint of entry.joints) joint.setVisible(!this.inside);
    }

    // Mansard roof: visible only from outside. Inside the cutaway it must not
    // cover the space the player is inspecting.
    for (const obj of this.mansardRoofObjects) obj.setVisible(mansardRoofVisible(floor, this.inside));

    // Front terrace roof: visible from outside and while inspecting floor 1.
    // The stair shaft is drawn above it, so the opening stays readable.
    for (const obj of this.terraceRoofObjects) {
      obj.setVisible(terraceRoofVisible(floor, this.inside));
    }

    // Cutaway wall slicing for current interior floor
    const current = this.floors.get(floor);
    const currentSpec = this.building.floors.find((candidate) => candidate.level === floor);
    if (current && currentSpec && this.inside) {
      const cutWalls = cutWallIds(currentSpec, x, y);
      for (const wall of current.walls) {
        const run = this.building.floors.find((candidate) => candidate.level === floor)?.wallRuns.find((candidate) => candidate.id === wall.run.id);
        if (run) wall.setCut(cutWalls.has(run.id));
      }
      for (const door of current.doors) {
        door.setCut(cutWalls.has(door.run.id));
      }
      for (const window of current.windows) {
        window.setCut(cutWalls.has(window.run.id));
      }
      for (const [id, furniture] of this.furnitureViews) {
        const object = furniture.object;
        const cut = object.placement.mount === 'wall'
          ? cutWalls.has(object.placement.wallRunId)
          : (object.placement.mount === 'ceiling' && this.inside);
        furniture.setWallCut(cut);
      }
    } else {
      for (const entry of this.floors.values()) {
        for (const wall of entry.walls) wall.setCut(false);
        for (const door of entry.doors) door.setCut(false);
        for (const window of entry.windows) window.setCut(false);
      }
      for (const furniture of this.furnitureViews.values()) furniture.setWallCut(false);
    }
  }

  destroy(): void {
    this.subfloor?.destroy();
    for (const curb of this.foundationCurbs) curb.destroy();
    this.foundationCurbs = [];
    for (const entry of this.floors.values()) {
      entry.floor.destroy();
      entry.floorImage?.destroy();
      entry.stairHole?.destroy();
      for (const wall of entry.walls) wall.destroy();
      for (const door of entry.doors) door.destroy();
      for (const window of entry.windows) window.destroy();
      for (const furniture of entry.furniture) furniture.destroy();
      for (const stair of entry.stairs) stair.destroy();
      for (const shaft of entry.shafts) shaft.destroy();
      for (const joint of entry.joints) joint.destroy();
    }
    for (const obj of this.mansardRoofObjects) obj.destroy();
    for (const obj of this.terraceRoofObjects) obj.destroy();
    this.floors.clear();
  }
}
