import * as THREE from 'three';
import type {
  BuildingModel,
  DecalModel,
  FixtureModel,
  MaterialKey,
  OpeningModel,
  PipeModel,
  PlinthModel,
  PropModel,
  RectM,
  SlabModel,
  StairModel,
  WallModel,
} from './buildingModel.js';

export interface DecalAtlas {
  ivy: THREE.Texture[];
  brickDamage: THREE.Texture[];
  puddle: THREE.Texture[];
  tarPatch: THREE.Texture[];
}

export interface BuildingTextures {
  brick: THREE.Texture;
  plaster: THREE.Texture;
  wood: THREE.Texture;
  concrete: THREE.Texture;
  tar: THREE.Texture;
  metal: THREE.Texture;
  ivy: THREE.Texture;
  brickDamage: THREE.Texture;
  puddle: THREE.Texture;
  tarPatch: THREE.Texture;
  weeds: THREE.Texture;
  decalAtlas?: DecalAtlas;
  windowUnit?: THREE.Texture;
  doorLeaf?: THREE.Texture;
}

export interface StairMeshEntry {
  group: THREE.Group;
  fromIndex: number;
  toIndex: number;
}

export interface BuildingMeshes {
  group: THREE.Group;
  levelGroups: Map<string, THREE.Group>;
  nearWalls: THREE.Object3D[];
  fixtures: FixtureModel[];
  plinth: THREE.Object3D;
  groundOccluder: THREE.Mesh;
  exteriorClutter: THREE.Group;
  stairs: StairMeshEntry[];
}

interface SceneMaterials extends Record<MaterialKey, THREE.Material> {
  doorFrame: THREE.Material;
  doorLeaf: THREE.Material;
  doorPanel: THREE.Material;
  windowFrame: THREE.Material;
  stoneSill: THREE.Material;
  stoneParapet: THREE.Material;
  palletWood: THREE.Material;
  crateWood: THREE.Material;
  windowUnit?: THREE.Material;
  doorLeafTexture?: THREE.Material;
  glass: THREE.Material;
  acBody: THREE.Material;
  acDark: THREE.Material;
  acMetal: THREE.Material;
  decalIvy: THREE.Material[];
  decalBrickDamage: THREE.Material[];
  decalPuddle: THREE.Material[];
  decalTarPatch: THREE.Material[];
  weeds: THREE.Material;
  wallBrick: THREE.Material;
  wallBrickWeathered: THREE.Material;
  wallPlaster: THREE.Material;
  wallConcrete: THREE.Material;
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
    roughness: options.roughness ?? 0.88,
    metalness: options.metalness ?? 0.04,
    side: THREE.DoubleSide,
  });
}

function decalMaterial(source: THREE.Texture, options: { opacity?: number; alphaTest?: number } = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: source,
    transparent: true,
    opacity: options.opacity ?? 1,
    alphaTest: options.alphaTest ?? 0.08,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    side: THREE.DoubleSide,
    roughness: 1,
  });
}

function decalMaterials(
  frames: THREE.Texture[] | undefined,
  fallback: THREE.Texture,
  options: { opacity?: number; alphaTest?: number } = {},
): THREE.Material[] {
  if (frames && frames.length > 0) return frames.map((frame) => decalMaterial(frame, options));
  return [decalMaterial(fallback, options)];
}

