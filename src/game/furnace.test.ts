import { describe, expect, it } from 'vitest';
import {
  FURNACE_COOK_DURATION,
  FurnaceStateMachine,
  canInsertIntoFurnaceSlot,
  getFuelBurnDuration,
  getFurnaceRecipe,
  sanitizeFurnaceSnapshot
} from './furnace';
import { TOOL_ITEM_IDS, isItemId } from './survival';
import { BlockId } from './types';

describe('furnace definitions', () => {
  it('uses the existing raw-iron drop and produces a valid iron ingot item', () => {
    expect(getFurnaceRecipe('raw_iron')).toMatchObject({
      id: 'iron_ingot',
      output: { item: 'iron_ingot', count: 1 },
      cookDuration: FURNACE_COOK_DURATION
    });
    expect(getFurnaceRecipe(BlockId.Cobblestone)).toMatchObject({
      output: { item: BlockId.Stone, count: 1 }
    });
    expect(getFurnaceRecipe('raw_pork')).toMatchObject({
      output: { item: 'cooked_pork', count: 1 }
    });
    expect(getFurnaceRecipe('raw_mutton')).toMatchObject({
      output: { item: 'cooked_mutton', count: 1 }
    });
    expect(getFurnaceRecipe('raw_beef')).toMatchObject({
      output: { item: 'cooked_beef', count: 1 }
    });
    expect(getFurnaceRecipe(BlockId.Sand)).toMatchObject({
      output: { item: BlockId.Glass, count: 1 }
    });
    expect(getFurnaceRecipe(BlockId.Dirt)).toBeNull();
    expect(isItemId('iron_ingot')).toBe(true);
    expect(isItemId('cooked_pork')).toBe(true);
    expect(isItemId('cooked_mutton')).toBe(true);
    expect(isItemId('cooked_beef')).toBe(true);
  });

  it('matches the standard burn durations for supported basic fuels', () => {
    expect(getFuelBurnDuration('coal')).toBe(80);
    expect(getFuelBurnDuration(BlockId.Wood)).toBe(15);
    expect(getFuelBurnDuration(BlockId.Planks)).toBe(15);
    expect(getFuelBurnDuration('stick')).toBe(5);
    expect(getFuelBurnDuration(TOOL_ITEM_IDS.woodenPickaxe)).toBe(10);
    expect(getFuelBurnDuration(BlockId.Cobblestone)).toBe(0);
  });

  it('exposes insertion rules and never permits external output insertion', () => {
    expect(canInsertIntoFurnaceSlot('input', BlockId.Cobblestone)).toBe(true);
    expect(canInsertIntoFurnaceSlot('input', 'raw_iron')).toBe(true);
    expect(canInsertIntoFurnaceSlot('input', 'raw_pork')).toBe(true);
    expect(canInsertIntoFurnaceSlot('input', 'raw_mutton')).toBe(true);
    expect(canInsertIntoFurnaceSlot('input', 'raw_beef')).toBe(true);
    expect(canInsertIntoFurnaceSlot('input', BlockId.Sand)).toBe(true);
    expect(canInsertIntoFurnaceSlot('input', 'cooked_pork')).toBe(false);
    expect(canInsertIntoFurnaceSlot('input', BlockId.Dirt)).toBe(false);
    expect(canInsertIntoFurnaceSlot('fuel', BlockId.Planks)).toBe(true);
    expect(canInsertIntoFurnaceSlot('fuel', 'raw_iron')).toBe(false);
    expect(canInsertIntoFurnaceSlot('output', BlockId.Stone)).toBe(false);
  });
});

