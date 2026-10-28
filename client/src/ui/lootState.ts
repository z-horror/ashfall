import type { ContainerView, InventoryView } from '@ashfall/shared';

/** Stable identity for a container view; used to avoid rebuilding the DOM on every snapshot. */
export function containerSignature(container: ContainerView | null | undefined): string {
  if (!container) return '';
  const items = container.items.map((item) => `${item.id}:${item.key}:${item.qty}`).join('|');
  return `${container.id}#${items}`;
}

export function selectionExists(
  selectedId: string | null,
  inv: InventoryView | null | undefined,
  container: ContainerView | null | undefined,
): boolean {
  if (!selectedId) return false;
  return Boolean(inv?.items.some((item) => item.id === selectedId) || container?.items.some((item) => item.id === selectedId));
}
