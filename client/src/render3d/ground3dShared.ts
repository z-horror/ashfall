import * as THREE from 'three';
import { TILE, TILE_SIZE_M } from '@ashfall/shared';

export const TILE_M = TILE_SIZE_M; // 1.6 meters

export type TileKind = 'grass' | 'dirt' | 'asphalt' | 'sidewalk' | 'building';

/**
 * Procedural tile atlas on a 512x512 canvas.
 * 4 quadrants (256x256 each):
 * - (0, 0): Grass / Lawn
 * - (1, 0): Dirt / Compacted soil
 * - (0, 1): Asphalt road
 * - (1, 1): Sidewalk concrete pavers
 */
export function createProceduralGroundAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // 1. Grass (Top-Left: 0, 0, 256, 256)
  ctx.fillStyle = '#475a34';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const rad = 1 + Math.random() * 2.5;
    ctx.fillStyle = Math.random() > 0.45 ? '#3b4d2a' : '#576f3f';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  // Subtle grass blades
  ctx.strokeStyle = '#344524';
  ctx.lineWidth = 1;
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 6, y - 3 - Math.random() * 5);
    ctx.stroke();
  }

  // 2. Dirt (Top-Right: 256, 0, 256, 256)
  ctx.fillStyle = '#4a4033';
  ctx.fillRect(256, 0, 256, 256);
  for (let i = 0; i < 1500; i++) {
    const x = 256 + Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillStyle = Math.random() > 0.5 ? '#3d3429' : '#594d3c';
    ctx.beginPath();
    ctx.arc(x, y, 1 + Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Asphalt (Bottom-Left: 0, 256, 256, 256)
  ctx.fillStyle = '#262927';
  ctx.fillRect(0, 256, 256, 256);
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * 256;
    const y = 256 + Math.random() * 256;
    const g = 40 + Math.floor(Math.random() * 35);
    ctx.fillStyle = `rgb(${g},${g + 2},${g})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  // Subtle road surface crack
  ctx.strokeStyle = '#1b1d1c';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(40, 290);
  ctx.lineTo(75, 330);
  ctx.lineTo(110, 345);
  ctx.lineTo(135, 395);
  ctx.stroke();

  // 4. Sidewalk Concrete Pavers (Bottom-Right: 256, 256, 256, 256)
  ctx.fillStyle = '#6e726c';
  ctx.fillRect(256, 256, 256, 256);
  for (let py = 0; py < 2; py++) {
    for (let px = 0; px < 2; px++) {
      const bx = 256 + px * 128;
      const by = 256 + py * 128;
      ctx.fillStyle = (px + py) % 2 === 0 ? '#727670' : '#6a6e68';
      ctx.fillRect(bx + 2, by + 2, 124, 124);

      for (let s = 0; s < 300; s++) {
        const sx = bx + 4 + Math.random() * 120;
        const sy = by + 4 + Math.random() * 120;
        ctx.fillStyle = Math.random() > 0.5 ? '#7f837d' : '#5b5e58';
        ctx.fillRect(sx, sy, 1.2, 1.2);
      }
    }
  }
  // Dark paver joints
  ctx.strokeStyle = '#3e413c';
  ctx.lineWidth = 3;
  ctx.strokeRect(257, 257, 254, 254);
  ctx.beginPath();
  ctx.moveTo(256 + 128, 256);
  ctx.lineTo(256 + 128, 512);
  ctx.moveTo(256, 256 + 128);
  ctx.lineTo(512, 256 + 128);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * Linear gradient shadow texture for perimeter contact strips.
 * U=0 is dark at the wall, U=1 fades to transparent.
 */
export function createPerimeterShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createLinearGradient(0, 0, 128, 0);
  gradient.addColorStop(0, 'rgba(0,0,0,0.68)');
  gradient.addColorStop(0.35, 'rgba(0,0,0,0.38)');
  gradient.addColorStop(0.75, 'rgba(0,0,0,0.12)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 16);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * UV bounds in the 2x2 atlas:
 * grass:    (0.00, 0.50) to (0.50, 1.00)
 * dirt:     (0.50, 0.50) to (1.00, 1.00)
 * asphalt:  (0.00, 0.00) to (0.50, 0.50)
 * sidewalk: (0.50, 0.00) to (1.00, 0.50)
 */
export function atlasUVFor(kind: TileKind): { u0: number; v0: number; u1: number; v1: number } {
  const margin = 0.004; // avoid edge bleed
  switch (kind) {
    case 'grass':
      return { u0: 0.0 + margin, v0: 0.5 + margin, u1: 0.5 - margin, v1: 1.0 - margin };
    case 'dirt':
      return { u0: 0.5 + margin, v0: 0.5 + margin, u1: 1.0 - margin, v1: 1.0 - margin };
    case 'asphalt':
      return { u0: 0.0 + margin, v0: 0.0 + margin, u1: 0.5 - margin, v1: 0.5 - margin };
    case 'sidewalk':
      return { u0: 0.5 + margin, v0: 0.0 + margin, u1: 1.0 - margin, v1: 0.5 - margin };
    default:
      return { u0: 0.0, v0: 0.5, u1: 0.5, v1: 1.0 };
  }
}

/**
 * Helper to add a 3D box into position/normal/index arrays.
 */
export function addBoxToBuffers(
  positions: number[],
  normals: number[],
  indices: number[],
  cx: number,
  cy: number,
  cz: number,
  wx: number,
  wy: number,
  wz: number,
): void {
  const hx = wx / 2;
  const hy = wy / 2;
  const hz = wz / 2;
  const startIdx = positions.length / 3;

  const faces = [
    // +Z (top)
    { norm: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    // -Z (bottom)
    { norm: [0, 0, -1], v: [[-hx, hy, -hz], [hx, hy, -hz], [hx, -hy, -hz], [-hx, -hy, -hz]] },
    // +X
    { norm: [1, 0, 0], v: [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]] },
    // -X
    { norm: [-1, 0, 0], v: [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]] },
    // +Y
    { norm: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    // -Y
    { norm: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
  ];

  for (let f = 0; f < faces.length; f++) {
    const face = faces[f];
    const vi = startIdx + f * 4;
    for (const p of face.v) {
      positions.push(cx + p[0], cy + p[1], cz + p[2]);
      normals.push(face.norm[0], face.norm[1], face.norm[2]);
    }
    indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
  }
}

/**
 * Builds contact shadow collar geometry around building perimeter [x0, x1] x [y0, y1].
 * Formed by 4 edge strips + 4 corners extending outward from foundation wall.
 * Interior floor has zero shadow polygons.
 */
export function buildPerimeterShadowGeometry(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  margin = 0.95,
  elevationZ = 0.046,
): THREE.BufferGeometry {
  const m = margin;
  const shadowPositions: number[] = [];
  const shadowNormals: number[] = [];
  const shadowUvs: number[] = [];
  const shadowIndices: number[] = [];

  const addShadowQuad = (
    p0: [number, number], uv0: [number, number],
    p1: [number, number], uv1: [number, number],
    p2: [number, number], uv2: [number, number],
    p3: [number, number], uv3: [number, number],
  ): void => {
    const baseIdx = shadowPositions.length / 3;
    for (const [px, py] of [p0, p1, p2, p3]) {
      shadowPositions.push(px, py, elevationZ);
      shadowNormals.push(0, 0, 1);
    }
    for (const [u, v] of [uv0, uv1, uv2, uv3]) {
      shadowUvs.push(u, v);
    }
    shadowIndices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
  };

  // 1. South strip (y1 -> y1 + m)
  addShadowQuad([x0, y1], [0, 0], [x1, y1], [0, 1], [x1, y1 + m], [1, 1], [x0, y1 + m], [1, 0]);
  // 2. North strip (y0 -> y0 - m)
  addShadowQuad([x0, y0], [0, 0], [x1, y0], [0, 1], [x1, y0 - m], [1, 1], [x0, y0 - m], [1, 0]);
  // 3. West strip (x0 -> x0 - m)
  addShadowQuad([x0, y0], [0, 0], [x0, y1], [0, 1], [x0 - m, y1], [1, 1], [x0 - m, y0], [1, 0]);
  // 4. East strip (x1 -> x1 + m)
  addShadowQuad([x1, y0], [0, 0], [x1, y1], [0, 1], [x1 + m, y1], [1, 1], [x1 + m, y0], [1, 0]);

  // 5. South-West corner
  addShadowQuad([x0, y1], [0, 0], [x0, y1 + m], [1, 0], [x0 - m, y1 + m], [1, 1], [x0 - m, y1], [1, 1]);
  // 6. South-East corner
  addShadowQuad([x1, y1], [0, 0], [x1, y1 + m], [1, 0], [x1 + m, y1 + m], [1, 1], [x1 + m, y1], [1, 1]);
  // 7. North-West corner
  addShadowQuad([x0, y0], [0, 0], [x0, y0 - m], [1, 0], [x0 - m, y0 - m], [1, 1], [x0 - m, y0], [1, 1]);
  // 8. North-East corner
  addShadowQuad([x1, y0], [0, 0], [x1, y0 - m], [1, 0], [x1 + m, y0 - m], [1, 1], [x1 + m, y0], [1, 1]);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(shadowPositions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(shadowNormals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(shadowUvs, 2));
  geom.setIndex(shadowIndices);
  return geom;
}

export interface SharedGroundMaterials {
  ground: THREE.MeshStandardMaterial;
  curb: THREE.MeshStandardMaterial;
  shadow: THREE.MeshBasicMaterial;
}

export function createGroundMaterials(
  atlasTexture: THREE.CanvasTexture,
  shadowTexture: THREE.CanvasTexture,
): SharedGroundMaterials {
  const ground = new THREE.MeshStandardMaterial({
    map: atlasTexture,
    roughness: 0.88,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const curb = new THREE.MeshStandardMaterial({
    color: 0x82857f,
    roughness: 0.75,
    metalness: 0.1,
  });

  const shadow = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  return { ground, curb, shadow };
}

/**
 * Maps raw TILE enum values from shared to 3D terrain TileKind.
 */
export function mapTileIdToKind(tileId: number): TileKind {
  switch (tileId) {
    case TILE.ASPHALT:
      return 'asphalt';
    case TILE.SIDEWALK:
    case TILE.CONCRETE:
      return 'sidewalk';
    case TILE.GRASS:
      return 'grass';
    case TILE.DIRT:
    case TILE.RUBBLE:
      return 'dirt';
    case TILE.WOOD_FLOOR:
    case TILE.TILE_FLOOR:
      return 'building';
    default:
      return 'grass';
  }
}
