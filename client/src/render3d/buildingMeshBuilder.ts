import * as THREE from 'three';
import type {
  BuildingModel,
  FixtureModel,
  MaterialKey,
  OpeningModel,
  RectM,
  SlabModel,
  StairModel,
  WallModel,
} from './buildingModel.js';

export interface BuildingTextures {
  brick: THREE.Texture;
  plaster: THREE.Texture;
  wood: THREE.Texture;
  concrete: THREE.Texture;
  tar: THREE.Texture;
  door: THREE.Texture;
  window: THREE.Texture;
  metal: THREE.Texture;
}

export interface BuildingMeshes {
  group: THREE.Group;
  nearWalls: THREE.Object3D[];
  upperFloor: THREE.Object3D[];
  fixtures: FixtureModel[];
}

function repeatedTexture(source: THREE.Texture, repeatX: number, repeatY: number): THREE.Texture {
  const texture = source.clone();
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

function surfaceMaterial(
  source: THREE.Texture,
  repeatX: number,
  repeatY: number,
  options: { color?: number; roughness?: number; metalness?: number } = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: repeatedTexture(source, repeatX, repeatY),
    color: options.color ?? 0xffffff,
    roughness: options.roughness ?? 0.92,
    metalness: options.metalness ?? 0.02,
  });
}

function openingMaterial(source: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: source,
    transparent: true,
    alphaTest: 0.05,
    side: THREE.DoubleSide,
  });
}

function makeMaterials(textures: BuildingTextures): Record<MaterialKey, THREE.Material> {
  return {
    brick: surfaceMaterial(textures.brick, 3, 2),
    brickWeathered: surfaceMaterial(textures.brick, 3, 2, { color: 0xd8c7b8 }),
    plaster: surfaceMaterial(textures.plaster, 2, 2),
    wood: surfaceMaterial(textures.wood, 4, 4),
    concrete: surfaceMaterial(textures.concrete, 3, 3, { roughness: 1 }),
    tar: surfaceMaterial(textures.tar, 4, 4, { roughness: 1 }),
    metal: surfaceMaterial(textures.metal, 1, 1, { roughness: 0.6, metalness: 0.35, color: 0x9aa0a0 }),
  };
}

function addBox(
  parent: THREE.Object3D,
  widthX: number,
  widthY: number,
  heightZ: number,
  cx: number,
  cy: number,
  cz: number,
  material: THREE.Material,
  castShadow = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(widthX, widthY, heightZ), material);
  mesh.position.set(cx, cy, cz);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function splitRectAroundHole(rect: RectM, hole: RectM): RectM[] {
  const left = Math.max(rect.x, hole.x);
  const right = Math.min(rect.x + rect.w, hole.x + hole.w);
  const top = Math.max(rect.y, hole.y);
  const bottom = Math.min(rect.y + rect.h, hole.y + hole.h);
  if (left >= right || top >= bottom) return [rect];

  const out: RectM[] = [];
  if (rect.x < left) out.push({ x: rect.x, y: rect.y, w: left - rect.x, h: rect.h });
  if (right < rect.x + rect.w) out.push({ x: right, y: rect.y, w: rect.x + rect.w - right, h: rect.h });
  if (rect.y < top) out.push({ x: left, y: rect.y, w: right - left, h: top - rect.y });
  if (bottom < rect.y + rect.h) out.push({ x: left, y: bottom, w: right - left, h: rect.y + rect.h - bottom });
  return out;
}

function addSlab(
  parent: THREE.Object3D,
  slab: SlabModel,
  material: THREE.Material,
): void {
  const centerZ = (slab.zBottom + slab.zTop) / 2;
  const heightZ = slab.zTop - slab.zBottom;
  let rects = [slab.rect];
  for (const hole of slab.holes ?? []) {
    rects = rects.flatMap((rect) => splitRectAroundHole(rect, hole));
  }
  for (const rect of rects) {
    addBox(parent, rect.w, rect.h, heightZ, rect.x + rect.w / 2, rect.y + rect.h / 2, centerZ, material, false);
  }
}

function addWallSegment(
  parent: THREE.Object3D,
  wall: WallModel,
  material: THREE.Material,
  from: number,
  to: number,
  zBottom: number,
  zTop: number,
): void {
  const length = to - from;
  if (length <= 1e-5 || zTop - zBottom <= 1e-5) return;
  if (wall.axis === 'h') {
    addBox(parent, length, wall.thicknessM, zTop - zBottom, from + length / 2, wall.fixedM, (zBottom + zTop) / 2, material);
  } else {
    addBox(parent, wall.thicknessM, length, zTop - zBottom, wall.fixedM, from + length / 2, (zBottom + zTop) / 2, material);
  }
}

