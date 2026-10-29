import * as THREE from 'three';
import { computeBillboardAxes } from './billboardAxes.js';
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
  brickClean?: THREE.Texture;
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
  doorFrame?: THREE.Texture;
  wallInteriorDamaged?: THREE.Texture;
  floorWoodClean?: THREE.Texture;
  floorWoodScuffed?: THREE.Texture;
  wallConcrete?: THREE.Texture;
  roofAcUnit?: THREE.Texture;
  bedDouble?: THREE.Texture;
  wardrobe?: THREE.Texture;
  propPallet?: THREE.Texture;
  propDownspout?: THREE.Texture;
  propClutter?: THREE.Texture;
  asphalt?: THREE.Texture;
  sidewalk?: THREE.Texture;
  ground?: THREE.Texture;
  contactShadow?: THREE.Texture;
}

export interface StairMeshEntry {
  group: THREE.Group;
  fromIndex: number;
  toIndex: number;
}

export interface BuildingMeshes {
  group: THREE.Group;
  levelGroups: Map<string, THREE.Group>;
  interiorGroups: Map<string, THREE.Group>;
  exteriorWallGroups: Map<string, THREE.Group>;
  fixtureGroups: Map<string, THREE.Group>;
  nearWalls: THREE.Object3D[];
  fixtures: FixtureModel[];
  plinth: THREE.Object3D;
  groundOccluder: THREE.Mesh;
  exteriorClutter: THREE.Group;
  stairs: StairMeshEntry[];
}

interface SceneMaterials extends Record<MaterialKey, THREE.Material> {
  textures: BuildingTextures;
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
  contactShadow?: THREE.Material;
  decalIvy: THREE.Material[];
  decalBrickDamage: THREE.Material[];
  decalPuddle: THREE.Material[];
  decalTarPatch: THREE.Material[];
  weeds: THREE.Material;
  wallBrick: THREE.Material;
  wallBrickWeathered: THREE.Material;
  wallPlaster: THREE.Material;
  wallInteriorDamaged: THREE.Material;
  wallConcrete: THREE.Material;
  baseboardWood: THREE.Material;
  furnitureWood: THREE.Material;
  counterStone: THREE.Material;
  applianceWhite: THREE.Material;
  applianceSteel: THREE.Material;
  bedSheet: THREE.Material;
  bedBlanket: THREE.Material;
  rugMat: THREE.Material;
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

  const woodTexture = textures.floorWoodClean ?? textures.wood;
  const concreteTexture = textures.wallConcrete ?? textures.concrete;
  const brickTexture = textures.brickClean ?? textures.brick;

