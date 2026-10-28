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
 * The visible walls of a stairwell and protective balustrade.
 *
 * Replaces the crude grey box and wireframe collision lines with:
 * 1. Warm dark cellar stone/masonry walls with ambient occlusion depth gradient.
 * 2. Elegant dark wood bullnose floor trim framing the opening.
 * 3. Wooden balustrade railing with sturdy newel posts and turned spindles
 *    along the exposed room edge, preventing the stairwell from reading as a hazard trench.
 */
export class StairShaftView {
  private graphics: Phaser.GameObjects.Graphics;
  private railingGraphics: Phaser.GameObjects.Graphics;
  private floor: FloorSpec;
  private hole: TileRect;
  private lowerZ: number;

  constructor(scene: Phaser.Scene, floor: FloorSpec, hole: TileRect, lowerZ: number) {
    this.floor = floor;
    this.hole = hole;
    this.lowerZ = lowerZ;
    // Shaft walls sit inside the hole beneath floor level
    this.graphics = scene.add.graphics()
      .setDepth(FLOOR_BAND * floor.level + hole.x + hole.y - 50)
      .setVisible(false);
    // Railing and floor trim sit on top of the floor surface in isometric order
    this.railingGraphics = scene.add.graphics()
      .setDepth(FLOOR_BAND * floor.level + (hole.x + hole.w / 2) + (hole.y + hole.h / 2) + 0.35)
      .setVisible(false);
    this.draw();
  }

