import * as THREE from 'three';

const sharedMaterials = {
  wood: new THREE.MeshStandardMaterial({
    color: 0x8b5a2b,
    roughness: 0.7,
    metalness: 0.05,
  }),
  steel: new THREE.MeshStandardMaterial({
    color: 0x88929b,
    roughness: 0.35,
    metalness: 0.8,
  }),
  darkSteel: new THREE.MeshStandardMaterial({
    color: 0x2e3338,
    roughness: 0.5,
    metalness: 0.75,
  }),
  rustRed: new THREE.MeshStandardMaterial({
    color: 0x9b3b2f,
    roughness: 0.6,
    metalness: 0.3,
  }),
  blackGrip: new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.85,
    metalness: 0.0,
  }),
};

export function createWeaponMesh(weaponKey: string | null): THREE.Object3D | null {
  if (!weaponKey) return null;

  const root = new THREE.Group();
  root.name = `weapon_${weaponKey}`;

  switch (weaponKey) {
    case 'knife': {
      // Small handle + steel blade
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.022, 0.12, 8),
        sharedMaterials.blackGrip,
      );
      handle.position.set(0, 0.05, 0);

      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.01, 0.18, 0.035),
        sharedMaterials.steel,
      );
      blade.position.set(0, 0.2, 0.01);

      root.add(handle);
      root.add(blade);
      break;
    }

    case 'bat': {
      // Wooden baseball bat
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.026, 0.22, 10),
        sharedMaterials.blackGrip,
      );
      grip.position.set(0, 0.1, 0);

      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.026, 0.62, 12),
        sharedMaterials.wood,
      );
      barrel.position.set(0, 0.5, 0);

      const knob = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10),
        sharedMaterials.wood,
      );
      knob.position.set(0, -0.015, 0);

      root.add(grip);
      root.add(barrel);
      root.add(knob);
      break;
    }

    case 'spiked_bat': {
      // Wooden baseball bat with metallic spikes
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.026, 0.22, 10),
        sharedMaterials.blackGrip,
      );
      grip.position.set(0, 0.1, 0);

      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.046, 0.026, 0.62, 12),
        sharedMaterials.wood,
      );
      barrel.position.set(0, 0.5, 0);

      const knob = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.03, 10),
        sharedMaterials.wood,
      );
      knob.position.set(0, -0.015, 0);

      root.add(grip);
      root.add(barrel);
      root.add(knob);

      // Add small spikes along the upper barrel
      const spikeGeo = new THREE.ConeGeometry(0.01, 0.06, 6);
      spikeGeo.rotateX(Math.PI / 2);
      for (let i = 0; i < 6; i++) {
        const spike = new THREE.Mesh(spikeGeo, sharedMaterials.steel);
        const angle = (i * Math.PI) / 3;
        const yPos = 0.45 + (i % 3) * 0.12;
        spike.position.set(Math.cos(angle) * 0.045, yPos, Math.sin(angle) * 0.045);
        spike.rotation.y = angle;
        root.add(spike);
      }
      break;
    }

    case 'crowbar': {
      // Classic red/dark steel crowbar
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.65, 8),
        sharedMaterials.rustRed,
      );
      shaft.position.set(0, 0.32, 0);

      const hook = new THREE.Mesh(
        new THREE.TorusGeometry(0.07, 0.018, 8, 12, Math.PI * 0.6),
        sharedMaterials.steel,
      );
      hook.position.set(0.04, 0.63, 0);
      hook.rotation.z = -Math.PI * 0.25;

      root.add(shaft);
      root.add(hook);
      break;
    }

    case 'axe': {
      // Firefighter / camping axe
      const haft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.026, 0.72, 8),
        sharedMaterials.wood,
      );
      haft.position.set(0, 0.35, 0);

      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.14, 0.18),
        sharedMaterials.rustRed,
      );
      head.position.set(0, 0.68, 0.05);

      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(0.008, 0.16, 0.04),
        sharedMaterials.steel,
      );
      edge.position.set(0, 0.68, 0.14);

      root.add(haft);
      root.add(head);
      root.add(edge);
      break;
    }

    case 'pistol': {
      // 9mm handgun placeholder
      const grip = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.11, 0.05),
        sharedMaterials.blackGrip,
      );
      grip.position.set(0, 0.04, -0.02);
      grip.rotation.x = -0.22;

      const slide = new THREE.Mesh(
        new THREE.BoxGeometry(0.038, 0.05, 0.18),
        sharedMaterials.darkSteel,
      );
      slide.position.set(0, 0.1, 0.04);

      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 0.04, 8),
        sharedMaterials.darkSteel,
      );
      barrel.position.set(0, 0.1, 0.135);
      barrel.rotation.x = Math.PI / 2;

      root.add(grip);
      root.add(slide);
      root.add(barrel);
      break;
    }

    default: {
      // Generic item box
      const generic = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.35, 0.08),
        sharedMaterials.steel,
      );
      generic.position.set(0, 0.18, 0);
      root.add(generic);
      break;
    }
  }

  // Adjust root orientation so weapon aligns naturally with right hand grasp
  // In KayKit handslot.r, local +Y is along the grip / pointing out of fist
  root.position.set(0, 0, 0);

  return root;
}