function makeMaterials(textures: BuildingTextures): SceneMaterials {
  const windowUnitMat = textures.windowUnit
    ? new THREE.MeshStandardMaterial({
        map: textures.windowUnit,
        transparent: true,
        alphaTest: 0.1,
        roughness: 0.85,
        metalness: 0.1,
        side: THREE.DoubleSide,
      })
    : undefined;

  const doorLeafMat = textures.doorLeaf
    ? new THREE.MeshStandardMaterial({
        map: textures.doorLeaf,
        roughness: 0.72,
        metalness: 0.28,
        side: THREE.DoubleSide,
      })
    : undefined;

  return {
    brick: surfaceMaterial(textures.brick, 5, 1.2, { roughness: 0.86 }),
    brickWeathered: surfaceMaterial(textures.brick, 5, 1.2, { color: 0xdfd4c8, roughness: 0.9 }),
    plaster: surfaceMaterial(textures.plaster, 2, 2, { roughness: 0.95 }),
    wood: surfaceMaterial(textures.wood, 10, 8, { roughness: 0.82 }),
    concrete: surfaceMaterial(textures.concrete, 4, 4, { color: 0xdfdad2, roughness: 0.95 }),
    stoneSill: new THREE.MeshStandardMaterial({ color: 0xd8d4cb, roughness: 0.88, metalness: 0.05, side: THREE.DoubleSide }),
    stoneParapet: new THREE.MeshStandardMaterial({ color: 0xded9d2, roughness: 0.88, metalness: 0.04, side: THREE.DoubleSide }),
    tar: surfaceMaterial(textures.tar, 1, 1, { color: 0xd0d0cd, roughness: 0.65, metalness: 0.08 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x36332f, roughness: 0.72, metalness: 0.45, side: THREE.DoubleSide }),
    doorFrame: new THREE.MeshStandardMaterial({ color: 0x2c3030, roughness: 0.75, metalness: 0.35, side: THREE.DoubleSide }),
    doorLeaf: doorLeafMat ?? new THREE.MeshStandardMaterial({ color: 0x383e42, roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide }),
    doorPanel: new THREE.MeshStandardMaterial({ color: 0x161819, roughness: 0.85, metalness: 0.2, side: THREE.DoubleSide }),
    windowFrame: new THREE.MeshStandardMaterial({ color: 0x28201a, roughness: 0.92, side: THREE.DoubleSide }),
    palletWood: new THREE.MeshStandardMaterial({ color: 0x787268, roughness: 0.94, side: THREE.DoubleSide }),
    crateWood: new THREE.MeshStandardMaterial({ color: 0x846b52, roughness: 0.88, side: THREE.DoubleSide }),
    windowUnit: windowUnitMat,
    doorLeafTexture: doorLeafMat,
    glass: new THREE.MeshStandardMaterial({
      color: 0x141f22,
      roughness: 0.18,
      metalness: 0.25,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    acBody: new THREE.MeshStandardMaterial({ color: 0x8a9288, roughness: 0.65, metalness: 0.28, side: THREE.DoubleSide }),
    acDark: new THREE.MeshStandardMaterial({ color: 0x1c201e, roughness: 0.75, metalness: 0.4, side: THREE.DoubleSide }),
    acMetal: new THREE.MeshStandardMaterial({ color: 0x606866, roughness: 0.52, metalness: 0.58, side: THREE.DoubleSide }),
    decalIvy: decalMaterials(textures.decalAtlas?.ivy, textures.ivy, { alphaTest: 0.25 }),
    decalBrickDamage: decalMaterials(textures.decalAtlas?.brickDamage, textures.brickDamage, { alphaTest: 0.04 }),
    decalPuddle: decalMaterials(textures.decalAtlas?.puddle, textures.puddle, { alphaTest: 0.02, opacity: 0.88 }),
    decalTarPatch: decalMaterials(textures.decalAtlas?.tarPatch, textures.tarPatch, { alphaTest: 0.04 }),
    weeds: new THREE.MeshStandardMaterial({
      map: textures.weeds,
      transparent: true,
      alphaTest: 0.4,
      depthWrite: true,
      side: THREE.DoubleSide,
      roughness: 1,
    }),
    wallBrick: surfaceMaterial(textures.brick, 1, 1, { roughness: 0.86 }),
    wallBrickWeathered: surfaceMaterial(textures.brick, 1, 1, { color: 0xdfd4c8, roughness: 0.9 }),
    wallPlaster: surfaceMaterial(textures.plaster, 1, 1, { roughness: 0.95 }),
    wallConcrete: surfaceMaterial(textures.concrete, 1, 1, { color: 0xdfdad2, roughness: 0.95 }),
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

function addSlab(parent: THREE.Object3D, slab: SlabModel, material: THREE.Material): void {
  const centerZ = (slab.zBottom + slab.zTop) / 2;
  const heightZ = slab.zTop - slab.zBottom;
  let rects = [slab.rect];
  for (const hole of slab.holes ?? []) {
    rects = rects.flatMap((rect) => splitRectAroundHole(rect, hole));
  }
  for (const rect of rects) {
    const geometry = new THREE.BoxGeometry(rect.w, rect.h, heightZ);
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    const scaleM = 2.4;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    for (let i = 0; i < position.count; i++) {
      const worldX = cx + position.getX(i);
      const worldY = cy + position.getY(i);
      uv.setXY(i, worldX / scaleM, worldY / scaleM);
    }
    uv.needsUpdate = true;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(cx, cy, centerZ);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

function wallMaterialFor(
  key: MaterialKey,
  materials: SceneMaterials,
): { material: THREE.Material; textureScaleM: number } {
  switch (key) {
    case 'brick':
      return { material: materials.wallBrick, textureScaleM: 2.4 };
    case 'brickWeathered':
      return { material: materials.wallBrickWeathered, textureScaleM: 2.4 };
    case 'plaster':
      return { material: materials.wallPlaster, textureScaleM: 2.0 };
    case 'concrete':
      return { material: materials.stoneParapet, textureScaleM: 2.4 };
    default:
      return { material: materials[key], textureScaleM: 2.4 };
  }
}

function addWallSegment(
  parent: THREE.Object3D,
  wall: WallModel,
  materials: SceneMaterials,
  from: number,
  to: number,
  zBottom: number,
  zTop: number,
): void {
  const length = to - from;
  if (length <= 1e-5 || zTop - zBottom <= 1e-5) return;
  const isHorizontal = wall.axis === 'h';
  const geometry = new THREE.BoxGeometry(
    isHorizontal ? length : wall.thicknessM,
    isHorizontal ? wall.thicknessM : length,
    zTop - zBottom,
  );
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const centerAlong = from + length / 2;
  const centerZ = (zBottom + zTop) / 2;
  const { material, textureScaleM } = wallMaterialFor(wall.material, materials);
  for (let i = 0; i < position.count; i++) {
    const localAlong = isHorizontal ? position.getX(i) : position.getY(i);
    const along = centerAlong + localAlong;
    const z = centerZ + position.getZ(i);
    uv.setXY(i, along / textureScaleM, z / textureScaleM);
  }
  uv.needsUpdate = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    isHorizontal ? centerAlong : wall.fixedM,
    isHorizontal ? wall.fixedM : centerAlong,
    centerZ,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

function wallBox(
  parent: THREE.Object3D,
  wall: WallModel,
  alongCenter: number,
  alongSize: number,
  depthCenterOffset: number,
  depthSize: number,
  zCenter: number,
  zSize: number,
  material: THREE.Material,
  castShadow = true,
): THREE.Mesh {
  if (wall.axis === 'h') {
    return addBox(
      parent,
      alongSize,
      depthSize,
      zSize,
      alongCenter,
      wall.fixedM + depthCenterOffset,
      zCenter,
      material,
      castShadow,
    );
  }
  return addBox(
    parent,
    depthSize,
    alongSize,
    zSize,
    wall.fixedM + depthCenterOffset,
    alongCenter,
    zCenter,
    material,
    castShadow,
  );
}

function addDoor(parent: THREE.Object3D, wall: WallModel, opening: OpeningModel, materials: SceneMaterials): void {
  const jamb = 0.08;
  const head = 0.09;
  const sill = 0.04;
  const x0 = opening.x0;
  const x1 = opening.x1;
  const z0 = opening.z0;
  const z1 = opening.z1;
  const center = (x0 + x1) / 2;
  const face = wall.thicknessM / 2;
  const frameDepth = wall.thicknessM + 0.05;

  // Dark steel door frame
  wallBox(parent, wall, x0 + jamb / 2, jamb, 0, frameDepth, (z0 + z1) / 2, z1 - z0, materials.doorFrame);
  wallBox(parent, wall, x1 - jamb / 2, jamb, 0, frameDepth, (z0 + z1) / 2, z1 - z0, materials.doorFrame);
  wallBox(parent, wall, center, x1 - x0, 0, frameDepth, z1 - head / 2, head, materials.doorFrame);
  wallBox(parent, wall, center, x1 - x0, 0, frameDepth, z0 + sill / 2, sill, materials.doorFrame);

  // Stone threshold under the door on the exterior
  wallBox(parent, wall, center, x1 - x0 + 0.08, face + 0.04, 0.08, z0 + sill / 2, sill + 0.02, materials.stoneSill);

  const leafWidth = x1 - x0 - jamb * 2 - 0.02;
  const leafBottom = z0 + sill + 0.01;
  const leafTop = z1 - head - 0.01;
  const leafHeight = leafTop - leafBottom;
  const leafCenterZ = (leafBottom + leafTop) / 2;
  const leafDepth = 0.06;
  const leafOffset = face - leafDepth / 2;

  // Heavy steel door leaf
  wallBox(parent, wall, center, leafWidth, leafOffset, leafDepth, leafCenterZ, leafHeight, materials.doorLeaf);

  if (materials.doorLeafTexture) {
    // High-resolution textured door face (sage-grey steel with rust and DANGER sign)
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(leafWidth, leafHeight), materials.doorLeafTexture);
    const pos = new THREE.Vector3(
      wall.axis === 'h' ? center : wall.fixedM + face + 0.006,
      wall.axis === 'h' ? wall.fixedM + face + 0.006 : center,
      leafCenterZ,
    );
    const normal = wall.axis === 'h' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    quad.position.copy(pos);
    quad.up.set(0, 0, 1);
    quad.lookAt(pos.clone().add(normal));
    quad.renderOrder = 2;
    parent.add(quad);
  } else {
    // Structural steel reinforcement bands across the door
    const panelWidth = leafWidth * 0.94;
    const panelHeight = 0.075;
    const panelOffset = face + 0.008;
    const panelDepth = 0.014;
    wallBox(parent, wall, center, panelWidth, panelOffset, panelDepth, leafCenterZ + leafHeight * 0.32, panelHeight, materials.doorPanel, false);
    wallBox(parent, wall, center, panelWidth, panelOffset, panelDepth, leafCenterZ, panelHeight, materials.doorPanel, false);
    wallBox(parent, wall, center, panelWidth, panelOffset, panelDepth, leafCenterZ - leafHeight * 0.32, panelHeight, materials.doorPanel, false);

    // Speakeasy peephole grill
    wallBox(parent, wall, center, 0.22, panelOffset + 0.008, 0.016, leafCenterZ + leafHeight * 0.18, 0.13, materials.doorFrame, false);
    wallBox(parent, wall, center, 0.18, panelOffset + 0.012, 0.01, leafCenterZ + leafHeight * 0.18, 0.09, materials.glass, false);

    // Handle & Lock
    const hinge = opening.hinge ?? 'right';
    const handleAlong = hinge === 'left' ? x1 - 0.18 : x0 + 0.18;
    wallBox(parent, wall, handleAlong, 0.08, face + 0.035, 0.02, z0 + 1.0, 0.14, materials.doorFrame, false);
    wallBox(parent, wall, handleAlong, 0.05, face + 0.055, 0.05, z0 + 1.0, 0.05, materials.metal, false);
    wallBox(parent, wall, handleAlong, 0.11, face + 0.028, 0.02, z0 + 1.0, 0.11, materials.metal, false);
  }
}

function addArch(parent: THREE.Object3D, wall: WallModel, opening: OpeningModel, materials: SceneMaterials): void {
  const frame = 0.09;
  const x0 = opening.x0;
  const x1 = opening.x1;
  const z0 = opening.z0;
  const z1 = opening.z1;
  const frameDepth = wall.thicknessM + 0.02;
  wallBox(parent, wall, x0 + frame / 2, frame, 0, frameDepth, (z0 + z1) / 2, z1 - z0, materials.doorFrame);
  wallBox(parent, wall, x1 - frame / 2, frame, 0, frameDepth, (z0 + z1) / 2, z1 - z0, materials.doorFrame);
  wallBox(parent, wall, (x0 + x1) / 2, x1 - x0, 0, frameDepth, z1 - frame / 2, frame, materials.doorFrame);
}

function addWindow(parent: THREE.Object3D, wall: WallModel, opening: OpeningModel, materials: SceneMaterials): void {
  const frame = 0.075;
  const x0 = opening.x0;
  const x1 = opening.x1;
  const z0 = opening.z0;
  const z1 = opening.z1;
  const center = (x0 + x1) / 2;
  const centerZ = (z0 + z1) / 2;
  const windowWidth = x1 - x0;
  const windowHeight = z1 - z0;
  const frameDepth = wall.thicknessM + 0.04;
  const halfWall = wall.thicknessM / 2;

  // Outer dark wood window frame
  wallBox(parent, wall, x0 + frame / 2, frame, 0, frameDepth, centerZ, windowHeight, materials.windowFrame);
  wallBox(parent, wall, x1 - frame / 2, frame, 0, frameDepth, centerZ, windowHeight, materials.windowFrame);
  wallBox(parent, wall, center, windowWidth, 0, frameDepth, z1 - frame / 2, frame, materials.windowFrame);
  wallBox(parent, wall, center, windowWidth, 0, frameDepth, z0 + frame / 2, frame, materials.windowFrame);

  // Stone sill extending out below the window on the exterior face
  const sillAlong = windowWidth + 0.08;
  const sillThickness = 0.06;
  const sillProjection = 0.09;
  wallBox(parent, wall, center, sillAlong, halfWall + sillProjection / 2, sillProjection, z0 + sillThickness / 2, sillThickness, materials.stoneSill);

  // Stone lintel on top of the window on the exterior face
  const lintelThickness = 0.07;
  const lintelProjection = 0.04;
  wallBox(parent, wall, center, sillAlong, halfWall + lintelProjection / 2, lintelProjection, z1 - lintelThickness / 2 + 0.015, lintelThickness, materials.stoneSill);

  // Dark interior backplane behind the glass (eliminates see-through house)
  wallBox(parent, wall, center, windowWidth, -halfWall + 0.01, 0.02, centerZ, windowHeight, materials.doorPanel, false);

  if (materials.windowUnit) {
    // Photorealistic window unit texture quad (lintel, frame, sashes, mullions & glass)
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(windowWidth, windowHeight), materials.windowUnit);
    const pos = new THREE.Vector3(
      wall.axis === 'h' ? center : wall.fixedM + halfWall + 0.005,
      wall.axis === 'h' ? wall.fixedM + halfWall + 0.005 : center,
      centerZ,
    );
    const normal = wall.axis === 'h' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    quad.position.copy(pos);
    quad.up.set(0, 0, 1);
    quad.lookAt(pos.clone().add(normal));
    quad.renderOrder = 2;
    parent.add(quad);
  } else {
    const innerWidth = windowWidth - frame * 2;
    const innerHeight = windowHeight - frame * 2;
    if (innerWidth > 0 && innerHeight > 0) {
      const glass = wallBox(parent, wall, center, innerWidth, 0, 0.018, centerZ, innerHeight, materials.glass, false);
      glass.renderOrder = 2;
      wallBox(parent, wall, center, 0.035, 0.012, 0.035, centerZ, innerHeight, materials.windowFrame, false);
      wallBox(parent, wall, center, innerWidth, 0.012, 0.035, centerZ, 0.035, materials.windowFrame, false);
      wallBox(parent, wall, center, innerWidth, 0.012, 0.035, centerZ + innerHeight * 0.22, 0.025, materials.windowFrame, false);
    }
  }
}

function addWall(parent: THREE.Object3D, wall: WallModel, materials: SceneMaterials): THREE.Group {
  const group = new THREE.Group();
  const openings = [...(wall.openings ?? [])].sort((a, b) => a.x0 - b.x0);
  // Exterior boxes must overlap at corners. Otherwise the two boxes only touch
  // by their inner faces and the outer corner is left open.
  const cornerExtension = wall.exterior ? wall.thicknessM / 2 + 0.005 : 0;
  const start = wall.fromM - cornerExtension;
  const end = wall.toM + cornerExtension;
  let cursor = start;
  for (const opening of openings) {
    if (opening.x0 > cursor) addWallSegment(group, wall, materials, cursor, opening.x0, wall.zBottom, wall.zTop);
    if (opening.z0 > wall.zBottom) addWallSegment(group, wall, materials, opening.x0, opening.x1, wall.zBottom, opening.z0);
    if (opening.z1 < wall.zTop) addWallSegment(group, wall, materials, opening.x0, opening.x1, opening.z1, wall.zTop);
    if (opening.kind === 'door') addDoor(group, wall, opening, materials);
    else if (opening.kind === 'window') addWindow(group, wall, opening, materials);
    else addArch(group, wall, opening, materials);
    cursor = Math.max(cursor, opening.x1);
  }
  if (cursor < end) addWallSegment(group, wall, materials, cursor, end, wall.zBottom, wall.zTop);
  parent.add(group);
  return group;
}

function addSlopedBox(
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  widthX: number,
  length: number,
  thickness: number,
  angle: number,
  material: THREE.Material,
  castShadow = true,
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(widthX, length, thickness), material);
  mesh.position.set(x, y, z);
  mesh.rotation.x = angle;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
}

function addStair(parent: THREE.Object3D, stair: StairModel, materials: SceneMaterials): void {
  const width = stair.widthM;
  const x = stair.hole.x + (stair.hole.w - width) / 2;
  const run = Math.min(stair.steps * stair.treadM, stair.hole.h);
  const yStart = stair.direction === 'up' ? stair.hole.y + stair.hole.h : stair.hole.y;
  const yEnd = yStart + (stair.direction === 'up' ? -run : run);
  const zStart = stair.fromZ;
  const zEnd = stair.toZ;
  const angle = Math.atan2(zEnd - zStart, yEnd - yStart);
  const slopeLength = Math.hypot(run, zEnd - zStart);
  const midY = (yStart + yEnd) / 2;
  const midZ = (zStart + zEnd) / 2;

  for (let i = 0; i < stair.steps; i++) {
    const zTop = stair.direction === 'up'
      ? stair.fromZ + (i + 1) * stair.riseM
      : stair.fromZ - (i + 1) * stair.riseM;
    const y = stair.direction === 'up'
      ? stair.hole.y + stair.hole.h - (i + 0.5) * stair.treadM
      : stair.hole.y + (i + 0.5) * stair.treadM;
    addBox(parent, width, stair.treadM, stair.riseM, x + width / 2, y, zTop - stair.riseM / 2, materials.wood);
  }

  // Stringers under the treads and closed side cheeks hide the step undersides.
  for (const sideX of [x + 0.08, x + width - 0.08]) {
    addSlopedBox(parent, sideX, midY, midZ - 0.11, 0.08, slopeLength, 0.2, angle, materials.doorFrame);
  }
  for (const sideX of [x - 0.035, x + width + 0.035]) {
    addSlopedBox(parent, sideX, midY, midZ - 0.14, 0.07, slopeLength, 0.28, angle, materials.wood);
  }

  // Handrail and posts on both sides.
  for (const sideX of [x, x + width]) {
    addSlopedBox(parent, sideX, midY, midZ + 0.92, 0.05, slopeLength, 0.05, angle, materials.metal, false);
    for (const [py, pz] of [[yStart, zStart], [yEnd, zEnd]] as const) {
      addBox(parent, 0.05, 0.05, 0.92, sideX, py, pz + 0.46, materials.metal, false);
    }
  }

  // Small landings tie the flight to the slabs above and below.
  addBox(parent, width, 0.3, 0.06, x + width / 2, yStart, zStart - 0.03, materials.wood, false);
  addBox(parent, width, 0.3, 0.06, x + width / 2, yEnd, zEnd - 0.03, materials.wood, false);
}

function addAcUnit(parent: THREE.Object3D, fixture: FixtureModel, materials: SceneMaterials): void {
  const group = new THREE.Group();
  group.position.set(fixture.xM, fixture.yM, fixture.zM);
  group.rotation.z = fixture.yaw ?? 0;
  const width = fixture.widthM;
  const depth = fixture.depthM;
  const height = fixture.heightM;

  addBox(group, width, depth, height, 0, 0, height / 2, materials.acBody);

  const fanRadius = Math.min(width, depth) * 0.27;
  const fan = new THREE.Mesh(new THREE.CylinderGeometry(fanRadius, fanRadius, 0.035, 24), materials.acDark);
  fan.rotation.x = Math.PI / 2;
  fan.position.set(0, 0, height + 0.018);
  fan.castShadow = true;
  group.add(fan);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(fanRadius + 0.02, 0.018, 8, 24), materials.acMetal);
  ring.position.set(0, 0, height + 0.025);
  group.add(ring);

  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(fanRadius * 1.55, 0.055, 0.012), materials.acDark);
    blade.position.set(0, 0, height + 0.045);
    blade.rotation.z = (i * Math.PI) / 2 + Math.PI / 6;
    group.add(blade);
  }

  addBox(group, width * 0.72, 0.018, height * 0.62, 0, depth / 2 + 0.011, height * 0.5, materials.acDark, false);
  for (let i = 0; i < 6; i++) {
    const z = height * 0.26 + (i * height * 0.48) / 5;
    addBox(group, width * 0.68, 0.018, 0.018, 0, depth / 2 + 0.028, z, materials.acMetal, false);
  }

  addBox(group, 0.018, depth * 0.62, height * 0.56, width / 2 + 0.011, 0, height * 0.5, materials.acDark, false);
  for (let i = 0; i < 5; i++) {
    const y = -depth * 0.24 + (i * depth * 0.48) / 4;
    addBox(group, 0.018, 0.018, height * 0.5, width / 2 + 0.028, y, height * 0.5, materials.acMetal, false);
  }

  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.55, 8), materials.acMetal);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(side * (width * 0.32), -depth / 2 - 0.035, height * 0.45);
    group.add(pipe);
  }

  addBox(group, width * 0.12, depth * 0.12, 0.04, width * 0.36, depth * 0.36, 0.02, materials.acDark, false);
  addBox(group, width * 0.12, depth * 0.12, 0.04, -width * 0.36, depth * 0.36, 0.02, materials.acDark, false);
  addBox(group, width * 0.12, depth * 0.12, 0.04, width * 0.36, -depth * 0.36, 0.02, materials.acDark, false);
  addBox(group, width * 0.12, depth * 0.12, 0.04, -width * 0.36, -depth * 0.36, 0.02, materials.acDark, false);

  parent.add(group);
}

