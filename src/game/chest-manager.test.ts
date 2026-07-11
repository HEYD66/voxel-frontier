import { describe, expect, it, vi } from 'vitest';
import { ChestManager, chestKey, type WorldChestSave } from './chest-manager';
import { CHEST_SLOT_COUNT } from './chest';
import { TOOL_ITEM_IDS, type ItemStack } from './survival';
import { BlockId } from './types';

describe('ChestManager', () => {
  it('keeps storage at distinct normalized coordinates independent', () => {
    const manager = new ChestManager();
    const first = manager.getOrCreate(1.8, 2.2, 3.9);
    const second = manager.getOrCreate(-4, 5, 6);
    first.setSlot(0, { item: BlockId.Dirt, count: 2 });
    second.setSlot(0, { item: BlockId.Dirt, count: 7 });

    expect(manager.size).toBe(2);
    expect(manager.get(1, 2, 3)).toBe(first);
    expect(manager.getByKey(chestKey(-4, 5, 6))).toBe(second);
    expect(manager.get(-4, 5, 6)?.getSlot(0)?.count).toBe(7);
  });

  it('round-trips all 27 slots only for coordinates backed by chest blocks', () => {
    const manager = new ChestManager();
    manager.getOrCreate(1, 2, 3, 'east').setSlot(26, { item: 'coal', count: 14 });
    manager.getOrCreate(9, 9, 9).setSlot(0, { item: BlockId.Stone, count: 4 });

    const serialized = manager.serialize();
    expect(serialized[0]?.state.slots).toHaveLength(CHEST_SLOT_COUNT);
    expect(serialized[0]?.facing).toBe('east');

    const restored = new ChestManager();
    restored.load(serialized, (x, y, z) => x === 1 && y === 2 && z === 3);

    expect(restored.size).toBe(1);
    expect(restored.get(1, 2, 3)?.getSlot(26)).toEqual({ item: 'coal', count: 14 });
    expect(restored.getFacing(1, 2, 3)).toBe('east');
    expect(restored.getFacingByKey(chestKey(1, 2, 3))).toBe('east');
    expect(restored.get(9, 9, 9)).toBeNull();
    expect(restored.serialize()).toEqual([serialized[0]]);
  });

  it('persists facing for empty chests and does not overwrite it while opening', () => {
    const manager = new ChestManager();
    const empty = manager.getOrCreate(4, 5, 6, 'west');

    expect(manager.getOrCreate(4, 5, 6)).toBe(empty);
    expect(manager.getFacing(4, 5, 6)).toBe('west');
    expect(manager.serialize()).toEqual([
      {
        position: [4, 5, 6],
        state: empty.getSnapshot(),
        facing: 'west'
      }
    ]);

    const restored = new ChestManager();
    restored.load(manager.serialize(), () => true);
    expect(restored.get(4, 5, 6)?.getSlots().every((slot) => slot === null)).toBe(true);
    expect(restored.getFacing(4, 5, 6)).toBe('west');
  });

  it('defaults legacy and unsafe facing values to north', () => {
    const emptySlots = Array.from({ length: CHEST_SLOT_COUNT }, () => null);
    const restored = new ChestManager();
    restored.load(
      [
        { position: [1, 2, 3], state: { version: 1, slots: emptySlots } },
        {
          position: [4, 5, 6],
          state: { version: 1, slots: emptySlots },
          facing: '__proto__'
        }
      ] as unknown as WorldChestSave[],
      () => true
    );

    expect(restored.getFacing(1, 2, 3)).toBe('north');
    expect(restored.getFacing(4, 5, 6)).toBe('north');
  });

  it('keeps the first valid duplicate and skips malformed or stale entries', () => {
    const emptySlots = (): Array<ItemStack | null> =>
      Array.from({ length: CHEST_SLOT_COUNT }, () => null);
    const firstSlots = emptySlots();
    firstSlots[0] = { item: BlockId.Dirt, count: 999 };
    const duplicateSlots = emptySlots();
    duplicateSlots[0] = { item: BlockId.Stone, count: 9 };
    const saved = [
      null,
      { position: [Number.NaN, 2, 3], state: { version: 1, slots: firstSlots } },
      { position: [1, 2, 3], state: { version: 1, slots: [] } },
      {
        position: [1.9, 2.1, 3.8],
        state: { version: 1, slots: firstSlots },
        facing: 'invalid'
      },
      {
        position: [1, 2, 3],
        state: { version: 1, slots: duplicateSlots },
        facing: 'south'
      },
      { position: [9, 9, 9], state: { version: 1, slots: duplicateSlots } }
    ] as unknown as WorldChestSave[];

    const restored = new ChestManager();
    expect(() => {
      restored.load(saved, (x, y, z) => x === 1 && y === 2 && z === 3);
    }).not.toThrow();

    expect(restored.size).toBe(1);
    expect(restored.get(1, 2, 3)?.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 64 });
    expect(restored.getFacing(1, 2, 3)).toBe('north');
    expect(restored.get(9, 9, 9)).toBeNull();
  });

  it('updates facing only for an existing chest', () => {
    const manager = new ChestManager();
    manager.getOrCreate(3, 4, 5, 'south');

    expect(manager.setFacing(3, 4, 5, 'east')).toBe(true);
    expect(manager.getFacing(3, 4, 5)).toBe('east');
    expect(manager.setFacing(9, 9, 9, 'west')).toBe(false);
    expect(manager.size).toBe(1);
  });

  it('returns all contents and deletes storage when a chest block is removed', () => {
    const manager = new ChestManager();
    const chest = manager.getOrCreate(3, 4, 5);
    chest.setSlot(0, { item: BlockId.Planks, count: 32 });
    chest.setSlot(8, { item: 'iron_ingot', count: 5 });
    chest.setSlot(26, { item: TOOL_ITEM_IDS.ironSword, count: 1, durability: 19 });

    expect(manager.remove(3, 4, 5)).toEqual([
      { item: BlockId.Planks, count: 32 },
      { item: 'iron_ingot', count: 5 },
      { item: TOOL_ITEM_IDS.ironSword, count: 1, durability: 19 }
    ]);
    expect(manager.size).toBe(0);
    expect(manager.get(3, 4, 5)).toBeNull();
    expect(manager.remove(3, 4, 5)).toEqual([]);
  });

  it('clears existing runtime state before loading an absent snapshot', () => {
    const manager = new ChestManager();
    manager.getOrCreate(1, 1, 1).setSlot(0, { item: BlockId.Dirt, count: 1 });

    manager.load(undefined, () => true);

    expect(manager.size).toBe(0);
  });

  it('resolves either half to one consistently ordered live double container', () => {
    const manager = new ChestManager();
    const westHalf = manager.getOrCreate(0, 5, 0, 'north');
    const eastHalf = manager.getOrCreate(1, 5, 0, 'north');
    westHalf.setSlot(0, { item: BlockId.Dirt, count: 2 });
    eastHalf.setSlot(0, { item: BlockId.Wood, count: 3 });

    const fromWest = manager.resolveContainer(0, 5, 0);
    const fromEast = manager.resolveContainerByKey(chestKey(1, 5, 0));
    expect(fromWest?.isDouble).toBe(true);
    expect(fromEast?.isDouble).toBe(true);
    if (!fromWest?.isDouble || !fromEast?.isDouble) {
      throw new Error('Expected a double chest.');
    }

    expect(fromWest.facing).toBe('north');
    expect(fromWest.keys).toEqual([chestKey(1, 5, 0), chestKey(0, 5, 0)]);
    expect(fromWest.positions).toEqual([
      [1, 5, 0],
      [0, 5, 0]
    ]);
    expect(fromWest.left.inventory).toBe(eastHalf);
    expect(fromWest.right.inventory).toBe(westHalf);
    expect(fromWest.selected.key).toBe(chestKey(0, 5, 0));
    expect(fromEast.keys).toEqual(fromWest.keys);
    expect(fromEast.selected.key).toBe(chestKey(1, 5, 0));

    expect(fromWest.inventory.getSlot(0)).toEqual({ item: BlockId.Wood, count: 3 });
    expect(fromWest.inventory.getSlot(27)).toEqual({ item: BlockId.Dirt, count: 2 });
    fromWest.inventory.setSlot(53, { item: BlockId.Stone, count: 4 });
    expect(westHalf.getSlot(26)).toEqual({ item: BlockId.Stone, count: 4 });
  });

  it('resolves isolated and incompatible neighbors as single containers', () => {
    const manager = new ChestManager();
    const origin = manager.getOrCreate(0, 5, 0, 'north');
    manager.getOrCreate(1, 5, 0, 'south');
    manager.getOrCreate(0, 5, -1, 'north');
    manager.getOrCreate(0, 6, 0, 'north');

    const resolved = manager.resolveContainer(0, 5, 0);
    expect(resolved).toMatchObject({
      isDouble: false,
      facing: 'north',
      keys: [chestKey(0, 5, 0)],
      positions: [[0, 5, 0]],
      left: null,
      right: null
    });
    expect(resolved?.inventory).toBe(origin);
    expect(manager.resolveContainer(99, 5, 0)).toBeNull();
    expect(manager.resolveContainerByKey('not-a-position')).toBeNull();
  });

  it('validates isolated placement and only connects same-facing side neighbors', () => {
    const manager = new ChestManager();
    manager.getOrCreate(0, 5, 0, 'north');

    expect(manager.validatePlacement(4.9, 5.8, 4.2, 'west')).toEqual({
      allowed: true,
      position: [4, 5, 4],
      facing: 'west',
      isDouble: false,
      connectsTo: null,
      reason: null
    });

    const side = manager.validatePlacement(1, 5, 0, 'north');
    expect(side.allowed).toBe(true);
    expect(side.isDouble).toBe(true);
    expect(side.connectsTo?.key).toBe(chestKey(0, 5, 0));
    expect(manager.canPlace(-1, 5, 0, 'north')).toBe(true);

    expect(manager.validatePlacement(0, 5, -1, 'north')).toMatchObject({
      allowed: true,
      isDouble: false
    });
    expect(manager.validatePlacement(1, 5, 0, 'south')).toMatchObject({
      allowed: true,
      isDouble: false
    });
    expect(manager.validatePlacement(1, 6, 0, 'north')).toMatchObject({
      allowed: true,
      isDouble: false
    });
    expect(manager.validatePlacement(0, 5, 0, 'north')).toMatchObject({
      allowed: false,
      reason: 'occupied'
    });
  });

  it('rejects bridges, extensions of valid pairs and malformed chest chains', () => {
    const bridge = new ChestManager();
    bridge.getOrCreate(-1, 5, 0, 'north');
    bridge.getOrCreate(1, 5, 0, 'north');
    expect(bridge.validatePlacement(0, 5, 0, 'north')).toMatchObject({
      allowed: false,
      reason: 'would-bridge-chests'
    });
    expect(bridge.canPlace(0, 5, 0, 'north')).toBe(false);

    const paired = new ChestManager();
    paired.getOrCreate(0, 5, 0, 'north');
    paired.getOrCreate(1, 5, 0, 'north');
    expect(paired.resolveContainer(0, 5, 0)?.isDouble).toBe(true);
    expect(paired.validatePlacement(2, 5, 0, 'north')).toMatchObject({
      allowed: false,
      reason: 'adjacent-to-double-chest'
    });

    const malformed = new ChestManager();
    malformed.getOrCreate(0, 5, 0, 'north');
    malformed.getOrCreate(1, 5, 0, 'north');
    malformed.getOrCreate(2, 5, 0, 'north');
    expect(malformed.resolveContainer(1, 5, 0)?.isDouble).toBe(false);
    expect(malformed.validatePlacement(3, 5, 0, 'north')).toMatchObject({
      allowed: false,
      reason: 'would-form-triple-chest'
    });
  });

  it('resolves legacy saves deterministically regardless of entry order', () => {
    const source = new ChestManager();
    source.getOrCreate(0, 5, 0, 'north').setSlot(0, { item: BlockId.Dirt, count: 2 });
    source.getOrCreate(1, 5, 0, 'north').setSlot(0, { item: BlockId.Wood, count: 3 });
    const legacy = source
      .serialize()
      .reverse()
      .map(({ facing: _facing, ...entry }) => entry) as WorldChestSave[];

    const restored = new ChestManager();
    restored.load(legacy, () => true);
    const first = restored.resolveContainer(0, 5, 0);
    const second = restored.resolveContainer(1, 5, 0);
    expect(first?.isDouble).toBe(true);
    expect(second?.isDouble).toBe(true);
    if (!first?.isDouble || !second?.isDouble) {
      throw new Error('Expected a restored legacy double chest.');
    }
    expect(first.facing).toBe('north');
    expect(first.keys).toEqual([chestKey(1, 5, 0), chestKey(0, 5, 0)]);
    expect(second.keys).toEqual(first.keys);
    expect(first.inventory.getSlot(0)).toEqual({ item: BlockId.Wood, count: 3 });
    expect(first.inventory.getSlot(27)).toEqual({ item: BlockId.Dirt, count: 2 });
  });

  it('keeps the surviving half inventory and facing after its partner is removed', () => {
    const manager = new ChestManager();
    const northHalf = manager.getOrCreate(0, 7, 0, 'east');
    const southHalf = manager.getOrCreate(0, 7, 1, 'east');
    northHalf.setSlot(0, { item: BlockId.Stone, count: 8 });
    southHalf.setSlot(0, { item: BlockId.Wood, count: 5 });
    expect(manager.resolveContainer(0, 7, 0)?.isDouble).toBe(true);

    expect(manager.remove(0, 7, 1)).toEqual([{ item: BlockId.Wood, count: 5 }]);
    expect(manager.size).toBe(1);
    expect(manager.get(0, 7, 0)).toBe(northHalf);
    expect(manager.get(0, 7, 0)?.getSlot(0)).toEqual({ item: BlockId.Stone, count: 8 });
    expect(manager.getFacing(0, 7, 0)).toBe('east');

    const surviving = manager.resolveContainer(0, 7, 0);
    expect(surviving?.isDouble).toBe(false);
    expect(surviving?.inventory).toBe(northHalf);
    expect(surviving?.keys).toEqual([chestKey(0, 7, 0)]);
    expect(manager.serialize()).toEqual([
      {
        position: [0, 7, 0],
        state: northHalf.getSnapshot(),
        facing: 'east'
      }
    ]);
    expect(manager.validatePlacement(0, 7, 1, 'east')).toMatchObject({
      allowed: true,
      isDouble: true
    });
  });

  it('returns reciprocal connection offsets for all four chest facings', () => {
    const cases = [
      { facing: 'north', first: [0, 5, 0], second: [1, 5, 0], offset: [1, 0] },
      { facing: 'south', first: [0, 5, 0], second: [-1, 5, 0], offset: [-1, 0] },
      { facing: 'east', first: [0, 5, 0], second: [0, 5, 1], offset: [0, 1] },
      { facing: 'west', first: [0, 5, 0], second: [0, 5, -1], offset: [0, -1] }
    ] as const;

    for (const value of cases) {
      const manager = new ChestManager();
      manager.getOrCreate(...value.first, value.facing);
      manager.getOrCreate(
        value.second[0],
        value.second[1],
        value.second[2],
        value.facing
      );
      expect(manager.getConnectionOffset(...value.first)).toEqual({
        dx: value.offset[0],
        dz: value.offset[1]
      });
      expect(
        manager.getConnectionOffset(value.second[0], value.second[1], value.second[2])
      ).toEqual({
        dx: 0 - value.offset[0],
        dz: 0 - value.offset[1]
      });
    }
  });

  it('returns no connection offset for every half of a malformed legacy triple', () => {
    const source = new ChestManager();
    source.getOrCreate(0, 5, 0, 'north');
    source.getOrCreate(1, 5, 0, 'north');
    source.getOrCreate(2, 5, 0, 'north');
    const restored = new ChestManager();
    restored.load(source.serialize(), () => true);

    for (const x of [0, 1, 2]) {
      expect(restored.getConnectionOffset(x, 5, 0)).toBeNull();
      expect(restored.resolveContainer(x, 5, 0)?.isDouble).toBe(false);
    }
  });

  it('resolves and validates only local topology among many unrelated chests', () => {
    const manager = new ChestManager();
    manager.getOrCreate(0, 5, 0, 'north');
    manager.getOrCreate(1, 5, 0, 'north');
    for (let index = 0; index < 1_000; index += 1) {
      manager.getOrCreate(100 + index * 3, 20 + index % 7, 100, 'north');
    }

    const internal = (manager as unknown as { chests: Map<string, unknown> }).chests;
    const keys = vi.spyOn(internal, 'keys').mockImplementation(() => {
      throw new Error('Full chest-map enumeration is forbidden in local queries.');
    });
    try {
      expect(manager.getConnectionOffset(0, 5, 0)).toEqual({ dx: 1, dz: 0 });
      const resolved = manager.resolveContainer(0, 5, 0);
      expect(resolved?.isDouble).toBe(true);
      expect(resolved?.keys).toEqual([chestKey(1, 5, 0), chestKey(0, 5, 0)]);
      expect(manager.validatePlacement(2, 5, 0, 'north')).toMatchObject({
        allowed: false,
        reason: 'adjacent-to-double-chest'
      });
      expect(manager.validatePlacement(0, 5, 1, 'north')).toMatchObject({
        allowed: true,
        isDouble: false
      });
    } finally {
      keys.mockRestore();
    }
  });

  it('reuses a stable combined inventory and keeps unrelated additions local', () => {
    const manager = new ChestManager();
    manager.getOrCreate(0, 5, 0, 'north');
    manager.getOrCreate(1, 5, 0, 'north');
    const first = manager.resolveContainer(0, 5, 0);
    const second = manager.resolveContainer(1, 5, 0);
    if (!first?.isDouble || !second?.isDouble) throw new Error('Expected a double chest.');
    expect(second.inventory).toBe(first.inventory);

    manager.getOrCreate(100, 5, 100, 'west');
    const afterUnrelatedAdd = manager.resolveContainer(0, 5, 0);
    expect(afterUnrelatedAdd?.inventory).toBe(first.inventory);
    expect(manager.setFacing(0, 5, 0, 'north')).toBe(true);
    expect(manager.resolveContainer(0, 5, 0)?.inventory).toBe(first.inventory);
  });

  it('invalidates cached combined inventories for local add, remove and facing changes', () => {
    const manager = new ChestManager();
    manager.getOrCreate(0, 5, 0, 'north');
    manager.getOrCreate(1, 5, 0, 'north');
    const initial = manager.resolveContainer(0, 5, 0);
    if (!initial?.isDouble) throw new Error('Expected a double chest.');

    manager.getOrCreate(2, 5, 0, 'north');
    expect(manager.getConnectionOffset(0, 5, 0)).toBeNull();
    expect(manager.resolveContainer(0, 5, 0)?.isDouble).toBe(false);
    manager.remove(2, 5, 0);
    const afterLocalAdd = manager.resolveContainer(0, 5, 0);
    if (!afterLocalAdd?.isDouble) throw new Error('Expected a restored double chest.');
    expect(afterLocalAdd.inventory).not.toBe(initial.inventory);

    expect(manager.setFacing(1, 5, 0, 'south')).toBe(true);
    expect(manager.resolveContainer(0, 5, 0)?.isDouble).toBe(false);
    expect(manager.setFacing(1, 5, 0, 'north')).toBe(true);
    const afterFacing = manager.resolveContainer(0, 5, 0);
    if (!afterFacing?.isDouble) throw new Error('Expected a restored double chest.');
    expect(afterFacing.inventory).not.toBe(afterLocalAdd.inventory);

    manager.remove(1, 5, 0);
    manager.getOrCreate(1, 5, 0, 'north');
    const afterRemove = manager.resolveContainer(0, 5, 0);
    if (!afterRemove?.isDouble) throw new Error('Expected a recreated double chest.');
    expect(afterRemove.inventory).not.toBe(afterFacing.inventory);
  });

  it('clears combined inventory caches when loading or clearing manager state', () => {
    const manager = new ChestManager();
    manager.getOrCreate(0, 5, 0, 'north');
    manager.getOrCreate(1, 5, 0, 'north');
    const beforeLoad = manager.resolveContainer(0, 5, 0);
    if (!beforeLoad?.isDouble) throw new Error('Expected a double chest.');
    const saved = manager.serialize();

    manager.load(saved, () => true);
    const afterLoad = manager.resolveContainer(0, 5, 0);
    if (!afterLoad?.isDouble) throw new Error('Expected a loaded double chest.');
    expect(afterLoad.inventory).not.toBe(beforeLoad.inventory);
    expect(manager.resolveContainer(1, 5, 0)?.inventory).toBe(afterLoad.inventory);

    manager.clear();
    manager.getOrCreate(0, 5, 0, 'north');
    manager.getOrCreate(1, 5, 0, 'north');
    const afterClear = manager.resolveContainer(0, 5, 0);
    if (!afterClear?.isDouble) throw new Error('Expected a recreated double chest.');
    expect(afterClear.inventory).not.toBe(afterLoad.inventory);
  });
});
