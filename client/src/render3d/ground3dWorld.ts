import * as THREE from 'three';
import { TILE, TILE_SIZE_M, type BuildingSpec, type TileRect } from '@ashfall/shared';
import type { ClientWorld } from '../world/clientWorld.js';
import {
  TILE_M,
  createProceduralGroundAtlas,
  createPerimeterShadowTexture,
  createGroundMaterials,
  atlasUVFor,
  addBoxToBuffers,
  buildPerimeterShadowGeometry,
  mapTileIdToKind,
  type SharedGroundMaterials,
  type TileKind,
} from './ground3dShared.js';

export interface Ground3DMetrics {
  chunksCount: number;
  quadsCount: number;
  triangles: number;
  drawCalls: number;
  cutoutTilesCount: number;
}

interface GroundChunkEntry {
  cx: number;
  cy: number;
  group: THREE.Group;
  groundMesh: THREE.Mesh;
  curbMesh?: THREE.Mesh;
  quadsCount: number;
  trianglesCount: number;
  cutoutTilesCount: number;
  buildingIds: Set<string>;
}

function collectBuildingCells(building: BuildingSpec): TileRect[] {
  const cells: TileRect[] = [];
  for (const floor of building.floors) {
    cells.push(...floor.floor.cells);
    for (const walkable of floor.walkable ?? []) cells.push(walkable);
    for (const stair of floor.stairs) {
      if (stair.hole) cells.push(stair.hole);
      if (stair.entry) cells.push(stair.entry);
      if (stair.exit) cells.push(stair.exit);
    }
  }
  if (building.roof) cells.push(...building.roof.cells);
  return cells;
}