function addFixture(parent: THREE.Object3D, fixture: FixtureModel, materials: SceneMaterials): void {
  if (fixture.kind === 'ac') {
    addAcUnit(parent, fixture, materials);
  } else if (fixture.kind === 'hatch') {
    addBox(parent, fixture.widthM, fixture.depthM, 0.22, fixture.xM, fixture.yM, fixture.zM - 0.11, materials.metal, false);
  } else if (fixture.kind === 'vent') {
    addBox(parent, fixture.widthM, fixture.depthM, fixture.heightM, fixture.xM, fixture.yM, fixture.zM + fixture.heightM / 2, materials.metal);
  } else {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(fixture.widthM / 2, fixture.widthM / 2, fixture.heightM, 16), materials.metal);
    tank.rotation.x = Math.PI / 2;
    tank.position.set(fixture.xM, fixture.yM, fixture.zM + fixture.heightM / 2);
    tank.castShadow = true;
    parent.add(tank);
  }
}

function addPlinth(parent: THREE.Object3D, plinth: PlinthModel, material: THREE.Material): THREE.Mesh {
  const { rect, heightM, thicknessM } = plinth;
  const outer = new THREE.Shape();
  const x0 = rect.x - thicknessM;
  const y0 = rect.y - thicknessM;
  const x1 = rect.x + rect.w + thicknessM;
  const y1 = rect.y + rect.h + thicknessM;
  outer.moveTo(x0, y0);
  outer.lineTo(x1, y0);
  outer.lineTo(x1, y1);
  outer.lineTo(x0, y1);
  outer.closePath();

  const hole = new THREE.Path();
  hole.moveTo(rect.x, rect.y);
  hole.lineTo(rect.x + rect.w, rect.y);
  hole.lineTo(rect.x + rect.w, rect.y + rect.h);
  hole.lineTo(rect.x, rect.y + rect.h);
  hole.closePath();
  outer.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(outer, {
    depth: heightM,
    bevelEnabled: false,
    curveSegments: 1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = -heightM;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addGroundOccluder(parent: THREE.Object3D, model: BuildingModel): THREE.Mesh {
  const margin = 14.0;
  const x0 = model.footprint.x - margin;
  const y0 = model.footprint.y - margin;
  const x1 = model.footprint.x + model.footprint.w + margin;
  const y1 = model.footprint.y + model.footprint.h + margin;
  const shape = new THREE.Shape();
  shape.moveTo(x0, y0);
  shape.lineTo(x1, y0);
  shape.lineTo(x1, y1);
  shape.lineTo(x0, y1);
  shape.closePath();

  for (const stair of model.stairs) {
    if (stair.toZ >= stair.fromZ || stair.toZ >= 0) continue;
    const hole = new THREE.Path();
    hole.moveTo(stair.hole.x, stair.hole.y);
    hole.lineTo(stair.hole.x + stair.hole.w, stair.hole.y);
    hole.lineTo(stair.hole.x + stair.hole.w, stair.hole.y + stair.hole.h);
    hole.lineTo(stair.hole.x, stair.hole.y + stair.hole.h);
    hole.closePath();
    shape.holes.push(hole);
  }

  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    }),
  );
  mesh.position.z = -0.005;
  mesh.renderOrder = -1000;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function decalFor(decal: DecalModel, materials: SceneMaterials): THREE.Material {
  const frame = Math.max(0, Math.floor(decal.frame ?? 0));
  switch (decal.texture) {
    case 'ivy':
      return materials.decalIvy[frame % materials.decalIvy.length];
    case 'brickDamage':
      return materials.decalBrickDamage[frame % materials.decalBrickDamage.length];
    case 'puddle':
      return materials.decalPuddle[frame % materials.decalPuddle.length];
    case 'tarPatch':
      return materials.decalTarPatch[frame % materials.decalTarPatch.length];
  }
}

function addWallDecal(
  parent: THREE.Object3D,
  wall: WallModel,
  decal: DecalModel,
  side: 'front' | 'back',
  materials: SceneMaterials,
): void {
  const width = decal.u1 - decal.u0;
  const height = decal.v1 - decal.v0;
  if (width <= 0 || height <= 0) return;
  const sign = side === 'front' ? 1 : -1;
  const offset = decal.offsetM ?? 0.012;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), decalFor(decal, materials));
  const centerU = (decal.u0 + decal.u1) / 2;
  const centerV = (decal.v0 + decal.v1) / 2;
  let position: THREE.Vector3;
  let normal: THREE.Vector3;
  if (wall.axis === 'h') {
    position = new THREE.Vector3(centerU, wall.fixedM + sign * (wall.thicknessM / 2 + offset), centerV);
    normal = new THREE.Vector3(0, sign, 0);
  } else {
    position = new THREE.Vector3(wall.fixedM + sign * (wall.thicknessM / 2 + offset), centerU, centerV);
    normal = new THREE.Vector3(sign, 0, 0);
  }
  plane.position.copy(position);
  plane.up.set(0, 0, 1);
  plane.lookAt(position.clone().add(normal));
  plane.renderOrder = 3;
  parent.add(plane);
}