function addOpeningPlane(
  parent: THREE.Object3D,
  wall: WallModel,
  opening: OpeningModel,
  textures: BuildingTextures,
): void {
  if (wall.axis !== 'h') return;
  const width = opening.x1 - opening.x0;
  const height = opening.z1 - opening.z0;
  if (width <= 0 || height <= 0) return;
  const texture = opening.kind === 'door' ? textures.door : textures.window;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), openingMaterial(texture));
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(
    (opening.x0 + opening.x1) / 2,
    wall.fixedM + wall.thicknessM / 2 + 0.012,
    (opening.z0 + opening.z1) / 2,
  );
  plane.renderOrder = 2;
  parent.add(plane);
}

function addWall(
  parent: THREE.Object3D,
  wall: WallModel,
  material: THREE.Material,
  textures: BuildingTextures,
): THREE.Group {
  const group = new THREE.Group();
  const openings = [...(wall.openings ?? [])].sort((a, b) => a.x0 - b.x0);
  let cursor = wall.fromM;
  for (const opening of openings) {
    if (opening.x0 > cursor) addWallSegment(group, wall, material, cursor, opening.x0, wall.zBottom, wall.zTop);
    if (opening.z0 > wall.zBottom) addWallSegment(group, wall, material, opening.x0, opening.x1, wall.zBottom, opening.z0);
    if (opening.z1 < wall.zTop) addWallSegment(group, wall, material, opening.x0, opening.x1, opening.z1, wall.zTop);
    addOpeningPlane(group, wall, opening, textures);
    cursor = Math.max(cursor, opening.x1);
  }
  if (cursor < wall.toM) addWallSegment(group, wall, material, cursor, wall.toM, wall.zBottom, wall.zTop);
  parent.add(group);
  return group;
}

function addStair(
  parent: THREE.Object3D,
  stair: StairModel,
  material: THREE.Material,
): void {
  const width = stair.widthM;
  const x = stair.hole.x + (stair.hole.w - width) / 2;
  for (let i = 0; i < stair.steps; i++) {
    const zTop = stair.direction === 'up'
      ? stair.fromZ + (i + 1) * stair.riseM
      : stair.fromZ - (i + 1) * stair.riseM;
    const y = stair.direction === 'up'
      ? stair.hole.y + stair.hole.h - (i + 0.5) * stair.treadM
      : stair.hole.y + (i + 0.5) * stair.treadM;
    addBox(parent, width, stair.treadM, stair.riseM, x + width / 2, y, zTop - stair.riseM / 2, material);
  }
}

export function buildBuildingMeshes(model: BuildingModel, textures: BuildingTextures): BuildingMeshes {
  const group = new THREE.Group();
  const nearWalls: THREE.Object3D[] = [];
  const upperFloor: THREE.Object3D[] = [];
  const materials = makeMaterials(textures);

  for (const slab of model.slabs) {
    const slabGroup = new THREE.Group();
    addSlab(slabGroup, slab, materials[slab.material]);
    group.add(slabGroup);
    if (slab.zBottom >= 2.4) upperFloor.push(slabGroup);
  }

  for (const wall of model.walls) {
    const wallGroup = addWall(group, wall, materials[wall.material], textures);
    if (wall.zBottom >= 2.4) upperFloor.push(wallGroup);
    const near = wall.exterior && (
      (wall.axis === 'h' && wall.fixedM > model.footprint.y + model.footprint.h / 2) ||
      (wall.axis === 'v' && wall.fixedM > model.footprint.x + model.footprint.w / 2)
    );
    if (near) nearWalls.push(wallGroup);
    // Interior partitions also block the cutaway view of the room.
    if (!wall.exterior) nearWalls.push(wallGroup);
  }

  const stairs = new THREE.Group();
  for (const stair of model.stairs) addStair(stairs, stair, materials.wood);
  group.add(stairs);

  const hatch = model.fixtures.find((fixture) => fixture.kind === 'hatch');
  if (hatch) {
    addBox(
      group,
      hatch.widthM,
      hatch.depthM,
      0.22,
      hatch.xM,
      hatch.yM,
      hatch.zM - 0.11,
      materials.metal,
      false,
    );
  }

  return { group, nearWalls, upperFloor, fixtures: model.fixtures };
}
