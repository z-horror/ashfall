import { TILE, decodeRLE, type ChunkData, type GroundItemSnapshot, type PlayerSnapshot, type ZombieSnapshot } from '@ashfall/shared';

const SIZE = 256;

export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private baseCtx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('minimap canvas unavailable');
    this.ctx = ctx;
    this.base = document.createElement('canvas');
    this.base.width = SIZE;
    this.base.height = SIZE;
    const bctx = this.base.getContext('2d');
    if (!bctx) throw new Error('minimap base canvas unavailable');
    this.baseCtx = bctx;
    this.baseCtx.fillStyle = '#080b09';
    this.baseCtx.fillRect(0, 0, SIZE, SIZE);
  }

  addChunk(chunk: ChunkData): void {
    const tiles = decodeRLE(chunk.tiles, 32 * 32);
    const walls = decodeRLE(chunk.walls, 32 * 32);
    const x0 = chunk.cx * 32 * 2;
    const y0 = chunk.cy * 32 * 2;
    const colors: Record<number, string> = {
      [TILE.ASPHALT]: '#25292a',
      [TILE.SIDEWALK]: '#3b3b33',
      [TILE.GRASS]: '#28301f',
      [TILE.DIRT]: '#3a332a',
      [TILE.WOOD_FLOOR]: '#453a2a',
      [TILE.TILE_FLOOR]: '#41423a',
      [TILE.CONCRETE]: '#34352f',
      [TILE.RUBBLE]: '#3c3c36',
    };
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const tile = tiles[y * 32 + x] ?? 0;
        this.baseCtx.fillStyle = colors[tile] ?? '#222';
        this.baseCtx.fillRect(x0 + x * 2, y0 + y * 2, 2, 2);
      }
    }
    // buildings on top
    for (const b of chunk.buildings) {
      this.baseCtx.fillStyle = b.style === 2 ? '#4a453c' : b.style === 1 ? '#4b4134' : '#423a30';
      this.baseCtx.fillRect(b.x * 2, b.y * 2, b.w * 2, b.h * 2);
      this.baseCtx.strokeStyle = '#665d4b';
      this.baseCtx.lineWidth = 0.7;
      this.baseCtx.strokeRect(b.x * 2 + 0.5, b.y * 2 + 0.5, b.w * 2 - 1, b.h * 2 - 1);
    }
    // walls (interior partitions / edges)
    this.baseCtx.fillStyle = '#151713';
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        if (walls[y * 32 + x]) this.baseCtx.fillRect(x0 + x * 2, y0 + y * 2, 2, 2);
      }
    }
    // props as faint texture dots
    for (const p of chunk.props) {
      if (p.type === 'tree' || p.type === 'bush') {
        this.baseCtx.fillStyle = 'rgba(45,60,35,0.55)';
        this.baseCtx.fillRect(p.x * 2, p.y * 2, 2, 2);
      }
    }
    this.baseCtx.strokeStyle = 'rgba(140,130,100,0.12)';
    this.baseCtx.strokeRect(x0, y0, 64, 64);
  }

  render(
    self: { x: number; y: number; aim: number } | null,
    players: PlayerSnapshot[],
    zombies: ZombieSnapshot[],
    items: GroundItemSnapshot[],
  ): void {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.imageSmoothingEnabled = false;
    c.drawImage(this.base, 0, 0, SIZE, SIZE, 0, 0, this.canvas.width, this.canvas.height);
    const scale = this.canvas.width / SIZE;
    const px = (x: number) => x * 2 * scale;
    for (const it of items) {
      c.fillStyle = 'rgba(205,170,95,0.65)';
      c.fillRect(px(it.x) - 1, px(it.y) - 1, 2, 2);
    }
    for (const z of zombies) {
      c.fillStyle = z.type === 2 ? '#c04a36' : '#9c3b2e';
      c.beginPath();
      c.arc(px(z.x), px(z.y), z.type === 2 ? 2.7 : 2, 0, Math.PI * 2);
      c.fill();
    }
    for (const p of players) {
      c.fillStyle = '#9fb6a5';
      c.beginPath();
      c.arc(px(p.x), px(p.y), 2.4, 0, Math.PI * 2);
      c.fill();
    }
    if (self) {
      const x = px(self.x);
      const y = px(self.y);
      c.save();
      c.translate(x, y);
      c.rotate(self.aim + Math.PI / 4);
      c.fillStyle = '#e0bc72';
      c.beginPath();
      c.moveTo(5, 0);
      c.lineTo(-3, 3.4);
      c.lineTo(-3, -3.4);
      c.closePath();
      c.fill();
      c.restore();
      c.strokeStyle = 'rgba(224,188,114,0.35)';
      c.beginPath();
      c.arc(x, y, 7, 0, Math.PI * 2);
      c.stroke();
    }
    c.strokeStyle = 'rgba(160,150,120,0.16)';
    c.strokeRect(0.5, 0.5, this.canvas.width - 1, this.canvas.height - 1);
    c.fillStyle = 'rgba(200,190,160,0.42)';
    c.font = '8px monospace';
    c.fillText('N', 4, 10);
  }
}
