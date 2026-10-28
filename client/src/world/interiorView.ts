import Phaser from 'phaser';
import {
  OBJECT_TEMPLATES,
  PX_PER_METER,
  footprintAabb,
  runPointAtM,
  supportPoint,
  worldFootprintParts,
  type BuildingSpec,
  type FloorSpec,
  type ObjectInstance,
  type ObjectState,
  type WallRun,
  type WorldFootprint,
} from '@ashfall/shared';
import { worldToScreen, HALF_H } from '@ashfall/shared';
import { generatedFurnitureKey } from '../art/generatedAssets.js';

const FLOOR_BAND = 10_000;

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

function polygon(g: Phaser.GameObjects.Graphics, points: Array<{ x: number; y: number }>, color: number, alpha = 1): void {
  if (points.length < 3) return;
  g.fillStyle(color, alpha);
  g.beginPath();
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  g.closePath();
  g.fillPath();
}

function box(
  g: Phaser.GameObjects.Graphics,
  aabb: { minX: number; minY: number; maxX: number; maxY: number },
  elevationM: number,
  heightM: number,
  colors: { top: number; left: number; right: number },
): void {
  const zTop = elevationM + heightM;
  const p = (x: number, y: number, z: number) => worldToScreen(x, y, z);
  const base = [p(aabb.minX, aabb.minY, elevationM), p(aabb.maxX, aabb.minY, elevationM), p(aabb.maxX, aabb.maxY, elevationM), p(aabb.minX, aabb.maxY, elevationM)];
  const top = [p(aabb.minX, aabb.minY, zTop), p(aabb.maxX, aabb.minY, zTop), p(aabb.maxX, aabb.maxY, zTop), p(aabb.minX, aabb.maxY, zTop)];
  polygon(g, [base[1], base[2], top[2], top[1]], colors.right);
  polygon(g, [base[2], base[3], top[3], top[2]], colors.left);
  polygon(g, top, colors.top);
  polygon(g, [base[0], base[1], top[1], top[0]], colors.left, 0.7);
  polygon(g, [base[3], base[0], top[0], top[3]], colors.right, 0.7);
}

function diamond(g: Phaser.GameObjects.Graphics, aabb: { minX: number; minY: number; maxX: number; maxY: number }, elevationM: number, color: number, alpha = 1): void {
  const p = (x: number, y: number) => worldToScreen(x, y, elevationM);
  polygon(g, [p(aabb.minX, aabb.minY), p(aabb.maxX, aabb.minY), p(aabb.maxX, aabb.maxY), p(aabb.minX, aabb.maxY)], color, alpha);
}

export class InteriorView {
  readonly object: ObjectInstance;
  private scene: Phaser.Scene;
  private building: BuildingSpec;
  private floor: FloorSpec;
  private graphics: Phaser.GameObjects.Graphics;
  private image?: Phaser.GameObjects.Image;
  private state?: ObjectState;
  private wallCut = false;

  constructor(scene: Phaser.Scene, building: BuildingSpec, floor: FloorSpec, object: ObjectInstance, state?: ObjectState) {
    this.scene = scene;
    this.building = building;
    this.floor = floor;
    this.object = object;
    this.state = state;
    this.graphics = scene.add.graphics();
    this.draw();
  }

  private wallRun(): WallRun | undefined {
    if (this.object.placement.mount !== 'wall') return undefined;
    return this.floor.wallRuns.find((run) => run.id === (this.object.placement as Extract<typeof this.object.placement, { mount: 'wall' }>).wallRunId);
  }

