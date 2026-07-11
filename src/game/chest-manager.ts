import {
  ChestInventory,
  DEFAULT_CHEST_FACING,
  sanitizeChestFacing,
  sanitizeChestSnapshot,
  type ChestFacing,
  type ChestSnapshot
} from './chest';
import {
  CombinedChestInventory,
  resolveDoubleChestPair,
  type ChestConnectionNode
} from './double-chest';
import type { ItemStack } from './survival';

export type ChestPosition = [number, number, number];

const CHEST_SIDE_OFFSETS: Readonly<
  Record<ChestFacing, readonly [readonly [number, number], readonly [number, number]]>
> = {
  north: [[-1, 0], [1, 0]],
  south: [[-1, 0], [1, 0]],
  east: [[0, -1], [0, 1]],
  west: [[0, -1], [0, 1]]
};

export interface WorldChestSave {
  position: ChestPosition;
  state: ChestSnapshot;
  /** Optional only so version-1 saves without block-state metadata remain loadable. */
  facing?: ChestFacing;
}

interface ManagedChest {
  inventory: ChestInventory;
  facing: ChestFacing;
}

interface CachedCombinedChest {
  readonly leftKey: string;
  readonly rightKey: string;
  readonly leftInventory: ChestInventory;
  readonly rightInventory: ChestInventory;
  readonly inventory: CombinedChestInventory;
}

export interface ChestConnectionOffset {
  readonly dx: number;
  readonly dz: number;
}

export interface ChestContainerHalf extends ChestConnectionNode {
  readonly key: string;
  readonly position: ChestPosition;
  readonly inventory: ChestInventory;
}

interface ChestContainerBase {
  readonly facing: ChestFacing;
  readonly selected: ChestContainerHalf;
}

export interface SingleChestContainer extends ChestContainerBase {
  readonly isDouble: false;
  readonly inventory: ChestInventory;
  readonly keys: readonly [string];
  readonly positions: readonly [ChestPosition];
  readonly left: null;
  readonly right: null;
}

export interface DoubleChestContainer extends ChestContainerBase {
  readonly isDouble: true;
  readonly inventory: CombinedChestInventory;
  /** Ordered from the player's view of the chest front. */
  readonly keys: readonly [string, string];
  /** Ordered from the player's view of the chest front. */
  readonly positions: readonly [ChestPosition, ChestPosition];
  readonly left: ChestContainerHalf;
  readonly right: ChestContainerHalf;
}

export type ResolvedChestContainer = SingleChestContainer | DoubleChestContainer;

export type ChestPlacementRejectionReason =
  | 'occupied'
  | 'would-bridge-chests'
  | 'adjacent-to-double-chest'
  | 'would-form-triple-chest';

export type ChestPlacementValidation =
  | {
      readonly allowed: true;
      readonly position: ChestPosition;
      readonly facing: ChestFacing;
      readonly isDouble: boolean;
      readonly connectsTo: ChestContainerHalf | null;
      readonly reason: null;
    }
  | {
      readonly allowed: false;
      readonly position: ChestPosition;
      readonly facing: ChestFacing;
      readonly isDouble: false;
      readonly connectsTo: null;
      readonly reason: ChestPlacementRejectionReason;
    };

export class ChestManager {
  private readonly chests = new Map<string, ManagedChest>();
  private readonly combinedChests = new Map<string, CachedCombinedChest>();
  private readonly combinedChestByHalf = new Map<string, string>();

  get size(): number {
    return this.chests.size;
  }

  getOrCreate(
    x: number,
    y: number,
    z: number,
    facing: ChestFacing = DEFAULT_CHEST_FACING
  ): ChestInventory {
    const position = normalizePosition(x, y, z);
    const key = chestKey(...position);
    let managed = this.chests.get(key);
    if (!managed) {
      this.invalidateTopology(position, [sanitizeChestFacing(facing)]);
      managed = {
        inventory: new ChestInventory(),
        facing: sanitizeChestFacing(facing)
      };
      this.chests.set(key, managed);
    }
    return managed.inventory;
  }

  get(x: number, y: number, z: number): ChestInventory | null {
    return this.chests.get(chestKey(...normalizePosition(x, y, z)))?.inventory ?? null;
  }

  getByKey(key: string): ChestInventory | null {
    return this.chests.get(key)?.inventory ?? null;
  }

  getFacing(x: number, y: number, z: number): ChestFacing | null {
    return this.chests.get(chestKey(...normalizePosition(x, y, z)))?.facing ?? null;
  }

  getFacingByKey(key: string): ChestFacing | null {
    return this.chests.get(key)?.facing ?? null;
  }

  /**
   * Returns the horizontal offset to the other half of a valid double chest.
   * This is a constant-time topology query and never creates an inventory view.
   */
  getConnectionOffset(x: number, y: number, z: number): ChestConnectionOffset | null {
    const position = normalizePosition(x, y, z);
    const managed = this.chests.get(chestKey(...position));
    return managed ? this.getConnectionOffsetAt(position, managed.facing) : null;
  }

