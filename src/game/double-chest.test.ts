import { describe, expect, it, vi } from 'vitest';
import { ChestInventory, type ChestFacing } from './chest';
import {
  DOUBLE_CHEST_SLOT_COUNT,
  CombinedChestInventory,
  findDoubleChestPair,
  isChestConnectionCandidate,
  resolveDoubleChestPair,
  type ChestBlockPosition,
  type ChestConnectionNode
} from './double-chest';
import { TOOL_DEFINITIONS, TOOL_ITEM_IDS, type ItemStack } from './survival';
import { BlockId } from './types';

interface TestChest extends ChestConnectionNode {
  readonly id: string;
}

function chest(
  id: string,
  position: ChestBlockPosition,
  facing: ChestFacing = 'north'
): TestChest {
  return { id, position, facing };
}

describe('double-chest connection rules', () => {
  it('accepts only same-facing horizontal side neighbors', () => {
    const origin = chest('origin', [0, 10, 0], 'north');

    expect(isChestConnectionCandidate(origin, chest('west', [-1, 10, 0], 'north'))).toBe(true);
    expect(isChestConnectionCandidate(origin, chest('east', [1, 10, 0], 'north'))).toBe(true);
    expect(isChestConnectionCandidate(origin, chest('front', [0, 10, -1], 'north'))).toBe(false);
    expect(isChestConnectionCandidate(origin, chest('back', [0, 10, 1], 'north'))).toBe(false);
    expect(isChestConnectionCandidate(origin, chest('vertical', [1, 11, 0], 'north'))).toBe(false);
    expect(isChestConnectionCandidate(origin, chest('diagonal', [1, 10, 1], 'north'))).toBe(false);
    expect(isChestConnectionCandidate(origin, chest('distant', [2, 10, 0], 'north'))).toBe(false);
    expect(isChestConnectionCandidate(origin, chest('same', [0, 10, 0], 'north'))).toBe(false);
    expect(isChestConnectionCandidate(origin, chest('turned', [1, 10, 0], 'south'))).toBe(false);

    const eastFacing = chest('east-facing', [0, 10, 0], 'east');
    expect(isChestConnectionCandidate(eastFacing, chest('south', [0, 10, 1], 'east'))).toBe(true);
    expect(isChestConnectionCandidate(eastFacing, chest('east', [1, 10, 0], 'east'))).toBe(false);
  });

  it('uses stable player-facing left/right halves independent of query order', () => {
    const cases: Array<{
      facing: ChestFacing;
      first: ChestBlockPosition;
      second: ChestBlockPosition;
      leftId: string;
    }> = [
      { facing: 'north', first: [0, 5, 0], second: [1, 5, 0], leftId: 'second' },
      { facing: 'south', first: [0, 5, 0], second: [1, 5, 0], leftId: 'first' },
      { facing: 'east', first: [0, 5, 0], second: [0, 5, 1], leftId: 'second' },
      { facing: 'west', first: [0, 5, 0], second: [0, 5, 1], leftId: 'first' }
    ];

    for (const value of cases) {
      const first = chest('first', value.first, value.facing);
      const second = chest('second', value.second, value.facing);
      const forward = resolveDoubleChestPair(first, second, [first, second]);
      const reverse = resolveDoubleChestPair(second, first, [second, first]);

      expect(forward?.facing).toBe(value.facing);
      expect(forward?.left.id).toBe(value.leftId);
      expect(reverse?.left.id).toBe(value.leftId);
      expect(reverse?.right.id).toBe(forward?.right.id);
    }
  });

  it('rejects an entire three-chest chain from either end or the middle', () => {
    const first = chest('first', [0, 5, 0]);
    const middle = chest('middle', [1, 5, 0]);
    const last = chest('last', [2, 5, 0]);
    const all = [first, middle, last];

    expect(resolveDoubleChestPair(first, middle, all)).toBeNull();
    expect(resolveDoubleChestPair(middle, last, all)).toBeNull();
    expect(findDoubleChestPair(first, all)).toBeNull();
    expect(findDoubleChestPair(middle, all)).toBeNull();
    expect(findDoubleChestPair(last, all)).toBeNull();
  });

  it('ignores incompatible nearby chests and resolves disjoint pairs', () => {
    const first = chest('first', [0, 5, 0]);
    const second = chest('second', [1, 5, 0]);
    const turned = chest('turned', [2, 5, 0], 'south');
    const third = chest('third', [4, 5, 0]);
    const fourth = chest('fourth', [5, 5, 0]);
    const all = [fourth, turned, second, third, first];

    expect(findDoubleChestPair(first, all)?.left.id).toBe('second');
    expect(findDoubleChestPair(second, all)?.right.id).toBe('first');
    expect(findDoubleChestPair(third, all)?.left.id).toBe('fourth');
    expect(findDoubleChestPair(turned, all)).toBeNull();
  });

  it('rejects non-block coordinates at the geometry boundary', () => {
    const first = chest('first', [0, 5, 0]);
    const fractional = chest('fractional', [1, 5.5, 0]);
    expect(isChestConnectionCandidate(first, fractional)).toBe(false);
  });
});

