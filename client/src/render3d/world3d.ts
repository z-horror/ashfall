import * as THREE from 'three';
import Phaser from 'phaser';
import { TILE_SIZE_M, sceneToWorld, type BuildingSpec } from '@ashfall/shared';
import type { ClientWorld } from '../world/clientWorld.js';
import type { CharacterView } from '../world/entityView.js';
import type { GameScene } from '../game/GameScene.js';
import { buildBuildingMeshes, type BuildingMeshes, type BuildingTextures } from './buildingMeshBuilder.js';
import { CHARACTER_SHEET_COLS, CHARACTER_SHEET_ROWS, loadBuildingTextures, loadCharacterSheet } from './assets3d.js';
import { specToBuildingModel } from './specToBuildingModel.js';

const TILE = TILE_SIZE_M;
const SHEET_COLS = CHARACTER_SHEET_COLS;
const SHEET_ROWS = CHARACTER_SHEET_ROWS;
const CHARACTER_STYLES = ['p0', 'p1', 'p2', 'p3', 'z0', 'z1', 'z2'];

const BILLBOARD_NORMAL = new THREE.Vector3(1, 1, 0.5).normalize();
const CHARACTER_CAMERA_OFFSET = 0.14;

let contactShadowTexture: THREE.CanvasTexture | null = null;

function getContactShadowTexture(): THREE.CanvasTexture {
  if (contactShadowTexture) return contactShadowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(0,0,0,0.62)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,0.34)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  contactShadowTexture = new THREE.CanvasTexture(canvas);
  return contactShadowTexture;
}

function solveBillboardAxis(
  targetX: number,
  targetY: number,
  e1: THREE.Vector3,
  e2: THREE.Vector3,
  inverse: { i11: number; i12: number; i21: number; i22: number },
): THREE.Vector3 {
  const a = inverse.i11 * targetX + inverse.i12 * targetY;
  const b = inverse.i21 * targetX + inverse.i22 * targetY;
  return e1.clone().multiplyScalar(a).add(e2.clone().multiplyScalar(b));
}

function computeBillboardAxes(): { x: THREE.Vector3; y: THREE.Vector3 } {
  const gx = new THREE.Vector3(20, -20, 0);
  const gy = new THREE.Vector3(10, 10, -40);
  const e1 = new THREE.Vector3().crossVectors(BILLBOARD_NORMAL, new THREE.Vector3(0, 0, 1)).normalize();
  const e2 = new THREE.Vector3().crossVectors(BILLBOARD_NORMAL, e1).normalize();
  const a11 = gx.dot(e1);
  const a12 = gx.dot(e2);
  const a21 = gy.dot(e1);
  const a22 = gy.dot(e2);
  const det = a11 * a22 - a12 * a21;
  const inverse = {
    i11: a22 / det,
    i12: -a12 / det,
    i21: -a21 / det,
    i22: a11 / det,
  };
  return {
    x: solveBillboardAxis(1, 0, e1, e2, inverse),
    y: solveBillboardAxis(0, -1, e1, e2, inverse),
  };
}

interface BuildingEntry {
  spec: BuildingSpec;
  model: ReturnType<typeof specToBuildingModel>['model'];
  meshes: BuildingMeshes;
}

interface CharacterEntry {
  view: CharacterView;
  style: string;
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

export class World3D {
  readonly ready: Promise<void>;
  private readonly scene: Phaser.Scene;
  private readonly world: ClientWorld;
  private readonly gameScene: GameScene;
  private renderer!: THREE.WebGLRenderer;
  private scene3d = new THREE.Scene();
  private camera!: THREE.OrthographicCamera;
  private canvas!: HTMLCanvasElement;
  private textures: BuildingTextures | null = null;
  private characterSheets = new Map<string, THREE.Texture>();
  private buildings = new Map<string, BuildingEntry>();
  private characters = new Map<string, CharacterEntry>();
  private billboardX = new THREE.Vector3();
  private billboardY = new THREE.Vector3();
  private readyResolved = false;
  private readyResolve!: () => void;

  constructor(scene: Phaser.Scene, world: ClientWorld) {
    this.scene = scene;
    this.world = world;
    this.gameScene = scene as unknown as GameScene;
    this.ready = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    void this.init();
  }