  /** Resolves the single or double container reached through either half. */
  resolveContainer(x: number, y: number, z: number): ResolvedChestContainer | null {
    return this.resolveContainerByKey(chestKey(...normalizePosition(x, y, z)));
  }

  /** Resolves the single or double container reached through either half. */
  resolveContainerByKey(key: string): ResolvedChestContainer | null {
    const selected = this.getContainerHalf(key);
    if (!selected) return null;

    const offset = this.getConnectionOffsetAt(selected.position, selected.facing);
    if (!offset) {
      return {
        isDouble: false,
        inventory: selected.inventory,
        facing: selected.facing,
        keys: [selected.key],
        positions: [selected.position],
        selected,
        left: null,
        right: null
      };
    }

    const partner = this.getContainerHalf(
      chestKey(
        selected.position[0] + offset.dx,
        selected.position[1],
        selected.position[2] + offset.dz
      )
    );
    if (!partner) return null;
    const pair = resolveDoubleChestPair(selected, partner, [selected, partner]);
    if (!pair) return null;

    return {
      isDouble: true,
      inventory: this.getCombinedInventory(pair.left, pair.right),
      facing: pair.facing,
      keys: [pair.left.key, pair.right.key],
      positions: [pair.left.position, pair.right.position],
      selected,
      left: pair.left,
      right: pair.right
    };
  }

  /**
   * Checks chest-to-chest topology only. World occupancy for non-chest blocks
   * remains the caller's responsibility.
   */
  validatePlacement(
    x: number,
    y: number,
    z: number,
    facing: ChestFacing = DEFAULT_CHEST_FACING
  ): ChestPlacementValidation {
    const position = normalizePosition(x, y, z);
    const normalizedFacing = sanitizeChestFacing(facing);
    const key = chestKey(...position);
    if (this.chests.has(key)) {
      return placementRejected(position, normalizedFacing, 'occupied');
    }

    const compatible = this.getCompatibleNeighbors(position, normalizedFacing);

    if (compatible.length === 0) {
      return placementAllowed(position, normalizedFacing, null);
    }
    if (compatible.length > 1) {
      return placementRejected(position, normalizedFacing, 'would-bridge-chests');
    }

    const partner = compatible[0]!;
    if (this.getConnectionOffsetAt(partner.position, partner.facing)) {
      return placementRejected(position, normalizedFacing, 'adjacent-to-double-chest');
    }

    if (this.getCompatibleNeighbors(partner.position, partner.facing).length > 0) {
      return placementRejected(position, normalizedFacing, 'would-form-triple-chest');
    }

    return placementAllowed(position, normalizedFacing, partner);
  }

  canPlace(
    x: number,
    y: number,
    z: number,
    facing: ChestFacing = DEFAULT_CHEST_FACING
  ): boolean {
    return this.validatePlacement(x, y, z, facing).allowed;
  }

  setFacing(x: number, y: number, z: number, facing: ChestFacing): boolean {
    const position = normalizePosition(x, y, z);
    const managed = this.chests.get(chestKey(...position));
    if (!managed) return false;
    const normalizedFacing = sanitizeChestFacing(facing);
    if (managed.facing === normalizedFacing) return true;
    this.invalidateTopology(position, [managed.facing, normalizedFacing]);
    managed.facing = normalizedFacing;
    return true;
  }

  remove(x: number, y: number, z: number): ItemStack[] {
    const key = chestKey(...normalizePosition(x, y, z));
    const managed = this.chests.get(key);
    if (!managed) return [];
    const position = normalizePosition(x, y, z);
    this.invalidateTopology(position, [managed.facing]);
    this.chests.delete(key);
    return managed.inventory.takeAllContents();
  }

  serialize(): WorldChestSave[] {
    const saved: WorldChestSave[] = [];
    for (const [key, managed] of this.chests) {
      const position = parseChestKey(key);
      if (!position) continue;
      saved.push({
        position,
        state: managed.inventory.getSnapshot(),
        facing: managed.facing
      });
    }
    return saved;
  }