  return {
    textures,
    brick: surfaceMaterial(brickTexture, 1, 1, { color: 0xffe2d8, roughness: 0.82 }),
    brickWeathered: surfaceMaterial(brickTexture, 1, 1, { color: 0xf4dcd0, roughness: 0.86 }),
    plaster: surfaceMaterial(textures.plaster, 1, 1, { roughness: 0.92 }),
    wood: surfaceMaterial(woodTexture, 1, 1, { roughness: 0.82 }),
    concrete: surfaceMaterial(concreteTexture, 1, 1, { color: 0xdcd6cc, roughness: 0.92 }),
    stoneSill: surfaceMaterial(concreteTexture, 1.2, 1.2, { color: 0xe0dad0, roughness: 0.88, metalness: 0.02 }),
    stoneParapet: surfaceMaterial(concreteTexture, 1.2, 1.2, { color: 0xeee8de, roughness: 0.85, metalness: 0.02 }),
    tar: surfaceMaterial(textures.tar, 1, 1, { color: 0xffffff, roughness: 0.85, metalness: 0.04 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x2c2826, roughness: 0.65, metalness: 0.62, side: THREE.DoubleSide }),
    doorFrame: textures.doorFrame
      ? new THREE.MeshStandardMaterial({ map: textures.doorFrame, roughness: 0.82, metalness: 0.18, side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ color: 0x242828, roughness: 0.78, metalness: 0.35, side: THREE.DoubleSide }),
    doorLeaf: doorLeafMat ?? new THREE.MeshStandardMaterial({ color: 0x383e42, roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide }),
    doorPanel: new THREE.MeshStandardMaterial({ color: 0x161819, roughness: 0.85, metalness: 0.2, side: THREE.DoubleSide }),
    windowFrame: surfaceMaterial(woodTexture, 1, 1, { color: 0x221a14, roughness: 0.92, metalness: 0.05 }),
    palletWood: surfaceMaterial(woodTexture, 1, 1, { color: 0x7e7668, roughness: 0.90 }),
    crateWood: surfaceMaterial(woodTexture, 1, 1, { color: 0x8a7258, roughness: 0.88 }),
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
    acBody: new THREE.MeshStandardMaterial({ color: 0x727a72, roughness: 0.68, metalness: 0.28, side: THREE.DoubleSide }),
    acDark: new THREE.MeshStandardMaterial({ color: 0x1c201e, roughness: 0.75, metalness: 0.4, side: THREE.DoubleSide }),
    acMetal: new THREE.MeshStandardMaterial({ color: 0x545c5a, roughness: 0.52, metalness: 0.58, side: THREE.DoubleSide }),
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
    wallBrick: surfaceMaterial(brickTexture, 1, 1, { color: 0xffe2d8, roughness: 0.82 }),
    wallBrickWeathered: surfaceMaterial(brickTexture, 1, 1, { color: 0xf4dcd0, roughness: 0.86 }),
    wallPlaster: surfaceMaterial(textures.plaster, 1, 1, { roughness: 0.95 }),
    wallInteriorDamaged: surfaceMaterial(textures.wallInteriorDamaged ?? textures.plaster, 1, 1, { roughness: 0.95 }),
    wallConcrete: surfaceMaterial(concreteTexture, 1, 1, { color: 0xc8c2b8, roughness: 0.95 }),
    baseboardWood: surfaceMaterial(woodTexture, 1, 1, { color: 0x2a1e14, roughness: 0.78, metalness: 0.05 }),
    furnitureWood: surfaceMaterial(woodTexture, 1, 1, { color: 0x6e5238, roughness: 0.82, metalness: 0.05 }),
    counterStone: surfaceMaterial(concreteTexture, 1, 1, { color: 0xc8c2b8, roughness: 0.7, metalness: 0.08 }),
    applianceWhite: new THREE.MeshStandardMaterial({ color: 0xe8e6e2, roughness: 0.45, metalness: 0.15, side: THREE.DoubleSide }),
    applianceSteel: new THREE.MeshStandardMaterial({ color: 0x7c8488, roughness: 0.45, metalness: 0.65, side: THREE.DoubleSide }),
    bedSheet: surfaceMaterial(textures.plaster, 1, 1, { color: 0xdedcd7, roughness: 0.92, metalness: 0.02 }),
    bedBlanket: surfaceMaterial(textures.plaster, 1, 1, { color: 0x3e4e46, roughness: 0.88, metalness: 0.02 }),
    rugMat: surfaceMaterial(textures.wallInteriorDamaged ?? textures.plaster, 1, 1, { color: 0x783226, roughness: 0.95, metalness: 0.02 }),
    contactShadow: textures.contactShadow
      ? new THREE.MeshBasicMaterial({
          map: textures.contactShadow,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      : undefined,
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
  const scaleM = slab.material === 'wood' ? 1.2 : slab.material === 'tar' ? 3.6 : 2.4;
  for (const rect of rects) {
    const geometry = new THREE.BoxGeometry(rect.w, rect.h, heightZ);
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    for (let i = 0; i < position.count; i++) {
      const nz = Math.abs(normal.getZ(i));
      if (nz > 0.5) {
        const worldX = cx + position.getX(i);
        const worldY = cy + position.getY(i);
        uv.setXY(i, worldX / scaleM, worldY / scaleM);
      } else if (Math.abs(normal.getX(i)) > 0.5) {
        const worldY = cy + position.getY(i);
        uv.setXY(i, worldY / scaleM, (position.getZ(i) + heightZ / 2) / Math.max(0.2, heightZ));
      } else {
        const worldX = cx + position.getX(i);
        uv.setXY(i, worldX / scaleM, (position.getZ(i) + heightZ / 2) / Math.max(0.2, heightZ));
      }
    }
    uv.needsUpdate = true;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(cx, cy, centerZ);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}

function wallMaterialsFor(
  wall: WallModel,
  materials: SceneMaterials,
): THREE.Material[] {
  if (wall.levelId === 'level:-1') {
    return [materials.wallConcrete, materials.wallConcrete, materials.wallConcrete, materials.wallConcrete, materials.wallConcrete, materials.wallConcrete];
  }
  if (wall.id.includes('base')) {
    return [materials.stoneParapet, materials.stoneParapet, materials.stoneParapet, materials.stoneParapet, materials.stoneParapet, materials.stoneParapet];
  }
  if (wall.id.includes('parapet') || wall.id.includes('cap')) {
    return [materials.wallBrick, materials.wallBrick, materials.wallBrick, materials.wallBrick, materials.stoneParapet, materials.wallConcrete];
  }
  if (!wall.exterior || wall.material === 'plaster') {
    return [materials.wallPlaster, materials.wallPlaster, materials.wallPlaster, materials.wallPlaster, materials.baseboardWood, materials.wallConcrete];
  }

  // Exterior envelope wall with interior face
  const ext = materials.wallBrick;
  const int = materials.wallPlaster;
  const top = materials.stoneParapet;
  const btm = materials.wallConcrete;

  if (wall.axis === 'h') {
    // Face 2 is +Y, Face 3 is -Y
    const southFacing = wall.fixedM > 4.5;
    return southFacing ? [ext, ext, ext, int, top, btm] : [ext, ext, int, ext, top, btm];
  }

  // Face 0 is +X, Face 1 is -X
  const eastFacing = wall.fixedM > 6.0;
  return eastFacing ? [ext, int, ext, ext, top, btm] : [int, ext, ext, ext, top, btm];
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
  const textureScaleM = 1.80;
  for (let i = 0; i < position.count; i++) {
    const localAlong = isHorizontal ? position.getX(i) : position.getY(i);
    const along = centerAlong + localAlong;
    const z = centerZ + position.getZ(i);
    uv.setXY(i, along / textureScaleM, z / textureScaleM);
  }
  uv.needsUpdate = true;
  const matList = wallMaterialsFor(wall, materials);
  const mesh = new THREE.Mesh(geometry, matList);
  mesh.position.set(
    isHorizontal ? centerAlong : wall.fixedM,
    isHorizontal ? wall.fixedM : centerAlong,
    centerZ,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);

  // Wooden baseboard skirting along the bottom of interior walls (ground floor)
  if (wall.levelId === 'level:0' && zBottom <= 0.05 && !wall.id.includes('parapet') && !wall.id.includes('base')) {
    const trimH = 0.12;
    const trimD = 0.015;
    if (isHorizontal) {
      const isPartition = !wall.exterior || wall.material === 'plaster';
      const southFacing = wall.fixedM > 4.5;
      if (isPartition || southFacing) {
        addBox(parent, length, trimD, trimH, centerAlong, wall.fixedM - wall.thicknessM / 2 + trimD / 2, zBottom + trimH / 2, materials.baseboardWood, false);
      }
      if (isPartition || !southFacing) {
        addBox(parent, length, trimD, trimH, centerAlong, wall.fixedM + wall.thicknessM / 2 - trimD / 2, zBottom + trimH / 2, materials.baseboardWood, false);
      }
    } else {
      const isPartition = !wall.exterior || wall.material === 'plaster';
      const eastFacing = wall.fixedM > 6.0;
      if (isPartition || eastFacing) {
        addBox(parent, trimD, length, trimH, wall.fixedM - wall.thicknessM / 2 + trimD / 2, centerAlong, zBottom + trimH / 2, materials.baseboardWood, false);
      }
      if (isPartition || !eastFacing) {
        addBox(parent, trimD, length, trimH, wall.fixedM + wall.thicknessM / 2 - trimD / 2, centerAlong, zBottom + trimH / 2, materials.baseboardWood, false);
      }
    }
  }
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
  const halfWall = wall.thicknessM / 2;
  const isHorizontal = wall.axis === 'h';
  const isSouthFacing = isHorizontal && wall.fixedM > 4.5;
  const isEastFacing = !isHorizontal && wall.fixedM > 6.0;
  const sign = (isHorizontal ? isSouthFacing : isEastFacing) ? 1 : -1;
  const face = sign * halfWall;
  const frameDepth = wall.thicknessM + 0.05;

  // Dark steel door frame
  wallBox(parent, wall, x0 + jamb / 2, jamb, 0, frameDepth, (z0 + z1) / 2, z1 - z0, materials.doorFrame);
  wallBox(parent, wall, x1 - jamb / 2, jamb, 0, frameDepth, (z0 + z1) / 2, z1 - z0, materials.doorFrame);
  wallBox(parent, wall, center, x1 - x0, 0, frameDepth, z1 - head / 2, head, materials.doorFrame);
  wallBox(parent, wall, center, x1 - x0, 0, frameDepth, z0 + sill / 2, sill, materials.doorFrame);

  // Stone threshold under the door on the exterior
  wallBox(parent, wall, center, x1 - x0 + 0.08, face + sign * 0.04, 0.08, z0 + sill / 2, sill + 0.02, materials.stoneSill);

  const leafWidth = x1 - x0 - jamb * 2 - 0.02;
  const leafBottom = z0 + sill + 0.01;
  const leafTop = z1 - head - 0.01;
  const leafHeight = leafTop - leafBottom;
  const leafCenterZ = (leafBottom + leafTop) / 2;
  const leafDepth = 0.06;
  const leafOffset = face - sign * (leafDepth / 2);

  // Heavy steel door leaf
  wallBox(parent, wall, center, leafWidth, leafOffset, leafDepth, leafCenterZ, leafHeight, materials.doorLeaf);

  if (materials.doorLeafTexture) {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(leafWidth, leafHeight), materials.doorLeafTexture);
    const pos = new THREE.Vector3(
      isHorizontal ? center : wall.fixedM + face + sign * 0.006,
      isHorizontal ? wall.fixedM + face + sign * 0.006 : center,
      leafCenterZ,
    );
    const normal = isHorizontal ? new THREE.Vector3(0, sign, 0) : new THREE.Vector3(sign, 0, 0);
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
  const halfWall = wall.thicknessM / 2;
  const isHorizontal = wall.axis === 'h';
  const isSouthFacing = isHorizontal && wall.fixedM > 4.5;
  const isEastFacing = !isHorizontal && wall.fixedM > 6.0;
  const sign = (isHorizontal ? isSouthFacing : isEastFacing) ? 1 : -1;
  const face = sign * halfWall;

  // Dark interior backplane behind the glass (eliminates see-through house)
  wallBox(parent, wall, center, windowWidth, -sign * halfWall + sign * 0.01, 0.02, centerZ, windowHeight, materials.doorPanel, false);

  if (materials.windowUnit) {
    // Photorealistic window unit texture quad (lintel, frame, sashes, mullions & glass)
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(windowWidth, windowHeight), materials.windowUnit);
    const pos = new THREE.Vector3(
      isHorizontal ? center : wall.fixedM + face + sign * 0.006,
      isHorizontal ? wall.fixedM + face + sign * 0.006 : center,
      centerZ,
    );
    const normal = isHorizontal ? new THREE.Vector3(0, sign, 0) : new THREE.Vector3(sign, 0, 0);
    quad.position.copy(pos);
    quad.up.set(0, 0, 1);
    quad.lookAt(pos.clone().add(normal));
    quad.renderOrder = 2;
    quad.receiveShadow = true;
    parent.add(quad);

    // Projecting weathered stone sill under window (matching visual-target.jpg)
    const sillOverhang = 0.08;
    const sillHeight = 0.07;
    const sillDepth = 0.08;
    wallBox(
      parent,
      wall,
      center,
      windowWidth + sillOverhang * 2,
      face + sign * (sillDepth / 2 - 0.01),
      sillDepth,
      z0 - sillHeight / 2,
      sillHeight,
      materials.stoneSill,
    );

    // Stone lintel above window
    wallBox(
      parent,
      wall,
      center,
      windowWidth + 0.12,
      face + sign * 0.015,
      0.04,
      z1 + sillHeight / 2,
      sillHeight,
      materials.stoneSill,
    );
  } else {
    const frameDepth = wall.thicknessM + 0.04;
    wallBox(parent, wall, x0 + frame / 2, frame, 0, frameDepth, centerZ, windowHeight, materials.windowFrame);
    wallBox(parent, wall, x1 - frame / 2, frame, 0, frameDepth, centerZ, windowHeight, materials.windowFrame);
    wallBox(parent, wall, center, windowWidth, 0, frameDepth, z1 - frame / 2, frame, materials.windowFrame);
    wallBox(parent, wall, center, windowWidth, 0, frameDepth, z0 + frame / 2, frame, materials.windowFrame);
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

function addIsometricSprite(
  parent: THREE.Object3D,
  texture: THREE.Texture,
  options: {
    x: number;
    y: number;
    z: number;
    widthM: number;
    heightM: number;
    anchorX?: number;
    anchorY?: number;
    alphaTest?: number;
    roughness?: number;
    castShadowBox?: { w: number; d: number; h: number };
  },
): THREE.Mesh {
  const { x, y, z, widthM, heightM, anchorX = 0.5, anchorY = 0 } = options;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    alphaTest: options.alphaTest ?? 0.05,
    roughness: options.roughness ?? 0.8,
    metalness: 0.15,
    side: THREE.DoubleSide,
    depthWrite: true,
  });

  const geometry = new THREE.PlaneGeometry(widthM, heightM);
  geometry.translate((0.5 - anchorX) * widthM, (0.5 - anchorY) * heightM, 0);
  geometry.scale(-1, 1, 1);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: texture,
    alphaTest: options.alphaTest ?? 0.05,
    side: THREE.DoubleSide,
  });
  const axes = computeBillboardAxes();

  mesh.matrixAutoUpdate = false;
  const matrix = new THREE.Matrix4().makeBasis(
    axes.unitX.clone().negate(),
    axes.unitY.clone(),
    axes.normal,
  );
  matrix.setPosition(x, y, z);
  mesh.matrix.copy(matrix);
  mesh.matrixWorldNeedsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  parent.add(mesh);

  if (options.castShadowBox) {
    const sb = options.castShadowBox;
    const shadowMesh = new THREE.Mesh(
      new THREE.BoxGeometry(sb.w, sb.d, sb.h),
      new THREE.MeshBasicMaterial({ colorWrite: false }),
    );
    shadowMesh.position.set(x, y, z + sb.h / 2);
    shadowMesh.castShadow = true;
    shadowMesh.receiveShadow = false;
    parent.add(shadowMesh);
  }

  return mesh;
}

function addFixture(parent: THREE.Object3D, fixture: FixtureModel, materials: SceneMaterials): void {
  if (fixture.kind === 'ac') {
    if (materials.contactShadow) {
      const shadowMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.65, 1.45),
        materials.contactShadow,
      );
      shadowMesh.position.set(fixture.xM + 0.18, fixture.yM - 0.14, fixture.zM + 0.005);
      shadowMesh.renderOrder = 1;
      parent.add(shadowMesh);
    }
    if (materials.textures.roofAcUnit) {
      addIsometricSprite(parent, materials.textures.roofAcUnit, {
        x: fixture.xM,
        y: fixture.yM,
        z: fixture.zM,
        widthM: 1.48,
        heightM: 1.52,
        anchorX: 0.5,
        anchorY: 0.10,
        roughness: 0.85,
        castShadowBox: { w: 1.25, d: 1.25, h: 1.1 },
      });
    } else {
      addAcUnit(parent, fixture, materials);
    }
  } else if (fixture.kind === 'hatch') {
    addBox(parent, fixture.widthM, fixture.depthM, 0.22, fixture.xM, fixture.yM, fixture.zM - 0.11, materials.metal, false);
  } else if (fixture.kind === 'vent') {
    if (materials.contactShadow) {
      const shadowMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.55),
        materials.contactShadow,
      );
      shadowMesh.position.set(fixture.xM + 0.08, fixture.yM - 0.06, fixture.zM + 0.005);
      shadowMesh.renderOrder = 1;
      parent.add(shadowMesh);
    }
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

