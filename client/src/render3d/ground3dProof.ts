import * as THREE from 'three';
import { createTestBuildingModel, type BuildingModel } from './buildingModel.js';
import { buildBuildingMeshes, type BuildingMeshes } from './buildingMeshBuilder.js';
import { loadBuildingTextures } from './assets3d.js';
import {
  buildGroundChunk,
  HOUSE_MIN_X,
  HOUSE_MIN_Y,
  HOUSE_MAX_X,
  HOUSE_MAX_Y,
  CHUNK_MIN_X,
  CHUNK_MIN_Y,
  CHUNK_MAX_X,
  CHUNK_MAX_Y,
  type GroundChunkResult,
} from './ground3dChunk.js';

declare global {
  interface Window {
    __ground3dReady?: boolean;
    __ground3d?: {
      setCameraView: (preset: 'isometric' | 'north' | 'east' | 'south' | 'west' | 'top' | 'basement') => void;
      setCutaway: (on: boolean) => void;
      setShadows: (on: boolean) => void;
      getMetrics: () => {
        fps: number;
        frameTimeMs: number;
        drawCalls: number;
        triangles: number;
        chunkQuads: number;
        cutoutTiles: number;
      };
    };
  }
}

const canvas = document.getElementById('ground-canvas') as HTMLCanvasElement;
const fpsValEl = document.getElementById('val-fps') as HTMLElement;
const frameTimeValEl = document.getElementById('val-frametime') as HTMLElement;
const drawCallsValEl = document.getElementById('val-drawcalls') as HTMLElement;
const trianglesValEl = document.getElementById('val-triangles') as HTMLElement;
const statusEl = document.getElementById('proof-status') as HTMLElement;
const cutawayCheckbox = document.getElementById('chk-cutaway') as HTMLInputElement | null;
const shadowsCheckbox = document.getElementById('chk-shadows') as HTMLInputElement | null;

// 1. WebGL Renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

// 2. Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e0c);
scene.fog = new THREE.Fog(0x0a0e0c, 85, 175);

// 3. Lighting
const ambientLight = new THREE.AmbientLight(0xdfe6ee, 0.65);
scene.add(ambientLight);

const hemisphereLight = new THREE.HemisphereLight(0xbdd3e8, 0x3d3f35, 0.4);
scene.add(hemisphereLight);

const houseCenterX = (HOUSE_MIN_X + HOUSE_MAX_X) / 2; // 54.4 m
const houseCenterY = (HOUSE_MIN_Y + HOUSE_MAX_Y) / 2; // 51.8 m

const sunLight = new THREE.DirectionalLight(0xfff7e8, 1.45);
sunLight.position.set(houseCenterX + 28, houseCenterY - 24, 45);
sunLight.target.position.set(houseCenterX, houseCenterY, 0);
scene.add(sunLight.target);
scene.add(sunLight);

sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 130;
const d = 26;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
sunLight.shadow.bias = -0.0004;

// 4. Camera (Orthographic Isometric with Orbit Controls)
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 350);
camera.up.set(0, 0, 1);

const viewTarget = new THREE.Vector3(houseCenterX, houseCenterY, 1.4);
let viewSize = 38; // Initial frustum height in meters

const DEFAULT_AZIMUTH = Math.PI / 4; // 45 deg
const DEFAULT_ELEVATION = Math.atan(1 / Math.SQRT2); // 35.26 deg
let azimuth = DEFAULT_AZIMUTH;
let elevation = DEFAULT_ELEVATION;

function updateCamera(): void {
  const horizontal = Math.cos(elevation);
  const dir = new THREE.Vector3(
    Math.cos(azimuth) * horizontal,
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
  );
  camera.position.copy(viewTarget).addScaledVector(dir, 100);
  camera.lookAt(viewTarget);

  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const halfH = viewSize / 2;
  const halfW = halfH * aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}

updateCamera();

// Mouse Orbit Controls
let isDragging = false;
let prevMouseX = 0;
let prevMouseY = 0;

