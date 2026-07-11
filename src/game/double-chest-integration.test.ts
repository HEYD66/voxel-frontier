import { describe, expect, it } from 'vitest';
import { CraftingGrid } from './crafting';
import {
  ChestManager,
  chestKey,
  type DoubleChestContainer
} from './chest-manager';
import { DOUBLE_CHEST_OPEN_DURATION } from './double-chest-visual';
import { DoubleChestVisualManager } from './double-chest-visual-manager';
import { InventoryActions } from './inventory-actions';
import { ItemInventory } from './survival';
import { BlockId } from './types';

function requireDouble(
  manager: ChestManager,
  x: number,
  y: number,
  z: number
): DoubleChestContainer {
  const resolved = manager.resolveContainer(x, y, z);
  if (!resolved?.isDouble) throw new Error('Expected a double chest.');
  return resolved;
}

function place(
  manager: ChestManager,
  x: number,
  y: number,
  z: number,
  facing: 'north' | 'south' | 'east' | 'west'
): boolean {
  if (!manager.canPlace(x, y, z, facing)) return false;
  manager.getOrCreate(x, y, z, facing);
  return true;
}

function createNorthDouble(): {
  manager: ChestManager;
  container: DoubleChestContainer;
} {
  const manager = new ChestManager();
  expect(place(manager, 0, 5, 0, 'north')).toBe(true);
  expect(place(manager, 1, 5, 0, 'north')).toBe(true);
  return { manager, container: requireDouble(manager, 0, 5, 0) };
}

