import * as THREE from 'three';
import Phaser from 'phaser';
import { TILE_SIZE_M, sceneToWorld, type BuildingSpec } from '@ashfall/shared';
import type { ClientWorld } from '../world/clientWorld.js';
import type { CharacterView } from '../world/entityView.js';
import type { GameScene } from '../game/GameScene.js';
import { buildBuildingMeshes, type BuildingMeshes, type BuildingTextures } from './buildingMeshBuilder.js';
import { CHARACTER_SHEET_COLS, CHARACTER_SHEET_ROWS, loadBuildingTextures, loadCharacterSheet } from './assets3d.js';
import { specToBuildingModel } from './specToBuildingModel.js';
import { CharacterModelLoader } from './characterModelLoader.js';
import { Character3D } from './character3d.js';
import { hashString } from '../art/util.js';

import { BILLBOARD_NORMAL, computeBillboardAxes } from './billboardAxes.js';

const TILE = TILE_SIZE_M;
const SHEET_COLS = CHARACTER_SHEET_COLS;
const SHEET_ROWS = CHARACTER_SHEET_ROWS;
const CHARACTER_STYLES = ['p0', 'p1', 'p2', 'p3', 'z0', 'z1', 'z2'];
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
  private characters3d = new Map<string, Character3D>();
  private lastTime = 0;
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
      this.renderer.toneMappingExposure = 1.35;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;

      this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
      this.camera.matrixAutoUpdate = false;
      this.camera.matrixWorld.identity();
      this.camera.matrixWorldInverse.identity();

      this.scene3d.add(new THREE.HemisphereLight(0x9ec4ed, 0x5a4c38, 0.80));
      this.scene3d.add(new THREE.AmbientLight(0xfff6ec, 0.35));

      // Sun target centered directly on building in world meters (54.4, 52.0, 1.8)
      const sunTarget = new THREE.Object3D();
      sunTarget.position.set(54.4, 52.0, 1.8);
      this.scene3d.add(sunTarget);

      // High-angle afternoon sun (68 deg elevation) from West-South-West
      // Produces bright, warm roofs and facades with crisp, short contact shadows towards East
      // Matching the lighting and shadow characteristics of visual-target.jpg
      const sun = new THREE.DirectionalLight(0xfff5e6, 3.6);
      sun.position.set(54.4 - 24, 52.0 + 4, 38);
      sun.target = sunTarget;
      sun.castShadow = true;
      sun.shadow.mapSize.width = 4096;
      sun.shadow.mapSize.height = 4096;
      sun.shadow.camera.near = 10;
      sun.shadow.camera.far = 85;
      sun.shadow.camera.left = -20;
      sun.shadow.camera.right = 20;
      sun.shadow.camera.top = 20;
      sun.shadow.camera.bottom = -20;
      sun.shadow.camera.up.set(0, 0, 1);
      sun.shadow.camera.updateProjectionMatrix();
      sun.shadow.bias = 0.00005;
      sun.shadow.normalBias = 0;
      this.scene3d.add(sun);

      // Soft sky fill light for shadow side readability
      const fill = new THREE.DirectionalLight(0x7ca4d0, 0.60);
      fill.position.set(54.4 + 18, 52.0 - 18, 26);
      fill.target = sunTarget;
      this.scene3d.add(fill);

      const axes = computeBillboardAxes();
      this.billboardX.copy(axes.x);
      this.billboardY.copy(axes.y);

      this.textures = await loadBuildingTextures();
      const sheets = await Promise.all(CHARACTER_STYLES.map((style) => loadCharacterSheet(style)));
      CHARACTER_STYLES.forEach((style, index) => this.characterSheets.set(style, sheets[index]));

      // Asynchronously load 3D character rig and skeletal animations
      CharacterModelLoader.getInstance()
        .load()
        .catch((err) => {
          console.warn('[world3d] Character model 3D load warning:', err);
        });

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
    for (const char3d of this.characters3d.values()) {
      char3d.destroy(this.scene3d);
    }
    this.characters3d.clear();
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
      const buildingObjects = [...world.objects.values()].filter((object) => object.buildingId === spec.id);
      const converted = specToBuildingModel(spec, buildingObjects);
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
      const playerFloor = state.playerFloor;

      for (const [levelId, group] of entry.meshes.interiorGroups) {
        const level = entry.model.levels.find((candidate) => candidate.id === levelId);
        if (!inside) {
          group.visible = !level || level.index >= 0;
        } else {
          group.visible = level?.index === playerFloor;
        }
      }

      for (const [levelId, group] of entry.meshes.exteriorWallGroups) {
        const level = entry.model.levels.find((candidate) => candidate.id === levelId);
        if (!inside) {
          group.visible = !level || level.index >= 0;
        } else {
          group.visible = level !== undefined && level.index >= 0 && level.index <= playerFloor;
        }
      }

      for (const [levelId, group] of entry.meshes.fixtureGroups) {
        const level = entry.model.levels.find((candidate) => candidate.id === levelId);
        if (!inside) {
          group.visible = !level || level.index >= 0;
        } else {
          group.visible = level !== undefined && level.index === playerFloor;
        }
      }

      for (const wall of entry.meshes.nearWalls) {
        const wallLevel = wall.userData.levelId as string | undefined;
        const isCurrentFloor = wallLevel === `level:${playerFloor}`;
        wall.visible = !inside || !isCurrentFloor;
      }
      entry.meshes.plinth.visible = !inside || playerFloor >= 0;
      entry.meshes.groundOccluder.visible = !inside || playerFloor >= 0;
      entry.meshes.exteriorClutter.visible = !inside;
      for (const stair of entry.meshes.stairs) {
        const low = Math.min(stair.fromIndex, stair.toIndex);
        const high = Math.max(stair.fromIndex, stair.toIndex);
        stair.group.visible = !inside ? low >= 0 : (playerFloor >= low && playerFloor <= high);
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

  private syncCharacters(dt: number, now: number): void {
    if (!this.readyResolved) return;
    const views = this.gameScene.getRenderableCharacters();
    const active = new Set<string>();
    const loaderReady = CharacterModelLoader.getInstance().isReady;

    for (const view of views) {
      const key = `${view.kind}:${view.id}`;
      active.add(key);

      // Prefer 3D skinned humanoid rig when loaded
      if (loaderReady) {
        let char3d = this.characters3d.get(key);
        if (!char3d) {
          const variant = view.kind === 'player' ? hashString(String(view.id)) % 4 : view.type;
          char3d = new Character3D(this.scene3d, key, view.kind, variant);
          this.characters3d.set(key, char3d);

          // Remove any temporary billboard that was active during initial loading
          const oldBillboard = this.characters.get(key);
          if (oldBillboard) {
            this.scene3d.remove(oldBillboard.mesh);
            this.scene3d.remove(oldBillboard.shadow);
            oldBillboard.mesh.geometry.dispose();
            oldBillboard.material.map?.dispose();
            oldBillboard.material.dispose();
            oldBillboard.shadow.geometry.dispose();
            (oldBillboard.shadow.material as THREE.Material).dispose();
            this.characters.delete(key);
          }
        }
        char3d.update(dt, now, view);
        continue;
      }

      // Fallback billboard rendering while 3D models load
      if (view.isDead) continue;
      const frameName = view.frameName;
      const separator = frameName.indexOf(':');
      if (separator < 0) continue;
      const style = frameName.slice(0, separator);
      const index = Number(frameName.slice(separator + 1));
      if (!Number.isFinite(index)) continue;
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
      if (active.has(key) && !loaderReady) continue;
      this.scene3d.remove(entry.mesh);
      this.scene3d.remove(entry.shadow);
      entry.mesh.geometry.dispose();
      entry.material.map?.dispose();
      entry.material.dispose();
      entry.shadow.geometry.dispose();
      (entry.shadow.material as THREE.Material).dispose();
      this.characters.delete(key);
    }

    for (const [key, char3d] of [...this.characters3d]) {
      if (active.has(key)) continue;
      char3d.destroy(this.scene3d);
      this.characters3d.delete(key);
    }
  }

  update(): void {
    if (!this.readyResolved) return;
    const now = performance.now();
    const dt = this.lastTime > 0 ? Math.min(0.1, (now - this.lastTime) / 1000) : 0.016;
    this.lastTime = now;

    this.updateBuildingVisibility();
    this.syncCharacters(dt, now);
  }
}
