import Phaser from 'phaser';
import { worldToScreen, type FloorSpec } from '@ashfall/shared';
import type { TileRect } from '@ashfall/shared';

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

/**
 * The visible walls of a stairwell. The flat underlay alone reads as a hole in
 * the world because there is nothing between the floor rim and the landing;
 * these two far-facing walls turn it into a shaft.
 *
 * The shaft is intentionally drawn below the stair run (a small negative
 * sublayer offset) so the staircase remains the front-most object inside the
 * opening. It is only enabled for the floor whose opening is being inspected.
 */
export class StairShaftView {
  private graphics: Phaser.GameObjects.Graphics;
  private floor: FloorSpec;
  private hole: TileRect;
  private lowerZ: number;

  constructor(scene: Phaser.Scene, floor: FloorSpec, hole: TileRect, lowerZ: number) {
    this.floor = floor;
    this.hole = hole;
    this.lowerZ = lowerZ;
    this.graphics = scene.add.graphics()
      .setDepth(FLOOR_BAND * floor.level + hole.x + hole.y - 50)
      .setVisible(false);
    this.draw();
  }

  private draw(): void {
    const g = this.graphics;
    g.clear();
    const { x, y, w, h } = this.hole;
    const upperZ = this.floor.elevationM;
    const lowerZ = this.lowerZ;
    if (upperZ - lowerZ <= 0.05) return;

    const p = (px: number, py: number, pz: number) => worldToScreen(px, py, pz);
    const plaster = this.floor.level === 1;
    const face = plaster ? 0x6f5f4a : 0x565752;
    const side = plaster ? 0x514433 : 0x3f403c;
    const base = plaster ? 0x392e22 : 0x2f302d;

    // Far (north) inner wall.
    fillQuad(
      g,
      p(x, y, lowerZ),
      p(x + w, y, lowerZ),
      p(x + w, y, upperZ),
      p(x, y, upperZ),
      face,
    );
    // Darker lower band and foundation line.
    fillQuad(
      g,
      p(x, y, lowerZ),
      p(x + w, y, lowerZ),
      p(x + w, y, lowerZ + 0.55),
      p(x, y, lowerZ + 0.55),
      base,
    );

    // Far (west) inner wall, shaded slightly darker.
    fillQuad(
      g,
      p(x, y, lowerZ),
      p(x, y + h, lowerZ),
      p(x, y + h, upperZ),
      p(x, y, upperZ),
      side,
    );
    fillQuad(
      g,
      p(x, y, lowerZ),
      p(x, y + h, lowerZ),
      p(x, y + h, lowerZ + 0.55),
      p(x, y, lowerZ + 0.55),
      base,
    );

    // Subtle vertical joints on the long wall.
    g.lineStyle(1, 0x2b251d, 0.28);
    for (let sx = x + 1; sx < x + w - 0.05; sx += 1) {
      g.beginPath();
      g.moveTo(p(sx, y, lowerZ).x, p(sx, y, lowerZ).y);
      g.lineTo(p(sx, y, upperZ).x, p(sx, y, upperZ).y);
      g.strokePath();
    }

    // Dark rim shadow just under the opening lip.
    const lip = 0.06;
    fillQuad(
      g,
      p(x, y, upperZ - lip),
      p(x + w, y, upperZ - lip),
      p(x + w, y, upperZ),
      p(x, y, upperZ),
      0x1d1812,
      0.55,
    );

    // Stone/sill trim around the opening.
    const trimZ = upperZ + 0.02;
    g.lineStyle(3, 0x9a8d78, 0.95);
    g.beginPath();
    g.moveTo(p(x, y, trimZ).x, p(x, y, trimZ).y);
    g.lineTo(p(x + w, y, trimZ).x, p(x + w, y, trimZ).y);
    g.lineTo(p(x + w, y + h, trimZ).x, p(x + w, y + h, trimZ).y);
    g.lineTo(p(x, y + h, trimZ).x, p(x, y + h, trimZ).y);
    g.closePath();
    g.strokePath();
  }

  setActive(active: boolean): void {
    this.graphics.setVisible(active);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
