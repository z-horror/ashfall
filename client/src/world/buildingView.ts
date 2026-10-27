import Phaser from 'phaser';
import {
  OBJECT_TEMPLATES,
  PX_PER_METER,
  TILE_SIZE_M,
  openingCenter,
  runPointAtM,
  sideOfWall,
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
} from '@ashfall/shared';
import { InteriorView } from './interiorView.js';

const FLOOR_BAND = 10_000;

function materialColors(material: string): { face: number; top: number; cut: number } {
  switch (material) {
    case 'interior':
      return { face: 0x8a765c, top: 0x6d5a42, cut: 0x7b684e };
    case 'concrete':
      return { face: 0x85877d, top: 0x686a61, cut: 0x77796f };
    case 'industrial':
      return { face: 0x6d7774, top: 0x525b58, cut: 0x5f6965 };
    default:
      return { face: 0x8a5143, top: 0x663a30, cut: 0x77453a };
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
  color: number,
): void {
  const half = run.thicknessM / 2;
  const s = startM / TILE_SIZE_M;
  const e = (startM + widthM) / TILE_SIZE_M;
  if (run.axis === 'h') {
    const x0 = run.from + s;
    const x1 = run.from + e;
    const y0 = run.fixed + half;
    const y1 = run.fixed - half;
    fillQuad(
      g,
      worldToScreen(x0, y0, zBottom),
      worldToScreen(x1, y0, zBottom),
      worldToScreen(x1, y0, zTop),
      worldToScreen(x0, y0, zTop),
      color,
    );
    fillQuad(
      g,
      worldToScreen(x0, y1, zTop),
      worldToScreen(x1, y1, zTop),
      worldToScreen(x1, y0, zTop),
      worldToScreen(x0, y0, zTop),
      color,
      0.72,
    );
  } else {
    const y0 = run.from + s;
    const y1 = run.from + e;
    const x0 = run.fixed + half;
    const x1 = run.fixed - half;
    fillQuad(
      g,
      worldToScreen(x0, y0, zBottom),
      worldToScreen(x0, y1, zBottom),
      worldToScreen(x0, y1, zTop),
      worldToScreen(x0, y0, zTop),
      color,
    );
    fillQuad(
      g,
      worldToScreen(x1, y0, zTop),
      worldToScreen(x0, y0, zTop),
      worldToScreen(x0, y1, zTop),
      worldToScreen(x1, y1, zTop),
      color,
      0.72,
    );
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

  constructor(scene: Phaser.Scene, floor: FloorSpec, run: WallRun, startM: number, endM: number) {
    this.floor = floor;
    this.run = run;
    this.startM = startM;
    this.endM = endM;
    const start = runPointAtM(run, startM);
    const end = runPointAtM(run, endM);
    this.depth = Math.min(start.x, end.x) + Math.min(start.y, end.y) + FLOOR_BAND * floor.level + 0.2;
    this.full = scene.add.graphics().setDepth(this.depth);
    this.cut = scene.add.graphics().setDepth(this.depth);
    const colors = materialColors(run.material);
    drawWallPanel(this.full, run, startM, endM - startM, floor.elevationM, floor.elevationM + run.heightM, colors.face);
    drawWallPanel(this.cut, run, startM, endM - startM, floor.elevationM, floor.elevationM + 0.45, colors.cut);
    this.cut.setVisible(false);
    if (scene.textures.exists('gen_wall_face')) {
      const half = run.thicknessM / 2;
      const x0 = run.axis === 'h' ? run.from + startM / 1.6 : run.fixed + half;
      const x1 = run.axis === 'h' ? run.from + endM / 1.6 : run.fixed + half;
      const y0 = run.axis === 'h' ? run.fixed + half : run.from + startM / 1.6;
      const y1 = run.axis === 'h' ? run.fixed + half : run.from + endM / 1.6;
      const bottom0 = worldToScreen(x0, y0, floor.elevationM);
      const bottom1 = worldToScreen(x1, y1, floor.elevationM);
      const top0 = worldToScreen(x0, y0, floor.elevationM + run.heightM);
      const top1 = worldToScreen(x1, y1, floor.elevationM + run.heightM);
      const minX = Math.min(bottom0.x, bottom1.x, top0.x, top1.x);
      const minY = Math.min(bottom0.y, bottom1.y, top0.y, top1.y);
      const maxX = Math.max(bottom0.x, bottom1.x, top0.x, top1.x);
      const maxY = Math.max(bottom0.y, bottom1.y, top0.y, top1.y);
      const width = Math.max(1, Math.ceil(maxX - minX));
      const height = Math.max(1, Math.ceil(maxY - minY));
      const canvasKey = `wall_${run.id}_${Math.round(startM * 100)}_${Math.round(endM * 100)}`;
      if (scene.textures.exists(canvasKey)) scene.textures.remove(canvasKey);
      const texture = scene.textures.createCanvas(canvasKey, width, height);
      if (texture) {
        const ctx = texture.getContext();
        const source = scene.textures.get('gen_wall_face').getSourceImage() as CanvasImageSource;
        const img = scene.textures.get('gen_wall_face').getSourceImage() as HTMLImageElement;
        ctx.save();
        const tiles = Math.max(1, Math.round((endM - startM) / 3.2));
        const a = (top1.x - top0.x) / (tiles * Math.max(1, img.width));
        const b = (top1.y - top0.y) / (tiles * Math.max(1, img.width));
        const c = (bottom0.x - top0.x) / Math.max(1, img.height);
        const d = (bottom0.y - top0.y) / Math.max(1, img.height);
        ctx.setTransform(a, b, c, d, top0.x - minX, top0.y - minY);
        for (let tile = 0; tile < tiles; tile++) ctx.drawImage(source, tile * img.width, 0);
        ctx.restore();
        ctx.fillStyle = 'rgba(52, 45, 36, 0.75)';
        ctx.beginPath();
        ctx.moveTo(top0.x - minX, top0.y - minY);
        ctx.lineTo(top1.x - minX, top1.y - minY);
        ctx.lineTo(top1.x - minX + (top1.x > top0.x ? 0 : 0), top1.y - minY - 3);
        ctx.lineTo(top0.x - minX, top0.y - minY - 3);
        ctx.closePath();
        ctx.fill();
        texture.refresh();
      }
      this.image = scene.add.image(minX, minY, canvasKey).setOrigin(0, 0).setDepth(this.depth);
      this.full.setVisible(false);
    }
  }

  setCut(cut: boolean): void {
    if (this.cutVisible === cut) return;
    this.cutVisible = cut;
    this.full.setVisible(!cut && !this.image);
    this.image?.setVisible(!cut);
    this.cut.setVisible(cut);
  }

  setActive(active: boolean): void {
    this.full.setVisible(active && !this.cutVisible && !this.image);
    this.image?.setVisible(active && !this.cutVisible);
    this.cut.setVisible(active && this.cutVisible);
  }

  destroy(): void {
    this.full.destroy();
    this.cut.destroy();
    this.image?.destroy();
  }
}

class DoorView {
  private graphics: Phaser.GameObjects.Graphics;
  private leaf: Phaser.GameObjects.Graphics;
  private image?: Phaser.GameObjects.Image;
  private run: WallRun;
  private opening: OpeningSpec;
  private floor: FloorSpec;
  private state: DoorState;
  private depth: number;

  constructor(scene: Phaser.Scene, floor: FloorSpec, run: WallRun, opening: OpeningSpec, state: DoorState) {
    this.floor = floor;
    this.run = run;
    this.opening = opening;
    this.state = state;
    const center = openingCenter(run, opening);
    this.depth = center.x + center.y + FLOOR_BAND * floor.level + 0.45;
    this.graphics = scene.add.graphics().setDepth(this.depth);
    this.leaf = scene.add.graphics().setDepth(this.depth + 0.01);
    if (scene.textures.exists('gen_door_closed')) {
      const base = run.axis === 'h'
        ? worldToScreen(center.x, run.fixed + run.thicknessM / 2, floor.elevationM)
        : worldToScreen(run.fixed + run.thicknessM / 2, center.y, floor.elevationM);
      this.image = scene.add.image(base.x, base.y, 'gen_door_closed').setOrigin(0.5, 1).setDepth(this.depth + 0.02);
      this.image.setDisplaySize(64, run.heightM * 40);
      if (run.axis === 'v') this.image.setFlipX(true);
    }
    this.draw();
  }

  private draw(): void {
    const g = this.graphics;
    const leaf = this.leaf;
    g.clear();
    leaf.clear();
    const z0 = this.floor.elevationM;
    const z1 = z0 + Math.min(this.opening.heightM, this.run.heightM);
    drawWallPanel(g, this.run, this.opening.startM, 0.06, z0, z1, 0x2e2a25);
    drawWallPanel(g, this.run, this.opening.startM + this.opening.widthM - 0.06, 0.06, z0, z1, 0x2e2a25);
    drawWallPanel(g, this.run, this.opening.startM, this.opening.widthM, z1 - 0.06, z1, 0x2e2a25);
    if (!this.state.open) {
      drawWallPanel(leaf, this.run, this.opening.startM + 0.06, this.opening.widthM - 0.12, z0, z1 - 0.06, this.state.locked ? 0x6a3b31 : 0x6c5031);
    }
    if (this.image) {
      const showImage = !this.state.open;
      this.image.setVisible(showImage);
      g.setVisible(!showImage);
      leaf.setVisible(!showImage);
    }
  }

  setState(state: DoorState): void {
    this.state = state;
    this.draw();
  }

  setActive(active: boolean): void {
    this.graphics.setVisible(active && (!this.image || this.state.open));
    this.leaf.setVisible(active && (!this.image || this.state.open));
    this.image?.setVisible(active && !this.state.open);
  }

  destroy(): void {
    this.graphics.destroy();
    this.leaf.destroy();
    this.image?.destroy();
  }
}

class WindowView {
  private graphics: Phaser.GameObjects.Graphics;
  private run: WallRun;
  private opening: OpeningSpec;
  private floor: FloorSpec;
  private state: WindowState;

  constructor(scene: Phaser.Scene, floor: FloorSpec, run: WallRun, opening: OpeningSpec, state: WindowState) {
    this.floor = floor;
    this.run = run;
    this.opening = opening;
    this.state = state;
    const center = openingCenter(run, opening);
    this.graphics = scene.add.graphics().setDepth(center.x + center.y + FLOOR_BAND * floor.level + 0.4);
    this.draw();
  }

  private draw(): void {
    const g = this.graphics;
    g.clear();
    const z0 = this.floor.elevationM + this.opening.sillM;
    const z1 = z0 + this.opening.heightM;
    drawWallPanel(g, this.run, this.opening.startM, 0.05, z0, z1, 0x2e2a25);
    drawWallPanel(g, this.run, this.opening.startM + this.opening.widthM - 0.05, 0.05, z0, z1, 0x2e2a25);
    if (!this.state.broken) drawWallPanel(g, this.run, this.opening.startM + 0.05, this.opening.widthM - 0.1, z0, z1, this.state.boarded ? 0x5a4632 : 0x536b6d);
    if (this.state.boarded) {
      drawWallPanel(g, this.run, this.opening.startM + 0.05, this.opening.widthM - 0.1, z0 + 0.25, z0 + 0.32, 0x3d3023);
      drawWallPanel(g, this.run, this.opening.startM + 0.05, this.opening.widthM - 0.1, z0 + 0.65, z0 + 0.72, 0x3d3023);
    }
  }

  setState(state: WindowState): void {
    this.state = state;
    this.draw();
  }

  setActive(active: boolean): void {
    this.graphics.setVisible(active);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}

class StairView {
  private graphics: Phaser.GameObjects.Graphics;
  private stair: StairSpec;
  private floor: FloorSpec;
  private baseX: number;
  private baseY: number;

  constructor(scene: Phaser.Scene, floor: FloorSpec, stair: StairSpec) {
    this.floor = floor;
    this.stair = stair;
    this.graphics = scene.add.graphics();
    const widthTiles = stair.widthM / TILE_SIZE_M;
    this.baseX = stair.hole.x + (stair.hole.w - widthTiles) / 2;
    this.baseY = stair.hole.y + 0.2;
    this.draw();
  }

  private draw(maxSteps = this.stair.steps): void {
    const g = this.graphics;
    g.clear();
    const widthTiles = this.stair.widthM / TILE_SIZE_M;
    const treadTiles = this.stair.treadM / TILE_SIZE_M;
    const dir = this.stair.toLevel < this.stair.fromLevel ? 1 : -1;
    const startZ = this.floor.elevationM;
    for (let i = 0; i < Math.min(maxSteps, this.stair.steps); i++) {
      const y0 = this.baseY + i * treadTiles * dir;
      const y1 = y0 + treadTiles * dir;
      const zTop = startZ - (i + 1) * this.stair.riseM * (this.stair.toLevel < this.stair.fromLevel ? 1 : -1);
      const zBottom = zTop - 0.16;
      const x0 = this.baseX;
      const x1 = this.baseX + widthTiles;
      const p = (x: number, y: number, z: number) => worldToScreen(x, y, z);
      const top = [p(x0, y0, zTop), p(x1, y0, zTop), p(x1, y1, zTop), p(x0, y1, zTop)];
      fillQuad(g, top[0], top[1], top[2], top[3], i % 2 ? 0x6b5a42 : 0x756349);
      fillQuad(g, p(x0, y1, zTop), p(x1, y1, zTop), p(x1, y1, zBottom), p(x0, y1, zBottom), 0x4a3b2b);
      fillQuad(g, p(x1, y0, zTop), p(x1, y1, zTop), p(x1, y1, zBottom), p(x1, y0, zBottom), 0x584838);
    }
    const midX = this.baseX + widthTiles / 2;
    this.graphics.setDepth(midX + this.baseY + 0.3 + FLOOR_BAND * this.stair.fromLevel);
  }

  setActive(activeFloor: number): void {
    const active = activeFloor === this.stair.fromLevel || activeFloor === this.stair.toLevel;
    this.graphics.setVisible(active);
    if (active) {
      const widthTiles = this.stair.widthM / TILE_SIZE_M;
      const midX = this.baseX + widthTiles / 2;
      this.graphics.setDepth(midX + this.baseY + 0.3 + FLOOR_BAND * activeFloor);
      // On the upper floor only the visible top of the shaft is shown; the
      // full flight belongs to the lower-floor view.
      this.draw(activeFloor === this.stair.fromLevel ? Math.min(4, this.stair.steps) : this.stair.steps);
    }
  }

  destroy(): void {
    this.graphics.destroy();
  }
}

export class BuildingView {
  readonly building: BuildingSpec;
  private scene: Phaser.Scene;
  private floors = new Map<number, { floor: Phaser.GameObjects.Graphics; walls: WallPiece[]; doors: DoorView[]; windows: WindowView[]; furniture: InteriorView[]; stairs: StairView[] }>();
  private roof?: Phaser.GameObjects.Graphics;
  private activeFloor = 0;
  private inside = false;
  private local = { x: 0, y: 0 };
  private doorViews = new Map<string, DoorView>();
  private windowViews = new Map<string, WindowView>();
  private furnitureViews = new Map<string, InteriorView>();

  constructor(scene: Phaser.Scene, building: BuildingSpec, objects: ObjectInstance[], states: Record<string, ObjectState>, doorStates: DoorState[], windowStates: WindowState[]) {
    this.scene = scene;
    this.building = building;
    for (const floor of building.floors) {
      this.buildFloor(floor, objects, states, doorStates, windowStates);
    }
    this.buildRoof();
  }

  private buildFloor(floor: FloorSpec, objects: ObjectInstance[], states: Record<string, ObjectState>, doorStates: DoorState[], windowStates: WindowState[]): void {
    const floorGraphics = this.scene.add.graphics().setDepth(FLOOR_BAND * floor.level - 1000);
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
          fillQuad(floorGraphics, points[0], points[1], points[2], points[3], floor.floor.material === 'concrete' ? 0x77766c : 0x8b7658);
        }
      }
    }

    const walls: WallPiece[] = [];
    for (const run of floor.wallRuns) {
      const intervals = solidIntervals(run, floor.openings);
      for (const interval of intervals) {
        walls.push(new WallPiece(this.scene, floor, run, interval.startM, interval.endM));
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
    this.floors.set(floor.level, { floor: floorGraphics, walls, doors, windows, furniture, stairs });
  }

  private buildRoof(): void {
    if (!this.building.roof) return;
    const top = [...this.building.floors].sort((a, b) => b.elevationM - a.elevationM)[0];
    const z = top.elevationM + top.clearHeightM + this.building.roof.thicknessM;
    const g = this.scene.add.graphics().setDepth(FLOOR_BAND * top.level + 9000);
    for (const rect of this.building.roof.cells) {
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          const points = [worldToScreen(x, y, z), worldToScreen(x + 1, y, z), worldToScreen(x + 1, y + 1, z), worldToScreen(x, y + 1, z)];
          fillQuad(g, points[0], points[1], points[2], points[3], 0x4b4d46);
        }
      }
    }
    this.roof = g;
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

  private roomHere(x: number, y: number, floor: number): boolean {
    const spec = this.building.floors.find((candidate) => candidate.level === floor);
    if (!spec) return false;
    const buildingRooms = spec.rooms;
    for (const room of buildingRooms) {
      // Room geometry is compiled by ClientWorld; this view only needs a coarse footprint test.
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
    for (const [level, entry] of this.floors) {
      const active = level === floor;
      entry.floor.setVisible(active);
      for (const wall of entry.walls) wall.setActive(active);
      for (const door of entry.doors) door.setActive(active);
      for (const window of entry.windows) window.setActive(active);
      for (const furniture of entry.furniture) furniture.setVisible(active && this.inside);
      for (const stair of entry.stairs) stair.setActive(floor);
    }
    if (this.roof) this.roof.setVisible(floor >= 0 && !this.inside);

    const current = this.floors.get(floor);
    if (current && this.inside) {
      const camera = { x: x + 1000, y: y + 1000 };
      const cutWalls = new Set<string>();
      for (const run of this.building.floors.find((candidate) => candidate.level === floor)?.wallRuns ?? []) {
        const a = sideOfWall(run, { x, y });
        const b = sideOfWall(run, camera);
        if (Math.sign(a) !== Math.sign(b)) cutWalls.add(run.id);
      }
      for (const wall of current.walls) {
        const run = this.building.floors.find((candidate) => candidate.level === floor)?.wallRuns.find((candidate) => candidate.id === wall.run.id);
        if (run) wall.setCut(cutWalls.has(run.id));
      }
      for (const [id, furniture] of this.furnitureViews) {
        const object = furniture.object;
        const cut = object.placement.mount === 'wall' && cutWalls.has(object.placement.wallRunId);
        furniture.setWallCut(cut);
      }
    } else {
      for (const entry of this.floors.values()) for (const wall of entry.walls) wall.setCut(false);
      for (const furniture of this.furnitureViews.values()) furniture.setWallCut(false);
    }
  }

  destroy(): void {
    for (const entry of this.floors.values()) {
      entry.floor.destroy();
      for (const wall of entry.walls) wall.destroy();
      for (const door of entry.doors) door.destroy();
      for (const window of entry.windows) window.destroy();
      for (const furniture of entry.furniture) furniture.destroy();
      for (const stair of entry.stairs) stair.destroy();
    }
    this.roof?.destroy();
    this.floors.clear();
  }
}
