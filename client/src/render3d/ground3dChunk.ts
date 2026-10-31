import * as THREE from 'three';
import { ROAD_CENTERS, ROAD_HALF } from '@ashfall/shared';
import {
  TILE_M,
  createProceduralGroundAtlas,
  createPerimeterShadowTexture,
  atlasUVFor,
  addBoxToBuffers,
  buildPerimeterShadowGeometry,
  createGroundMaterials,
  type TileKind,
} from './ground3dShared.js';

export { TILE_M, createProceduralGroundAtlas, type TileKind };
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
 * Builds the complete 3D Ground Chunk for the 32x32 patch.
 */
export function buildGroundChunk(): GroundChunkResult {
  const group = new THREE.Group();
  group.name = 'ground3d_chunk_root';

  const atlasTexture = createProceduralGroundAtlas();
  const shadowTexture = createPerimeterShadowTexture();
  const { ground: groundMaterial, curb: curbMaterial, shadow: shadowMaterial } =
    createGroundMaterials(atlasTexture, shadowTexture);

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

  // Contact Shadow collar around building perimeter
  const shadowGeometry = buildPerimeterShadowGeometry(HOUSE_MIN_X, HOUSE_MIN_Y, HOUSE_MAX_X, HOUSE_MAX_Y);
  const shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadowMesh.name = 'contact_shadow_perimeter_mesh';
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
