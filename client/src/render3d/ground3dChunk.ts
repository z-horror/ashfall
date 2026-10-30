import * as THREE from 'three';
import { ROAD_CENTERS, ROAD_HALF, TILE_SIZE_M } from '@ashfall/shared';

export const TILE_M = TILE_SIZE_M; // 1.6 meters
export const CHUNK_ORIGIN_TILE_X = 18;
export const CHUNK_ORIGIN_TILE_Y = 18;
export const CHUNK_TILES_COUNT = 32; // 32x32 tiles (x=18..50, y=18..50)

export const CHUNK_MIN_X = CHUNK_ORIGIN_TILE_X * TILE_M; // 28.8 m
export const CHUNK_MIN_Y = CHUNK_ORIGIN_TILE_Y * TILE_M; // 28.8 m
export const CHUNK_MAX_X = (CHUNK_ORIGIN_TILE_X + CHUNK_TILES_COUNT) * TILE_M; // 80.0 m
export const CHUNK_MAX_Y = (CHUNK_ORIGIN_TILE_Y + CHUNK_TILES_COUNT) * TILE_M; // 80.0 m

// Test building occupies tiles 28..40 in X, 28..37 in Y
export const HOUSE_TILE_X0 = 28;
export const HOUSE_TILE_X1 = 40;
export const HOUSE_TILE_Y0 = 28;
export const HOUSE_TILE_Y1 = 37;

export const HOUSE_MIN_X = HOUSE_TILE_X0 * TILE_M; // 44.8 m
export const HOUSE_MIN_Y = HOUSE_TILE_Y0 * TILE_M; // 44.8 m
export const HOUSE_MAX_X = HOUSE_TILE_X1 * TILE_M; // 64.0 m
export const HOUSE_MAX_Y = HOUSE_TILE_Y1 * TILE_M; // 59.2 m

export type TileKind = 'grass' | 'dirt' | 'asphalt' | 'sidewalk' | 'building';

