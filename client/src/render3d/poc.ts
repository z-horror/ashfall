import * as THREE from 'three';
import { createTestBuildingModel, createVariantBuildingModel, type BuildingModel } from './buildingModel.js';
import { buildBuildingMeshes, type BuildingTextures } from './buildingMeshBuilder.js';
import { CharacterBillboard } from './characterBillboard.js';

declare global {
  interface Window {
    __pocReady?: boolean;
    __poc?: {
      setView: (name: 'exterior' | 'terrace' | 'interior' | 'animation' | 'door' | 'layers' | 'variant' | 'corner') => void;
      setCamera: (azimuthDeg: number, elevationDeg: number) => void;
      setCutaway: (on: boolean) => void;
      setAnimation: (on: boolean) => void;
      ready: boolean;
    };
  }
}

const TILE = 1.6;
const mx = (tileX: number): number => (tileX - 28) * TILE;
const my = (tileY: number): number => (tileY - 28) * TILE;

const canvas = document.getElementById('poc-canvas') as HTMLCanvasElement;
const statusEl = document.getElementById('poc-status') as HTMLElement;
const readyEl = document.getElementById('poc-ready') as HTMLElement;
const cutawayInput = document.getElementById('cutaway') as HTMLInputElement;
const animateInput = document.getElementById('animate') as HTMLInputElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b09);
scene.fog = new THREE.Fog(0x080b09, 75, 150);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
camera.up.set(0, 0, 1);

const view = {
  target: new THREE.Vector3(9.6, 7.2, 2.6),
  size: 30,
};
const DEFAULT_AZIMUTH = Math.PI / 4;
const DEFAULT_ELEVATION = Math.atan(1 / Math.SQRT2);
let azimuth = DEFAULT_AZIMUTH;
let elevation = DEFAULT_ELEVATION;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function updateCamera(): void {
  const horizontal = Math.cos(elevation);
  const direction = new THREE.Vector3(
    Math.cos(azimuth) * horizontal,
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
  );
  camera.position.copy(view.target).addScaledVector(direction, 80);
  camera.lookAt(view.target);
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const halfH = view.size / 2;
  const halfW = halfH * aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}

function loadTexture(loader: THREE.TextureLoader, url: string, repeatX = 1, repeatY = 1): Promise<THREE.Texture> {
  return loader.loadAsync(url).then((texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    return texture;
  });
}

