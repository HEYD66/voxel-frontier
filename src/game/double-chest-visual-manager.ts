import * as THREE from 'three';
import {
  DEFAULT_CHEST_FACING,
  sanitizeChestFacing,
  type ChestFacing
} from './chest';
import { chestKey } from './chest-manager';
import {
  resolveDoubleChestPair,
  type ChestBlockPosition,
  type ChestConnectionNode,
  type DoubleChestPair
} from './double-chest';
import { DoubleChestVisual } from './double-chest-visual';

export interface DoubleChestVisualLighting {
  blockLight: number;
  skyLight: number;
  daylight?: number;
}

interface NormalizedPair {
  facing: ChestFacing;
  left: ChestBlockPosition;
  right: ChestBlockPosition;
}

interface ManagedDoubleChest extends NormalizedPair {
  visual: DoubleChestVisual;
}

/** A stable coordinate-only key; argument order does not affect the result. */
export function doubleChestPairKey(
  first: ChestBlockPosition,
  second: ChestBlockPosition
): string {
  const [left, right] = sortPositions(normalizePosition(first), normalizePosition(second));
  return `${chestKey(...left)}|${chestKey(...right)}`;
}

/** Owns continuous double-chest models and indexes each one by both half blocks. */
export class DoubleChestVisualManager extends THREE.Group {
  private readonly pairs = new Map<string, ManagedDoubleChest>();
  private readonly halfToPair = new Map<string, string>();
  private disposed = false;

  constructor() {
    super();
    this.name = 'Double chest visuals';
  }

  get size(): number {
    return this.pairs.size;
  }

  upsert<T extends ChestConnectionNode>(
    pair: DoubleChestPair<T>,
    lighting?: DoubleChestVisualLighting
  ): DoubleChestVisual;
  upsert(
    first: ChestBlockPosition,
    second: ChestBlockPosition,
    facing?: ChestFacing,
    lighting?: DoubleChestVisualLighting
  ): DoubleChestVisual;
  upsert<T extends ChestConnectionNode>(
    pairOrFirst: DoubleChestPair<T> | ChestBlockPosition,
    secondOrLighting?: ChestBlockPosition | DoubleChestVisualLighting,
    facing: ChestFacing = DEFAULT_CHEST_FACING,
    directLighting?: DoubleChestVisualLighting
  ): DoubleChestVisual {
    if (this.disposed) {
      throw new Error('Cannot add a double chest to a disposed visual manager.');
    }

    const usingPair = isDoubleChestPair(pairOrFirst);
    const normalized = usingPair
      ? normalizePair(pairOrFirst)
      : normalizeDirectPair(
          pairOrFirst,
          requirePosition(secondOrLighting),
          sanitizeChestFacing(facing)
        );
    const lighting = usingPair
      ? (secondOrLighting as DoubleChestVisualLighting | undefined)
      : directLighting;
    const key = doubleChestPairKey(normalized.left, normalized.right);
    const leftHalfKey = chestKey(...normalized.left);
    const rightHalfKey = chestKey(...normalized.right);
    this.assertUnclaimedHalf(leftHalfKey, key);
    this.assertUnclaimedHalf(rightHalfKey, key);

    let managed = this.pairs.get(key);
    if (!managed) {
      const visual = new DoubleChestVisual({
        facing: normalized.facing,
        ...lighting
      });
      managed = { ...normalized, visual };
      this.pairs.set(key, managed);
      this.halfToPair.set(leftHalfKey, key);
      this.halfToPair.set(rightHalfKey, key);
      this.add(visual);
    } else {
      managed.facing = normalized.facing;
      managed.left = normalized.left;
      managed.right = normalized.right;
      managed.visual.setFacing(normalized.facing);
      if (lighting) applyLighting(managed.visual, lighting);
    }

    const center = pairCenter(normalized.left, normalized.right);
    managed.visual.position.set(center[0], center[1], center[2]);
    return managed.visual;
  }

  get(x: number, y: number, z: number): DoubleChestVisual | null {
    const pairKey = this.halfToPair.get(chestKey(x, y, z));
    return pairKey ? this.pairs.get(pairKey)?.visual ?? null : null;
  }

  getByKey(key: string): DoubleChestVisual | null {
    const pairKey = this.pairs.has(key) ? key : this.halfToPair.get(key);
    return pairKey ? this.pairs.get(pairKey)?.visual ?? null : null;
  }

  getPairKey(x: number, y: number, z: number): string | null {
    return this.halfToPair.get(chestKey(x, y, z)) ?? null;
  }

