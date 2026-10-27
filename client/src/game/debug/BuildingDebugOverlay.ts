import Phaser from 'phaser';
import {
  COLLISION_SCALE,
  OBJECT_TEMPLATES,
  isAabb,
  supportPoint,
  worldFootprintParts,
  worldToScreen,
  type BuildingSpec,
} from '@ashfall/shared';
import type { ClientWorld } from '../../world/clientWorld.js';

export class BuildingDebugOverlay {
  private graphics: Phaser.GameObjects.Graphics;
  private visible = true;

  constructor(private scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(200_000);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.graphics.setVisible(visible);
    if (!visible) this.graphics.clear();
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  update(world: ClientWorld, floor: number): void {
    if (!this.visible) return;
    const g = this.graphics;
    g.clear();
    const collision = world.getCollisionGrid(floor);
    for (const building of world.buildings.values()) {
      this.drawBuilding(g, world, building, floor, collision);
    }
  }

  private drawBuilding(g: Phaser.GameObjects.Graphics, world: ClientWorld, building: BuildingSpec, floor: number, collision: ReturnType<ClientWorld['getCollisionGrid']>): void {
    const spec = building.floors.find((candidate) => candidate.level === floor);
    if (!spec) return;
    for (const room of spec.rooms) {
      for (const rect of room.rects) {
        g.lineStyle(1, 0x7bd6ff, 0.55);
        const a = worldToScreen(rect.x, rect.y, spec.elevationM);
        const b = worldToScreen(rect.x + rect.w, rect.y, spec.elevationM);
        const c = worldToScreen(rect.x + rect.w, rect.y + rect.h, spec.elevationM);
        const d = worldToScreen(rect.x, rect.y + rect.h, spec.elevationM);
        g.strokePoints([a, b, c, d, a], false);
      }
    }
    for (const run of spec.wallRuns) {
      g.lineStyle(2, 0xffca66, 0.75);
      const a = run.axis === 'h' ? worldToScreen(run.from, run.fixed, spec.elevationM) : worldToScreen(run.fixed, run.from, spec.elevationM);
      const b = run.axis === 'h' ? worldToScreen(run.to, run.fixed, spec.elevationM) : worldToScreen(run.fixed, run.to, spec.elevationM);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
    for (const opening of spec.openings) {
      const run = spec.wallRuns.find((candidate) => candidate.id === opening.wallRunId);
      if (!run) continue;
      const distance = (opening.startM + opening.widthM / 2) / 1.6;
      const point = run.axis === 'h' ? { x: run.from + distance, y: run.fixed } : { x: run.fixed, y: run.from + distance };
      const screen = worldToScreen(point.x, point.y, spec.elevationM);
      g.lineStyle(2, opening.kind === 'door' ? 0x7cff9a : opening.kind === 'window' ? 0x6fb7ff : 0xd9a4ff, 0.95);
      g.strokeCircle(screen.x, screen.y, 5);
    }
    for (const stair of spec.stairs) {
      g.lineStyle(2, 0xff9a55, 0.9);
      const a = worldToScreen(stair.entry.x, stair.entry.y, spec.elevationM);
      const b = worldToScreen(stair.entry.x + stair.entry.w, stair.entry.y + stair.entry.h, spec.elevationM);
      g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    for (const object of world.objects.values()) {
      if (object.level !== floor) continue;
      const template = OBJECT_TEMPLATES[object.templateId];
      if (!template || object.placement.mount !== 'floor') continue;
      const parts = worldFootprintParts(object, template);
      const support = supportPoint(parts);
      for (const part of parts) {
        if (!isAabb(part)) continue;
        g.lineStyle(1, 0xa5ff8c, 0.85);
        const a = worldToScreen(part.minX, part.minY, spec.elevationM);
        const b = worldToScreen(part.maxX, part.maxY, spec.elevationM);
        g.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      }
      const s = worldToScreen(support.x, support.y, spec.elevationM);
      g.fillStyle(0xff4f4f, 1);
      g.fillCircle(s.x, s.y, 3);
    }
    for (const room of spec.rooms) {
      const minX = Math.min(...room.rects.map((rect) => rect.x));
      const minY = Math.min(...room.rects.map((rect) => rect.y));
      const maxX = Math.max(...room.rects.map((rect) => rect.x + rect.w));
      const maxY = Math.max(...room.rects.map((rect) => rect.y + rect.h));
      for (let sy = minY * COLLISION_SCALE; sy < maxY * COLLISION_SCALE; sy += 4) {
        for (let sx = minX * COLLISION_SCALE; sx < maxX * COLLISION_SCALE; sx += 4) {
          if (!collision.cells[sy * collision.w + sx]) continue;
          const x = sx / COLLISION_SCALE;
          const y = sy / COLLISION_SCALE;
          const p = worldToScreen(x, y, spec.elevationM);
          g.fillStyle(0xff0000, 0.18);
          g.fillRect(p.x, p.y, 2, 1);
        }
      }
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