export interface GroundChunkResult {
  group: THREE.Group;
  materials: {
    ground: THREE.Material;
    asphalt: THREE.Material;
    sidewalk: THREE.Material;
    curb: THREE.Material;
    shadow: THREE.Material;
  };
  metrics: {
    triangles: number;
    quadsCount: number;
    cutoutTilesCount: number;
  };
}

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
  // Grid of 4 modular square pavers (each 128x128) with subtle noise
  for (let py = 0; py < 2; py++) {
    for (let px = 0; px < 2; px++) {
      const bx = 256 + px * 128;
      const by = 256 + py * 128;
      ctx.fillStyle = (px + py) % 2 === 0 ? '#727670' : '#6a6e68';
      ctx.fillRect(bx + 2, by + 2, 124, 124);

      // Micro specks inside paver
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
 * Creates soft contact shadow texture under the house plinth.
 */
function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(128, 128, 40, 128, 128, 126);
  gradient.addColorStop(0, 'rgba(0,0,0,0.72)');
  gradient.addColorStop(0.45, 'rgba(0,0,0,0.48)');
  gradient.addColorStop(0.85, 'rgba(0,0,0,0.14)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function isRoadCoord(coord: number): boolean {
  return ROAD_CENTERS.some((c) => Math.abs(coord - c) <= ROAD_HALF);
}

function roadDistance(coord: number): number {
  let best = 999;
  for (const c of ROAD_CENTERS) {
    best = Math.min(best, Math.abs(coord - c) - ROAD_HALF);
  }
  return best;
}

export function classifyTile(tileX: number, tileY: number): TileKind {
  // Check building footprint cutout
  if (
    tileX >= HOUSE_TILE_X0 &&
    tileX < HOUSE_TILE_X1 &&
    tileY >= HOUSE_TILE_Y0 &&
    tileY < HOUSE_TILE_Y1
  ) {
    return 'building';
  }

  const isRoad = isRoadCoord(tileX) || isRoadCoord(tileY);
  if (isRoad) return 'asphalt';

  const isSidewalk = roadDistance(tileX) <= 2 || roadDistance(tileY) <= 2;
  if (isSidewalk) return 'sidewalk';

  // Natural dirt trails around house front door and yard
  const nearHouseFront = tileY === HOUSE_TILE_Y1 && tileX >= 33 && tileX <= 36;
  if (nearHouseFront) return 'dirt';

  const pseudoNoise = Math.sin(tileX * 12.9898 + tileY * 78.233) * 43758.5453;
  const frac = pseudoNoise - Math.floor(pseudoNoise);
  return frac < 0.28 ? 'dirt' : 'grass';
}

/**
 * UV bounds in the 2x2 atlas:
 * grass:    (0.00, 0.50) to (0.50, 1.00)
 * dirt:     (0.50, 0.50) to (1.00, 1.00)
 * asphalt:  (0.00, 0.00) to (0.50, 0.50)
 * sidewalk: (0.50, 0.00) to (1.00, 0.50)
 */
function atlasUVFor(kind: TileKind): { u0: number; v0: number; u1: number; v1: number } {
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

function addBoxToBuffers(
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
 * Builds the complete 3D Ground Chunk for the 32x32 patch.
 */
export function buildGroundChunk(): GroundChunkResult {
  const group = new THREE.Group();
  group.name = 'ground3d_chunk_root';

  const atlasTexture = createProceduralGroundAtlas();

  const groundMaterial = new THREE.MeshStandardMaterial({
    map: atlasTexture,
    roughness: 0.88,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const curbMaterial = new THREE.MeshStandardMaterial({
    color: 0x82857f,
    roughness: 0.75,
    metalness: 0.1,
  });

  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: createContactShadowTexture(),
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  // Geometry buffers for the ground mesh
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  let vertexCount = 0;
  let quadsCount = 0;
  let cutoutTilesCount = 0;

  // Build the tile grid with exact physical cutout for the building
  for (let ty = 0; ty < CHUNK_TILES_COUNT; ty++) {
    for (let tx = 0; tx < CHUNK_TILES_COUNT; tx++) {
      const tileX = CHUNK_ORIGIN_TILE_X + tx;
      const tileY = CHUNK_ORIGIN_TILE_Y + ty;
      const kind = classifyTile(tileX, tileY);

      // EXCLUDE building tiles! Creates the true 3D cutout hole for basement & plinth
      if (kind === 'building') {
        cutoutTilesCount++;
        continue;
      }

      const x0 = tileX * TILE_M;
      const y0 = tileY * TILE_M;
      const x1 = x0 + TILE_M;
      const y1 = y0 + TILE_M;

      // Real 3D depth separation:
      // Road is at z = 0.0 m.
      // Sidewalk is physically elevated to z = +0.08 m.
      // Lawn and dirt are at z = +0.04 m.
      const z = kind === 'asphalt' ? 0.0 : kind === 'sidewalk' ? 0.08 : 0.04;

      const uv = atlasUVFor(kind);

      // 4 vertices of the tile quad
      // v0: (x0, y0), v1: (x1, y0), v2: (x1, y1), v3: (x0, y1)
      positions.push(
        x0, y0, z,
        x1, y0, z,
        x1, y1, z,
        x0, y1, z,
      );

      normals.push(
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
      );

      uvs.push(
        uv.u0, uv.v0,
        uv.u1, uv.v0,
        uv.u1, uv.v1,
        uv.u0, uv.v1,
      );

      // Two triangles per quad
      indices.push(
        vertexCount, vertexCount + 1, vertexCount + 2,
        vertexCount, vertexCount + 2, vertexCount + 3,
      );

      vertexCount += 4;
      quadsCount++;
    }
  }

  const groundGeometry = new THREE.BufferGeometry();
  groundGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  groundGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  groundGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  groundGeometry.setIndex(indices);

  const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.name = 'ground_surface_mesh';
  groundMesh.receiveShadow = true;
  group.add(groundMesh);

  // 3D Curbs (Бордюры): merged into ONE single buffer geometry (1 draw call!)
  const curbPositions: number[] = [];
  const curbNormals: number[] = [];
  const curbIndices: number[] = [];

  const curbWidth = 0.16; // 16 cm wide
  const curbHeight = 0.14; // rises from z=0 to z=+0.14

  for (let ty = 0; ty < CHUNK_TILES_COUNT; ty++) {
    for (let tx = 0; tx < CHUNK_TILES_COUNT; tx++) {
      const tileX = CHUNK_ORIGIN_TILE_X + tx;
      const tileY = CHUNK_ORIGIN_TILE_Y + ty;
      if (classifyTile(tileX, tileY) !== 'sidewalk') continue;

      const x0 = tileX * TILE_M;
      const y0 = tileY * TILE_M;

      // West neighbor is road -> vertical curb on west edge
      if (tx > 0 && classifyTile(tileX - 1, tileY) === 'asphalt') {
        addBoxToBuffers(
          curbPositions,
          curbNormals,
          curbIndices,
          x0 + curbWidth / 2,
          y0 + TILE_M / 2,
          curbHeight / 2,
          curbWidth,
          TILE_M,
          curbHeight,
        );
      }
      // East neighbor is road -> vertical curb on east edge
      if (tx < CHUNK_TILES_COUNT - 1 && classifyTile(tileX + 1, tileY) === 'asphalt') {
        addBoxToBuffers(
          curbPositions,
          curbNormals,
          curbIndices,
          x0 + TILE_M - curbWidth / 2,
          y0 + TILE_M / 2,
          curbHeight / 2,
          curbWidth,
          TILE_M,
          curbHeight,
        );
      }
      // South neighbor is road -> horizontal curb on south edge
      if (ty > 0 && classifyTile(tileX, tileY - 1) === 'asphalt') {
        addBoxToBuffers(
          curbPositions,
          curbNormals,
          curbIndices,
          x0 + TILE_M / 2,
          y0 + curbWidth / 2,
          curbHeight / 2,
          TILE_M,
          curbWidth,
          curbHeight,
        );
      }
      // North neighbor is road -> horizontal curb on north edge
      if (ty < CHUNK_TILES_COUNT - 1 && classifyTile(tileX, tileY + 1) === 'asphalt') {
        addBoxToBuffers(
          curbPositions,
          curbNormals,
          curbIndices,
          x0 + TILE_M / 2,
          y0 + TILE_M - curbWidth / 2,
          curbHeight / 2,
          TILE_M,
          curbWidth,
          curbHeight,
        );
      }
    }
  }

  if (curbPositions.length > 0) {
    const curbGeometry = new THREE.BufferGeometry();
    curbGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curbPositions, 3));
    curbGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(curbNormals, 3));
    curbGeometry.setIndex(curbIndices);

    const mergedCurbMesh = new THREE.Mesh(curbGeometry, curbMaterial);
    mergedCurbMesh.name = 'curbs_merged_mesh';
    mergedCurbMesh.castShadow = true;
    mergedCurbMesh.receiveShadow = true;
    group.add(mergedCurbMesh);
  }

  // Contact Shadow under building plinth
  // Extends 1.2 meters around the house base to ground the building naturally into the lawn
  const shadowMargin = 1.2;
  const shadowW = HOUSE_MAX_X - HOUSE_MIN_X + shadowMargin * 2;
  const shadowH = HOUSE_MAX_Y - HOUSE_MIN_Y + shadowMargin * 2;
  const shadowCenterX = (HOUSE_MIN_X + HOUSE_MAX_X) / 2;
  const shadowCenterY = (HOUSE_MIN_Y + HOUSE_MAX_Y) / 2;

  const shadowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(shadowW, shadowH),
    shadowMaterial,
  );
  shadowMesh.position.set(shadowCenterX, shadowCenterY, 0.046); // sits slightly above ground
  shadowMesh.renderOrder = 2;
  group.add(shadowMesh);

  return {
    group,
    materials: {
      ground: groundMaterial,
      asphalt: groundMaterial,
      sidewalk: groundMaterial,
      curb: curbMaterial,
      shadow: shadowMaterial,
    },
    metrics: {
      triangles: (indices.length / 3) + (curbIndices.length / 3) + 2,
      quadsCount,
      cutoutTilesCount,
    },
  };
}