describe('CombinedChestInventory', () => {
  it('maps left 0-26 then right 27-53 as a live 54-slot view', () => {
    const left = new ChestInventory();
    const right = new ChestInventory();
    const combined = new CombinedChestInventory(left, right);

    left.setSlot(0, { item: BlockId.Dirt, count: 2 });
    right.setSlot(0, { item: BlockId.Wood, count: 3 });
    expect(combined.size).toBe(DOUBLE_CHEST_SLOT_COUNT);
    expect(combined.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 2 });
    expect(combined.getSlot(27)).toEqual({ item: BlockId.Wood, count: 3 });

    expect(combined.setSlot(26, { item: BlockId.Stone, count: 4 })).toBe(true);
    expect(combined.setSlot(53, { item: BlockId.Planks, count: 5 })).toBe(true);
    expect(left.getSlot(26)).toEqual({ item: BlockId.Stone, count: 4 });
    expect(right.getSlot(26)).toEqual({ item: BlockId.Planks, count: 5 });
    expect(combined.getSlots()).toHaveLength(54);

    right.setSlot(8, { item: BlockId.Cobblestone, count: 7 });
    expect(combined.getSlot(35)).toEqual({ item: BlockId.Cobblestone, count: 7 });
  });

  it('returns cloned views while retaining only the two underlying inventories', () => {
    const left = new ChestInventory();
    const right = new ChestInventory();
    const combined = new CombinedChestInventory(left, right);
    left.setSlot(0, { item: BlockId.Dirt, count: 2 });

    const slot = combined.getSlot(0)!;
    const snapshot = combined.getSnapshot();
    slot.count = 40;
    snapshot.slots[0]!.count = 41;
    expect(left.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 2 });

    combined.setSlot(0, { item: BlockId.Dirt, count: 9 });
    expect(left.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 9 });
  });

  it('fills matching stacks anywhere in the 54 slots before using an empty slot', () => {
    const left = new ChestInventory();
    const right = new ChestInventory();
    const combined = new CombinedChestInventory(left, right);
    right.setSlot(4, { item: BlockId.Dirt, count: 63 });

    expect(combined.addStack({ item: BlockId.Dirt, count: 2 })).toBe(0);
    expect(right.getSlot(4)).toEqual({ item: BlockId.Dirt, count: 64 });
    expect(left.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 1 });
  });

  it('obeys one-item durability stacks and reports overflow across both halves', () => {
    const left = new ChestInventory();
    const right = new ChestInventory();
    const combined = new CombinedChestInventory(left, right);
    const pickaxe = TOOL_ITEM_IDS.ironPickaxe;

    expect(combined.addStack({ item: pickaxe, count: 2, durability: 9999 })).toBe(0);
    expect(combined.getSlot(0)).toEqual({
      item: pickaxe,
      count: 1,
      durability: TOOL_DEFINITIONS[pickaxe].maxDurability
    });
    expect(combined.getSlot(1)).toEqual(combined.getSlot(0));

    for (let index = 0; index < combined.size; index += 1) {
      combined.setSlot(index, { item: BlockId.Cobblestone, count: 64 });
    }
    combined.setSlot(53, { item: BlockId.Dirt, count: 63 });
    expect(combined.addStack({ item: BlockId.Dirt, count: 3 })).toBe(2);
    expect(right.getSlot(26)).toEqual({ item: BlockId.Dirt, count: 64 });
  });

  it('delegates insertion, removal and invalid indices to the correct half', () => {
    const left = new ChestInventory();
    const right = new ChestInventory();
    const combined = new CombinedChestInventory(left, right);

    expect(combined.insert(27, { item: BlockId.Dirt, count: 70 })).toBe(6);
    expect(right.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 64 });
    expect(combined.remove(27, 5)).toEqual({ item: BlockId.Dirt, count: 5 });
    expect(right.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 59 });
    expect(combined.getSlot(-1)).toBeNull();
    expect(combined.getSlot(54)).toBeNull();
    expect(combined.setSlot(Number.NaN, null)).toBe(false);
    expect(combined.insert(99, { item: BlockId.Dirt, count: 8 })).toBe(8);
    expect(combined.remove(99)).toBeNull();
  });

  it('takes contents in combined slot order and clears both backing chests', () => {
    const left = new ChestInventory();
    const right = new ChestInventory();
    const combined = new CombinedChestInventory(left, right);
    left.setSlot(20, { item: 'coal', count: 8 });
    right.setSlot(0, { item: BlockId.Wood, count: 3 });
    right.setSlot(25, { item: TOOL_ITEM_IDS.stoneShovel, count: 1, durability: 12 });

    expect(combined.takeAllContents()).toEqual([
      { item: 'coal', count: 8 },
      { item: BlockId.Wood, count: 3 },
      { item: TOOL_ITEM_IDS.stoneShovel, count: 1, durability: 12 }
    ]);
    expect(left.getSlots().every((stack) => stack === null)).toBe(true);
    expect(right.getSlots().every((stack) => stack === null)).toBe(true);
  });

  it('forwards either half changes to one combined subscription', () => {
    const left = new ChestInventory();
    const right = new ChestInventory();
    const combined = new CombinedChestInventory(left, right);
    const listener = vi.fn();
    const unsubscribe = combined.subscribe(listener);

    left.setSlot(0, { item: BlockId.Dirt, count: 1 });
    right.setSlot(0, { item: BlockId.Wood, count: 2 });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(combined.getSnapshot());

    unsubscribe();
    left.clear();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('requires two distinct backing inventories', () => {
    const inventory = new ChestInventory();
    expect(() => new CombinedChestInventory(inventory, inventory)).toThrow(TypeError);
  });

  it('does not mutate the incoming stack object', () => {
    const combined = new CombinedChestInventory(new ChestInventory(), new ChestInventory());
    const stack: ItemStack = { item: BlockId.Dirt, count: 70 };
    combined.addStack(stack);
    expect(stack).toEqual({ item: BlockId.Dirt, count: 70 });
  });
});