function addSlabDecal(parent: THREE.Object3D, slab: SlabModel, decal: DecalModel, materials: SceneMaterials): void {
  const width = decal.u1 - decal.u0;
  const height = decal.v1 - decal.v0;
  if (width <= 0 || height <= 0) return;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), decalFor(decal, materials));
  plane.position.set((decal.u0 + decal.u1) / 2, (decal.v0 + decal.v1) / 2, slab.zTop + (decal.offsetM ?? 0.006));
  plane.renderOrder = 3;
  parent.add(plane);
}

function addPipe(parent: THREE.Object3D, pipe: PipeModel, materials: SceneMaterials): void {
  if (pipe.points.length < 2) return;
  const points = pipe.points.map((point) => new THREE.Vector3(point.x, point.y, point.z));
  const curve = new THREE.CatmullRomCurve3(points);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, pipe.radiusM, 12, false), materials[pipe.material]);
  tube.castShadow = true;
  tube.receiveShadow = true;
  parent.add(tube);

  // Top hopper head (воронка водостока)
  const top = points[0];
  const hopper = new THREE.Mesh(new THREE.CylinderGeometry(pipe.radiusM * 2.2, pipe.radiusM * 1.1, 0.22, 12), materials[pipe.material]);
  hopper.rotation.x = Math.PI / 2;
  hopper.position.set(top.x, top.y, top.z + 0.08);
  hopper.castShadow = true;
  parent.add(hopper);

  // Mounting brackets along the wall
  const bottom = points[points.length - 1];
  for (let z = bottom.z + 0.6; z < top.z - 0.4; z += 1.4) {
    addBox(parent, 0.16, 0.08, 0.05, bottom.x - 0.02, bottom.y, z, materials.metal, false);
  }

  // Curved discharge shoe at bottom (водовыпускное колено)
  const shoe = new THREE.Mesh(new THREE.CylinderGeometry(pipe.radiusM * 1.1, pipe.radiusM * 1.25, 0.22, 12), materials[pipe.material]);
  shoe.rotation.x = Math.PI / 3;
  shoe.position.set(bottom.x + 0.06, bottom.y, bottom.z + 0.06);
  shoe.castShadow = true;
  parent.add(shoe);
}

