import { describe, expect, it } from 'vitest';
import { BlockId } from './types';
import {
  normalizeChestInventoryState,
  type InventoryItemStack
} from './ui';

describe('chest inventory UI state', () => {
  it('infers a 54-slot large chest and preserves its last rendered slot', () => {
    const slots: Array<InventoryItemStack | null> = Array.from(
      { length: 54 },
      () => null
    );
    slots[53] = { itemId: BlockId.Dirt, count: 8, block: BlockId.Dirt };

    const state = normalizeChestInventoryState({ slots });

    expect(state.size).toBe(54);
    expect(state.title).toBe('大箱子');
    expect(state.slots).toHaveLength(54);
    expect(state.slots[53]).toEqual({
      itemId: BlockId.Dirt,
      count: 8,
      block: BlockId.Dirt
    });
    expect(state.slots[53]).not.toBe(slots[53]);
  });

  it('keeps the single-chest default and honors explicit size and title semantics', () => {
    const inferred = normalizeChestInventoryState({ slots: [] });
    expect(inferred).toMatchObject({ size: 27, title: '箱子' });
    expect(inferred.slots).toHaveLength(27);

    const explicit = normalizeChestInventoryState({
      slots: Array.from({ length: 54 }, () => null),
      size: 27,
      title: '  补给箱  '
    });
    expect(explicit).toMatchObject({ size: 27, title: '补给箱' });
    expect(explicit.slots).toHaveLength(27);
  });
});
