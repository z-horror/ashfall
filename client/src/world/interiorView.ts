import Phaser from 'phaser';
import {
  OBJECT_TEMPLATES,
  PX_PER_METER,
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

function colorFor(templateId: string): { top: number; left: number; right: number } {
  switch (templateId) {
    case 'bed_double':
    case 'bed_single':
      return { top: 0x7b6f5a, left: 0x4e463a, right: 0x615747 };
    case 'wardrobe':
    case 'shelf':
    case 'counter':
      return { top: 0x755a3b, left: 0x4a3826, right: 0x5a4530 };
    case 'fridge':
    case 'utility_box':
      return { top: 0x9aa3a0, left: 0x646c6b, right: 0x7b8482 };
    case 'table':
      return { top: 0x8a6847, left: 0x58422c, right: 0x6c5036 };
    case 'chair':
      return { top: 0x6e5135, left: 0x443220, right: 0x574029 };
    case 'crate':
      return { top: 0x8b6a42, left: 0x5c442b, right: 0x704f32 };
    default:
      return { top: 0x6f746d, left: 0x444843, right: 0x565b54 };
  }
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

function box(g: Phaser.GameObjects.Graphics, aabb: { minX: number; minY: number; maxX: number; maxY: number }, elevationM: number, heightM: number, colors: { top: number; left: number; right: number }): void {
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
    const colors = colorFor(this.object.templateId);
    const elevation = this.floor.elevationM;
    const g = this.graphics;
    g.clear();

    const textureKey = generatedFurnitureKey(this.object.templateId);
    if (textureKey && this.scene.textures.exists(textureKey) && this.object.placement.mount === 'floor') {
      const placement = this.object.placement;
      const point = worldToScreen(placement.x, placement.y, elevation);
      if (!this.image) this.image = this.scene.add.image(point.x, point.y, textureKey).setOrigin(0.5, 1);
      this.image.setTexture(textureKey);
      const wT = template.sizeM.width / 1.6;
      const dT = template.sizeM.depth / 1.6;
      const targetH = template.sizeM.height * 40 + (wT + dT) * HALF_H;
      const aspect = this.image.width / Math.max(1, this.image.height);
      this.image.setDisplaySize(targetH * aspect, targetH);
      this.image.setPosition(point.x, point.y);
      this.image.setDepth(
        supportPoint(worldFootprintParts(this.object, template)).x +
          supportPoint(worldFootprintParts(this.object, template)).y +
          FLOOR_BAND * this.floor.level +
          0.5,
      );
      this.image.setVisible(true);
      g.setVisible(false);
      return;
    }
    this.image?.setVisible(false);

    if (this.object.placement.mount === 'wall') {
      const run = this.wallRun();
      if (!run) return;
      const placement = this.object.placement;
      const point = runPointAtM(run, placement.offsetM);
      const screen = worldToScreen(point.x, point.y, elevation + placement.heightM);
      const width = Math.max(6, template.sizeM.width * PX_PER_METER);
      const height = Math.max(6, template.sizeM.height * PX_PER_METER);
      g.fillStyle(colors.right, 1);
      g.fillRect(screen.x - width / 2, screen.y - height, width, height);
      g.fillStyle(colors.top, 1);
      g.fillRect(screen.x - width / 2, screen.y - height, width, 3);
      const depth = point.x + point.y + FLOOR_BAND * this.floor.level + 0.6;
      g.setDepth(depth);
      g.setVisible(!this.wallCut);
      return;
    }

    if (this.object.placement.mount === 'ceiling') {
      const placement = this.object.placement;
      const screen = worldToScreen(placement.x, placement.y, elevation + placement.heightM);
      g.fillStyle(0xe6d6a2, 0.9);
      g.fillCircle(screen.x, screen.y, 5);
      g.setDepth(placement.x + placement.y + FLOOR_BAND * this.floor.level + 0.5);
      return;
    }

    const parts = worldFootprintParts(this.object, template);
    if (parts.length === 0) return;
    const support = supportPoint(parts);
    if (this.object.templateId === 'rug') {
      for (const part of parts) {
        if ('minX' in part) diamond(g, part, elevation + 0.01, 0x5a4a3a, 0.7);
      }
      g.setDepth(support.x + support.y + FLOOR_BAND * this.floor.level + 0.05);
    } else {
      for (const part of parts) {
        if ('minX' in part) box(g, part, elevation, template.sizeM.height, colors);
        else {
          box(
            g,
            { minX: part.x - part.r, minY: part.y - part.r, maxX: part.x + part.r, maxY: part.y + part.r },
            elevation,
            template.sizeM.height,
            colors,
          );
        }
      }
      g.setDepth(support.x + support.y + FLOOR_BAND * this.floor.level + 0.5);
    }
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
    this.graphics.setVisible(visible && (!this.state?.destroyed));
    this.image?.setVisible(visible && (!this.state?.destroyed));
  }

  destroy(): void {
    this.graphics.destroy();
    this.image?.destroy();
  }
}