  load(
    saved: readonly WorldChestSave[] | undefined,
    isChestBlock: (x: number, y: number, z: number) => boolean
  ): void {
    this.chests.clear();
    this.clearCombinedCache();
    if (!Array.isArray(saved)) return;

    for (const value of saved) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as Partial<WorldChestSave>;
      const position = normalizeSavedPosition(entry.position);
      const state = sanitizeChestSnapshot(entry.state);
      if (!position || !state || !isChestBlock(...position)) continue;
      const key = chestKey(...position);
      if (this.chests.has(key)) continue;
      this.chests.set(key, {
        inventory: new ChestInventory(state),
        facing: sanitizeChestFacing(entry.facing)
      });
    }
  }

  clear(): void {
    this.chests.clear();
    this.clearCombinedCache();
  }

  private getContainerHalf(key: string): ChestContainerHalf | null {
    const managed = this.chests.get(key);
    const position = parseChestKey(key);
    if (!managed || !position) return null;
    return {
      key,
      position,
      facing: managed.facing,
      inventory: managed.inventory
    };
  }

  private getConnectionOffsetAt(
    position: ChestPosition,
    facing: ChestFacing
  ): ChestConnectionOffset | null {
    const key = chestKey(...position);
    if (!this.chests.has(key)) return null;
    const offset = this.getUniqueCompatibleOffset(position, facing);
    if (!offset) return null;

    const partnerPosition: ChestPosition = [
      position[0] + offset.dx,
      position[1],
      position[2] + offset.dz
    ];
    const reciprocal = this.getUniqueCompatibleOffset(partnerPosition, facing);
    return reciprocal?.dx === -offset.dx && reciprocal.dz === -offset.dz
      ? offset
      : null;
  }

  private getUniqueCompatibleOffset(
    position: ChestPosition,
    facing: ChestFacing
  ): ChestConnectionOffset | null {
    let found: ChestConnectionOffset | null = null;
    for (const [dx, dz] of CHEST_SIDE_OFFSETS[facing]) {
      const managed = this.chests.get(
        chestKey(position[0] + dx, position[1], position[2] + dz)
      );
      if (!managed || managed.facing !== facing) continue;
      if (found) return null;
      found = { dx, dz };
    }
    return found;
  }

  private getCompatibleNeighbors(
    position: ChestPosition,
    facing: ChestFacing
  ): ChestContainerHalf[] {
    const result: ChestContainerHalf[] = [];
    for (const [dx, dz] of CHEST_SIDE_OFFSETS[facing]) {
      const key = chestKey(position[0] + dx, position[1], position[2] + dz);
      const managed = this.chests.get(key);
      if (!managed || managed.facing !== facing) continue;
      result.push({
        key,
        position: [position[0] + dx, position[1], position[2] + dz],
        facing: managed.facing,
        inventory: managed.inventory
      });
    }
    return result;
  }

  private getCombinedInventory(
    left: ChestContainerHalf,
    right: ChestContainerHalf
  ): CombinedChestInventory {
    const pairKey = combinedChestKey(left.key, right.key);
    const cached = this.combinedChests.get(pairKey);
    if (
      cached &&
      cached.leftInventory === left.inventory &&
      cached.rightInventory === right.inventory
    ) {
      return cached.inventory;
    }

    this.invalidateCombinedForHalf(left.key);
    this.invalidateCombinedForHalf(right.key);
    const inventory = new CombinedChestInventory(left.inventory, right.inventory);
    this.combinedChests.set(pairKey, {
      leftKey: left.key,
      rightKey: right.key,
      leftInventory: left.inventory,
      rightInventory: right.inventory,
      inventory
    });
    this.combinedChestByHalf.set(left.key, pairKey);
    this.combinedChestByHalf.set(right.key, pairKey);
    return inventory;
  }

  private invalidateTopology(
    position: ChestPosition,
    facings: readonly ChestFacing[]
  ): void {
    const affected = new Set<string>([chestKey(...position)]);
    for (const facing of facings) {
      for (const [dx, dz] of CHEST_SIDE_OFFSETS[facing]) {
        affected.add(chestKey(position[0] + dx, position[1], position[2] + dz));
      }
    }
    for (const key of affected) this.invalidateCombinedForHalf(key);
  }

  private invalidateCombinedForHalf(halfKey: string): void {
    const pairKey = this.combinedChestByHalf.get(halfKey);
    if (!pairKey) return;
    const cached = this.combinedChests.get(pairKey);
    this.combinedChests.delete(pairKey);
    this.combinedChestByHalf.delete(halfKey);
    if (!cached) return;
    this.combinedChestByHalf.delete(cached.leftKey);
    this.combinedChestByHalf.delete(cached.rightKey);
  }

  private clearCombinedCache(): void {
    this.combinedChests.clear();
    this.combinedChestByHalf.clear();
  }
}

export function chestKey(x: number, y: number, z: number): string {
  return `${Math.trunc(x)},${Math.trunc(y)},${Math.trunc(z)}`;
}

function parseChestKey(key: string): ChestPosition | null {
  const parts = key.split(',').map(Number);
  if (parts.length !== 3 || !parts.every(Number.isInteger)) return null;
  return [parts[0]!, parts[1]!, parts[2]!];
}

function normalizePosition(x: number, y: number, z: number): ChestPosition {
  return [Math.trunc(x), Math.trunc(y), Math.trunc(z)];
}

function normalizeSavedPosition(value: unknown): ChestPosition | null {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
  ) {
    return null;
  }
  return normalizePosition(value[0], value[1], value[2]);
}

function combinedChestKey(leftKey: string, rightKey: string): string {
  return `${leftKey}|${rightKey}`;
}

function placementAllowed(
  position: ChestPosition,
  facing: ChestFacing,
  connectsTo: ChestContainerHalf | null
): ChestPlacementValidation {
  return {
    allowed: true,
    position,
    facing,
    isDouble: connectsTo !== null,
    connectsTo,
    reason: null
  };
}

function placementRejected(
  position: ChestPosition,
  facing: ChestFacing,
  reason: ChestPlacementRejectionReason
): ChestPlacementValidation {
  return {
    allowed: false,
    position,
    facing,
    isDouble: false,
    connectsTo: null,
    reason
  };
}
