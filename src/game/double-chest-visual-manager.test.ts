import { Group } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { chestKey } from './chest-manager';
import type { ChestConnectionNode, DoubleChestPair } from './double-chest';
import {
  DoubleChestVisualManager,
  doubleChestPairKey
} from './double-chest-visual-manager';

function pair(
  left: ChestConnectionNode['position'],
  right: ChestConnectionNode['position'],
  facing: ChestConnectionNode['facing']
): DoubleChestPair {
  return {
    facing,
    left: { position: left, facing },
    right: { position: right, facing }
  };
}

describe('doubleChestPairKey', () => {
  it('is stable across argument order and normalized coordinate input', () => {
    expect(doubleChestPairKey([2, 5, -3], [1, 5, -3])).toBe(
      doubleChestPairKey([1.9, 5.8, -3.1], [2.2, 5.1, -3.9])
    );
    expect(doubleChestPairKey([2, 5, -3], [1, 5, -3])).toBe('1,5,-3|2,5,-3');
  });
});

describe('DoubleChestVisualManager', () => {
  it('upserts a DoubleChestPair and indexes the shared visual by either half', () => {
    const manager = new DoubleChestVisualManager();
    expect(manager).toBeInstanceOf(Group);
    const value = pair([1, 7, 3], [0, 7, 3], 'south');
    const visual = manager.upsert(value);
    const key = doubleChestPairKey(value.left.position, value.right.position);

    expect(manager.size).toBe(1);
    expect(manager.children).toEqual([visual]);
    expect(manager.get(0, 7, 3)).toBe(visual);
    expect(manager.get(1, 7, 3)).toBe(visual);
    expect(manager.getByKey(key)).toBe(visual);
    expect(manager.getByKey(chestKey(1, 7, 3))).toBe(visual);
    expect(manager.getPairKey(0, 7, 3)).toBe(key);
    expect(visual.facing).toBe('south');
    expect(visual.position.toArray()).toEqual([1, 7, 3.5]);
    manager.dispose();
  });

  it('accepts two positions in either order and maps all four facing axes', () => {
    const manager = new DoubleChestVisualManager();
    const north = manager.upsert([1, 2, 0], [0, 2, 0], 'north');
    const east = manager.upsert([4, 2, 1], [4, 2, 0], 'east');

    expect(north.position.toArray()).toEqual([1, 2, 0.5]);
    expect(north.facing).toBe('north');
    expect(east.position.toArray()).toEqual([4.5, 2, 1]);
    expect(east.facing).toBe('east');
    expect(manager.get(4, 2, 0)).toBe(east);
    expect(manager.get(4, 2, 1)).toBe(east);
    manager.dispose();
  });

  it('reuses the same pair, updates facing and light, and drives it from either half', () => {
    const manager = new DoubleChestVisualManager();
    const visual = manager.upsert([0, 4, 0], [1, 4, 0], 'south', {
      blockLight: 0,
      skyLight: 0,
      daylight: 0
    });
    const dispose = vi.spyOn(visual, 'dispose');
    const updated = manager.upsert([1, 4, 0], [0, 4, 0], 'north', {
      blockLight: 15,
      skyLight: 0
    });

    expect(updated).toBe(visual);
    expect(manager.size).toBe(1);
    expect(dispose).not.toHaveBeenCalled();
    expect(visual.facing).toBe('north');
    expect(visual.base.material.color.r).toBeCloseTo(1, 8);
    expect(manager.setOpen(1, 4, 0, true)).toBe(true);
    manager.update(0.25);
    expect(visual.openProgress).toBeCloseTo(0.5, 8);
    expect(manager.setLighting(0, 4, 0, {
      blockLight: 0,
      skyLight: 0,
      daylight: 0
    })).toBe(true);
    expect(visual.base.material.color.r).toBeCloseTo(0.2, 8);
    expect(manager.setOpen(9, 9, 9, true)).toBe(false);
    manager.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('removes the entire model through either half and disposes it once', () => {
    const manager = new DoubleChestVisualManager();
    const first = manager.upsert([0, 0, 0], [1, 0, 0], 'south');
    const second = manager.upsert([5, 0, 0], [6, 0, 0], 'north');
    const firstDispose = vi.spyOn(first, 'dispose');
    const secondDispose = vi.spyOn(second, 'dispose');

    expect(manager.removeChest(1, 0, 0)).toBe(true);
    expect(manager.removeChest(0, 0, 0)).toBe(false);
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(manager.get(0, 0, 0)).toBeNull();
    expect(manager.get(1, 0, 0)).toBeNull();
    expect(manager.size).toBe(1);

    manager.clear();
    expect(secondDispose).toHaveBeenCalledTimes(1);
    expect(manager.size).toBe(0);
    expect(manager.children).toHaveLength(0);
    manager.dispose();
    manager.dispose();
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).toHaveBeenCalledTimes(1);
    expect(() => manager.upsert([8, 0, 0], [9, 0, 0])).toThrow(/disposed visual manager/i);
  });

  it('rejects invalid pairs and conflicting half mappings without leaking visuals', () => {
    const manager = new DoubleChestVisualManager();
    expect(() => manager.upsert([0, 0, 0], [0, 0, 1], 'north')).toThrow(/side neighbors/i);
    expect(() => manager.upsert([0, 0, 0], [2, 0, 0], 'south')).toThrow(/side neighbors/i);
    expect(() => manager.upsert([0, 0, 0], [1, 1, 0], 'south')).toThrow(/side neighbors/i);

    manager.upsert([0, 0, 0], [1, 0, 0], 'south');
    expect(() => manager.upsert([1, 0, 0], [2, 0, 0], 'south')).toThrow(
      /already belongs to another double chest/i
    );
    expect(manager.size).toBe(1);
    expect(manager.children).toHaveLength(1);
    manager.dispose();
  });
});