window.addEventListener('mousedown', (e) => {
  if ((e.target as HTMLElement).closest('#hud-card')) return;
  isDragging = true;
  prevMouseX = e.clientX;
  prevMouseY = e.clientY;
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const deltaX = e.clientX - prevMouseX;
  const deltaY = e.clientY - prevMouseY;
  prevMouseX = e.clientX;
  prevMouseY = e.clientY;

  azimuth -= deltaX * 0.006;
  elevation = Math.max(0.18, Math.min(Math.PI / 2 - 0.05, elevation + deltaY * 0.006));
  updateCamera();
});

window.addEventListener('mouseup', () => {
  isDragging = false;
});

window.addEventListener('wheel', (e) => {
  viewSize = Math.max(14, Math.min(75, viewSize + (e.deltaY > 0 ? 3 : -3)));
  updateCamera();
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateCamera();
});

// 5. Build 3D Ground Chunk
statusEl.textContent = 'Генерация 3D-земли и атласа...';
const groundChunk: GroundChunkResult = buildGroundChunk();
scene.add(groundChunk.group);

// 6. Load Test Building
let buildingModel: BuildingModel | null = null;
let buildingMeshes: BuildingMeshes | null = null;

async function initScene(): Promise<void> {
  try {
    statusEl.textContent = 'Загрузка ассетов дома...';
    const textures = await loadBuildingTextures();
    buildingModel = createTestBuildingModel();
    buildingMeshes = buildBuildingMeshes(buildingModel, textures);

    // Position house at world coordinates (origin tile 28, 28)
    const buildingWorldX = 28 * 1.6;
    const buildingWorldY = 28 * 1.6;
    buildingMeshes.group.position.set(buildingWorldX, buildingWorldY, 0);

    // Disable M1 depth occluder: ground is real 3D geometry with cutout!
    buildingMeshes.groundOccluder.visible = false;

    scene.add(buildingMeshes.group);
    statusEl.textContent = 'Готово. 3D-земля активна.';

    window.__ground3dReady = true;
  } catch (err) {
    statusEl.textContent = `Ошибка: ${err}`;
    console.error('[ground3d] init error:', err);
  }
}

void initScene();

// 7. Cutaway and Basement controllers
let cutawayActive = false;
let inBasementMode = false;

function setBasementMode(active: boolean): void {
  inBasementMode = active;
  if (!buildingMeshes) return;

  const groundGroup = buildingMeshes.levelGroups.get('ground');
  const basementGroup = buildingMeshes.levelGroups.get('basement');
  const roofGroup = buildingMeshes.levelGroups.get('roof');
  const mansardGroup = buildingMeshes.levelGroups.get('mansard');

  if (active) {
    if (roofGroup) roofGroup.visible = false;
    if (mansardGroup) mansardGroup.visible = false;
    if (groundGroup) groundGroup.visible = false;
    buildingMeshes.plinth.visible = false;
    if (basementGroup) basementGroup.visible = true;
    for (const stair of buildingMeshes.stairs) stair.group.visible = true;
    for (const wall of buildingMeshes.nearWalls) wall.visible = false;
  } else {
    if (groundGroup) groundGroup.visible = true;
    buildingMeshes.plinth.visible = true;
    if (basementGroup) basementGroup.visible = true;
    for (const stair of buildingMeshes.stairs) stair.group.visible = true;
    applyCutaway(cutawayActive);
  }
}

function applyCutaway(active: boolean): void {
  cutawayActive = active;
  if (!buildingMeshes) return;

  if (inBasementMode && !active) {
    setBasementMode(false);
  }

  const roofGroup = buildingMeshes.levelGroups.get('roof');
  const mansardGroup = buildingMeshes.levelGroups.get('mansard');
  if (roofGroup) roofGroup.visible = !active && !inBasementMode;
  if (mansardGroup) mansardGroup.visible = !active && !inBasementMode;

  for (const wall of buildingMeshes.nearWalls) {
    wall.visible = !active && !inBasementMode;
  }
}