function addGroundOccluder(parent: THREE.Object3D, model: BuildingModel, materials: SceneMaterials): THREE.Mesh {
  const margin = 24.0;
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

  const geometry = new THREE.ShapeGeometry(shape);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const scaleM = 7.2;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    uv.setXY(i, x / scaleM, y / scaleM);
  }
  uv.needsUpdate = true;

  const groundMat = materials.textures.ground
    ? new THREE.MeshStandardMaterial({
        map: repeatedTexture(materials.textures.ground, 1, 1),
        color: 0xc6cca8,
        roughness: 0.92,
        metalness: 0.04,
        side: THREE.DoubleSide,
      })
    : new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: THREE.DoubleSide });

  const mesh = new THREE.Mesh(geometry, groundMat);
  mesh.position.z = -0.005;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
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
  const hopper = new THREE.Mesh(new THREE.CylinderGeometry(pipe.radiusM * 2.0, pipe.radiusM * 1.05, 0.22, 12), materials[pipe.material]);
  hopper.rotation.x = Math.PI / 2;
  hopper.position.set(top.x, top.y, top.z);
  hopper.castShadow = true;
  parent.add(hopper);

  // Mounting brackets along the wall
  const straightX = top.x;
  const straightY = top.y;
  const bottomZ = points[points.length - 1].z;
  for (let z = bottomZ + 0.6; z < top.z - 0.3; z += 1.2) {
    addBox(parent, 0.14, 0.14, 0.04, straightX, straightY, z, materials.metal, false);
  }
}