function loadCroppedTexture(
  loader: THREE.TextureLoader,
  url: string,
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  sourceHeight: number,
): Promise<THREE.Texture> {
  return loader.loadAsync(url).then((source) => {
    const canvas = document.createElement('canvas');
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error(`Cannot create 2D context for ${url}`);
    context.drawImage(source.image as CanvasImageSource, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
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

function fallbackTexture(color: number): THREE.Texture {
  const surface = document.createElement('canvas');
  surface.width = 8;
  surface.height = 8;
  const ctx = surface.getContext('2d');
  if (ctx) {
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, 8, 8);
  }
  const texture = new THREE.CanvasTexture(surface);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

async function loadTextureOrFallback(
  loader: THREE.TextureLoader,
  url: string,
  color: number,
  repeatX: number,
  repeatY: number,
): Promise<THREE.Texture> {
  try {
    return await loadTexture(loader, url, repeatX, repeatY);
  } catch (error) {
    console.warn('[poc] texture fallback', url, error);
    return fallbackTexture(color);
  }
}

async function main(): Promise<void> {
  const loader = new THREE.TextureLoader();

  const [
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
    weeds,
    charSheet,
    groundTexture,
  ] = await Promise.all([
    loadTextureOrFallback(loader, '/assets/buildings/wall_brick_face.png', 0x6b3a2c, 6, 3),
    loadTextureOrFallback(loader, '/assets/buildings/wall_interior_face.png', 0x7d725c, 2, 2),
    loadTextureOrFallback(loader, '/assets/buildings/floor_wood.png', 0x6a4e35, 12, 9),
    loadTextureOrFallback(loader, '/assets/buildings/floor_concrete.png', 0x4c4f4c, 6, 6),
    loadTextureOrFallback(loader, '/assets/buildings/roof_tar.png', 0x2a2b28, 8, 8),
    loadTextureOrFallback(loader, '/assets/buildings/floor_concrete.png', 0x777b77, 1, 1),
    loadCroppedTexture(loader, '/assets/buildings/ivy_decals_sheet.png', 360, 30, 300, 500),
    loadTextureOrFallback(loader, '/assets/buildings/brick_damage.png', 0x5a4030, 1, 1),
    loadTextureOrFallback(loader, '/assets/buildings/decal_puddle.png', 0x2d3333, 1, 1),
    loadTextureOrFallback(loader, '/assets/buildings/tar_patches.png', 0x262825, 1, 1),
    Promise.resolve(makeWeedTexture()),
    loadTextureOrFallback(loader, '/assets/characters/char_p0.png', 0x8a7a5a, 1, 1),
    loadTextureOrFallback(loader, '/assets/buildings/ground_postapo.png', 0x333430, 0.25, 0.25),
  ]);

  const textures: BuildingTextures = {
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
    weeds,
  };

  const model = createTestBuildingModel();
  const meshes = buildBuildingMeshes(model, textures);
  scene.add(meshes.group);

  const variantModel = createVariantBuildingModel();
  const variantMeshes = buildBuildingMeshes(variantModel, textures);
  variantMeshes.group.position.set(30, 0, 0);
  scene.add(variantMeshes.group);

  const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1 });
  // The ground must have a hole under the building; otherwise it covers the
  // basement floor at z=-3 when looking down the stairwell.
  const groundShape = new THREE.Shape();
  const outer = 80;
  groundShape.moveTo(-outer, -outer);
  groundShape.lineTo(outer, -outer);
  groundShape.lineTo(outer, outer);
  groundShape.lineTo(-outer, outer);
  groundShape.closePath();
  const footprintHole = new THREE.Path();
  footprintHole.moveTo(model.footprint.x, model.footprint.y);
  footprintHole.lineTo(model.footprint.x + model.footprint.w, model.footprint.y);
  footprintHole.lineTo(model.footprint.x + model.footprint.w, model.footprint.y + model.footprint.h);
  footprintHole.lineTo(model.footprint.x, model.footprint.y + model.footprint.h);
  footprintHole.closePath();
  groundShape.holes.push(footprintHole);
  const ground = new THREE.Mesh(new THREE.ShapeGeometry(groundShape), groundMaterial);
  ground.position.set(0, 0, -0.035);
  ground.receiveShadow = true;
  scene.add(ground);

  const hemisphere = new THREE.HemisphereLight(0xa8b9c6, 0x2c241c, 1.15);
  scene.add(hemisphere);
  scene.add(new THREE.AmbientLight(0xffffff, 0.22));

  const sun = new THREE.DirectionalLight(0xffe2b5, 2.4);
  sun.position.set(34, 18, 46);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  sun.shadow.radius = 3;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x71879a, 0.7);
  fill.position.set(-24, -16, 22);
  scene.add(fill);


  const characters = {
    inside: new CharacterBillboard(scene, charSheet, { x: mx(32), y: my(31), z: 0, direction: 2, mode: 'walk' }),
    terrace: new CharacterBillboard(scene, charSheet, { x: mx(36), y: my(35), z: 3.05, direction: 2, mode: 'walk' }),
    behind: new CharacterBillboard(scene, charSheet, { x: mx(34), y: my(26), z: 0, direction: 2, mode: 'walk' }),
  };

  let cutaway = false;
  let animating = true;

  function applyCutaway(on: boolean): void {
    cutaway = on;
    const apply = (
      levels: BuildingModel['levels'],
      levelGroups: Map<string, THREE.Group>,
      nearWalls: THREE.Object3D[],
      activeLevelId: string,
    ): void => {
      const activeIndex = levels.find((level) => level.id === activeLevelId)?.index ?? 0;
      for (const [id, group] of levelGroups) {
        const level = levels.find((candidate) => candidate.id === id);
        group.visible = !on || !level || level.index <= activeIndex;
      }
      for (const object of nearWalls) object.visible = !on;
    };
    apply(model.levels, meshes.levelGroups, meshes.nearWalls, 'ground');
    apply(variantModel.levels, variantMeshes.levelGroups, variantMeshes.nearWalls, 'ground');
    cutawayInput.checked = on;
  }

  function setCharacterVisibility(visible: Array<keyof typeof characters>): void {
    for (const [name, character] of Object.entries(characters)) {
      character.setVisible(visible.includes(name as keyof typeof characters));
    }
  }

  function setView(name: 'exterior' | 'terrace' | 'interior' | 'animation' | 'door' | 'layers' | 'variant' | 'corner'): void {
    azimuth = DEFAULT_AZIMUTH;
    elevation = DEFAULT_ELEVATION;
    if (name === 'terrace') {
      view.target.set(mx(36), my(35), 3.0);
      view.size = 16;
      applyCutaway(false);
      setCharacterVisibility(['terrace']);
    } else if (name === 'interior') {
      view.target.set(9.6, 7.2, 1.2);
      view.size = 22;
      applyCutaway(true);
      setCharacterVisibility(['inside']);
    } else if (name === 'animation') {
      view.target.set(mx(36), my(35), 3.9);
      view.size = 6;
      applyCutaway(false);
      setCharacterVisibility(['terrace']);
    } else if (name === 'door') {
      view.target.set(mx(35), my(37), 1.2);
      view.size = 6;
      applyCutaway(false);
      setCharacterVisibility([]);
    } else if (name === 'layers') {
      view.target.set(19.0, 5.5, 1.8);
      view.size = 9;
      applyCutaway(false);
      setCharacterVisibility([]);
    } else if (name === 'variant') {
      view.target.set(38.0, 6.4, 4.2);
      view.size = 24;
      applyCutaway(false);
      setCharacterVisibility([]);
    } else if (name === 'corner') {
      view.target.set(18.0, 13.0, 1.2);
      view.size = 8;
      applyCutaway(false);
      setCharacterVisibility([]);
    } else {
      view.target.set(9.6, 7.2, 2.6);
      view.size = 26;
      applyCutaway(false);
      setCharacterVisibility(['inside', 'terrace', 'behind']);
    }
    updateCamera();
    document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === name);
    });
  }

  function setAnimation(on: boolean): void {
    animating = on;
    animateInput.checked = on;
    for (const character of Object.values(characters)) character.setMode(on ? 'walk' : 'idle');
  }

  cutawayInput.addEventListener('change', () => applyCutaway(cutawayInput.checked));
  animateInput.addEventListener('change', () => setAnimation(animateInput.checked));
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view as 'exterior' | 'terrace' | 'interior' | 'animation' | 'door' | 'layers' | 'variant' | 'corner'));
  });

  let drag: { pointerId: number; x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (event) => {
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    azimuth -= (event.clientX - drag.x) * 0.006;
    elevation = clamp(elevation + (event.clientY - drag.y) * 0.006, 0.12, 1.35);
    drag.x = event.clientX;
    drag.y = event.clientY;
    updateCamera();
  });
  const endDrag = (event: PointerEvent): void => {
    if (drag?.pointerId === event.pointerId) drag = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    view.size = clamp(view.size * (1 + event.deltaY * 0.001), 4, 60);
    updateCamera();
  }, { passive: false });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    updateCamera();
  });

  updateCamera();
  setView('exterior');
  renderer.render(scene, camera);

  let lastFrame = performance.now();
  function frame(now: number): void {
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    if (animating) {
      for (const character of Object.values(characters)) character.update(dt);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  statusEl.textContent = cutaway ? 'Cutaway включён' : 'Готово';
  readyEl.textContent = 'PoC готов. Сравнивай ракурсы с эталоном и текущим рендером.';
  window.__poc = {
    setView,
    setCutaway: applyCutaway,
    setAnimation,
    setCamera: (azimuthDeg: number, elevationDeg: number) => {
      azimuth = (azimuthDeg * Math.PI) / 180;
      elevation = clamp((elevationDeg * Math.PI) / 180, 0.12, 1.35);
      updateCamera();
    },
    ready: true,
  };
  window.__pocReady = true;
}

main().catch((error) => {
  console.error('[poc] failed', error);
  statusEl.textContent = `Ошибка PoC: ${error instanceof Error ? error.message : String(error)}`;
});