  private draw(): void {
    const template = OBJECT_TEMPLATES[this.object.templateId];
    if (!template || this.state?.destroyed) {
      this.image?.setVisible(false);
      this.graphics.setVisible(false);
      return;
    }
    const elevation = this.floor.elevationM;
    const g = this.graphics;
    g.clear();

    const textureKey = generatedFurnitureKey(this.object.templateId);
    if (textureKey && this.scene.textures.exists(textureKey) && this.object.placement.mount === 'floor') {
      const parts = worldFootprintParts(this.object, template);
      const footprint = footprintAabb(parts);
      const support = supportPoint(parts);

      // Contact shadow on the floor
      g.clear();
      diamond(g, footprint, elevation, 0x080806, 0.4);
      g.setDepth(support.x + support.y + FLOOR_BAND * this.floor.level + 0.1);
      g.setVisible(true);

      const supportScreen = worldToScreen(support.x, support.y, elevation);

      if (!this.image) this.image = this.scene.add.image(supportScreen.x, supportScreen.y, textureKey).setOrigin(0.5, 1);
      this.image.setTexture(textureKey);
      const wT = template.sizeM.width / 1.6;
      const dT = template.sizeM.depth / 1.6;
      const targetH = template.sizeM.height * 40 + (wT + dT) * HALF_H;
      const aspect = this.image.width / Math.max(1, this.image.height);
      this.image.setDisplaySize(targetH * aspect, targetH);
      this.image.setPosition(supportScreen.x, supportScreen.y);
      this.image.setDepth(support.x + support.y + FLOOR_BAND * this.floor.level + 0.5);
      this.image.setVisible(true);
      return;
    }
    this.image?.setVisible(false);

    if (this.object.placement.mount === 'wall') {
      const run = this.wallRun();
      if (!run) return;
      const placement = this.object.placement;
      const wM = template.sizeM.width;
      const hM = template.sizeM.height;
      const z0 = elevation + placement.heightM - hM / 2;
      const z1 = elevation + placement.heightM + hM / 2;
      const halfThick = run.thicknessM / 2 + 0.02;

      const p0 = runPointAtM(run, placement.offsetM - wM / 2);
      const p1 = runPointAtM(run, placement.offsetM + wM / 2);

      let c0: { x: number; y: number };
      let c1: { x: number; y: number };
      if (run.axis === 'h') {
        c0 = { x: p0.x, y: run.fixed + halfThick };
        c1 = { x: p1.x, y: run.fixed + halfThick };
      } else {
        c0 = { x: run.fixed + halfThick, y: p0.y };
        c1 = { x: run.fixed + halfThick, y: p1.y };
      }

      const qTL = worldToScreen(c0.x, c0.y, z1);
      const qTR = worldToScreen(c1.x, c1.y, z1);
      const qBR = worldToScreen(c1.x, c1.y, z0);
      const qBL = worldToScreen(c0.x, c0.y, z0);

      g.clear();
      if (this.object.templateId === 'picture') {
        // Drop shadow on wall
        fillQuad(g, { x: qTL.x + 2, y: qTL.y + 2 }, { x: qTR.x + 2, y: qTR.y + 2 }, { x: qBR.x + 2, y: qBR.y + 2 }, { x: qBL.x + 2, y: qBL.y + 2 }, 0x111111, 0.4);
        // Wooden frame
        fillQuad(g, qTL, qTR, qBR, qBL, 0x3a2818, 1);

        // Gold bevel
        const inset = 0.05;
        const z0i = z0 + 0.03;
        const z1i = z1 - 0.03;
        const p0i = runPointAtM(run, placement.offsetM - wM / 2 + inset);
        const p1i = runPointAtM(run, placement.offsetM + wM / 2 - inset);
        const ci0 = run.axis === 'h' ? { x: p0i.x, y: run.fixed + halfThick } : { x: run.fixed + halfThick, y: p0i.y };
        const ci1 = run.axis === 'h' ? { x: p1i.x, y: run.fixed + halfThick } : { x: run.fixed + halfThick, y: p1i.y };
        fillQuad(g, worldToScreen(ci0.x, ci0.y, z1i), worldToScreen(ci1.x, ci1.y, z1i), worldToScreen(ci1.x, ci1.y, z0i), worldToScreen(ci0.x, ci0.y, z0i), 0x9c7a42, 1);

        // Canvas artwork
        const z0c = z0 + 0.06;
        const z1c = z1 - 0.06;
        const p0c = runPointAtM(run, placement.offsetM - wM / 2 + inset * 1.5);
        const p1c = runPointAtM(run, placement.offsetM + wM / 2 - inset * 1.5);
        const cc0 = run.axis === 'h' ? { x: p0c.x, y: run.fixed + halfThick } : { x: run.fixed + halfThick, y: p0c.y };
        const cc1 = run.axis === 'h' ? { x: p1c.x, y: run.fixed + halfThick } : { x: run.fixed + halfThick, y: p1c.y };
        fillQuad(g, worldToScreen(cc0.x, cc0.y, z1c), worldToScreen(cc1.x, cc1.y, z1c), worldToScreen(cc1.x, cc1.y, (z0c + z1c) / 2), worldToScreen(cc0.x, cc0.y, (z0c + z1c) / 2), 0x3e4d46, 1);
        fillQuad(g, worldToScreen(cc0.x, cc0.y, (z0c + z1c) / 2), worldToScreen(cc1.x, cc1.y, (z0c + z1c) / 2), worldToScreen(cc1.x, cc1.y, z0c), worldToScreen(cc0.x, cc0.y, z0c), 0x5a4832, 1);
      } else if (this.object.templateId === 'clock') {
        fillQuad(g, qTL, qTR, qBR, qBL, 0x422f1c, 1);
        const z0c = z0 + 0.04;
        const z1c = z1 - 0.04;
        const p0c = runPointAtM(run, placement.offsetM - wM / 2 + 0.04);
        const p1c = runPointAtM(run, placement.offsetM + wM / 2 - 0.04);
        const cc0 = run.axis === 'h' ? { x: p0c.x, y: run.fixed + halfThick } : { x: run.fixed + halfThick, y: p0c.y };
        const cc1 = run.axis === 'h' ? { x: p1c.x, y: run.fixed + halfThick } : { x: run.fixed + halfThick, y: p1c.y };
        fillQuad(g, worldToScreen(cc0.x, cc0.y, z1c), worldToScreen(cc1.x, cc1.y, z1c), worldToScreen(cc1.x, cc1.y, z0c), worldToScreen(cc0.x, cc0.y, z0c), 0xe2dcbe, 1);
      } else {
        fillQuad(g, qTL, qTR, qBR, qBL, 0x565b54, 1);
      }

      const depth = Math.max(c0.x, c1.x) + Math.max(c0.y, c1.y) + FLOOR_BAND * this.floor.level + 0.35;
      g.setDepth(depth);
      g.setVisible(!this.wallCut);
      return;
    }

    if (this.object.placement.mount === 'ceiling') {
      const placement = this.object.placement;
      const screen = worldToScreen(placement.x, placement.y, elevation + placement.heightM);
      g.fillStyle(0x383a37, 1);
      g.fillCircle(screen.x, screen.y - 4, 6);
      g.fillStyle(0xf0e4b8, 0.95);
      g.fillCircle(screen.x, screen.y, 4);
      g.setDepth(placement.x + placement.y + FLOOR_BAND * this.floor.level + 0.5);
      return;
    }

    const parts = worldFootprintParts(this.object, template);
    if (parts.length === 0) return;
    const support = supportPoint(parts);
    const heightM = template.sizeM.height;

    for (const part of parts) {
      if ('minX' in part) {
        const aabb = part;
        switch (this.object.templateId) {
          case 'table': {
            diamond(g, aabb, elevation, 0x181410, 0.45);
            const legW = 0.08;
            const legInset = 0.04;
            const legCols = { top: 0x4a3520, left: 0x362514, right: 0x402d1a };
            box(g, { minX: aabb.minX + legInset, minY: aabb.minY + legInset, maxX: aabb.minX + legInset + legW, maxY: aabb.minY + legInset + legW }, elevation, heightM - 0.05, legCols);
            box(g, { minX: aabb.maxX - legInset - legW, minY: aabb.minY + legInset, maxX: aabb.maxX - legInset, maxY: aabb.minY + legInset + legW }, elevation, heightM - 0.05, legCols);
            box(g, { minX: aabb.minX + legInset, minY: aabb.maxY - legInset - legW, maxX: aabb.minX + legInset + legW, maxY: aabb.maxY - legInset }, elevation, heightM - 0.05, legCols);
            box(g, { minX: aabb.maxX - legInset - legW, minY: aabb.maxY - legInset - legW, maxX: aabb.maxX - legInset, maxY: aabb.maxY - legInset }, elevation, heightM - 0.05, legCols);
            box(g, aabb, elevation + heightM - 0.06, 0.06, { top: 0x8a633e, left: 0x543c24, right: 0x6e4e2f });
            break;
          }
          case 'chair': {
            diamond(g, aabb, elevation, 0x181410, 0.35);
            const lW = 0.05;
            const lCols = { top: 0x44301d, left: 0x322212, right: 0x3b2917 };
            box(g, { minX: aabb.minX + 0.03, minY: aabb.minY + 0.03, maxX: aabb.minX + 0.03 + lW, maxY: aabb.minY + 0.03 + lW }, elevation, 0.42, lCols);
            box(g, { minX: aabb.maxX - 0.03 - lW, minY: aabb.minY + 0.03, maxX: aabb.maxX - 0.03, maxY: aabb.minY + 0.03 + lW }, elevation, 0.42, lCols);
            box(g, { minX: aabb.minX + 0.03, minY: aabb.maxY - 0.03 - lW, maxX: aabb.minX + 0.03 + lW, maxY: aabb.maxY - 0.03 }, elevation, 0.42, lCols);
            box(g, { minX: aabb.maxX - 0.03 - lW, minY: aabb.maxY - 0.03 - lW, maxX: aabb.maxX - 0.03, maxY: aabb.maxY - 0.03 }, elevation, 0.42, lCols);
            box(g, aabb, elevation + 0.42, 0.05, { top: 0x6e4d2e, left: 0x46301a, right: 0x583d23 });
            box(g, { minX: aabb.minX, minY: aabb.minY, maxX: aabb.maxX, maxY: aabb.minY + 0.07 }, elevation + 0.47, heightM - 0.47, { top: 0x5a3e23, left: 0x3e2915, right: 0x4c331c });
            break;
          }
          case 'nightstand': {
            diamond(g, aabb, elevation, 0x181410, 0.35);
            box(g, aabb, elevation + 0.04, heightM - 0.04, { top: 0x6a4e32, left: 0x422f1c, right: 0x543c25 });
            box(g, aabb, elevation + heightM - 0.03, 0.03, { top: 0x7c5d3d, left: 0x4e3823, right: 0x63472c });
            break;
          }
          case 'counter': {
            diamond(g, aabb, elevation, 0x181410, 0.35);
            box(g, aabb, elevation, heightM - 0.05, { top: 0x524233, left: 0x382c20, right: 0x463728 });
            box(g, aabb, elevation + heightM - 0.05, 0.05, { top: 0x8a8e8b, left: 0x505452, right: 0x646866 });
            break;
          }
          case 'fridge': {
            diamond(g, aabb, elevation, 0x181410, 0.4);
            box(g, aabb, elevation, 0.08, { top: 0x333534, left: 0x222423, right: 0x2a2c2b });
            box(g, aabb, elevation + 0.08, heightM - 0.08, { top: 0xd6cfc0, left: 0x9e978a, right: 0xb8b1a3 });
            const pFront0 = worldToScreen(aabb.maxX, aabb.minY, elevation + heightM * 0.62);
            const pFront1 = worldToScreen(aabb.maxX, aabb.maxY, elevation + heightM * 0.62);
            g.lineStyle(1.5, 0x4a453c, 0.85);
            g.beginPath();
            g.moveTo(pFront0.x, pFront0.y);
            g.lineTo(pFront1.x, pFront1.y);
            g.strokePath();
            const pHandle = worldToScreen(aabb.maxX, aabb.maxY - 0.08, elevation + heightM * 0.55);
            g.fillStyle(0xe0e4e6, 1);
            g.fillRect(pHandle.x - 2, pHandle.y - 12, 4, 16);
            g.fillStyle(0x606568, 1);
            g.fillRect(pHandle.x - 1, pHandle.y - 10, 2, 12);
            break;
          }
          case 'shelf': {
            diamond(g, aabb, elevation, 0x181410, 0.4);
            const postW = 0.05;
            const postCols = { top: 0x444645, left: 0x2a2c2b, right: 0x363837 };
            box(g, { minX: aabb.minX, minY: aabb.minY, maxX: aabb.minX + postW, maxY: aabb.minY + postW }, elevation, heightM, postCols);
            box(g, { minX: aabb.maxX - postW, minY: aabb.minY, maxX: aabb.maxX, maxY: aabb.minY + postW }, elevation, heightM, postCols);
            box(g, { minX: aabb.minX, minY: aabb.maxY - postW, maxX: aabb.minX + postW, maxY: aabb.maxY }, elevation, heightM, postCols);
            box(g, { minX: aabb.maxX - postW, minY: aabb.maxY - postW, maxX: aabb.maxX, maxY: aabb.maxY }, elevation, heightM, postCols);
            const tierCols = { top: 0x6e5c46, left: 0x4a3c2c, right: 0x5a4a37 };
            for (const hFrac of [0.08, 0.38, 0.68, 0.96]) {
              box(g, aabb, elevation + heightM * hFrac, 0.03, tierCols);
            }
            break;
          }
          case 'utility_box': {
            box(g, aabb, elevation, heightM, { top: 0x5a5e5c, left: 0x363a38, right: 0x464a48 });
            break;
          }
          case 'rug': {
            diamond(g, aabb, elevation + 0.01, 0x2e353b, 0.9);
            const inAabb = { minX: aabb.minX + 0.08, minY: aabb.minY + 0.08, maxX: aabb.maxX - 0.08, maxY: aabb.maxY - 0.08 };
            diamond(g, inAabb, elevation + 0.015, 0x824434, 0.9);
            const centAabb = { minX: aabb.minX + 0.2, minY: aabb.minY + 0.2, maxX: aabb.maxX - 0.2, maxY: aabb.maxY - 0.2 };
            diamond(g, centAabb, elevation + 0.02, 0xc4b294, 0.85);
            break;
          }
          default: {
            box(g, aabb, elevation, heightM, { top: 0x6f746d, left: 0x444843, right: 0x565b54 });
            break;
          }
        }
      }
    }
    g.setDepth(support.x + support.y + FLOOR_BAND * this.floor.level + 0.5);
    g.setVisible(this.object.level === this.floor.level);
  }

  setState(state: ObjectState | undefined): void {
    this.state = state;
    this.draw();
  }

  setWallCut(cut: boolean): void {
    if (this.wallCut === cut) return;
    this.wallCut = cut;
    this.draw();
  }

  setVisible(visible: boolean): void {
    this.graphics.setVisible(visible && !this.state?.destroyed);
    this.image?.setVisible(visible && !this.state?.destroyed);
  }

  destroy(): void {
    this.graphics.destroy();
    this.image?.destroy();
  }
}
