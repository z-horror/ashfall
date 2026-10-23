import Phaser from 'phaser';
import {
  ROAD_CENTERS,
  ROAD_HALF,
  TILE,
  WALL,
  type BuildingDef,
  type ChunkData,
  type DoorDef,
  type PropDef,
} from '@ashfall/shared';
import {
  WALL_HEIGHT,
  artImage,
  artSetTexture,
  drawArtTexture,
  getBuildingSign,
  propAnchor,
  propTextureKey,
  roofTextureKey,
  tileTextureKey,
  wallTextureKey,
} from '../art/textures.js';
import { iso } from '../game/iso.js';
import { makeCanvas } from '../art/util.js';
import type { ClientWorld } from './clientWorld.js';

export interface BuildingVisual {
  id: string;
  roofs: Phaser.GameObjects.Image[];
  walls: Phaser.GameObjects.Image[];
  doors: Phaser.GameObjects.Image[];
  maxDepth: number;
}

const TILE_W = 64;
const TILE_H = 32;
const CHUNK = 32;

export class ChunkView {
  readonly data: ChunkData;
  private scene: Phaser.Scene;
  private world: ClientWorld;
  private visuals: Map<string, BuildingVisual>;
  private sprites: Phaser.GameObjects.GameObject[] = [];
  private ground?: Phaser.GameObjects.Image;
  private groundTextureKey = '';
  private doorSprites = new Map<string, Phaser.GameObjects.Image>();
  propSprites = new Map<string, Phaser.GameObjects.Image>();

  constructor(
    scene: Phaser.Scene,
    world: ClientWorld,
    data: ChunkData,
    visuals: Map<string, BuildingVisual>,
  ) {
    this.scene = scene;
    this.world = world;
    this.data = data;
    this.visuals = visuals;
    this.build();
  }

  private visualFor(b: BuildingDef): BuildingVisual {
    let v = this.visuals.get(b.id);
    if (!v) {
      v = {
        id: b.id,
        roofs: [],
        walls: [],
        doors: [],
        maxDepth: b.x + b.w - 1 + (b.y + b.h - 1),
      };
      this.visuals.set(b.id, v);
    }
    return v;
  }

  private build(): void {
    this.buildGround();
    this.buildWalls();
    this.buildDoors();
    this.buildRoofs();
    this.buildProps();
  }

  private buildGround(): void {
    const { cx, cy } = this.data;
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const left = (x0 - (y0 + CHUNK - 1)) * (TILE_W / 2) - TILE_W / 2;
    const top = (x0 + y0) * (TILE_H / 2) - TILE_H / 2;
    const width = CHUNK * TILE_W + TILE_W;
    const height = CHUNK * TILE_H + TILE_H;

    // Bake the whole chunk on a 2D canvas and upload it once. Drawing 1024 tiles
    // through the WebGL renderer one by one is far slower on low-end hardware.
    const { canvas, ctx } = makeCanvas(width, height);
    const draw = (key: string, lx: number, ly: number) => {
      if (drawArtTexture(ctx, key, lx, ly)) return;
      const source = this.scene.textures.get(key)?.getSourceImage();
      if (source) ctx.drawImage(source as CanvasImageSource, lx, ly);
    };

    for (let ty = 0; ty < CHUNK; ty++) {
      for (let tx = 0; tx < CHUNK; tx++) {
        const gx = x0 + tx;
        const gy = y0 + ty;
        const tile = this.world.tileAt(gx, gy);
        const key = tileTextureKey(tile, gx, gy);
        const p = iso(gx + 0.5, gy + 0.5);
        const lx = p.x - left - TILE_W / 2;
        const ly = p.y - top - TILE_H / 2;
        draw(key, lx, ly);

        if (tile === TILE.ASPHALT) {
          const onVerticalRoad = ROAD_CENTERS.some((c) => Math.abs(gx - c) <= ROAD_HALF);
          const onHorizontalRoad = ROAD_CENTERS.some((c) => Math.abs(gy - c) <= ROAD_HALF);
          if (onHorizontalRoad && !onVerticalRoad) {
            const center = ROAD_CENTERS.find((c) => Math.abs(gy - c) <= ROAD_HALF)!;
            if (gy === center && gx % 5 < 2) draw('mark_lane_h', lx, ly);
          } else if (onVerticalRoad && !onHorizontalRoad) {
            const center = ROAD_CENTERS.find((c) => Math.abs(gx - c) <= ROAD_HALF)!;
            if (gx === center && gy % 5 >= 2) draw('mark_lane_v', lx, ly);
          }
        }
      }
    }

    this.groundTextureKey = `ground_${cx}_${cy}`;
    if (this.scene.textures.exists(this.groundTextureKey)) this.scene.textures.remove(this.groundTextureKey);
    this.scene.textures.addCanvas(this.groundTextureKey, canvas);
    this.ground = this.scene.add.image(left, top, this.groundTextureKey).setOrigin(0, 0);
    this.ground.setDepth(-1_000_000);
  }

