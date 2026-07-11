import {
  ItemInventory,
  getItemStackLimit,
  type ItemStack
} from './survival';

export const CHEST_SLOT_COUNT = 27;

export const CHEST_FACINGS = ['north', 'south', 'east', 'west'] as const;
export type ChestFacing = (typeof CHEST_FACINGS)[number];
export const DEFAULT_CHEST_FACING: ChestFacing = 'north';

const CHEST_FACING_SET: ReadonlySet<string> = new Set(CHEST_FACINGS);
const QUARTER_TURN = Math.PI / 2;
const FULL_TURN = Math.PI * 2;

export function isChestFacing(value: unknown): value is ChestFacing {
  return typeof value === 'string' && CHEST_FACING_SET.has(value);
}

/** Returns a stable legacy-safe facing for persisted or external values. */
export function sanitizeChestFacing(value: unknown): ChestFacing {
  return isChestFacing(value) ? value : DEFAULT_CHEST_FACING;
}

/**
 * Chooses the chest front from the player's yaw. The front points back toward
 * the player, opposite the horizontal direction they are looking.
 */
export function chestFacingFromYaw(yaw: number): ChestFacing {
  if (!Number.isFinite(yaw)) return DEFAULT_CHEST_FACING;
  const normalizedYaw = ((yaw % FULL_TURN) + FULL_TURN) % FULL_TURN;
  const sector = Math.floor((normalizedYaw + Math.PI / 4) / QUARTER_TURN) % 4;
  return (['south', 'east', 'north', 'west'] as const)[sector]!;
}

/** Equivalent to chestFacingFromYaw for a horizontal camera look vector. */
export function chestFacingFromLookDirection(x: number, z: number): ChestFacing {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) === 0) {
    return DEFAULT_CHEST_FACING;
  }
  return chestFacingFromYaw(Math.atan2(-x, -z));
}

export interface ChestSnapshot {
  version: 1;
  slots: Array<ItemStack | null>;
}

export type ChestListener = (snapshot: ChestSnapshot) => void;

/** A single chest's storage, independent from its world position. */
export class ChestInventory {
  private readonly inventory = new ItemInventory(CHEST_SLOT_COUNT);

  constructor(snapshot?: unknown) {
    if (snapshot !== undefined) this.loadSnapshot(snapshot);
  }

  get size(): number {
    return CHEST_SLOT_COUNT;
  }

  subscribe(listener: ChestListener): () => void {
    return this.inventory.subscribe((snapshot) => {
      listener({ version: 1, slots: snapshot.slots });
    });
  }

  getSlot(index: number): ItemStack | null {
    return this.inventory.getSlot(index);
  }

  getSlots(): Array<ItemStack | null> {
    return this.inventory.getSnapshot().slots;
  }

  getSnapshot(): ChestSnapshot {
    return { version: 1, slots: this.getSlots() };
  }

  loadSnapshot(value: unknown): boolean {
    const snapshot = sanitizeChestSnapshot(value);
    if (!snapshot) return false;
    this.inventory.loadSnapshot(snapshot);
    return true;
  }

  setSlot(index: number, stack: ItemStack | null): boolean {
    return this.inventory.setSlot(index, stack);
  }

  /** Inserts into one slot and returns the count that did not fit. */
  insert(index: number, stack: ItemStack): number {
    const requested = normalizeCount(stack.count);
    const slot = normalizeSlotIndex(index);
    if (slot < 0 || requested <= 0) return requested;

    const incoming = normalizeStack({ ...stack, count: requested });
    if (!incoming) return requested;
    const existing = this.inventory.getSlot(slot);
    if (existing && !canMergeStacks(existing, incoming)) return requested;

    const capacity = getItemStackLimit(incoming.item) - (existing?.count ?? 0);
    const transferred = Math.min(requested, Math.max(0, capacity));
    if (transferred <= 0) return requested;

    const next: ItemStack = {
      item: incoming.item,
      count: (existing?.count ?? 0) + transferred
    };
    if (incoming.durability !== undefined) next.durability = incoming.durability;
    this.inventory.setSlot(slot, next);
    return requested - transferred;
  }

  /** Adds across all slots and returns the count that did not fit. */
  addStack(stack: ItemStack): number {
    return this.inventory.addStack(stack);
  }

  remove(index: number, count = 1): ItemStack | null {
    return this.inventory.remove(index, count);
  }

  takeAllContents(): ItemStack[] {
    const contents = this.getSlots().filter((stack): stack is ItemStack => stack !== null);
    this.clear();
    return contents;
  }

  clear(): void {
    this.inventory.loadSnapshot({
      slots: Array.from({ length: CHEST_SLOT_COUNT }, () => null)
    });
  }
}

export function sanitizeChestSnapshot(value: unknown): ChestSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<ChestSnapshot>;
  if (
    candidate.version !== 1 ||
    !Array.isArray(candidate.slots) ||
    candidate.slots.length !== CHEST_SLOT_COUNT
  ) {
    return undefined;
  }

  const normalized = new ItemInventory(
    CHEST_SLOT_COUNT,
    candidate.slots as readonly (ItemStack | null)[]
  );
  return { version: 1, slots: normalized.getSnapshot().slots };
}

function normalizeStack(value: unknown): ItemStack | null {
  if (!value || typeof value !== 'object') return null;
  const normalized = new ItemInventory(1, [value as ItemStack]);
  return normalized.getSlot(0);
}

function canMergeStacks(left: ItemStack, right: ItemStack): boolean {
  return (
    left.item === right.item &&
    left.durability === undefined &&
    right.durability === undefined
  );
}

function normalizeCount(value: number): number {
  return Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
}

function normalizeSlotIndex(index: number): number {
  if (!Number.isFinite(index)) return -1;
  const slot = Math.trunc(index);
  return slot >= 0 && slot < CHEST_SLOT_COUNT ? slot : -1;
}
