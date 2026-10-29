import * as THREE from 'three';
import type { BuildingTextures, DecalAtlas } from './buildingMeshBuilder.js';

export const CHARACTER_SHEET_COLS = 12;
export const CHARACTER_SHEET_ROWS = 8;

interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

const IVY_FRAMES: AtlasFrame[] = [
  { x: 520, y: 60, w: 280, h: 620 },
  { x: 120, y: 200, w: 330, h: 760 },
  { x: 540, y: 640, w: 250, h: 300 },
  { x: 800, y: 60, w: 190, h: 350 },
  { x: 700, y: 820, w: 160, h: 170 },
];

const BRICK_DAMAGE_FRAMES: AtlasFrame[] = [
  { x: 150, y: 250, w: 350, h: 450 },
  { x: 730, y: 60, w: 280, h: 230 },
  { x: 680, y: 610, w: 210, h: 180 },
];

const PUDDLE_FRAMES: AtlasFrame[] = [{ x: 30, y: 140, w: 940, h: 750 }];

const TAR_PATCH_FRAMES: AtlasFrame[] = [
  { x: 6, y: 780, w: 494, h: 240 },
  { x: 520, y: 600, w: 250, h: 220 },
  { x: 700, y: 460, w: 270, h: 200 },
  { x: 10, y: 360, w: 250, h: 200 },
];

function fallbackTexture(color: number): THREE.Texture {
  const surface = document.createElement('canvas');
  surface.width = 8;
  surface.height = 8;
  const context = surface.getContext('2d');
  if (context) {
    context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    context.fillRect(0, 0, 8, 8);
  }
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

async function loadTexture(
  loader: THREE.TextureLoader,
  url: string,
  fallbackColor: number,
  filter?: string,
): Promise<THREE.Texture> {
  try {
    const texture = await loader.loadAsync(url);
    if (filter && typeof document !== 'undefined') {
      const img = texture.image as HTMLImageElement;
      if (img && img.width > 0 && img.height > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.filter = filter;
          ctx.drawImage(img, 0, 0);
          const processed = new THREE.CanvasTexture(canvas);
          processed.colorSpace = THREE.SRGBColorSpace;
          processed.wrapS = THREE.RepeatWrapping;
          processed.wrapT = THREE.RepeatWrapping;
          return processed;
        }
      }
    }
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  } catch (error) {
    console.warn('[world3d] texture fallback', url, error);
    return fallbackTexture(fallbackColor);
  }
}

async function loadCroppedTexture(
  loader: THREE.TextureLoader,
  url: string,
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  sourceHeight: number,
): Promise<THREE.Texture> {
  const source = await loader.loadAsync(url);
  return cropTexture(source, { x: sourceX, y: sourceY, w: sourceWidth, h: sourceHeight });
}

function cropTexture(source: THREE.Texture, frame: AtlasFrame): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = frame.w;
  canvas.height = frame.h;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Cannot create 2D context for atlas crop');
  context.drawImage(
    source.image as CanvasImageSource,
    frame.x,
    frame.y,
    frame.w,
    frame.h,
    0,
    0,
    frame.w,
    frame.h,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

async function loadAtlasFrames(
  loader: THREE.TextureLoader,
  url: string,
  frames: AtlasFrame[],
): Promise<THREE.Texture[]> {
  try {
    const source = await loader.loadAsync(url);
    return frames.map((frame) => cropTexture(source, frame));
  } catch (error) {
    console.warn('[world3d] decal atlas fallback', url, error);
    return [];
  }
}

function makeWeedTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, 128, 128);
    context.lineCap = 'round';
    const palette = ['#4f5a32', '#66713b', '#3f4a2a', '#7b713f', '#59653a'];
    for (let i = 0; i < 22; i++) {
      const x = 18 + ((i * 47) % 92);
      const height = 38 + ((i * 29) % 74);
      const bend = ((i % 5) - 2) * 8;
      context.strokeStyle = palette[i % palette.length];
      context.lineWidth = 2 + (i % 3);
      context.beginPath();
      context.moveTo(x, 126);
      context.quadraticCurveTo(x + bend * 0.4, 126 - height * 0.55, x + bend, 126 - height);
      context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export async function loadBuildingTextures(): Promise<BuildingTextures> {
  const loader = new THREE.TextureLoader();
  const [brick, plaster, wood, concrete, tar, metal, ivy, brickDamage, puddle, tarPatch, windowUnit, doorLeaf, ivyFrames, damageFrames, puddleFrames, tarFrames] = await Promise.all([
    loadTexture(loader, '/assets/buildings/wall_brick_clean.jpg', 0x824c3a),
    loadTexture(loader, '/assets/buildings/wall_interior_face.png', 0x7d725c),
    loadTexture(loader, '/assets/buildings/floor_wood.png', 0x6a4e35),
    loadTexture(loader, '/assets/buildings/floor_concrete.png', 0x4c4f4c),
    loadTexture(loader, '/assets/buildings/roof_tar.png', 0x2a2b28, 'brightness(1.55) contrast(1.08)'),
    loadTexture(loader, '/assets/buildings/floor_concrete.png', 0x777b77),
    loadCroppedTexture(loader, '/assets/buildings/ivy_decals_sheet.png', 360, 30, 300, 500),
    loadTexture(loader, '/assets/buildings/brick_damage.png', 0x5a4030),
    loadTexture(loader, '/assets/buildings/decal_puddle.png', 0x2d3333),
    loadTexture(loader, '/assets/buildings/tar_patches.png', 0x262825),
    loadTexture(loader, '/assets/buildings/window_unit.png', 0x2e251e),
    loadTexture(loader, '/assets/buildings/door_leaf.png', 0x3e454a),
    loadAtlasFrames(loader, '/assets/buildings/ivy_decals_sheet.png', IVY_FRAMES),
    loadAtlasFrames(loader, '/assets/buildings/brick_damage.png', BRICK_DAMAGE_FRAMES),
    loadAtlasFrames(loader, '/assets/buildings/decal_puddle.png', PUDDLE_FRAMES),
    loadAtlasFrames(loader, '/assets/buildings/tar_patches.png', TAR_PATCH_FRAMES),
  ]);

  const decalAtlas: DecalAtlas = {
    ivy: ivyFrames,
    brickDamage: damageFrames,
    puddle: puddleFrames,
    tarPatch: tarFrames,
  };

  return {
    brick,
    plaster,
    wood,
    concrete,
    tar,
    metal,
    ivy,
    brickDamage,
    puddle,
    tarPatch,
    weeds: makeWeedTexture(),
    decalAtlas,
    windowUnit,
    doorLeaf,
  };
}

const characterSheets = new Map<string, Promise<THREE.Texture>>();

export function loadCharacterSheet(style: string): Promise<THREE.Texture> {
  let promise = characterSheets.get(style);
  if (!promise) {
    const loader = new THREE.TextureLoader();
    promise = loader.loadAsync(`/assets/characters/char_${style}.png`).then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      return texture;
    });
    characterSheets.set(style, promise);
  }
  return promise;
}