function addSingleProp(parent: THREE.Object3D, prop: PropModel, materials: SceneMaterials): THREE.Group {
  const group = new THREE.Group();
  group.position.set(prop.xM, prop.yM, prop.zM);
  group.rotation.z = prop.yaw ?? 0;
  const scale = prop.scale ?? 1;
  group.scale.setScalar(scale);

  if (prop.kind === 'bed') {
    if (materials.textures.bedDouble) {
      addIsometricSprite(group, materials.textures.bedDouble, {
        x: 0,
        y: 0,
        z: 0,
        widthM: 1.85,
        heightM: 1.70,
        anchorX: 0.5,
        anchorY: 0.12,
        castShadowBox: { w: 1.5, d: 2.0, h: 0.55 },
      });
    } else {
      addBox(group, 1.4, 2.0, 0.22, 0, 0, 0.11, materials.furnitureWood);
      addBox(group, 1.44, 0.1, 0.85, 0, -0.95, 0.45, materials.furnitureWood);
      addBox(group, 1.32, 1.9, 0.22, 0, 0.02, 0.32, materials.bedSheet);
      addBox(group, 1.34, 1.25, 0.08, 0, 0.32, 0.45, materials.bedBlanket);
      addBox(group, 0.52, 0.34, 0.08, -0.32, -0.65, 0.44, materials.bedSheet);
      addBox(group, 0.52, 0.34, 0.08, 0.32, -0.65, 0.44, materials.bedSheet);
    }
  } else if (prop.kind === 'wardrobe') {
    if (materials.textures.wardrobe) {
      addIsometricSprite(group, materials.textures.wardrobe, {
        x: 0,
        y: 0,
        z: 0,
        widthM: 1.15,
        heightM: 1.78,
        anchorX: 0.5,
        anchorY: 0.06,
        castShadowBox: { w: 1.1, d: 0.6, h: 1.7 },
      });
    } else {
      addBox(group, 1.2, 0.58, 2.0, 0, 0, 1.0, materials.furnitureWood);
      addBox(group, 1.26, 0.64, 0.08, 0, 0, 2.04, materials.baseboardWood);
      addBox(group, 1.22, 0.6, 0.08, 0, 0, 0.04, materials.baseboardWood);
      addBox(group, 0.54, 0.02, 1.8, -0.28, 0.3, 1.0, materials.palletWood);
      addBox(group, 0.54, 0.02, 1.8, 0.28, 0.3, 1.0, materials.palletWood);
      addBox(group, 0.03, 0.03, 0.12, -0.06, 0.32, 1.05, materials.metal, false);
      addBox(group, 0.03, 0.03, 0.12, 0.06, 0.32, 1.05, materials.metal, false);
    }
  } else if (prop.kind === 'nightstand') {
    addBox(group, 0.5, 0.45, 0.5, 0, 0, 0.25, materials.furnitureWood);
    addBox(group, 0.54, 0.48, 0.04, 0, 0, 0.52, materials.furnitureWood);
    addBox(group, 0.04, 0.04, 0.04, 0, 0.24, 0.35, materials.metal, false);
  } else if (prop.kind === 'counter') {
    addBox(group, 1.2, 0.6, 0.84, 0, 0, 0.42, materials.furnitureWood);
    addBox(group, 1.24, 0.64, 0.06, 0, 0, 0.87, materials.counterStone);
    addBox(group, 0.45, 0.38, 0.01, -0.2, 0, 0.902, materials.applianceSteel, false);
  } else if (prop.kind === 'fridge') {
    addBox(group, 0.7, 0.7, 1.76, 0, 0, 0.88, materials.applianceSteel);
    addBox(group, 0.72, 0.02, 0.02, 0, 0.36, 1.22, materials.doorFrame, false);
    addBox(group, 0.03, 0.04, 0.45, 0.28, 0.38, 0.85, materials.metal, false);
  } else if (prop.kind === 'table') {
    addBox(group, 1.2, 0.8, 0.05, 0, 0, 0.725, materials.furnitureWood);
    const lx = 0.52;
    const ly = 0.32;
    addBox(group, 0.06, 0.06, 0.7, -lx, -ly, 0.35, materials.furnitureWood);
    addBox(group, 0.06, 0.06, 0.7, lx, -ly, 0.35, materials.furnitureWood);
    addBox(group, 0.06, 0.06, 0.7, -lx, ly, 0.35, materials.furnitureWood);
    addBox(group, 0.06, 0.06, 0.7, lx, ly, 0.35, materials.furnitureWood);
  } else if (prop.kind === 'chair') {
    addBox(group, 0.44, 0.44, 0.04, 0, 0, 0.45, materials.furnitureWood);
    const cx = 0.17;
    const cy = 0.17;
    addBox(group, 0.04, 0.04, 0.43, -cx, -cy, 0.215, materials.furnitureWood);
    addBox(group, 0.04, 0.04, 0.43, cx, -cy, 0.215, materials.furnitureWood);
    addBox(group, 0.04, 0.04, 0.43, -cx, cy, 0.215, materials.furnitureWood);
    addBox(group, 0.04, 0.04, 0.43, cx, cy, 0.215, materials.furnitureWood);
    addBox(group, 0.44, 0.04, 0.42, 0, -cy, 0.68, materials.furnitureWood);
  } else if (prop.kind === 'shelf') {
    const sx = 0.46;
    const sy = 0.14;
    addBox(group, 0.04, 0.04, 1.8, -sx, -sy, 0.9, materials.metal);
    addBox(group, 0.04, 0.04, 1.8, sx, -sy, 0.9, materials.metal);
    addBox(group, 0.04, 0.04, 1.8, -sx, sy, 0.9, materials.metal);
    addBox(group, 0.04, 0.04, 1.8, sx, sy, 0.9, materials.metal);
    for (const z of [0.15, 0.6, 1.05, 1.5, 1.78]) {
      addBox(group, 1.0, 0.35, 0.03, 0, 0, z, materials.palletWood);
    }
    addBox(group, 0.38, 0.28, 0.28, -0.22, 0, 0.31, materials.crateWood);
    addBox(group, 0.32, 0.26, 0.25, 0.25, 0, 0.75, materials.crateWood);
  } else if (prop.kind === 'utility_box') {
    addBox(group, 0.8, 0.5, 1.38, 0, 0, 0.69, materials.acMetal);
    addBox(group, 0.82, 0.02, 0.02, 0, 0.25, 0.7, materials.doorFrame, false);
  } else if (prop.kind === 'rug') {
    addBox(group, 2.0, 1.4, 0.01, 0, 0, 0.005, materials.rugMat, false);
  } else if (prop.kind === 'pallet') {
    const palletMat = materials.palletWood ?? materials.wood;
    if (prop.id.includes('lean')) {
      if (materials.contactShadow) {
        const shadowMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1.25, 0.65),
          materials.contactShadow,
        );
        shadowMesh.position.set(0, 0.12, 0.005);
        shadowMesh.renderOrder = 1;
        group.add(shadowMesh);
      }
      // Standing pallet leaning against the mansard wall, matching visual-target.jpg
      const lean = new THREE.Group();
      lean.rotation.x = 0.26;
      const w = 1.05;
      const h = 1.25;
      // 3 vertical stringer bearers
      for (const x of [-0.45, 0, 0.45]) {
        addBox(lean, 0.08, 0.09, h, x, -0.045, h / 2, palletMat);
      }
      // 6 horizontal face boards
      for (let i = 0; i < 6; i++) {
        const z = 0.06 + i * 0.22;
        addBox(lean, w, 0.022, 0.12, 0, 0.015, z, palletMat);
      }
      // 3 bottom skids
      for (const z of [0.08, h / 2, h - 0.08]) {
        addBox(lean, w, 0.02, 0.10, 0, -0.09, z, palletMat);
      }
      group.add(lean);
    } else if (materials.textures.propPallet) {
      if (materials.contactShadow) {
        const shadowMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(1.4, 1.4),
          materials.contactShadow,
        );
        shadowMesh.position.set(0.12, -0.08, 0.005);
        shadowMesh.renderOrder = 1;
        group.add(shadowMesh);
      }
      addIsometricSprite(group, materials.textures.propPallet, {
        x: 0,
        y: 0,
        z: 0,
        widthM: 1.25,
        heightM: 1.25,
        anchorX: 0.5,
        anchorY: 0.15,
        castShadowBox: { w: 1.1, d: 1.1, h: 0.2 },
      });
    } else {
      for (let i = 0; i < 5; i++) {
        addBox(group, 1.15, 0.14, 0.04, 0, -0.4 + i * 0.2, 0.12, palletMat);
      }
      for (const y of [-0.4, 0, 0.4]) {
        addBox(group, 1.15, 0.12, 0.1, 0, y, 0.05, palletMat);
      }
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

  parent.add(group);
  return group;
}