  private async init(): Promise<void> {
    try {
      const root = document.getElementById('game-root') ?? document.body;
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'world3d-canvas';
      Object.assign(this.canvas.style, {
        position: 'absolute',
        inset: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '1',
      });
      root.appendChild(this.canvas);

      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
      this.renderer.shadowMap.enabled = false;

      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
      this.camera.matrixAutoUpdate = false;
      this.camera.matrixWorld.identity();
      this.camera.matrixWorldInverse.identity();

      this.scene3d.add(new THREE.HemisphereLight(0xa8b9c6, 0x2c241c, 1.8));
      this.scene3d.add(new THREE.AmbientLight(0xffffff, 0.5));

      const sun = new THREE.DirectionalLight(0xffe2b5, 2.8);
      sun.position.set(114, 104, 150);
      sun.target.position.set(54, 54, 0);
      this.scene3d.add(sun);
      this.scene3d.add(sun.target);
      sun.castShadow = false;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -45;
      sun.shadow.camera.right = 45;
      sun.shadow.camera.top = 45;
      sun.shadow.camera.bottom = -45;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 250;
      sun.shadow.bias = -0.0006;


      const axes = computeBillboardAxes();
      this.billboardX.copy(axes.x);
      this.billboardY.copy(axes.y);

      this.textures = await loadBuildingTextures();
      const sheets = await Promise.all(CHARACTER_STYLES.map((style) => loadCharacterSheet(style)));
      CHARACTER_STYLES.forEach((style, index) => this.characterSheets.set(style, sheets[index]));

      window.addEventListener('resize', this.onResize);
      this.scene.game.events.on(Phaser.Core.Events.POST_RENDER, this.onPostRender);
      this.scene.events.once('shutdown', this.onShutdown);
      this.readyResolved = true;
      this.readyResolve();
      this.syncBuildings(this.world);
    } catch (error) {
      console.error('[world3d] init failed, keeping Phaser renderer', error);
    }
  }

