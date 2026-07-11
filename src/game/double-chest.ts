import {
  CHEST_SLOT_COUNT,
  ChestInventory,
  isChestFacing,
  type ChestFacing
} from './chest';
import type { ItemStack } from './survival';

export const DOUBLE_CHEST_SLOT_COUNT = CHEST_SLOT_COUNT * 2;

export type ChestBlockPosition = readonly [number, number, number];

/** The world metadata needed to decide whether two chests form one container. */
export interface ChestConnectionNode {
  readonly position: ChestBlockPosition;
  readonly facing: ChestFacing;
}

export interface DoubleChestPair<T extends ChestConnectionNode = ChestConnectionNode> {
  readonly facing: ChestFacing;
  readonly left: T;
  readonly right: T;
}

const FRONT_DIRECTIONS: Readonly<Record<ChestFacing, readonly [number, number]>> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0]
};

const LEFT_DIRECTIONS: Readonly<Record<ChestFacing, readonly [number, number]>> = {
  north: [1, 0],
  south: [-1, 0],
  east: [0, 1],
  west: [0, -1]
};

/**
 * Checks the local geometry for a possible connection. Triple-chest rejection
 * requires the complete nearby chest set and is handled by resolve/find below.
 */
export function isChestConnectionCandidate(
  first: ChestConnectionNode,
  second: ChestConnectionNode
): boolean {
  if (
    !isValidBlockPosition(first.position) ||
    !isValidBlockPosition(second.position) ||
    !isChestFacing(first.facing) ||
    !isChestFacing(second.facing) ||
    first.facing !== second.facing
  ) {
    return false;
  }

  const dx = second.position[0] - first.position[0];
  const dy = second.position[1] - first.position[1];
  const dz = second.position[2] - first.position[2];
  if (dy !== 0 || Math.abs(dx) + Math.abs(dz) !== 1) return false;

  const [frontX, frontZ] = FRONT_DIRECTIONS[first.facing];
  return dx * frontX + dz * frontZ === 0;
}

/**
 * Resolves a requested pair against every nearby chest. Both halves must have
 * exactly one compatible neighbor (each other), which prevents three-chest
 * chains regardless of which end initiates the query.
 */
export function resolveDoubleChestPair<T extends ChestConnectionNode>(
  first: T,
  second: T,
  allChests: readonly T[] = [first, second]
): DoubleChestPair<T> | null {
  if (!isChestConnectionCandidate(first, second)) return null;

  const pool = uniqueByPosition([first, second, ...allChests]);
  const firstNeighbors = compatibleNeighbors(first, pool);
  const secondNeighbors = compatibleNeighbors(second, pool);
  if (
    firstNeighbors.length !== 1 ||
    secondNeighbors.length !== 1 ||
    !positionsEqual(firstNeighbors[0]!.position, second.position) ||
    !positionsEqual(secondNeighbors[0]!.position, first.position)
  ) {
    return null;
  }

  return orderDoubleChestHalves(first, second);
}

/** Finds the only valid double-chest partner for one chest, if one exists. */
export function findDoubleChestPair<T extends ChestConnectionNode>(
  chest: T,
  allChests: readonly T[]
): DoubleChestPair<T> | null {
  const pool = uniqueByPosition([chest, ...allChests]);
  const neighbors = compatibleNeighbors(chest, pool);
  if (neighbors.length !== 1) return null;
  return resolveDoubleChestPair(chest, neighbors[0]!, pool);
}

export interface CombinedChestSnapshot {
  readonly slots: Array<ItemStack | null>;
}

export type CombinedChestListener = (snapshot: CombinedChestSnapshot) => void;

/**
 * A live 54-slot view over two independent chest inventories. Slots 0-26 map
 * to the left half and slots 27-53 map to the right half; no item state is
 * copied into a third backing inventory.
 */
export class CombinedChestInventory {
  readonly left: ChestInventory;
  readonly right: ChestInventory;

  constructor(left: ChestInventory, right: ChestInventory) {
    if (left === right) {
      throw new TypeError('A double chest requires two distinct inventories.');
    }
    this.left = left;
    this.right = right;
  }

  get size(): number {
    return DOUBLE_CHEST_SLOT_COUNT;
  }