  setOpen(x: number, y: number, z: number, open: boolean): boolean {
    const visual = this.get(x, y, z);
    if (!visual) return false;
    visual.setOpen(open);
    return true;
  }

  setLighting(
    x: number,
    y: number,
    z: number,
    lighting: DoubleChestVisualLighting
  ): boolean {
    const visual = this.get(x, y, z);
    if (!visual) return false;
    applyLighting(visual, lighting);
    return true;
  }

  removeChest(x: number, y: number, z: number): boolean {
    const pairKey = this.halfToPair.get(chestKey(x, y, z));
    if (!pairKey) return false;
    const managed = this.pairs.get(pairKey);
    if (!managed) {
      this.halfToPair.delete(chestKey(x, y, z));
      return false;
    }
    this.pairs.delete(pairKey);
    this.halfToPair.delete(chestKey(...managed.left));
    this.halfToPair.delete(chestKey(...managed.right));
    managed.visual.dispose();
    return true;
  }

  update(dt: number): void {
    for (const managed of this.pairs.values()) managed.visual.update(dt);
  }

  override clear(): this {
    for (const managed of this.pairs.values()) managed.visual.dispose();
    this.pairs.clear();
    this.halfToPair.clear();
    super.clear();
    return this;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeFromParent();
    this.clear();
  }

  private assertUnclaimedHalf(halfKey: string, requestedPairKey: string): void {
    const existingPairKey = this.halfToPair.get(halfKey);
    if (existingPairKey && existingPairKey !== requestedPairKey) {
      throw new Error(`Chest half ${halfKey} already belongs to another double chest.`);
    }
  }
}

function isDoubleChestPair<T extends ChestConnectionNode>(
  value: DoubleChestPair<T> | ChestBlockPosition
): value is DoubleChestPair<T> {
  return !Array.isArray(value);
}

function normalizePair<T extends ChestConnectionNode>(pair: DoubleChestPair<T>): NormalizedPair {
  const facing = sanitizeChestFacing(pair.facing);
  if (pair.left.facing !== facing || pair.right.facing !== facing) {
    throw new TypeError('Double chest pair halves must share the pair facing.');
  }
  return normalizeDirectPair(pair.left.position, pair.right.position, facing);
}

function normalizeDirectPair(
  first: ChestBlockPosition,
  second: ChestBlockPosition,
  facing: ChestFacing
): NormalizedPair {
  const firstNode: ChestConnectionNode = {
    position: normalizePosition(first),
    facing
  };
  const secondNode: ChestConnectionNode = {
    position: normalizePosition(second),
    facing
  };
  const pair = resolveDoubleChestPair(firstNode, secondNode, [firstNode, secondNode]);
  if (!pair) {
    throw new TypeError('Double chest halves must be same-level horizontal side neighbors.');
  }
  return {
    facing: pair.facing,
    left: pair.left.position,
    right: pair.right.position
  };
}

function requirePosition(
  value: ChestBlockPosition | DoubleChestVisualLighting | undefined
): ChestBlockPosition {
  if (!Array.isArray(value)) {
    throw new TypeError('A second chest block position is required.');
  }
  return value as unknown as ChestBlockPosition;
}

function normalizePosition(position: ChestBlockPosition): ChestBlockPosition {
  if (
    !Array.isArray(position) ||
    position.length !== 3 ||
    !position.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
  ) {
    throw new TypeError('Chest positions require three finite coordinates.');
  }
  return [Math.trunc(position[0]), Math.trunc(position[1]), Math.trunc(position[2])];
}

function sortPositions(
  first: ChestBlockPosition,
  second: ChestBlockPosition
): [ChestBlockPosition, ChestBlockPosition] {
  return comparePositions(first, second) <= 0 ? [first, second] : [second, first];
}

function comparePositions(first: ChestBlockPosition, second: ChestBlockPosition): number {
  return first[0] - second[0] || first[1] - second[1] || first[2] - second[2];
}

function pairCenter(
  first: ChestBlockPosition,
  second: ChestBlockPosition
): [number, number, number] {
  return [
    (first[0] + second[0]) / 2 + 0.5,
    first[1],
    (first[2] + second[2]) / 2 + 0.5
  ];
}

function applyLighting(
  visual: DoubleChestVisual,
  lighting: DoubleChestVisualLighting
): void {
  visual.setLighting(lighting.blockLight, lighting.skyLight, lighting.daylight ?? 1);
}