  private buildWalls(): void {
    const { cx, cy } = this.data;
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    for (let ty = 0; ty < CHUNK; ty++) {
      for (let tx = 0; tx < CHUNK; tx++) {
        const gx = x0 + tx;
        const gy = y0 + ty;
        const wall = this.data.walls ? this.world.wallAt(gx, gy) : 0;
        if (!wall) continue;
        const building = this.world.buildingAt(gx + 0.5, gy + 0.5);
        const style = building?.style ?? 0;
        const key = wallTextureKey(wall, gx, gy, style, wall === WALL.INTERIOR);
        const p = iso(gx + 0.5, gy + 0.5);
        const img = artImage(this.scene, p.x, p.y + TILE_H / 2, key)
          .setOrigin(0.5, 1)
          .setDepth(gx + gy + 0.75);
        this.sprites.push(img);
        if (building) this.visualFor(building).walls.push(img);
      }
    }
  }

  private buildDoors(): void {
    for (const door of this.data.doors) {
      this.addDoorSprite(door);
    }
  }

  private addDoorSprite(door: DoorDef): void {
    const open = this.world.doorOpen.get(door.id) ?? door.open;
    const p = iso(door.x + 0.5, door.y + 0.5);
    const key = open ? 'door_open' : 'door_closed';
    const img = artImage(this.scene, p.x, p.y + TILE_H / 2, key)
      .setOrigin(0.5, 1)
      .setDepth(door.x + door.y + 0.74);
    this.sprites.push(img);
    this.doorSprites.set(door.id, img);
    const building = this.world.buildingAt(door.x + 0.5, door.y + 0.5);
    if (building) this.visualFor(building).doors.push(img);
  }

  updateDoor(id: string, open: boolean): void {
    const img = this.doorSprites.get(id);
    if (!img) return;
    artSetTexture(img, open ? 'door_open' : 'door_closed');
  }

