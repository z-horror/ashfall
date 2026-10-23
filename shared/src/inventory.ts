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

export function canCarry(items: StackLike[], key: string, qty: number, slots = INVENTORY_SLOTS): boolean {
  const def = ITEMS[key];
  if (!def) return false;
  const weight = totalWeight(items) + itemWeight(key, qty);
  if (weight > INVENTORY_WEIGHT + 0.001) return false;
  const existing = items.find((i) => i.key === key && i.qty < def.stack);
  if (existing) return true;
  return items.length < slots;
}

export function stackLimit(key: string): number {
  return ITEMS[key]?.stack ?? 1;
}
