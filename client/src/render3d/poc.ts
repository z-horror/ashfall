import * as THREE from 'three';
import { createTestBuildingModel } from './buildingModel.js';
import { buildBuildingMeshes, type BuildingTextures } from './buildingMeshBuilder.js';
import { CharacterBillboard } from './characterBillboard.js';

declare global {
  interface Window {
    __pocReady?: boolean;
    __poc?: {
      setView: (name: 'exterior' | 'terrace' | 'interior' | 'animation') => void;
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
const cameraDirection = new THREE.Vector3(1, 1, Math.SQRT2).normalize();

function updateCamera(): void {
  camera.position.copy(view.target).addScaledVector(cameraDirection, 80);
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
    door,
    windowTexture,
    metal,
    charSheet,
    acTexture,
    groundTexture,
  ] = await Promise.all([
    loadTextureOrFallback(loader, '/assets/buildings/wall_brick_face.png', 0x6b3a2c, 6, 3),
    loadTextureOrFallback(loader, '/assets/buildings/wall_interior_face.png', 0x7d725c, 2, 2),
    loadTextureOrFallback(loader, '/assets/buildings/floor_wood.png', 0x6a4e35, 12, 9),
    loadTextureOrFallback(loader, '/assets/buildings/floor_concrete.png', 0x4c4f4c, 6, 6),
    loadTextureOrFallback(loader, '/assets/buildings/roof_tar.png', 0x2a2b28, 8, 8),
    loadTextureOrFallback(loader, '/assets/buildings/door_closed.png', 0x3d2a1c, 1, 1),
    loadTextureOrFallback(loader, '/assets/buildings/window_unit.png', 0x49535a, 1, 1),
    loadTextureOrFallback(loader, '/assets/buildings/floor_concrete.png', 0x777b77, 1, 1),
    loadTextureOrFallback(loader, '/assets/characters/char_p0.png', 0x8a7a5a, 1, 1),
    loadTextureOrFallback(loader, '/assets/buildings/roof_ac_unit.png', 0x8c8f82, 1, 1),
    loadTextureOrFallback(loader, '/assets/buildings/ground_postapo.png', 0x333430, 0.25, 0.25),
  ]);

  const textures: BuildingTextures = {
    brick,
    plaster,
    wood,
    concrete,
    tar,
    door,
    window: windowTexture,
    metal,
  };

  const model = createTestBuildingModel();
  const meshes = buildBuildingMeshes(model, textures);
  scene.add(meshes.group);

  const groundMaterial = new THREE.MeshStandardMaterial({ map: groundTexture, roughness: 1 });
  // The ground must have a hole under the building; otherwise it covers the
  // basement floor at z=-3 when looking down the stairwell.
  const groundShape = new THREE.Shape();
  const outer = 45;
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

  const hemisphere = new THREE.HemisphereLight(0xa8b9c6, 0x2c241c, 1.0);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xffe2b5, 2.4);
  sun.position.set(34, 18, 46);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -28;
  sun.shadow.camera.right = 28;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0x71879a, 0.7);
  fill.position.set(-24, -16, 22);
  scene.add(fill);

  const acFixture = model.fixtures.find((fixture) => fixture.kind === 'ac');
  let acSprite: THREE.Sprite | undefined;
  if (acFixture) {
    acSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: acTexture,
      transparent: true,
      alphaTest: 0.04,
      depthTest: true,
      depthWrite: true,
    }));
    acSprite.center.set(0.5, 0.04);
    acSprite.scale.set(1.35, 1.35, 1);
    acSprite.position.set(acFixture.xM, acFixture.yM, acFixture.zM + 0.02);
    scene.add(acSprite);
  }

  const characters = {
    inside: new CharacterBillboard(scene, charSheet, { x: mx(32), y: my(31), z: 0, direction: 2, mode: 'walk' }),
    terrace: new CharacterBillboard(scene, charSheet, { x: mx(36), y: my(35), z: 3.05, direction: 2, mode: 'walk' }),
    behind: new CharacterBillboard(scene, charSheet, { x: mx(34), y: my(26), z: 0, direction: 2, mode: 'walk' }),
  };

  let cutaway = false;
  let animating = true;

  function applyCutaway(on: boolean): void {
    cutaway = on;
    for (const object of meshes.nearWalls) object.visible = !on;
    for (const object of meshes.upperFloor) object.visible = !on;
    if (acSprite) acSprite.visible = !on;
    cutawayInput.checked = on;
  }

  function setCharacterVisibility(visible: Array<keyof typeof characters>): void {
    for (const [name, character] of Object.entries(characters)) {
      character.setVisible(visible.includes(name as keyof typeof characters));
    }
  }

  function setView(name: 'exterior' | 'terrace' | 'interior' | 'animation'): void {
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
    button.addEventListener('click', () => setView(button.dataset.view as 'exterior' | 'terrace' | 'interior' | 'animation'));
  });

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
  window.__poc = { setView, setCutaway: applyCutaway, setAnimation, ready: true };
  window.__pocReady = true;
}

main().catch((error) => {
  console.error('[poc] failed', error);
  statusEl.textContent = `Ошибка PoC: ${error instanceof Error ? error.message : String(error)}`;
});