  private draw(): void {
    const g = this.graphics;
    const rg = this.railingGraphics;
    g.clear();
    rg.clear();

    const { x, y, w, h } = this.hole;
    const upperZ = this.floor.elevationM;
    const lowerZ = this.lowerZ;
    if (upperZ - lowerZ <= 0.05) return;

    const p = (px: number, py: number, pz: number) => worldToScreen(px, py, pz);
    const isMansard = this.floor.level === 1;

    // Palette: rich cellar masonry / old plaster rather than flat raw grey concrete
    const wallUpper = isMansard ? 0x635443 : 0x3d3328;
    const wallMid   = isMansard ? 0x4f4233 : 0x2e251d;
    const wallBase  = isMansard ? 0x3b3024 : 0x1f1812;
    const mortar    = isMansard ? 0x2e251a : 0x15110d;

    // 1. Far (North) inner masonry wall
    const midZ = (upperZ + lowerZ) / 2;
    fillQuad(g, p(x, y, midZ), p(x + w, y, midZ), p(x + w, y, upperZ), p(x, y, upperZ), wallUpper);
    fillQuad(g, p(x, y, lowerZ), p(x + w, y, lowerZ), p(x + w, y, midZ), p(x, y, midZ), wallMid);
    fillQuad(g, p(x, y, lowerZ), p(x + w, y, lowerZ), p(x + w, y, lowerZ + 0.55), p(x, y, lowerZ + 0.55), wallBase);

    // Subtle horizontal stone courses on north wall
    g.lineStyle(1, mortar, 0.4);
    for (let z = lowerZ + 0.4; z < upperZ - 0.1; z += 0.45) {
      g.beginPath();
      g.moveTo(p(x, y, z).x, p(x, y, z).y);
      g.lineTo(p(x + w, y, z).x, p(x + w, y, z).y);
      g.strokePath();
    }

    // 2. Far (West) inner masonry wall (shaded darker)
    const sideUpper = isMansard ? 0x4e4031 : 0x2c241c;
    const sideMid   = isMansard ? 0x3c3024 : 0x211a13;
    const sideBase  = isMansard ? 0x281f16 : 0x14100b;
    fillQuad(g, p(x, y, midZ), p(x, y + h, midZ), p(x, y + h, upperZ), p(x, y, upperZ), sideUpper);
    fillQuad(g, p(x, y, lowerZ), p(x, y + h, lowerZ), p(x, y + h, midZ), p(x, y, midZ), sideMid);
    fillQuad(g, p(x, y, lowerZ), p(x, y + h, lowerZ), p(x, y + h, lowerZ + 0.55), p(x, y + h, lowerZ + 0.55), sideBase);

    // Subtle stone courses on west wall
    for (let z = lowerZ + 0.4; z < upperZ - 0.1; z += 0.45) {
      g.beginPath();
      g.moveTo(p(x, y, z).x, p(x, y, z).y);
      g.lineTo(p(x, y + h, z).x, p(x, y + h, z).y);
      g.strokePath();
    }

    // Deep ambient occlusion shadow under the top floor lip
    const lip = 0.08;
    fillQuad(g, p(x, y, upperZ - lip), p(x + w, y, upperZ - lip), p(x + w, y, upperZ), p(x, y, upperZ), 0x0a0806, 0.7);
    fillQuad(g, p(x, y, upperZ - lip), p(x, y + h, upperZ - lip), p(x, y + h, upperZ), p(x, y, upperZ), 0x080604, 0.75);

    // Deep pit bottom shadow gradient
    fillQuad(g, p(x, y, lowerZ), p(x + w, y, lowerZ), p(x + w, y, lowerZ + 0.7), p(x, y, lowerZ + 0.7), 0x050403, 0.55);

    // 3. Finished wooden bullnose floor trim framing the opening rim
    const trimZ = upperZ + 0.02;
    rg.lineStyle(3, 0x543c26, 0.95);
    rg.beginPath();
    rg.moveTo(p(x, y, trimZ).x, p(x, y, trimZ).y);
    rg.lineTo(p(x + w, y, trimZ).x, p(x + w, y, trimZ).y);
    rg.lineTo(p(x + w, y + h, trimZ).x, p(x + w, y + h, trimZ).y);
    rg.lineTo(p(x, y + h, trimZ).x, p(x, y + h, trimZ).y);
    rg.closePath();
    rg.strokePath();

    // Subtle edge highlight on the rim
    rg.lineStyle(1, 0x765436, 0.85);
    rg.beginPath();
    rg.moveTo(p(x, y + h, trimZ).x, p(x, y + h, trimZ).y);
    rg.lineTo(p(x + w, y + h, trimZ).x, p(x + w, y + h, trimZ).y);
    rg.lineTo(p(x + w, y, trimZ).x, p(x + w, y, trimZ).y);
    rg.strokePath();

    // 4. Wooden Protective Balustrade along the open room edge
    // For basement stair (floor 0): open room is to the West (along x = hole.x)
    // For mansard stair (floor 1): open room is to the East (along x = hole.x + hole.w)
    const railX = isMansard ? x + w : x;
    const railH = 0.88; // standard architectural handrail height (88cm)

    // Base runner plinth along the floor
    rg.lineStyle(2.5, 0x3d2919, 0.95);
    rg.beginPath();
    rg.moveTo(p(railX, y, trimZ).x, p(railX, y, trimZ).y);
    rg.lineTo(p(railX, y + h, trimZ).x, p(railX, y + h, trimZ).y);
    rg.strokePath();

    // Balusters (spindles) spaced along the opening
    const numSpindles = Math.round(h * 4); // ~every 0.25 tiles
    for (let i = 0; i <= numSpindles; i++) {
      const spY = y + (i / numSpindles) * h;
      const bBase = p(railX, spY, upperZ);
      const bTop = p(railX, spY, upperZ + railH);

      // Main turned spindle line
      rg.lineStyle(2, 0x583e26, 0.95);
      rg.beginPath();
      rg.moveTo(bBase.x, bBase.y);
      rg.lineTo(bTop.x, bTop.y);
      rg.strokePath();

      // Delicate spindle highlight
      rg.lineStyle(1, 0x7a5838, 0.7);
      rg.beginPath();
      rg.moveTo(bBase.x - 0.5, bBase.y);
      rg.lineTo(bTop.x - 0.5, bTop.y);
      rg.strokePath();
    }

    // Heavy Newel Post at front corner
    const post0Base = p(railX, y + h, upperZ);
    const post0Top = p(railX, y + h, upperZ + railH + 0.08);
    rg.lineStyle(4, 0x3c2817, 1);
    rg.beginPath();
    rg.moveTo(post0Base.x, post0Base.y);
    rg.lineTo(post0Top.x, post0Top.y);
    rg.strokePath();

    // Newel Post cap pyramid
    rg.fillStyle(0x6e4e30, 1);
    rg.fillCircle(post0Top.x, post0Top.y, 3);

    // Heavy Newel Post at far corner
    const post1Base = p(railX, y, upperZ);
    const post1Top = p(railX, y, upperZ + railH + 0.08);
    rg.lineStyle(4, 0x3c2817, 1);
    rg.beginPath();
    rg.moveTo(post1Base.x, post1Base.y);
    rg.lineTo(post1Top.x, post1Top.y);
    rg.strokePath();
    rg.fillStyle(0x6e4e30, 1);
    rg.fillCircle(post1Top.x, post1Top.y, 3);

    // Polished top handrail connecting posts
    const hrStart = p(railX, y, upperZ + railH);
    const hrEnd = p(railX, y + h, upperZ + railH);
    rg.lineStyle(3, 0x5e4229, 1);
    rg.beginPath();
    rg.moveTo(hrStart.x, hrStart.y);
    rg.lineTo(hrEnd.x, hrEnd.y);
    rg.strokePath();

    // Handrail top specular highlight
    rg.lineStyle(1.5, 0x8a6442, 0.95);
    rg.beginPath();
    rg.moveTo(hrStart.x, hrStart.y - 1.5);
    rg.lineTo(hrEnd.x, hrEnd.y - 1.5);
    rg.strokePath();
  }

  setActive(active: boolean): void {
    this.graphics.setVisible(active);
    this.railingGraphics.setVisible(active);
  }

  destroy(): void {
    this.graphics.destroy();
    this.railingGraphics.destroy();
  }
}