  private onResize = (): void => {
    if (!this.renderer) return;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private onShutdown = (): void => {
    this.scene.game.events.off(Phaser.Core.Events.POST_RENDER, this.onPostRender);
    window.removeEventListener('resize', this.onResize);
  };

  private onPostRender = (): void => {
    if (!this.readyResolved) return;
    this.updateCamera();
    this.renderer.render(this.scene3d, this.camera);
  };

  syncBuildings(world: ClientWorld): void {
    if (!this.textures) return;
    const ids = new Set(world.buildings.keys());
    for (const [id, entry] of [...this.buildings]) {
      if (!ids.has(id)) {
        this.scene3d.remove(entry.meshes.group);
        this.buildings.delete(id);
      }
    }
    for (const spec of world.buildings.values()) {
      if (this.buildings.has(spec.id)) continue;
      const converted = specToBuildingModel(spec);
      const meshes = buildBuildingMeshes(converted.model, this.textures);
      meshes.group.position.set(converted.worldPosition.x, converted.worldPosition.y, 0);
      this.scene3d.add(meshes.group);
      this.buildings.set(spec.id, { spec, model: converted.model, meshes });
    }
    this.updateBuildingVisibility();
  }

  private updateBuildingVisibility(): void {
    if (!this.readyResolved) return;
    const state = this.gameScene.getRender3DState();
    for (const [id, entry] of this.buildings) {
      const inside = id === state.currentBuilding;
      const inBasement = inside && state.playerFloor < 0;
      for (const [levelId, group] of entry.meshes.levelGroups) {
        const level = entry.model.levels.find((candidate) => candidate.id === levelId);
        group.visible = !inside || !level || level.index <= state.playerFloor;
      }
      for (const wall of entry.meshes.nearWalls) wall.visible = !inside;
      entry.meshes.plinth.visible = !inBasement;
      entry.meshes.groundOccluder.visible = !inside || state.playerFloor >= 0;
      entry.meshes.exteriorClutter.visible = !inside;
      for (const stair of entry.meshes.stairs) {
        const low = Math.min(stair.fromIndex, stair.toIndex);
        const high = Math.max(stair.fromIndex, stair.toIndex);
        stair.group.visible = !inside || (state.playerFloor >= low && state.playerFloor <= high);
      }
    }
  }

  private updateCamera(): void {
    if (!this.camera) return;
    const cam = this.scene.cameras.main;
    const state = this.gameScene.getRender3DState();
    const elevation = state.elevationM;
    const view = cam.worldView;
    const midX = view && view.width > 0 ? view.centerX : cam.midPoint.x;
    const midY = view && view.height > 0 ? view.centerY : cam.midPoint.y;
    const tile = sceneToWorld(midX, midY, elevation);
    const cx = tile.x * TILE;
    const cy = tile.y * TILE;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const zoom = cam.zoom;
    const sx = 20 * zoom;
    const sy = 10 * zoom;
    const sz = -40 * zoom;
    const panX = width / 2 - sx * (cx - cy);
    const panY = height / 2 - sy * (cx + cy) - sz * elevation;

    const matrix = new THREE.Matrix4().set(
      (2 * sx) / width, (-2 * sx) / width, 0, (2 * panX) / width - 1,
      (-2 * sy) / height, (-2 * sy) / height, (-2 * sz) / height, 1 - (2 * panY) / height,
      -1 / 200, -1 / 200, -0.6 / 200, 0,
      0, 0, 0, 1,
    );
    this.camera.projectionMatrix.copy(matrix);
    this.camera.projectionMatrixInverse.copy(matrix).invert();
  }

  private syncCharacters(): void {
    if (!this.readyResolved) return;
    const views = this.gameScene.getRenderableCharacters();
    const active = new Set<string>();
    for (const view of views) {
      if (view.isDead) continue;
      const frameName = view.frameName;
      const separator = frameName.indexOf(':');
      if (separator < 0) continue;
      const style = frameName.slice(0, separator);
      const index = Number(frameName.slice(separator + 1));
      if (!Number.isFinite(index)) continue;
      const key = `${view.kind}:${view.id}`;
      active.add(key);
      let entry = this.characters.get(key);
      if (!entry) {
        const sheet = this.characterSheets.get(style);
        if (!sheet) continue;
        const texture = sheet.clone();
        texture.needsUpdate = true;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.repeat.set(1 / SHEET_COLS, 1 / SHEET_ROWS);
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.08,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: true,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
          toneMapped: false,
        });
        const geometry = new THREE.PlaneGeometry(1, 1);
        geometry.translate(0, 0.5, 0);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.frustumCulled = false;
        this.scene3d.add(mesh);
        const shadow = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({
            map: getContactShadowTexture(),
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            depthTest: true,
            toneMapped: false,
            side: THREE.DoubleSide,
          }),
        );
        shadow.renderOrder = 1;
        this.scene3d.add(shadow);
        entry = { view, style, mesh, shadow, material };
        this.characters.set(key, entry);
      }
      if (entry.style !== style) continue;
      const texture = entry.material.map;
      if (texture) {
        texture.offset.set(
          (index % SHEET_COLS) / SHEET_COLS,
          1 - (Math.floor(index / SHEET_COLS) + 1) / SHEET_ROWS,
        );
      }
      const feet = new THREE.Vector3(view.x * TILE, view.y * TILE, view.elevationMeters + 0.02);
      const base = feet.clone().addScaledVector(BILLBOARD_NORMAL, CHARACTER_CAMERA_OFFSET);
      const anchorShift = -(1 - view.footAnchorFraction) * view.displayHeight;
      const matrix = new THREE.Matrix4().makeBasis(
        this.billboardX.clone().multiplyScalar(view.displayWidth),
        this.billboardY.clone().multiplyScalar(view.displayHeight),
        BILLBOARD_NORMAL,
      );
      matrix.setPosition(base.clone().addScaledVector(this.billboardY, anchorShift));
      entry.mesh.matrix.copy(matrix);
      entry.mesh.matrixWorldNeedsUpdate = true;
      entry.material.opacity = view.spriteAlpha;
      entry.material.color.setHex(view.spriteTint ?? 0xffffff);
      entry.mesh.visible = true;
      const worldWidth = view.displayWidth * this.billboardX.length();
      const shadowScale = Math.max(0.45, worldWidth * 0.34);
      entry.shadow.scale.set(shadowScale, shadowScale * 0.72, 1);
      entry.shadow.visible = true;
      entry.shadow.position.set(base.x, base.y, Math.max(0.01, view.elevationMeters + 0.012));
    }

    for (const [key, entry] of [...this.characters]) {
      if (active.has(key)) continue;
      this.scene3d.remove(entry.mesh);
      this.scene3d.remove(entry.shadow);
      entry.mesh.geometry.dispose();
      entry.material.map?.dispose();
      entry.material.dispose();
      entry.shadow.geometry.dispose();
      (entry.shadow.material as THREE.Material).dispose();
      this.characters.delete(key);
    }
  }

  update(): void {
    if (!this.readyResolved) return;
    this.updateBuildingVisibility();
    this.syncCharacters();
  }
}
