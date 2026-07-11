import { Group } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHEST_FACING } from './chest';
import { chestKey } from './chest-manager';
import { ChestVisualManager } from './chest-visual-manager';

describe('ChestVisualManager', () => {
  it('creates positioned visuals by chest key and defaults to the shared facing', () => {
    const manager = new ChestVisualManager();
    expect(manager).toBeInstanceOf(Group);

    const visual = manager.upsert(2, 7, -4);
    expect(manager.size).toBe(1);
    expect(manager.get(2, 7, -4)).toBe(visual);
    expect(manager.getByKey(chestKey(2, 7, -4))).toBe(visual);
    expect(visual.position.toArray()).toEqual([2.5, 7, -3.5]);
    expect(visual.facing).toBe(DEFAULT_CHEST_FACING);
    manager.dispose();
  });

  it('reuses repeated upserts while updating facing, canonical position, and light', () => {
    const manager = new ChestVisualManager();
    const visual = manager.upsert(3.9, 4.8, -2.7, 'north', {
      blockLight: 0,
      skyLight: 0,
      daylight: 0
    });
    const dispose = vi.spyOn(visual, 'dispose');

    const updated = manager.upsert(3.1, 4.2, -2.1, 'west', {
      blockLight: 15,
      skyLight: 0
    });

    expect(updated).toBe(visual);
    expect(manager.size).toBe(1);
    expect(manager.children).toEqual([visual]);
    expect(dispose).not.toHaveBeenCalled();
    expect(visual.facing).toBe('west');
    expect(visual.position.toArray()).toEqual([3.5, 4, -1.5]);
    expect(visual.base.material.color.r).toBeCloseTo(1, 8);
    manager.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('forwards open animation and lighting updates to an existing visual only', () => {
    const manager = new ChestVisualManager();
    const visual = manager.upsert(0, 12, 0, 'east');

    expect(manager.setOpen(8, 8, 8, true)).toBe(false);
    expect(manager.setOpen(0, 12, 0, true)).toBe(true);
    manager.update(0.25);
    expect(visual.openProgress).toBeCloseTo(0.5, 8);

    expect(manager.setLighting(8, 8, 8, {
      blockLight: 0,
      skyLight: 0
    })).toBe(false);
    expect(manager.setLighting(0, 12, 0, {
      blockLight: 0,
      skyLight: 0,
      daylight: 0
    })).toBe(true);
    expect(visual.base.material.color.r).toBeCloseTo(0.2, 8);
    manager.dispose();
  });

  it('removes, clears, and disposes visuals exactly once', () => {
    const manager = new ChestVisualManager();
    const first = manager.upsert(0, 0, 0, 'south');
    const second = manager.upsert(1, 0, 0, 'east');
    const firstDispose = vi.spyOn(first, 'dispose');
    const secondDispose = vi.spyOn(second, 'dispose');

    expect(manager.removeChest(0, 0, 0)).toBe(true);
    expect(manager.removeChest(0, 0, 0)).toBe(false);
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(manager.get(0, 0, 0)).toBeNull();

    manager.clear();
    expect(secondDispose).toHaveBeenCalledTimes(1);
    expect(manager.size).toBe(0);
    expect(manager.children).toHaveLength(0);

    manager.dispose();
    manager.dispose();
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).toHaveBeenCalledTimes(1);
    expect(() => manager.upsert(2, 0, 0)).toThrow(/disposed visual manager/i);
  });
});