describe('FurnaceStateMachine', () => {
  it('accumulates partial tick updates and consumes fuel only when smelting can start', () => {
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('input', { item: BlockId.Cobblestone, count: 1 });
    furnace.setSlot('fuel', { item: BlockId.Planks, count: 1 });

    expect(furnace.update(4)).toMatchObject({
      elapsed: 4,
      fuelConsumed: 1,
      itemsSmelted: 0,
      burning: true,
      changed: true
    });
    expect(furnace.getSnapshot()).toMatchObject({
      input: { item: BlockId.Cobblestone, count: 1 },
      fuel: null,
      output: null,
      burnTime: 11,
      burnDuration: 15,
      cookTime: 4,
      cookDuration: 10
    });

    expect(furnace.update(6).itemsSmelted).toBe(1);
    expect(furnace.getSlot('input')).toBeNull();
    expect(furnace.getSlot('output')).toEqual({ item: BlockId.Stone, count: 1 });
    expect(furnace.getSnapshot()).toMatchObject({ burnTime: 5, cookTime: 0 });
  });

  it('processes an extreme offline delta at state boundaries instead of requiring per-tick calls', () => {
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('input', { item: BlockId.Cobblestone, count: 64 });
    furnace.setSlot('fuel', { item: 'coal', count: 64 });

    const result = furnace.update(Number.MAX_VALUE);

    expect(result).toMatchObject({
      elapsed: Number.MAX_VALUE,
      fuelConsumed: 8,
      itemsSmelted: 64,
      burning: false
    });
    expect(furnace.getSlot('input')).toBeNull();
    expect(furnace.getSlot('fuel')).toEqual({ item: 'coal', count: 56 });
    expect(furnace.getSlot('output')).toEqual({ item: BlockId.Stone, count: 64 });
    expect(furnace.getSnapshot()).toMatchObject({ burnTime: 0, cookTime: 0 });
  });

  it('smelts raw iron into ingots and leaves unused burn time active', () => {
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('input', { item: 'raw_iron', count: 1 });
    furnace.setSlot('fuel', { item: BlockId.Wood, count: 1 });

    expect(furnace.update(10).itemsSmelted).toBe(1);
    expect(furnace.getSlot('output')).toEqual({ item: 'iron_ingot', count: 1 });
    expect(furnace.getSnapshot()).toMatchObject({ burnTime: 5, burnDuration: 15 });

    furnace.update(5);
    expect(furnace.burning).toBe(false);
    expect(furnace.burnProgress).toBe(0);
  });

  it.each([
    ['raw_pork', 'cooked_pork'],
    ['raw_mutton', 'cooked_mutton'],
    ['raw_beef', 'cooked_beef'],
    [BlockId.Sand, BlockId.Glass]
  ] as const)('smelts %s into %s', (input, output) => {
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('input', { item: input, count: 2 });
    furnace.setSlot('fuel', { item: BlockId.Planks, count: 1 });

    expect(furnace.update(FURNACE_COOK_DURATION).itemsSmelted).toBe(1);
    expect(furnace.getSlot('input')).toEqual({ item: input, count: 1 });
    expect(furnace.getSlot('output')).toEqual({ item: output, count: 1 });
    expect(furnace.getSnapshot()).toMatchObject({ burnTime: 5, cookTime: 0 });
  });

  it('does not consume fuel or input when the output is full or has another item', () => {
    for (const output of [
      { item: BlockId.Stone, count: 64 },
      { item: BlockId.Dirt, count: 1 }
    ] as const) {
      const furnace = new FurnaceStateMachine();
      furnace.setSlot('input', { item: BlockId.Cobblestone, count: 2 });
      furnace.setSlot('fuel', { item: 'coal', count: 2 });
      furnace.setSlot('output', output);

      expect(furnace.canSmelt()).toBe(false);
      expect(furnace.update(1_000)).toMatchObject({
        fuelConsumed: 0,
        itemsSmelted: 0,
        burning: false
      });
      expect(furnace.getSlot('input')).toEqual({ item: BlockId.Cobblestone, count: 2 });
      expect(furnace.getSlot('fuel')).toEqual({ item: 'coal', count: 2 });
      expect(furnace.getSlot('output')).toEqual(output);
    }
  });

  it('finishes only the amount that fits, while an already-lit furnace keeps burning', () => {
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('input', { item: BlockId.Cobblestone, count: 2 });
    furnace.setSlot('fuel', { item: 'coal', count: 1 });
    furnace.setSlot('output', { item: BlockId.Stone, count: 63 });

    const result = furnace.update(80);

    expect(result).toMatchObject({ fuelConsumed: 1, itemsSmelted: 1, burning: false });
    expect(furnace.getSlot('input')).toEqual({ item: BlockId.Cobblestone, count: 1 });
    expect(furnace.getSlot('output')).toEqual({ item: BlockId.Stone, count: 64 });
    expect(furnace.getSnapshot().cookTime).toBe(0);
  });

  it('decays interrupted progress at twice the normal rate while remaining fuel burns', () => {
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('input', { item: BlockId.Cobblestone, count: 2 });
    furnace.setSlot('fuel', { item: 'coal', count: 1 });
    furnace.update(4);
    furnace.setSlot('output', { item: BlockId.Dirt, count: 1 });

    furnace.update(1.5);

    expect(furnace.getSnapshot()).toMatchObject({ burnTime: 74.5, cookTime: 1 });
    expect(furnace.getSlot('input')).toEqual({ item: BlockId.Cobblestone, count: 2 });
    expect(furnace.getSlot('output')).toEqual({ item: BlockId.Dirt, count: 1 });
  });

  it('round-trips an active machine and continues from the serialized progress', () => {
    const first = new FurnaceStateMachine();
    first.setSlot('input', { item: 'raw_iron', count: 2 });
    first.setSlot('fuel', { item: 'coal', count: 1 });
    first.update(6.25);
    const serialized = JSON.parse(JSON.stringify(first.getSnapshot())) as unknown;

    const restored = new FurnaceStateMachine(serialized);
    expect(restored.getSnapshot()).toEqual(first.getSnapshot());
    expect(restored.update(3.75).itemsSmelted).toBe(1);
    expect(restored.getSlot('input')).toEqual({ item: 'raw_iron', count: 1 });
    expect(restored.getSlot('output')).toEqual({ item: 'iron_ingot', count: 1 });
    expect(restored.getSnapshot()).toMatchObject({ burnTime: 70, cookTime: 0 });
  });

  it('rejects malformed snapshots atomically and sanitizes valid bounds', () => {
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('input', { item: BlockId.Cobblestone, count: 2 });
    const before = furnace.getSnapshot();

    expect(furnace.loadSnapshot({ ...before, output: { item: 'diamond', count: 1 } })).toBe(false);
    expect(furnace.getSnapshot()).toEqual(before);
    expect(sanitizeFurnaceSnapshot({ ...before, burnTime: Number.NaN })).toBeUndefined();

    expect(
      sanitizeFurnaceSnapshot({
        ...before,
        input: { item: BlockId.Cobblestone, count: 999 },
        fuel: { item: 'coal', count: -4 },
        output: null,
        burnTime: 100,
        burnDuration: 15,
        cookTime: 100,
        cookDuration: 10
      })
    ).toMatchObject({
      input: { item: BlockId.Cobblestone, count: 64 },
      fuel: { item: 'coal', count: 1 },
      burnTime: 15,
      burnDuration: 15,
      cookTime: 0,
      cookDuration: 10
    });

    expect(
      sanitizeFurnaceSnapshot({
        ...before,
        fuel: { item: 'coal', count: 1 },
        burnTime: 86_400,
        burnDuration: 86_400,
        cookTime: 9,
        cookDuration: 0.001
      })
    ).toMatchObject({
      burnTime: 0,
      burnDuration: 0,
      cookTime: 0,
      cookDuration: FURNACE_COOK_DURATION
    });
  });

  it('inserts only valid input and fuel, reports overflow, and keeps returned stacks cloned', () => {
    const furnace = new FurnaceStateMachine();
    expect(furnace.canAccept('input', BlockId.Cobblestone)).toBe(true);
    expect(furnace.insert('input', { item: BlockId.Dirt, count: 4 })).toBe(4);
    expect(furnace.insert('output', { item: BlockId.Stone, count: 4 })).toBe(4);
    expect(furnace.insert('input', { item: BlockId.Cobblestone, count: 70 })).toBe(6);
    expect(furnace.insert('fuel', { item: 'coal', count: 70 })).toBe(6);

    const input = furnace.getSlot('input');
    expect(input).toEqual({ item: BlockId.Cobblestone, count: 64 });
    input!.count = 1;
    expect(furnace.getSlot('input')).toEqual({ item: BlockId.Cobblestone, count: 64 });
    expect(furnace.remove('fuel', 3)).toEqual({ item: 'coal', count: 3 });
    expect(furnace.getSlot('fuel')).toEqual({ item: 'coal', count: 61 });
  });

  it('resets cooking progress when the input recipe changes', () => {
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('input', { item: BlockId.Cobblestone, count: 1 });
    furnace.setSlot('fuel', { item: 'coal', count: 1 });
    furnace.update(5);
    expect(furnace.cookProgress).toBe(0.5);

    furnace.setSlot('input', { item: 'raw_iron', count: 1 });
    expect(furnace.getSnapshot().cookTime).toBe(0);
    furnace.update(10);
    expect(furnace.getSlot('output')).toEqual({ item: 'iron_ingot', count: 1 });
  });

  it('does not mutate state for non-positive or non-finite deltas', () => {
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('input', { item: BlockId.Cobblestone, count: 1 });
    furnace.setSlot('fuel', { item: 'coal', count: 1 });
    const before = furnace.getSnapshot();

    expect(furnace.update(0).changed).toBe(false);
    expect(furnace.update(-1).changed).toBe(false);
    expect(furnace.update(Number.POSITIVE_INFINITY).changed).toBe(false);
    expect(furnace.getSnapshot()).toEqual(before);
  });

  it('separates slot changes from timer changes and atomically returns all contents', () => {
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('input', { item: BlockId.Cobblestone, count: 2 });
    furnace.setSlot('fuel', { item: 'coal', count: 2 });

    expect(furnace.update(1)).toMatchObject({
      slotsChanged: true,
      progressChanged: true,
      changed: true
    });
    expect(furnace.update(1)).toMatchObject({
      slotsChanged: false,
      progressChanged: true,
      changed: true
    });

    furnace.setSlot('output', { item: BlockId.Stone, count: 3 });
    expect(furnace.takeAllContents()).toEqual([
      { item: BlockId.Cobblestone, count: 2 },
      { item: 'coal', count: 1 },
      { item: BlockId.Stone, count: 3 }
    ]);
    expect(furnace.getSnapshot()).toEqual({
      version: 1,
      input: null,
      fuel: null,
      output: null,
      burnTime: 0,
      burnDuration: 0,
      cookTime: 0,
      cookDuration: FURNACE_COOK_DURATION
    });
  });
});