function addProps(parent: THREE.Object3D, props: PropModel[], materials: SceneMaterials): THREE.Group {
  const clutter = new THREE.Group();
  for (const prop of props) {
    const group = new THREE.Group();
    group.position.set(prop.xM, prop.yM, prop.zM);
    group.rotation.z = prop.yaw ?? 0;
    const scale = prop.scale ?? 1;
    group.scale.setScalar(scale);

    if (prop.kind === 'pallet') {
      const palletMat = materials.palletWood ?? materials.wood;
      if (prop.id.includes('lean')) {
        group.rotation.x = -0.32;
      }
      for (let i = 0; i < 5; i++) {
        addBox(group, 1.15, 0.14, 0.04, 0, -0.4 + i * 0.2, 0.12, palletMat);
      }
      for (const y of [-0.4, 0, 0.4]) {
        addBox(group, 1.15, 0.12, 0.1, 0, y, 0.05, palletMat);
      }
    } else if (prop.kind === 'crate') {
      const crateMat = materials.crateWood ?? materials.wood;
      addBox(group, 0.8, 0.8, 0.8, 0, 0, 0.4, crateMat);
      for (const x of [-0.37, 0.37]) {
        for (const y of [-0.37, 0.37]) {
          addBox(group, 0.06, 0.06, 0.8, x, y, 0.4, materials.doorFrame);
        }
      }
    } else if (prop.kind === 'trash') {
      const bagMaterial = new THREE.MeshStandardMaterial({ color: 0x1d201c, roughness: 0.95 });
      for (const [x, y, s] of [[-0.2, 0.1, 0.28], [0.16, -0.12, 0.22], [0.02, 0.25, 0.18]]) {
        const bag = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), bagMaterial);
        bag.position.set(x, y, s);
        bag.castShadow = true;
        group.add(bag);
      }
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 12), materials.metal);
      can.rotation.x = Math.PI / 2;
      can.position.set(0.38, 0.08, 0.21);
      can.castShadow = true;
      group.add(can);
    } else {
      const weed = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.85), materials.weeds);
      weed.position.set(0, 0, 0.42);
      weed.castShadow = false;
      group.add(weed);
      const cross = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.85), materials.weeds);
      cross.position.set(0, 0, 0.42);
      cross.rotation.z = Math.PI / 2;
      cross.castShadow = false;
      group.add(cross);
    }

    clutter.add(group);
  }
  parent.add(clutter);
  return clutter;
}