  private buildRoofs(): void {
    const seen = new Set<string>();
    for (const b of this.data.buildings) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      const visual = this.visualFor(b);
      const { cx, cy } = this.data;
      const x0 = cx * CHUNK;
      const y0 = cy * CHUNK;
      for (let ty = 0; ty < CHUNK; ty++) {
        for (let tx = 0; tx < CHUNK; tx++) {
          const gx = x0 + tx;
          const gy = y0 + ty;
          if (gx < b.x || gy < b.y || gx >= b.x + b.w || gy >= b.y + b.h) continue;
          if (!b.roof) continue;
          const p = iso(gx + 0.5, gy + 0.5);
          const key = roofTextureKey(b.style, gx, gy);
          const img = artImage(this.scene, p.x, p.y - WALL_HEIGHT, key)
            .setOrigin(0.5, 0.5)
            .setDepth(visual.maxDepth + 0.9);
          this.sprites.push(img);
          visual.roofs.push(img);
        }
      }
      // rooftop clutter
      const seed = b.x * 31 + b.y * 17 + b.w * 7 + b.h;
      const count = 1 + (seed % 3);
      for (let i = 0; i < count; i++) {
        const rx = b.x + 2 + ((seed + i * 13) % Math.max(1, b.w - 4));
        const ry = b.y + 2 + ((seed + i * 7) % Math.max(1, b.h - 3));
        if (rx < b.x || ry < b.y || rx >= b.x + b.w - 1 || ry >= b.y + b.h - 1) continue;
        const type = ['prop_vent', 'prop_ac', 'prop_tank'][(seed + i) % 3];
        const key = type === 'prop_vent' ? 'prop_vent' : type === 'prop_ac' ? 'prop_ac' : 'prop_tank';
        const anchor = propAnchor(key);
        const p = iso(rx + 0.5, ry + 0.5);
        const img = artImage(this.scene, p.x, p.y - WALL_HEIGHT, key)
          .setOrigin(anchor.ox, anchor.oy)
          .setDepth(visual.maxDepth + 0.96);
        this.sprites.push(img);
        visual.roofs.push(img);
      }
      if (b.doorTiles.length > 0 && b.style !== 3) {
        const door = b.doorTiles[0];
        const key = getBuildingSign(this.scene, b.name);
        const p = iso(door.x + 0.5, door.y + 0.5);
        const img = artImage(this.scene, p.x, p.y - 64, key)
          .setOrigin(0.5, 0.5)
          .setScale(0.82)
          .setDepth(visual.maxDepth + 0.86)
          .setAlpha(0.92);
        this.sprites.push(img);
        visual.walls.push(img);
      }
    }
  }

  private buildProps(): void {
    for (const prop of this.data.props) {
      this.addPropSprite(prop);
    }
  }

  private addPropSprite(prop: PropDef): void {
    const key = propTextureKey(prop.type, prop.variant, prop.w, prop.h);
    const anchor = propAnchor(key);
    const cx = prop.x + prop.w / 2;
    const cy = prop.y + prop.h / 2;
    const p = iso(cx, cy);
    const flat = prop.type === 'blood' || prop.type === 'debris';
    const depth = flat ? prop.x + prop.y - 0.65 : cx + cy - 0.3;
    const img = artImage(this.scene, p.x, p.y, key)
      .setOrigin(anchor.ox, anchor.oy)
      .setDepth(depth);
    if (flat) img.setAlpha(0.85);
    if (prop.type === 'tree') {
      // subtle variation so tree lines do not look stamped
      const scale = 0.9 + ((prop.x * 7 + prop.y * 11) % 10) * 0.018;
      img.setScale(scale);
    }
    if (prop.type === 'car') {
      img.setTint(0xf0ece2);
    }
    this.sprites.push(img);
    this.propSprites.set(prop.id, img);
  }

  removeProp(id: string): void {
    const img = this.propSprites.get(id);
    if (!img) return;
    this.propSprites.delete(id);
    img.destroy();
    this.sprites = this.sprites.filter((s) => s !== img);
  }

  destroy(): void {
    if (this.ground) {
      this.ground.destroy();
      this.ground = undefined;
    }
    if (this.groundTextureKey && this.scene.textures.exists(this.groundTextureKey)) {
      this.scene.textures.remove(this.groundTextureKey);
      this.groundTextureKey = '';
    }
    for (const s of this.sprites) s.destroy();
    this.sprites = [];
    this.propSprites.clear();
    this.doorSprites.clear();
    for (const v of this.visuals.values()) {
      v.roofs = v.roofs.filter((r) => r.active);
      v.walls = v.walls.filter((w) => w.active);
      v.doors = v.doors.filter((d) => d.active);
    }
    for (const [id, v] of [...this.visuals.entries()]) {
      if (v.roofs.length === 0 && v.walls.length === 0 && v.doors.length === 0) this.visuals.delete(id);
    }
  }
}
