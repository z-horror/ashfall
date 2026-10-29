import * as THREE from 'three';
import type { BuildingTextures } from './buildingMeshBuilder.js';

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
): Promise<THREE.Texture> {
  try {
    const texture = await loader.loadAsync(url);
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
  const canvas = document.createElement('canvas');
  canvas.width = sourceWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(`Cannot create 2D context for ${url}`);
  context.drawImage(source.image as CanvasImageSource, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
  const [brick, plaster, wood, concrete, tar, metal, ivy, brickDamage, puddle, tarPatch] = await Promise.all([
    loadTexture(loader, '/assets/buildings/wall_brick_face.png', 0x6b3a2c),
    loadTexture(loader, '/assets/buildings/wall_interior_face.png', 0x7d725c),
    loadTexture(loader, '/assets/buildings/floor_wood.png', 0x6a4e35),
    loadTexture(loader, '/assets/buildings/floor_concrete.png', 0x4c4f4c),
    loadTexture(loader, '/assets/buildings/roof_tar.png', 0x2a2b28),
    loadTexture(loader, '/assets/buildings/floor_concrete.png', 0x777b77),
    loadCroppedTexture(loader, '/assets/buildings/ivy_decals_sheet.png', 360, 30, 300, 500),
    loadTexture(loader, '/assets/buildings/brick_damage.png', 0x5a4030),
    loadTexture(loader, '/assets/buildings/decal_puddle.png', 0x2d3333),
    loadTexture(loader, '/assets/buildings/tar_patches.png', 0x262825),
  ]);

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
