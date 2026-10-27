import Phaser from 'phaser';
import { TILE } from '@ashfall/shared';
import { TILE_H, TILE_W } from '@ashfall/shared';
import { drawArtTexture, tileTextureKey } from '../art/textures.js';
import { makeCanvas } from '../art/util.js';
import type { ChunkData } from '@ashfall/shared';
import type { ClientWorld } from './clientWorld.js';

const CHUNK = 32;

export class ChunkView {
  readonly data: ChunkData;
  private scene: Phaser.Scene;
  private world: ClientWorld;
  private ground?: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, world: ClientWorld, data: ChunkData) {
    this.scene = scene;
    this.world = world;
    this.data = data;
    this.buildGround();
  }

  private buildGround(): void {
    const { cx, cy } = this.data;
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const left = (x0 - (y0 + CHUNK - 1)) * (TILE_W / 2) - TILE_W / 2;
    const top = (x0 + y0) * (TILE_H / 2) - TILE_H / 2;
    const width = CHUNK * TILE_W + TILE_W;
    const height = CHUNK * TILE_H + TILE_H;
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
        const px = (gx - gy) * 32;
        const py = (gx + gy) * 16;
        draw(key, px - left - TILE_W / 2, py - top - TILE_H / 2);
        if (tile === TILE.ASPHALT) {
          const onVerticalRoad = [16, 48, 80, 112].some((c) => Math.abs(gx - c) <= 3);
          const onHorizontalRoad = [16, 48, 80, 112].some((c) => Math.abs(gy - c) <= 3);
          if (onHorizontalRoad && !onVerticalRoad && gy % 5 < 2) draw('mark_lane_h', px - left - TILE_W / 2, py - top - TILE_H / 2);
          else if (onVerticalRoad && !onHorizontalRoad && gx % 5 >= 2) draw('mark_lane_v', px - left - TILE_W / 2, py - top - TILE_H / 2);
        }
      }
    }

    const key = `ground_${cx}_${cy}`;
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    this.scene.textures.addCanvas(key, canvas);
    this.ground = this.scene.add.image(left, top, key).setOrigin(0, 0).setDepth(-1_000_000);
  }

  removeProp(_id: string): void {}

  setGroundVisible(visible: boolean): void {
    this.ground?.setVisible(visible);
  }

  destroy(): void {
    this.ground?.destroy();
    this.ground = undefined;
  }
}
