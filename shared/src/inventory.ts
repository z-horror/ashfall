import { ITEMS, INVENTORY_SLOTS, INVENTORY_WEIGHT } from './constants.js';

export interface StackLike {
  key: string;
  qty: number;
}

export function itemWeight(key: string, qty = 1): number {
  return (ITEMS[key]?.weight ?? 0.1) * qty;
}

export function totalWeight(items: StackLike[]): number {
  let sum = 0;
  for (const it of items) sum += itemWeight(it.key, it.qty);
  return Math.round(sum * 100) / 100;
}

export function canCarry(
  items: StackLike[],
  key: string,
  qty: number,
  slots = INVENTORY_SLOTS,
  maxWeight = INVENTORY_WEIGHT,
): boolean {
  if (qty <= 0) return true;
  const def = ITEMS[key];
  if (!def) return false;

  const weight = totalWeight(items) + itemWeight(key, qty);
  if (weight > maxWeight + 0.001) return false;

  const stackMax = def.stack ?? 1;
  let remainingQty = qty;

  for (const it of items) {
    if (it.key === key && it.qty < stackMax) {
      const space = stackMax - it.qty;
      remainingQty -= Math.min(remainingQty, space);
      if (remainingQty <= 0) break;
    }
  }

  if (remainingQty <= 0) return true;

  const newSlotsNeeded = Math.ceil(remainingQty / stackMax);
  const freeSlots = slots - items.length;
  return newSlotsNeeded <= freeSlots;
}

export function stackLimit(key: string): number {
  return ITEMS[key]?.stack ?? 1;
}