function addProps(parent: THREE.Object3D, props: PropModel[], materials: SceneMaterials): THREE.Group {
  const clutter = new THREE.Group();
  for (const prop of props) {
    addSingleProp(clutter, prop, materials);
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

  const interiorGroups = new Map<string, THREE.Group>();
  const exteriorWallGroups = new Map<string, THREE.Group>();
  const fixtureGroups = new Map<string, THREE.Group>();

  for (const level of model.levels) {
    const levelGroup = new THREE.Group();
    levelGroups.set(level.id, levelGroup);
    group.add(levelGroup);

    const interiorGroup = new THREE.Group();
    interiorGroups.set(level.id, interiorGroup);
    levelGroup.add(interiorGroup);

    const exteriorWallGroup = new THREE.Group();
    exteriorWallGroups.set(level.id, exteriorWallGroup);
    group.add(exteriorWallGroup);

    const fixtureGroup = new THREE.Group();
    fixtureGroups.set(level.id, fixtureGroup);
    group.add(fixtureGroup);
  }

  const roofFixtureGroup = new THREE.Group();
  fixtureGroups.set('roof', roofFixtureGroup);
  group.add(roofFixtureGroup);
  const levelGroup = (id: string): THREE.Group => levelGroups.get(id) ?? group;
  const interiorGroup = (id: string): THREE.Group => interiorGroups.get(id) ?? levelGroup(id);
  const exteriorWallGroup = (id: string): THREE.Group => exteriorWallGroups.get(id) ?? levelGroup(id);

  const plinth = addPlinth(group, model.plinth, materials.concrete);
  const groundOccluder = addGroundOccluder(group, model, materials);

  for (const slab of model.slabs) {
    const slabGroup = new THREE.Group();
    addSlab(slabGroup, slab, materials[slab.material]);
    slabGroups.set(slab.id, slabGroup);
    interiorGroup(slab.levelId).add(slabGroup);
  }

  for (const wall of model.walls) {
    const targetGroup = wall.exterior ? exteriorWallGroup(wall.levelId) : interiorGroup(wall.levelId);
    const wallGroup = addWall(targetGroup, wall, materials);
    wallGroup.userData.levelId = wall.levelId;
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
    const targetGroup = fixtureGroups.get(fixture.levelId) ?? group;
    addFixture(targetGroup, fixture, materials);
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

  const interiorProps = model.props.filter((prop) => prop.levelId !== undefined);
  const exteriorProps = model.props.filter((prop) => prop.levelId === undefined);

  for (const prop of interiorProps) {
    if (prop.levelId) {
      addSingleProp(interiorGroup(prop.levelId), prop, materials);
    }
  }

  const exteriorClutter = addProps(group, exteriorProps, materials);

  return {
    group,
    levelGroups,
    interiorGroups,
    exteriorWallGroups,
    fixtureGroups,
    nearWalls,
    fixtures: model.fixtures,
    plinth,
    groundOccluder,
    exteriorClutter,
    stairs,
  };
}