function getBuildingTileBounds(building: BuildingSpec): { x: number; y: number; w: number; h: number } {
  const cells = collectBuildingCells(building);
  if (cells.length === 0) return { x: building.origin.x, y: building.origin.y, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    minX = Math.min(minX, cell.x);
    minY = Math.min(minY, cell.y);
    maxX = Math.max(maxX, cell.x + cell.w);
    maxY = Math.max(maxY, cell.y + cell.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function isTileInsideBuilding(gx: number, gy: number, building: BuildingSpec): boolean {
  const bounds = getBuildingTileBounds(building);
  if (gx < bounds.x || gx >= bounds.x + bounds.w || gy < bounds.y || gy >= bounds.y + bounds.h) {
    return false;
  }
  for (const floor of building.floors) {
    for (const cell of floor.floor.cells) {
      if (gx >= cell.x && gx < cell.x + cell.w && gy >= cell.y && gy < cell.y + cell.h) return true;
    }
    for (const cell of floor.walkable ?? []) {
      if (gx >= cell.x && gx < cell.x + cell.w && gy >= cell.y && gy < cell.y + cell.h) return true;
    }
    for (const stair of floor.stairs) {
      if (stair.hole && gx >= stair.hole.x && gx < stair.hole.x + stair.hole.w && gy >= stair.hole.y && gy < stair.hole.y + stair.hole.h) return true;
    }
  }
  if (building.roof) {
    for (const cell of building.roof.cells) {
      if (gx >= cell.x && gx < cell.x + cell.w && gy >= cell.y && gy < cell.y + cell.h) return true;
    }
  }
  return false;
}

export class Ground3DWorld {
  private readonly scene3d: THREE.Scene;
  private readonly world: ClientWorld;

  readonly rootGroup = new THREE.Group();
  private readonly chunksGroup = new THREE.Group();
  private readonly shadowsGroup = new THREE.Group();

  private readonly atlasTexture: THREE.CanvasTexture;
  private readonly shadowTexture: THREE.CanvasTexture;
  private readonly materials: SharedGroundMaterials;

  private readonly chunks = new Map<string, GroundChunkEntry>();
  private readonly buildingShadows = new Map<string, THREE.Mesh>();

  constructor(scene3d: THREE.Scene, world: ClientWorld) {
    this.scene3d = scene3d;
    this.world = world;

    this.rootGroup.name = 'ground3d_world_root';
    this.chunksGroup.name = 'ground3d_chunks_group';
    this.shadowsGroup.name = 'ground3d_shadows_group';

    this.rootGroup.add(this.chunksGroup);
    this.rootGroup.add(this.shadowsGroup);
    this.scene3d.add(this.rootGroup);

    this.atlasTexture = createProceduralGroundAtlas();
    this.shadowTexture = createPerimeterShadowTexture();
    this.materials = createGroundMaterials(this.atlasTexture, this.shadowTexture);
  }

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  hasGroundChunk(cx: number, cy: number): boolean {
    return this.chunks.has(this.key(cx, cy));
  }

  setPlayerFloor(playerFloor: number): void {
    this.rootGroup.visible = playerFloor >= 0;
  }

  private isTileInAnyBuilding(gx: number, gy: number): boolean {
    const tileId = this.world.tileAt(gx, gy);
    if (tileId === TILE.WOOD_FLOOR || tileId === TILE.TILE_FLOOR) {
      return true;
    }
    for (const building of this.world.buildings.values()) {
      if (isTileInsideBuilding(gx, gy, building)) return true;
    }
    return false;
  }

  private getBuildingsIntersectingChunk(cx: number, cy: number): Set<string> {
    const intersecting = new Set<string>();
    const chunkMinX = cx * 32;
    const chunkMaxX = chunkMinX + 32;
    const chunkMinY = cy * 32;
    const chunkMaxY = chunkMinY + 32;

    for (const [id, building] of this.world.buildings) {
      const b = getBuildingTileBounds(building);
      const bMaxX = b.x + b.w;
      const bMaxY = b.y + b.h;
      if (b.x < chunkMaxX && bMaxX > chunkMinX && b.y < chunkMaxY && bMaxY > chunkMinY) {
        intersecting.add(id);
      }
    }
    return intersecting;
  }

  loadChunk(cx: number, cy: number): void {
    const chunkKey = this.key(cx, cy);
    if (this.chunks.has(chunkKey)) {
      this.rebuildChunk(cx, cy);
      return;
    }

    const chunkTileX0 = cx * 32;
    const chunkTileY0 = cy * 32;
    const intersectingBuildings = this.getBuildingsIntersectingChunk(cx, cy);

    const group = new THREE.Group();
    group.name = `ground3d_chunk_${cx}_${cy}`;

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    let vertexCount = 0;
    let quadsCount = 0;
    let cutoutTilesCount = 0;

    for (let ly = 0; ly < 32; ly++) {
      for (let lx = 0; lx < 32; lx++) {
        const gx = chunkTileX0 + lx;
        const gy = chunkTileY0 + ly;

        if (this.isTileInAnyBuilding(gx, gy)) {
          cutoutTilesCount++;
          continue;
        }

        const tileId = this.world.tileAt(gx, gy);
        const kind = mapTileIdToKind(tileId);

        const x0 = gx * TILE_M;
        const y0 = gy * TILE_M;
        const x1 = x0 + TILE_M;
        const y1 = y0 + TILE_M;

        const z = kind === 'asphalt' ? 0.0 : kind === 'sidewalk' ? 0.08 : 0.04;
        const uv = atlasUVFor(kind);

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

    const groundMesh = new THREE.Mesh(groundGeometry, this.materials.ground);
    groundMesh.name = `ground_mesh_${cx}_${cy}`;
    groundMesh.receiveShadow = true;
    group.add(groundMesh);

    // Curbs: check 4-connected neighbors for asphalt
    const curbPositions: number[] = [];
    const curbNormals: number[] = [];
    const curbIndices: number[] = [];

    const curbWidth = 0.16;
    const curbHeight = 0.14;

    const isAsphaltNeighbor = (nx: number, ny: number): boolean => {
      if (nx < 0 || ny < 0 || nx >= 128 || ny >= 128) return false;
      const ncx = Math.floor(nx / 32);
      const ncy = Math.floor(ny / 32);
      if (!this.world.chunks.has(this.key(ncx, ncy))) return false;
      const neighborTile = this.world.tileAt(nx, ny);
      return mapTileIdToKind(neighborTile) === 'asphalt';
    };

    for (let ly = 0; ly < 32; ly++) {
      for (let lx = 0; lx < 32; lx++) {
        const gx = chunkTileX0 + lx;
        const gy = chunkTileY0 + ly;
        if (this.isTileInAnyBuilding(gx, gy)) continue;

        const tileId = this.world.tileAt(gx, gy);
        if (mapTileIdToKind(tileId) !== 'sidewalk') continue;

        const x0 = gx * TILE_M;
        const y0 = gy * TILE_M;

        if (isAsphaltNeighbor(gx - 1, gy)) {
          addBoxToBuffers(curbPositions, curbNormals, curbIndices, x0 + curbWidth / 2, y0 + TILE_M / 2, curbHeight / 2, curbWidth, TILE_M, curbHeight);
        }
        if (isAsphaltNeighbor(gx + 1, gy)) {
          addBoxToBuffers(curbPositions, curbNormals, curbIndices, x0 + TILE_M - curbWidth / 2, y0 + TILE_M / 2, curbHeight / 2, curbWidth, TILE_M, curbHeight);
        }
        if (isAsphaltNeighbor(gx, gy - 1)) {
          addBoxToBuffers(curbPositions, curbNormals, curbIndices, x0 + TILE_M / 2, y0 + curbWidth / 2, curbHeight / 2, TILE_M, curbWidth, curbHeight);
        }
        if (isAsphaltNeighbor(gx, gy + 1)) {
          addBoxToBuffers(curbPositions, curbNormals, curbIndices, x0 + TILE_M / 2, y0 + TILE_M - curbWidth / 2, curbHeight / 2, TILE_M, curbWidth, curbHeight);
        }
      }
    }

    let curbMesh: THREE.Mesh | undefined;
    if (curbPositions.length > 0) {
      const curbGeometry = new THREE.BufferGeometry();
      curbGeometry.setAttribute('position', new THREE.Float32BufferAttribute(curbPositions, 3));
      curbGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(curbNormals, 3));
      curbGeometry.setIndex(curbIndices);

      curbMesh = new THREE.Mesh(curbGeometry, this.materials.curb);
      curbMesh.name = `curb_mesh_${cx}_${cy}`;
      curbMesh.castShadow = true;
      curbMesh.receiveShadow = true;
      group.add(curbMesh);
    }

    this.chunksGroup.add(group);

    const entry: GroundChunkEntry = {
      cx,
      cy,
      group,
      groundMesh,
      curbMesh,
      quadsCount,
      trianglesCount: (indices.length / 3) + (curbIndices.length / 3),
      cutoutTilesCount,
      buildingIds: intersectingBuildings,
    };
    this.chunks.set(chunkKey, entry);
  }

  unloadChunk(cx: number, cy: number): void {
    const chunkKey = this.key(cx, cy);
    const entry = this.chunks.get(chunkKey);
    if (!entry) return;

    this.chunksGroup.remove(entry.group);
    entry.groundMesh.geometry.dispose();
    entry.curbMesh?.geometry.dispose();
    this.chunks.delete(chunkKey);
  }

  rebuildChunk(cx: number, cy: number): void {
    this.unloadChunk(cx, cy);
    this.loadChunk(cx, cy);
  }

  syncAllLoadedChunks(world: ClientWorld): void {
    for (const chunkKey of world.chunks.keys()) {
      const [cxStr, cyStr] = chunkKey.split(',');
      const cx = Number(cxStr);
      const cy = Number(cyStr);
      if (!Number.isNaN(cx) && !Number.isNaN(cy)) {
        if (!this.chunks.has(chunkKey)) {
          this.loadChunk(cx, cy);
        }
      }
    }
    this.syncBuildingShadows();
  }

  syncBuildingShadows(): void {
    const activeIds = new Set(this.world.buildings.keys());

    // Remove deleted building shadows
    for (const [id, mesh] of [...this.buildingShadows]) {
      if (!activeIds.has(id)) {
        this.shadowsGroup.remove(mesh);
        mesh.geometry.dispose();
        this.buildingShadows.delete(id);
      }
    }

    // Add or update shadows for current buildings
    for (const [id, building] of this.world.buildings) {
      if (this.buildingShadows.has(id)) continue;

      const bounds = getBuildingTileBounds(building);
      const x0 = bounds.x * TILE_M;
      const x1 = (bounds.x + bounds.w) * TILE_M;
      const y0 = bounds.y * TILE_M;
      const y1 = (bounds.y + bounds.h) * TILE_M;

      const geom = buildPerimeterShadowGeometry(x0, y0, x1, y1);
      const mesh = new THREE.Mesh(geom, this.materials.shadow);
      mesh.name = `contact_shadow_${id}`;
      mesh.renderOrder = 2;

      this.shadowsGroup.add(mesh);
      this.buildingShadows.set(id, mesh);
    }
  }

  onBuildingsUpdated(_world: ClientWorld): void {
    this.syncBuildingShadows();

    // Check if any loaded chunk was affected by updated building footprints
    for (const [chunkKey, entry] of [...this.chunks]) {
      const currentBuildingIds = this.getBuildingsIntersectingChunk(entry.cx, entry.cy);
      let changed = currentBuildingIds.size !== entry.buildingIds.size;
      if (!changed) {
        for (const id of currentBuildingIds) {
          if (!entry.buildingIds.has(id)) {
            changed = true;
            break;
          }
        }
      }
      if (changed) {
        this.rebuildChunk(entry.cx, entry.cy);
      }
    }
  }

  getMetrics(): Ground3DMetrics {
    let quadsCount = 0;
    let triangles = 0;
    let drawCalls = 0;
    let cutoutTilesCount = 0;

    for (const chunk of this.chunks.values()) {
      quadsCount += chunk.quadsCount;
      triangles += chunk.trianglesCount;
      cutoutTilesCount += chunk.cutoutTilesCount;
      drawCalls += 1;
      if (chunk.curbMesh) drawCalls += 1;
    }

    for (const shadow of this.buildingShadows.values()) {
      drawCalls += 1;
      if (shadow.geometry.index) {
        triangles += shadow.geometry.index.count / 3;
      }
    }

    return {
      chunksCount: this.chunks.size,
      quadsCount,
      triangles,
      drawCalls,
      cutoutTilesCount,
    };
  }

  destroy(): void {
    for (const [key, entry] of this.chunks) {
      this.chunksGroup.remove(entry.group);
      entry.groundMesh.geometry.dispose();
      entry.curbMesh?.geometry.dispose();
    }
    this.chunks.clear();

    for (const [id, mesh] of this.buildingShadows) {
      this.shadowsGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    this.buildingShadows.clear();

    this.scene3d.remove(this.rootGroup);
    this.materials.ground.dispose();
    this.materials.curb.dispose();
    this.materials.shadow.dispose();
    this.atlasTexture.dispose();
    this.shadowTexture.dispose();
  }
}