if (cutawayCheckbox) {
  cutawayCheckbox.addEventListener('change', (e) => {
    applyCutaway((e.target as HTMLInputElement).checked);
  });
}

if (shadowsCheckbox) {
  shadowsCheckbox.addEventListener('change', (e) => {
    renderer.shadowMap.enabled = (e.target as HTMLInputElement).checked;
  });
}

// 8. Preset View Buttons
function setPreset(preset: 'isometric' | 'north' | 'east' | 'south' | 'west' | 'top' | 'basement'): void {
  if (preset !== 'basement' && inBasementMode) {
    setBasementMode(false);
  }

  switch (preset) {
    case 'isometric':
      azimuth = Math.PI / 4;
      elevation = Math.atan(1 / Math.SQRT2);
      viewTarget.set(houseCenterX, houseCenterY, 1.4);
      viewSize = 38;
      applyCutaway(false);
      if (cutawayCheckbox) cutawayCheckbox.checked = false;
      break;
    case 'north':
      azimuth = -Math.PI / 2;
      elevation = 0.45;
      viewTarget.set(houseCenterX, houseCenterY, 1.4);
      viewSize = 38;
      break;
    case 'south':
      azimuth = Math.PI / 2;
      elevation = 0.45;
      viewTarget.set(houseCenterX, houseCenterY, 1.4);
      viewSize = 38;
      break;
    case 'east':
      azimuth = Math.PI;
      elevation = 0.45;
      viewTarget.set(houseCenterX, houseCenterY, 1.4);
      viewSize = 38;
      break;
    case 'west':
      azimuth = 0;
      elevation = 0.45;
      viewTarget.set(houseCenterX, houseCenterY, 1.4);
      viewSize = 38;
      break;
    case 'top':
      azimuth = Math.PI / 4;
      elevation = Math.PI / 2 - 0.02;
      viewTarget.set(houseCenterX, houseCenterY, 0);
      viewSize = 48;
      break;
    case 'basement':
      azimuth = Math.PI / 4;
      elevation = 0.58;
      viewTarget.set(58.5, 49.5, -1.5);
      viewSize = 18;
      setBasementMode(true);
      if (cutawayCheckbox) cutawayCheckbox.checked = true;
      break;
  }
  updateCamera();
}

document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const preset = btn.getAttribute('data-preset') as any;
    if (preset) setPreset(preset);
  });
});

// 9. Performance Metrics & Render Loop
let lastTime = performance.now();
let frameCount = 0;
let lastFpsUpdate = performance.now();
let currentFps = 60;
let currentFrameTime = 16.6;

function animate(): void {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = now - lastTime;
  lastTime = now;
  frameCount++;

  if (now - lastFpsUpdate >= 400) {
    currentFps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
    currentFrameTime = Math.round(dt * 10) / 10;
    frameCount = 0;
    lastFpsUpdate = now;

    if (fpsValEl) fpsValEl.textContent = `${currentFps}`;
    if (frameTimeValEl) frameTimeValEl.textContent = `${currentFrameTime} ms`;
    if (drawCallsValEl) drawCallsValEl.textContent = `${renderer.info.render.calls}`;
    if (trianglesValEl) trianglesValEl.textContent = `${renderer.info.render.triangles.toLocaleString('ru-RU')}`;
  }

  renderer.render(scene, camera);
}

animate();

// 10. Public API for Verification
window.__ground3d = {
  setCameraView: setPreset,
  setCutaway: applyCutaway,
  setShadows: (on: boolean) => {
    renderer.shadowMap.enabled = on;
  },
  getMetrics: () => ({
    fps: currentFps,
    frameTimeMs: currentFrameTime,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    chunkQuads: groundChunk.metrics.quadsCount,
    cutoutTiles: groundChunk.metrics.cutoutTilesCount,
  }),
};