export function buildBuildingMeshes(model: BuildingModel, textures: BuildingTextures): BuildingMeshes {
  const group = new THREE.Group();
  const levelGroups = new Map<string, THREE.Group>();
  const nearWalls: THREE.Object3D[] = [];
  const wallGroups = new Map<string, THREE.Group>();
  const slabGroups = new Map<string, THREE.Group>();
  const stairs: StairMeshEntry[] = [];
  const materials = makeMaterials(textures);
  const levelIndexById = new Map(model.levels.map((level) => [level.id, level.index]));
  const nearestIndexForZ = (z: number): number => {
    let best = model.levels[0];
    for (const level of model.levels) {
      if (!best || Math.abs(level.elevation - z) < Math.abs(best.elevation - z)) best = level;
    }
    return best?.index ?? 0;
  };

  for (const level of model.levels) {
    const levelGroup = new THREE.Group();
    levelGroups.set(level.id, levelGroup);
    group.add(levelGroup);
  }
  const levelGroup = (id: string): THREE.Group => levelGroups.get(id) ?? group;

  const plinth = addPlinth(group, model.plinth, materials.concrete);
  const groundOccluder = addGroundOccluder(group, model);

  for (const slab of model.slabs) {
    const slabGroup = new THREE.Group();
    addSlab(slabGroup, slab, materials[slab.material]);
    slabGroups.set(slab.id, slabGroup);
    levelGroup(slab.levelId).add(slabGroup);
  }

  for (const wall of model.walls) {
    const wallGroup = addWall(levelGroup(wall.levelId), wall, materials);
    wallGroups.set(wall.id, wallGroup);
    const near = wall.exterior && (
      (wall.axis === 'h' && wall.fixedM > model.footprint.y + model.footprint.h / 2) ||
      (wall.axis === 'v' && wall.fixedM > model.footprint.x + model.footprint.w / 2)
    );
    if (near || !wall.exterior) nearWalls.push(wallGroup);
  }

  for (const stair of model.stairs) {
    const stairGroup = new THREE.Group();
    addStair(stairGroup, stair, materials);
    group.add(stairGroup);
    stairs.push({
      group: stairGroup,
      fromIndex: stair.fromLevelId !== undefined
        ? levelIndexById.get(stair.fromLevelId) ?? nearestIndexForZ(stair.fromZ)
        : nearestIndexForZ(stair.fromZ),
      toIndex: stair.toLevelId !== undefined
        ? levelIndexById.get(stair.toLevelId) ?? nearestIndexForZ(stair.toZ)
        : nearestIndexForZ(stair.toZ),
    });
  }

  for (const fixture of model.fixtures) {
    addFixture(levelGroup(fixture.levelId), fixture, materials);
  }

  for (const decal of model.decals) {
    const host = decal.host;
    if (host.kind === 'wall') {
      const wall = model.walls.find((candidate) => candidate.id === host.id);
      if (!wall) continue;
      const hostGroup = wallGroups.get(wall.id);
      if (hostGroup) addWallDecal(hostGroup, wall, decal, host.side, materials);
    } else if (host.kind === 'slab') {
      const slab = model.slabs.find((candidate) => candidate.id === host.id);
      if (!slab) continue;
      const hostGroup = slabGroups.get(slab.id);
      if (hostGroup) addSlabDecal(hostGroup, slab, decal, materials);
    }
  }

  for (const pipe of model.pipes) {
    if (pipe.host.kind !== 'wall') continue;
    const host = wallGroups.get(pipe.host.id);
    if (host) addPipe(host, pipe, materials);
  }

  const exteriorClutter = addProps(group, model.props, materials);

  return { group, levelGroups, nearWalls, fixtures: model.fixtures, plinth, groundOccluder, exteriorClutter, stairs };
}
