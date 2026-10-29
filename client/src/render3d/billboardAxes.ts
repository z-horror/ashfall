import * as THREE from 'three';

export const BILLBOARD_NORMAL = new THREE.Vector3(1, 1, 0.5).normalize();

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

export interface BillboardAxes {
  x: THREE.Vector3;
  y: THREE.Vector3;
  unitX: THREE.Vector3;
  unitY: THREE.Vector3;
  normal: THREE.Vector3;
}

let cachedAxes: BillboardAxes | null = null;

export function computeBillboardAxes(): BillboardAxes {
  if (cachedAxes) return cachedAxes;
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
  const x = solveBillboardAxis(1, 0, e1, e2, inverse);
  const y = solveBillboardAxis(0, -1, e1, e2, inverse);
  cachedAxes = {
    x,
    y,
    unitX: x.clone().normalize(),
    unitY: y.clone().normalize(),
    normal: BILLBOARD_NORMAL,
  };
  return cachedAxes;
}