  subscribe(listener: CombinedChestListener): () => void {
    const emit = (): void => listener(this.getSnapshot());
    const unsubscribeLeft = this.left.subscribe(emit);
    const unsubscribeRight = this.right.subscribe(emit);
    return () => {
      unsubscribeLeft();
      unsubscribeRight();
    };
  }

  getSlot(index: number): ItemStack | null {
    const target = this.resolveSlot(index);
    return target ? target.inventory.getSlot(target.index) : null;
  }

  getSlots(): Array<ItemStack | null> {
    return [...this.left.getSlots(), ...this.right.getSlots()];
  }

  getSnapshot(): CombinedChestSnapshot {
    return { slots: this.getSlots() };
  }

  setSlot(index: number, stack: ItemStack | null): boolean {
    const target = this.resolveSlot(index);
    return target ? target.inventory.setSlot(target.index, stack) : false;
  }

  /** Inserts into one combined slot and returns the count that did not fit. */
  insert(index: number, stack: ItemStack): number {
    const target = this.resolveSlot(index);
    return target
      ? target.inventory.insert(target.index, stack)
      : normalizeCount(stack.count);
  }

  remove(index: number, count = 1): ItemStack | null {
    const target = this.resolveSlot(index);
    return target ? target.inventory.remove(target.index, count) : null;
  }

  /**
   * Adds across both halves. Existing compatible stacks are filled throughout
   * the full 54-slot view before the first empty slot is used.
   */
  addStack(stack: ItemStack): number {
    let remaining = normalizeCount(stack.count);
    if (remaining === 0) return 0;

    for (let index = 0; index < this.size && remaining > 0; index += 1) {
      if (this.getSlot(index) === null) continue;
      remaining = this.insert(index, { ...stack, count: remaining });
    }

    for (let index = 0; index < this.size && remaining > 0; index += 1) {
      if (this.getSlot(index) !== null) continue;
      remaining = this.insert(index, { ...stack, count: remaining });
    }

    return remaining;
  }

  takeAllContents(): ItemStack[] {
    return [...this.left.takeAllContents(), ...this.right.takeAllContents()];
  }

  clear(): void {
    this.left.clear();
    this.right.clear();
  }

  private resolveSlot(
    index: number
  ): { inventory: ChestInventory; index: number } | null {
    const slot = normalizeSlotIndex(index);
    if (slot < 0) return null;
    return slot < CHEST_SLOT_COUNT
      ? { inventory: this.left, index: slot }
      : { inventory: this.right, index: slot - CHEST_SLOT_COUNT };
  }
}

function orderDoubleChestHalves<T extends ChestConnectionNode>(
  first: T,
  second: T
): DoubleChestPair<T> {
  const [leftX, leftZ] = LEFT_DIRECTIONS[first.facing];
  const firstProjection = first.position[0] * leftX + first.position[2] * leftZ;
  const secondProjection = second.position[0] * leftX + second.position[2] * leftZ;
  const left = firstProjection > secondProjection ? first : second;
  const right = left === first ? second : first;
  return { facing: first.facing, left, right };
}

function compatibleNeighbors<T extends ChestConnectionNode>(
  chest: T,
  pool: readonly T[]
): T[] {
  return pool.filter(
    (candidate) =>
      !positionsEqual(candidate.position, chest.position) &&
      isChestConnectionCandidate(chest, candidate)
  );
}

function uniqueByPosition<T extends ChestConnectionNode>(chests: readonly T[]): T[] {
  const result: T[] = [];
  const seen = new Set<string>();
  for (const chest of chests) {
    const key = chest.position.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(chest);
  }
  return result;
}

function positionsEqual(left: ChestBlockPosition, right: ChestBlockPosition): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function isValidBlockPosition(position: ChestBlockPosition): boolean {
  return (
    Array.isArray(position) &&
    position.length === 3 &&
    position.every((coordinate) => Number.isInteger(coordinate))
  );
}

function normalizeCount(value: number): number {
  return Math.max(0, Math.trunc(Number.isFinite(value) ? value : 0));
}

function normalizeSlotIndex(index: number): number {
  if (!Number.isFinite(index)) return -1;
  const slot = Math.trunc(index);
  return slot >= 0 && slot < DOUBLE_CHEST_SLOT_COUNT ? slot : -1;
}
