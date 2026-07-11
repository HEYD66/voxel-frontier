import { describe, expect, it } from 'vitest';
import { FurnaceManager } from './furnace-manager';
import { FurnaceStateMachine } from './furnace';
import { BlockId, type WorldFurnaceSave } from './types';

describe('FurnaceManager', () => {
  it('keeps furnaces at different coordinates independent', () => {
    const manager = new FurnaceManager();
    const first = manager.getOrCreate(1, 2, 3);
    const second = manager.getOrCreate(4, 5, 6);
    first.setSlot('input', { item: 'raw_iron', count: 2 });
    second.setSlot('input', { item: 'raw_iron', count: 7 });

    expect(manager.get(1, 2, 3)?.getSlot('input')?.count).toBe(2);
    expect(manager.get(4, 5, 6)?.getSlot('input')?.count).toBe(7);
    expect(first).not.toBe(second);
  });

  it('serializes and reloads only entries backed by furnace blocks', () => {
    const manager = new FurnaceManager();
    manager.getOrCreate(1, 2, 3).setSlot('fuel', { item: 'coal', count: 4 });
    manager.getOrCreate(9, 9, 9).setSlot('fuel', { item: 'stick', count: 2 });

    const restored = new FurnaceManager();
    restored.load(manager.serialize(), (x, y, z) => x === 1 && y === 2 && z === 3);

    expect(restored.size).toBe(1);
    expect(restored.get(1, 2, 3)?.getSlot('fuel')).toEqual({ item: 'coal', count: 4 });
    expect(restored.get(9, 9, 9)).toBeNull();
  });

  it('round-trips active state at multiple coordinates and advances every machine', () => {
    const manager = new FurnaceManager();
    const iron = manager.getOrCreate(1, 2, 3);
    iron.setSlot('input', { item: 'raw_iron', count: 2 });
    iron.setSlot('fuel', { item: 'coal', count: 1 });
    iron.update(3);
    const stone = manager.getOrCreate(-4, 5, 6);
    stone.setSlot('input', { item: BlockId.Cobblestone, count: 2 });
    stone.setSlot('fuel', { item: BlockId.Planks, count: 1 });
    stone.update(7);

    const restored = new FurnaceManager();
    restored.load(manager.serialize(), () => true);

    expect(restored.size).toBe(2);
    expect(restored.get(1, 2, 3)?.getSnapshot()).toEqual(iron.getSnapshot());
    expect(restored.get(-4, 5, 6)?.getSnapshot()).toEqual(stone.getSnapshot());

    const updates = restored.update(3);
    expect(updates.map((update) => update.key).sort()).toEqual(['-4,5,6', '1,2,3']);
    expect(restored.get(1, 2, 3)?.getSnapshot()).toMatchObject({
      input: { item: 'raw_iron', count: 2 },
      cookTime: 6
    });
    expect(restored.get(-4, 5, 6)?.getSnapshot()).toMatchObject({
      input: { item: BlockId.Cobblestone, count: 1 },
      output: { item: BlockId.Stone, count: 1 },
      cookTime: 0
    });
  });

  it('keeps the first valid duplicate and skips malformed or stale saved entries', () => {
    const first = new FurnaceStateMachine();
    first.setSlot('input', { item: 'raw_iron', count: 2 });
    const duplicate = new FurnaceStateMachine();
    duplicate.setSlot('input', { item: 'raw_iron', count: 9 });
    const malformedState = {
      ...first.getSnapshot(),
      output: { item: 'diamond', count: 1 }
    };
    const saved = [
      null,
      { position: [Number.NaN, 2, 3], state: first.getSnapshot() },
      { position: [1, 2, 3], state: malformedState },
      { position: [1.9, 2.1, 3.8], state: first.getSnapshot() },
      { position: [1, 2, 3], state: duplicate.getSnapshot() },
      { position: [9, 9, 9], state: duplicate.getSnapshot() }
    ] as unknown as WorldFurnaceSave[];

    const restored = new FurnaceManager();
    expect(() => {
      restored.load(saved, (x, y, z) => x === 1 && y === 2 && z === 3);
    }).not.toThrow();

    expect(restored.size).toBe(1);
    expect(restored.get(1, 2, 3)?.getSlot('input')).toEqual({
      item: 'raw_iron',
      count: 2
    });
    expect(restored.get(9, 9, 9)).toBeNull();
  });

  it('drops and removes all contents when a furnace block is broken', () => {
    const manager = new FurnaceManager();
    const furnace = manager.getOrCreate(3, 4, 5);
    furnace.setSlot('input', { item: 'raw_iron', count: 2 });
    furnace.setSlot('fuel', { item: 'coal', count: 1 });
    furnace.setSlot('output', { item: 'iron_ingot', count: 3 });

    expect(manager.remove(3, 4, 5)).toEqual([
      { item: 'raw_iron', count: 2 },
      { item: 'coal', count: 1 },
      { item: 'iron_ingot', count: 3 }
    ]);
    expect(manager.get(3, 4, 5)).toBeNull();
    expect(manager.remove(3, 4, 5)).toEqual([]);
  });
});
