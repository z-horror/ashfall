import * as THREE from 'three';

const woodMaterial = new THREE.MeshStandardMaterial({
  color: 0xdeb887,
  roughness: 0.45,
  metalness: 0.04,
});

const tapeMaterial = new THREE.MeshStandardMaterial({
  color: 0x1f2124,
  roughness: 0.88,
  metalness: 0.02,
});

const steelMaterial = new THREE.MeshStandardMaterial({
  color: 0xa4acb6,
  roughness: 0.28,
  metalness: 0.88,
});

const gunmetalMaterial = new THREE.MeshStandardMaterial({
  color: 0x24282c,
  roughness: 0.35,
  metalness: 0.90,
});

const crowbarRedMaterial = new THREE.MeshStandardMaterial({
  color: 0xa82b22,
  roughness: 0.45,
  metalness: 0.65,
});

/**
 * Creates a socketed 3D weapon mesh positioned to fit cleanly into
 * the character's right hand bone (mixamorigRightHand).
 */
export function buildWeaponMesh(kind: string): THREE.Group {
  const group = new THREE.Group();
  group.name = `weapon:${kind}`;

  switch (kind) {
    case 'bat':
    case 'spiked_bat': {
      // Baseball bat
      // Handle
      const handleGeom = new THREE.CylinderGeometry(0.014, 0.013, 0.22, 10);
      handleGeom.translate(0, 0.11, 0);
      const handle = new THREE.Mesh(handleGeom, tapeMaterial);
      handle.castShadow = true;
      group.add(handle);

      // Knob
      const knobGeom = new THREE.SphereGeometry(0.018, 8, 8);
      knobGeom.translate(0, 0, 0);
      const knob = new THREE.Mesh(knobGeom, woodMaterial);
      knob.castShadow = true;
      group.add(knob);

      // Barrel
      const barrelGeom = new THREE.CylinderGeometry(0.028, 0.014, 0.64, 12);
      barrelGeom.translate(0, 0.54, 0);
      const barrel = new THREE.Mesh(barrelGeom, woodMaterial);
      barrel.castShadow = true;
      group.add(barrel);

      // Top cap
      const capGeom = new THREE.SphereGeometry(0.027, 8, 8);
      capGeom.translate(0, 0.86, 0);
      const cap = new THREE.Mesh(capGeom, woodMaterial);
      cap.castShadow = true;
      group.add(cap);

      if (kind === 'spiked_bat') {
        const spikeGeom = new THREE.ConeGeometry(0.007, 0.035, 6);
        spikeGeom.rotateZ(Math.PI / 2);
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI) / 3;
          const y = 0.52 + (i % 3) * 0.1;
          const spike = new THREE.Mesh(spikeGeom, steelMaterial);
          spike.position.set(Math.cos(angle) * 0.025, y, Math.sin(angle) * 0.025);
          spike.rotation.y = -angle;
          spike.castShadow = true;
          group.add(spike);
        }
      }

      // Hand grip transform (aligned with fingers and forearm in Mixamo bone coordinates)
      group.position.set(-6, -1, 0);
      group.rotation.set(0, 0, Math.PI / 2);
      break;
    }

    case 'pistol': {
      // Semi-automatic pistol
      const slideGeom = new THREE.BoxGeometry(0.03, 0.042, 0.19);
      slideGeom.translate(0, 0.05, 0.03);
      const slide = new THREE.Mesh(slideGeom, gunmetalMaterial);
      slide.castShadow = true;
      group.add(slide);

      const gripGeom = new THREE.BoxGeometry(0.026, 0.11, 0.048);
      gripGeom.rotateX(-0.18);
      gripGeom.translate(0, -0.01, -0.01);
      const grip = new THREE.Mesh(gripGeom, tapeMaterial);
      grip.castShadow = true;
      group.add(grip);

      const barrelGeom = new THREE.CylinderGeometry(0.007, 0.007, 0.025, 8);
      barrelGeom.rotateX(Math.PI / 2);
      barrelGeom.translate(0, 0.05, 0.13);
      const barrel = new THREE.Mesh(barrelGeom, steelMaterial);
      barrel.castShadow = true;
      group.add(barrel);

      group.position.set(-7, -2, 0);
      group.rotation.set(-Math.PI / 2, Math.PI / 2, 0);
      break;
    }

    case 'knife': {
      // Combat knife
      const bladeGeom = new THREE.BoxGeometry(0.004, 0.032, 0.22);
      bladeGeom.translate(0, 0.15, 0);
      const blade = new THREE.Mesh(bladeGeom, steelMaterial);
      blade.castShadow = true;
      group.add(blade);

      const guardGeom = new THREE.BoxGeometry(0.018, 0.05, 0.008);
      guardGeom.translate(0, 0.04, 0);
      const guard = new THREE.Mesh(guardGeom, gunmetalMaterial);
      guard.castShadow = true;
      group.add(guard);

      const handleGeom = new THREE.CylinderGeometry(0.013, 0.013, 0.12, 8);
      handleGeom.translate(0, -0.02, 0);
      const handle = new THREE.Mesh(handleGeom, tapeMaterial);
      handle.castShadow = true;
      group.add(handle);

      group.position.set(-6, -1, 0);
      group.rotation.set(0, 0, Math.PI / 2);
      break;
    }

    case 'axe': {
      // Wood chopping axe
      const handleGeom = new THREE.CylinderGeometry(0.016, 0.013, 0.68, 10);
      handleGeom.translate(0, 0.32, 0);
      const handle = new THREE.Mesh(handleGeom, woodMaterial);
      handle.castShadow = true;
      group.add(handle);

      const headGeom = new THREE.BoxGeometry(0.03, 0.15, 0.12);
      headGeom.translate(0, 0.62, 0.04);
      const head = new THREE.Mesh(headGeom, steelMaterial);
      head.castShadow = true;
      group.add(head);

      group.position.set(-6, -1, 0);
      group.rotation.set(0, 0, Math.PI / 2);
      break;
    }

    case 'crowbar': {
      // Utility red crowbar
      const shaftGeom = new THREE.CylinderGeometry(0.013, 0.013, 0.72, 6);
      shaftGeom.translate(0, 0.35, 0);
      const shaft = new THREE.Mesh(shaftGeom, crowbarRedMaterial);
      shaft.castShadow = true;
      group.add(shaft);

      const clawGeom = new THREE.BoxGeometry(0.018, 0.08, 0.04);
      clawGeom.rotateX(0.4);
      clawGeom.translate(0, 0.72, 0.03);
      const claw = new THREE.Mesh(clawGeom, steelMaterial);
      claw.castShadow = true;
      group.add(claw);

      group.position.set(-6, -1, 0);
      group.rotation.set(0, 0, Math.PI / 2);
      break;
    }

    default:
      break;
  }

  return group;
}