describe('double chest cross-module integration', () => {
  it('resolves either half to the same 54-slot order and one synchronized visual', () => {
    const { manager, container } = createNorthDouble();
    container.left.inventory.setSlot(0, { item: BlockId.Wood, count: 2 });
    container.left.inventory.setSlot(26, { item: BlockId.Planks, count: 3 });
    container.right.inventory.setSlot(0, { item: BlockId.Dirt, count: 4 });
    container.right.inventory.setSlot(26, { item: BlockId.Stone, count: 5 });

    const throughLeft = requireDouble(manager, ...container.left.position);
    const throughRight = requireDouble(manager, ...container.right.position);
    expect(throughLeft.keys).toEqual(throughRight.keys);
    expect(throughLeft.positions).toEqual(throughRight.positions);
    expect(throughLeft.selected.key).toBe(container.left.key);
    expect(throughRight.selected.key).toBe(container.right.key);
    expect(throughLeft.inventory.getSlot(0)).toEqual({ item: BlockId.Wood, count: 2 });
    expect(throughLeft.inventory.getSlot(26)).toEqual({ item: BlockId.Planks, count: 3 });
    expect(throughLeft.inventory.getSlot(27)).toEqual({ item: BlockId.Dirt, count: 4 });
    expect(throughLeft.inventory.getSlot(53)).toEqual({ item: BlockId.Stone, count: 5 });
    expect(throughRight.inventory.getSlots()).toEqual(throughLeft.inventory.getSlots());

    const visuals = new DoubleChestVisualManager();
    try {
      const visual = visuals.upsert(throughLeft);
      expect(visuals.get(...throughLeft.left.position)).toBe(visual);
      expect(visuals.get(...throughLeft.right.position)).toBe(visual);
      expect(visuals.getByKey(throughLeft.left.key)).toBe(visual);
      expect(visuals.getByKey(throughLeft.right.key)).toBe(visual);

      expect(visuals.setOpen(...throughLeft.left.position, true)).toBe(true);
      visuals.update(DOUBLE_CHEST_OPEN_DURATION);
      expect(visual.openProgress).toBe(1);
      expect(visuals.get(...throughLeft.right.position)?.openProgress).toBe(1);

      expect(visuals.setOpen(...throughLeft.right.position, false)).toBe(true);
      visuals.update(DOUBLE_CHEST_OPEN_DURATION);
      expect(visual.openProgress).toBe(0);
      expect(visuals.get(...throughLeft.left.position)?.openProgress).toBe(0);
    } finally {
      visuals.dispose();
    }
  });

  it('routes primary and secondary clicks across the left/right slot boundary', () => {
    const { container } = createNorthDouble();
    container.left.inventory.setSlot(0, { item: BlockId.Dirt, count: 9 });
    const actions = new InventoryActions(new ItemInventory(36), new CraftingGrid());
    actions.setChest(container.inventory);

    expect(actions.click('chest', 0, 'secondary')).toEqual({
      changed: true,
      cursor: { item: BlockId.Dirt, count: 5 }
    });
    expect(container.left.inventory.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 4 });

    expect(actions.click('chest', 27, 'secondary').cursor).toEqual({
      item: BlockId.Dirt,
      count: 4
    });
    expect(container.right.inventory.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 1 });

    expect(actions.click('chest', 0, 'primary').cursor).toBeNull();
    expect(container.left.inventory.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 8 });
    expect(container.right.inventory.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 1 });
  });

  it('shift-moves from both halves and fills the right half after the left is full', () => {
    const { container } = createNorthDouble();
    container.left.inventory.setSlot(3, { item: BlockId.Wood, count: 7 });
    container.right.inventory.setSlot(4, { item: BlockId.Planks, count: 8 });
    const player = new ItemInventory(36);
    const actions = new InventoryActions(player, new CraftingGrid());
    actions.setChest(container.inventory);

    expect(actions.click('chest', 3, 'primary', true).changed).toBe(true);
    expect(actions.click('chest', 31, 'primary', true).changed).toBe(true);
    expect(container.left.inventory.getSlot(3)).toBeNull();
    expect(container.right.inventory.getSlot(4)).toBeNull();
    expect(player.getSlot(0)).toEqual({ item: BlockId.Wood, count: 7 });
    expect(player.getSlot(1)).toEqual({ item: BlockId.Planks, count: 8 });

    for (let index = 0; index < container.left.inventory.size; index += 1) {
      container.left.inventory.setSlot(index, { item: BlockId.Dirt, count: 64 });
    }
    player.setSlot(5, { item: BlockId.Stone, count: 6 });
    expect(actions.click('hotbar', 5, 'primary', true).changed).toBe(true);
    expect(player.getSlot(5)).toBeNull();
    expect(container.right.inventory.getSlot(0)).toEqual({ item: BlockId.Stone, count: 6 });
  });

  it('double-clicks through the right half and collects matching stacks from both halves', () => {
    const { container } = createNorthDouble();
    container.left.inventory.setSlot(10, { item: BlockId.Dirt, count: 10 });
    container.right.inventory.setSlot(20, { item: BlockId.Dirt, count: 20 });
    const player = new ItemInventory(36, [{ item: BlockId.Dirt, count: 5 }]);
    const actions = new InventoryActions(player, new CraftingGrid());
    actions.setChest(container.inventory);

    expect(actions.doubleClick('chest', 47)).toEqual({
      changed: true,
      cursor: { item: BlockId.Dirt, count: 35 }
    });
    expect(container.left.inventory.getSlot(10)).toBeNull();
    expect(container.right.inventory.getSlot(20)).toBeNull();
    expect(player.getSlot(0)).toBeNull();
  });

  it('preserves facing, left/right order and all boundary slots through save reload', () => {
    const source = new ChestManager();
    expect(place(source, 4, 9, 4, 'east')).toBe(true);
    expect(place(source, 4, 9, 5, 'east')).toBe(true);
    const before = requireDouble(source, 4, 9, 4);
    before.left.inventory.setSlot(0, { item: BlockId.Wood, count: 11 });
    before.left.inventory.setSlot(26, { item: BlockId.Planks, count: 12 });
    before.right.inventory.setSlot(0, { item: BlockId.Dirt, count: 13 });
    before.right.inventory.setSlot(26, { item: BlockId.Stone, count: 14 });

    const restored = new ChestManager();
    restored.load(source.serialize().reverse(), () => true);
    const fromNorth = requireDouble(restored, 4, 9, 4);
    const fromSouth = requireDouble(restored, 4, 9, 5);

    expect(fromNorth.facing).toBe('east');
    expect(fromNorth.keys).toEqual(before.keys);
    expect(fromSouth.keys).toEqual(before.keys);
    expect(fromNorth.positions).toEqual(before.positions);
    expect(fromNorth.inventory.getSlot(0)).toEqual({ item: BlockId.Wood, count: 11 });
    expect(fromNorth.inventory.getSlot(26)).toEqual({ item: BlockId.Planks, count: 12 });
    expect(fromNorth.inventory.getSlot(27)).toEqual({ item: BlockId.Dirt, count: 13 });
    expect(fromNorth.inventory.getSlot(53)).toEqual({ item: BlockId.Stone, count: 14 });
    expect(fromSouth.inventory.getSlots()).toEqual(fromNorth.inventory.getSlots());
  });

  it.each(['left', 'right'] as const)(
    'removing the %s half clears only it and leaves a stable single chest',
    (removedSide) => {
      const { manager, container } = createNorthDouble();
      container.left.inventory.setSlot(0, { item: BlockId.Wood, count: 5 });
      container.right.inventory.setSlot(0, { item: BlockId.Stone, count: 8 });
      const removed = container[removedSide];
      const surviving = removedSide === 'left' ? container.right : container.left;
      const expectedDrop = removedSide === 'left'
        ? { item: BlockId.Wood, count: 5 }
        : { item: BlockId.Stone, count: 8 };
      const expectedSurvivor = removedSide === 'left'
        ? { item: BlockId.Stone, count: 8 }
        : { item: BlockId.Wood, count: 5 };

      expect(manager.remove(...removed.position)).toEqual([expectedDrop]);
      expect(removed.inventory.getSlots().every((slot) => slot === null)).toBe(true);
      expect(surviving.inventory.getSlot(0)).toEqual(expectedSurvivor);
      expect(manager.get(...surviving.position)).toBe(surviving.inventory);
      expect(manager.getFacing(...surviving.position)).toBe('north');

      const single = manager.resolveContainer(...surviving.position);
      expect(single?.isDouble).toBe(false);
      expect(single?.inventory).toBe(surviving.inventory);
      expect(single?.keys).toEqual([surviving.key]);
      expect(manager.resolveContainer(...removed.position)).toBeNull();
      expect(manager.size).toBe(1);
    }
  );

  it('rejects bridge and triple placements without mutating manager state', () => {
    const bridge = new ChestManager();
    expect(place(bridge, -1, 5, 0, 'north')).toBe(true);
    expect(place(bridge, 1, 5, 0, 'north')).toBe(true);
    const bridgeState = bridge.serialize();
    expect(bridge.validatePlacement(0, 5, 0, 'north')).toMatchObject({
      allowed: false,
      reason: 'would-bridge-chests'
    });
    expect(place(bridge, 0, 5, 0, 'north')).toBe(false);
    expect(bridge.serialize()).toEqual(bridgeState);
    expect(bridge.size).toBe(2);
    expect(bridge.get(0, 5, 0)).toBeNull();

    const triple = new ChestManager();
    expect(place(triple, 0, 5, 0, 'north')).toBe(true);
    expect(place(triple, 1, 5, 0, 'north')).toBe(true);
    const tripleState = triple.serialize();
    expect(triple.validatePlacement(2, 5, 0, 'north')).toMatchObject({
      allowed: false,
      reason: 'adjacent-to-double-chest'
    });
    expect(place(triple, 2, 5, 0, 'north')).toBe(false);
    expect(triple.serialize()).toEqual(tripleState);
    expect(triple.size).toBe(2);
    expect(triple.get(2, 5, 0)).toBeNull();
    expect(requireDouble(triple, 0, 5, 0).keys).toEqual([
      chestKey(1, 5, 0),
      chestKey(0, 5, 0)
    ]);
  });
});
