import { describe, expect, it } from 'vitest';
import { CraftingGrid } from './crafting';
import { FurnaceStateMachine } from './furnace';
import { ArmorEquipment } from './equipment';
import { ChestInventory } from './chest';
import { CombinedChestInventory } from './double-chest';
import { InventoryActions } from './inventory-actions';
import {
  ARMOR_ITEM_IDS,
  ItemInventory,
  TOOL_DEFINITIONS,
  TOOL_ITEM_IDS
} from './survival';
import { BlockId } from './types';

describe('InventoryActions', () => {
  it('picks up, splits, places, and merges ordinary stacks', () => {
    const inventory = new ItemInventory(36, [{ item: BlockId.Dirt, count: 9 }]);
    const actions = new InventoryActions(inventory, new CraftingGrid());

    actions.click('hotbar', 0, 'secondary');
    expect(actions.cursor?.count).toBe(5);
    expect(inventory.getSlot(0)?.count).toBe(4);
    actions.click('hotbar', 1, 'secondary');
    expect(inventory.getSlot(1)?.count).toBe(1);
    actions.click('hotbar', 0, 'primary');
    expect(inventory.getSlot(0)?.count).toBe(8);
    expect(actions.cursor).toBeNull();
  });

  it('shift-moves hotbar stacks into the main inventory range', () => {
    const inventory = new ItemInventory(36, [{ item: BlockId.Stone, count: 32 }]);
    const actions = new InventoryActions(inventory, new CraftingGrid());
    actions.click('hotbar', 0, 'primary', true);

    expect(inventory.getSlot(0)).toBeNull();
    expect(inventory.getSlot(9)).toEqual({ item: BlockId.Stone, count: 32 });
  });

  it('equips matching armor by shift-click and supports cursor swaps', () => {
    const inventory = new ItemInventory(36, [
      { item: ARMOR_ITEM_IDS.ironChestplate, count: 1 },
      { item: ARMOR_ITEM_IDS.ironHelmet, count: 1 }
    ]);
    const equipment = new ArmorEquipment();
    const actions = new InventoryActions(inventory, new CraftingGrid(), equipment);

    expect(actions.click('hotbar', 0, 'primary', true).changed).toBe(true);
    expect(inventory.getSlot(0)).toBeNull();
    expect(equipment.getSlot(1)?.item).toBe(ARMOR_ITEM_IDS.ironChestplate);

    actions.click('hotbar', 1, 'primary');
    expect(actions.click('armor', 1, 'primary').changed).toBe(false);
    expect(actions.click('armor', 0, 'primary').changed).toBe(true);
    expect(equipment.getSlot(0)?.item).toBe(ARMOR_ITEM_IDS.ironHelmet);
    expect(actions.cursor).toBeNull();

    expect(actions.click('armor', 1, 'primary', true).changed).toBe(true);
    expect(equipment.getSlot(1)).toBeNull();
    expect(inventory.getSnapshot().slots.some(
      (stack) => stack?.item === ARMOR_ITEM_IDS.ironChestplate
    )).toBe(true);
  });

  it('does not consume a hotbar stack when a compact inventory has no main range', () => {
    const inventory = new ItemInventory(1, [{ item: BlockId.Stone, count: 32 }]);
    const actions = new InventoryActions(inventory, new CraftingGrid());

    expect(actions.click('hotbar', 0, 'primary', true)).toEqual({
      changed: false,
      cursor: null
    });
    expect(inventory.getSlot(0)).toEqual({ item: BlockId.Stone, count: 32 });
  });

  it('switches between player and crafting-table grids without losing the cursor', () => {
    const inventory = new ItemInventory(36);
    const playerGrid = new CraftingGrid();
    const tableGrid = new CraftingGrid(3);
    playerGrid.setSlot(0, { item: BlockId.Stone, count: 1 });
    tableGrid.setSlot(0, { item: BlockId.Dirt, count: 1 });
    const actions = new InventoryActions(inventory, playerGrid);

    actions.setCraftingGrid(tableGrid);
    actions.click('crafting', 0, 'primary');

    expect(actions.cursor).toEqual({ item: BlockId.Dirt, count: 1 });
    expect(tableGrid.getSlot(0)).toBeNull();
    expect(playerGrid.getSlot(0)).toEqual({ item: BlockId.Stone, count: 1 });
  });

  it('takes a crafting result onto an empty cursor even when inventory is full', () => {
    const inventory = new ItemInventory(1, [{ item: BlockId.Stone, count: 64 }]);
    const grid = new CraftingGrid();
    grid.setSlot(0, { item: BlockId.Wood, count: 1 });
    const actions = new InventoryActions(inventory, grid);

    expect(actions.click('craft-output', 0, 'primary')).toEqual({
      changed: true,
      cursor: { item: BlockId.Planks, count: 4 }
    });
    expect(inventory.getSlot(0)).toEqual({ item: BlockId.Stone, count: 64 });
    expect(grid.getSlot(0)).toBeNull();
  });

  it('merges a full recipe batch onto a compatible cursor or consumes nothing', () => {
    const grid = new CraftingGrid();
    grid.setSlot(0, { item: BlockId.Wood, count: 2 });
    const actions = new InventoryActions(new ItemInventory(1), grid);
    actions.setCursor({ item: BlockId.Planks, count: 60 });

    expect(actions.takeCraftOutput()).toEqual({
      changed: true,
      cursor: { item: BlockId.Planks, count: 64 }
    });
    expect(grid.getSlot(0)).toEqual({ item: BlockId.Wood, count: 1 });

    expect(actions.takeCraftOutput()).toEqual({
      changed: false,
      cursor: { item: BlockId.Planks, count: 64 }
    });
    expect(grid.getSlot(0)).toEqual({ item: BlockId.Wood, count: 1 });

    actions.setCursor({ item: BlockId.Dirt, count: 1 });
    expect(actions.takeCraftOutput().changed).toBe(false);
    expect(actions.cursor).toEqual({ item: BlockId.Dirt, count: 1 });
    expect(grid.getSlot(0)).toEqual({ item: BlockId.Wood, count: 1 });
  });

  it('puts crafted tools on the cursor with full durability', () => {
    const grid = new CraftingGrid(3);
    for (const slot of [0, 1, 2]) {
      grid.setSlot(slot, { item: BlockId.Planks, count: 1 });
    }
    for (const slot of [4, 7]) grid.setSlot(slot, { item: 'stick', count: 1 });
    const actions = new InventoryActions(new ItemInventory(1), grid);

    expect(actions.takeCraftOutput()).toEqual({
      changed: true,
      cursor: {
        item: TOOL_ITEM_IDS.woodenPickaxe,
        count: 1,
        durability: TOOL_DEFINITIONS[TOOL_ITEM_IDS.woodenPickaxe].maxDurability
      }
    });
    expect(grid.getSlots().every((stack) => stack === null)).toBe(true);
  });

  it('does not consume a tool recipe while the cursor already holds a tool', () => {
    const grid = new CraftingGrid(3);
    for (const slot of [0, 1, 2]) {
      grid.setSlot(slot, { item: BlockId.Planks, count: 1 });
    }
    for (const slot of [4, 7]) grid.setSlot(slot, { item: 'stick', count: 1 });
    const actions = new InventoryActions(new ItemInventory(1), grid);
    const durability = TOOL_DEFINITIONS[TOOL_ITEM_IDS.woodenPickaxe].maxDurability;
    actions.setCursor({ item: TOOL_ITEM_IDS.woodenPickaxe, count: 1, durability });

    expect(actions.takeCraftOutput()).toEqual({
      changed: false,
      cursor: { item: TOOL_ITEM_IDS.woodenPickaxe, count: 1, durability }
    });
    expect(grid.getSlots().filter((stack) => stack !== null)).toHaveLength(5);
  });

  it('leaves shift-click output for the inventory crafting path', () => {
    const grid = new CraftingGrid();
    grid.setSlot(0, { item: BlockId.Wood, count: 1 });
    const actions = new InventoryActions(new ItemInventory(1), grid);

    expect(actions.click('craft-output', 0, 'primary', true)).toEqual({
      changed: false,
      cursor: null
    });
    expect(grid.getSlot(0)).toEqual({ item: BlockId.Wood, count: 1 });
  });

  it('rejects invalid slot indices without dropping the cursor stack', () => {
    const inventory = new ItemInventory(36);
    const grid = new CraftingGrid();
    const actions = new InventoryActions(inventory, grid);
    actions.setCursor({ item: BlockId.Dirt, count: 5 });

    for (const [area, index] of [
      ['hotbar', -1],
      ['hotbar', 9],
      ['main', 27],
      ['main', 0.5],
      ['crafting', 4],
      ['crafting', Number.NaN],
      ['craft-output', 1]
    ] as const) {
      expect(actions.click(area, index, 'primary')).toEqual({
        changed: false,
        cursor: { item: BlockId.Dirt, count: 5 }
      });
    }

    expect(inventory.getSnapshot().slots.every((stack) => stack === null)).toBe(true);
    expect(grid.getSlots().every((stack) => stack === null)).toBe(true);
  });

  it('returns cursor and active crafting items without losing overflow', () => {
    const inventory = new ItemInventory(1, [{ item: BlockId.Planks, count: 63 }]);
    const grid = new CraftingGrid();
    grid.setSlot(0, { item: BlockId.Wood, count: 1 });
    const actions = new InventoryActions(inventory, grid);
    actions.setCursor({ item: BlockId.Planks, count: 2 });

    expect(actions.returnCursorAndCrafting()).toEqual([
      { item: BlockId.Planks, count: 1 },
      { item: BlockId.Wood, count: 1 }
    ]);
    expect(actions.cursor).toBeNull();
    expect(grid.getSlots()).toEqual([null, null, null, null]);
    expect(inventory.getSlot(0)).toEqual({ item: BlockId.Planks, count: 64 });
  });

  it('routes shift-clicked smeltables and fuel into the active furnace', () => {
    const inventory = new ItemInventory(36, [
      { item: 'raw_iron', count: 5 },
      { item: 'coal', count: 2 }
    ]);
    const furnace = new FurnaceStateMachine();
    const actions = new InventoryActions(inventory, new CraftingGrid());
    actions.setFurnace(furnace);

    expect(actions.click('hotbar', 0, 'primary', true).changed).toBe(true);
    expect(actions.click('hotbar', 1, 'primary', true).changed).toBe(true);
    expect(furnace.getSlot('input')).toEqual({ item: 'raw_iron', count: 5 });
    expect(furnace.getSlot('fuel')).toEqual({ item: 'coal', count: 2 });
    expect(inventory.getSlot(0)).toBeNull();
    expect(inventory.getSlot(1)).toBeNull();
  });

  it('shift-moves only the amount that the furnace or inventory can accept', () => {
    const inventory = new ItemInventory(36, [
      { item: 'raw_iron', count: 5 },
      { item: 'iron_ingot', count: 62 },
      ...Array.from({ length: 34 }, () => ({ item: BlockId.Dirt, count: 64 } as const))
    ]);
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('input', { item: 'raw_iron', count: 63 });
    furnace.setSlot('output', { item: 'iron_ingot', count: 5 });
    const actions = new InventoryActions(inventory, new CraftingGrid());
    actions.setFurnace(furnace);

    expect(actions.click('hotbar', 0, 'primary', true).changed).toBe(true);
    expect(furnace.getSlot('input')).toEqual({ item: 'raw_iron', count: 64 });
    expect(inventory.getSlot(0)).toEqual({ item: 'raw_iron', count: 4 });

    expect(actions.click('furnace-output', 0, 'primary', true).changed).toBe(true);
    expect(inventory.getSlot(1)).toEqual({ item: 'iron_ingot', count: 64 });
    expect(furnace.getSlot('output')).toEqual({ item: 'iron_ingot', count: 3 });

    expect(actions.click('furnace-output', 0, 'primary', true).changed).toBe(false);
    expect(furnace.getSlot('output')).toEqual({ item: 'iron_ingot', count: 3 });
  });

  it('supports primary and secondary furnace clicks without inserting into output', () => {
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('input', { item: 'raw_iron', count: 5 });
    furnace.setSlot('fuel', { item: 'coal', count: 4 });
    furnace.setSlot('output', { item: 'iron_ingot', count: 5 });
    const actions = new InventoryActions(new ItemInventory(1), new CraftingGrid());
    actions.setFurnace(furnace);

    expect(actions.click('furnace-input', 0, 'secondary').cursor).toEqual({
      item: 'raw_iron',
      count: 3
    });
    expect(furnace.getSlot('input')).toEqual({ item: 'raw_iron', count: 2 });
    expect(actions.click('furnace-input', 0, 'secondary').cursor).toEqual({
      item: 'raw_iron',
      count: 2
    });
    expect(furnace.getSlot('input')).toEqual({ item: 'raw_iron', count: 3 });
    expect(actions.click('furnace-input', 0, 'primary').cursor).toBeNull();
    expect(furnace.getSlot('input')).toEqual({ item: 'raw_iron', count: 5 });

    actions.setCursor({ item: BlockId.Dirt, count: 1 });
    expect(actions.click('furnace-output', 0, 'primary').changed).toBe(false);
    expect(actions.cursor).toEqual({ item: BlockId.Dirt, count: 1 });
    expect(furnace.getSlot('output')).toEqual({ item: 'iron_ingot', count: 5 });

    actions.setCursor(null);
    expect(actions.click('furnace-output', 0, 'secondary').cursor).toEqual({
      item: 'iron_ingot',
      count: 3
    });
    expect(furnace.getSlot('output')).toEqual({ item: 'iron_ingot', count: 2 });
    expect(furnace.getSlot('fuel')).toEqual({ item: 'coal', count: 4 });
  });

  it('takes furnace output atomically without exceeding cursor capacity', () => {
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('output', { item: 'iron_ingot', count: 3 });
    const actions = new InventoryActions(new ItemInventory(1), new CraftingGrid());
    actions.setFurnace(furnace);
    actions.setCursor({ item: 'iron_ingot', count: 63 });

    expect(actions.click('furnace-output', 0, 'primary')).toEqual({
      changed: true,
      cursor: { item: 'iron_ingot', count: 64 }
    });
    expect(furnace.getSlot('output')).toEqual({ item: 'iron_ingot', count: 2 });

    expect(actions.click('furnace-output', 0, 'primary').changed).toBe(false);
    expect(furnace.getSlot('output')).toEqual({ item: 'iron_ingot', count: 2 });
  });

  it('keeps furnace output when shift-click has no inventory capacity', () => {
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('output', { item: 'iron_ingot', count: 2 });
    const inventory = new ItemInventory(1, [{ item: BlockId.Stone, count: 64 }]);
    const actions = new InventoryActions(inventory, new CraftingGrid());
    actions.setFurnace(furnace);

    expect(actions.click('furnace-output', 0, 'primary', true).changed).toBe(false);
    expect(furnace.getSlot('output')).toEqual({ item: 'iron_ingot', count: 2 });
    expect(inventory.getSlot(0)).toEqual({ item: BlockId.Stone, count: 64 });
  });

  it('returns only the cursor when closing a furnace container', () => {
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('input', { item: 'raw_iron', count: 2 });
    furnace.setSlot('fuel', { item: 'coal', count: 1 });
    const inventory = new ItemInventory(2);
    const actions = new InventoryActions(inventory, new CraftingGrid());
    actions.setFurnace(furnace);
    actions.setCursor({ item: BlockId.Dirt, count: 3 });

    expect(actions.returnCursor()).toEqual([]);
    expect(actions.cursor).toBeNull();
    expect(inventory.count(BlockId.Dirt)).toBe(3);
    expect(furnace.getSlot('input')).toEqual({ item: 'raw_iron', count: 2 });
    expect(furnace.getSlot('fuel')).toEqual({ item: 'coal', count: 1 });
  });

  it('returns cursor overflow for dropping when a furnace is closed with a full inventory', () => {
    const furnace = new FurnaceStateMachine();
    furnace.setSlot('input', { item: 'raw_iron', count: 2 });
    furnace.setSlot('fuel', { item: 'coal', count: 1 });
    furnace.setSlot('output', { item: 'iron_ingot', count: 3 });
    const inventory = new ItemInventory(1, [{ item: BlockId.Stone, count: 64 }]);
    const actions = new InventoryActions(inventory, new CraftingGrid());
    actions.setFurnace(furnace);
    actions.setCursor({ item: BlockId.Dirt, count: 3 });

    expect(actions.returnCursor()).toEqual([{ item: BlockId.Dirt, count: 3 }]);
    expect(actions.cursor).toBeNull();
    expect(inventory.getSlot(0)).toEqual({ item: BlockId.Stone, count: 64 });
    expect(furnace.getSlot('input')).toEqual({ item: 'raw_iron', count: 2 });
    expect(furnace.getSlot('fuel')).toEqual({ item: 'coal', count: 1 });
    expect(furnace.getSlot('output')).toEqual({ item: 'iron_ingot', count: 3 });
  });

  it('supports primary and secondary clicks in the active chest', () => {
    const chest = new ChestInventory();
    chest.setSlot(0, { item: BlockId.Dirt, count: 9 });
    const actions = new InventoryActions(new ItemInventory(36), new CraftingGrid());
    actions.setChest(chest);

    expect(actions.click('chest', 0, 'secondary')).toEqual({
      changed: true,
      cursor: { item: BlockId.Dirt, count: 5 }
    });
    expect(chest.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 4 });

    expect(actions.click('chest', 1, 'secondary').cursor).toEqual({
      item: BlockId.Dirt,
      count: 4
    });
    expect(chest.getSlot(1)).toEqual({ item: BlockId.Dirt, count: 1 });

    expect(actions.click('chest', 0, 'primary').cursor).toBeNull();
    expect(chest.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 8 });
    expect(actions.click('chest', 27, 'primary').changed).toBe(false);
  });

  it('uses all 54 slots of a structurally compatible combined chest', () => {
    const left = new ChestInventory();
    const right = new ChestInventory();
    const chest = new CombinedChestInventory(left, right);
    right.setSlot(26, { item: BlockId.Dirt, count: 9 });
    const actions = new InventoryActions(new ItemInventory(36), new CraftingGrid());
    actions.setChest(chest);

    expect(actions.click('chest', 53, 'secondary')).toEqual({
      changed: true,
      cursor: { item: BlockId.Dirt, count: 5 }
    });
    expect(right.getSlot(26)).toEqual({ item: BlockId.Dirt, count: 4 });

    expect(actions.click('chest', 27, 'secondary').cursor).toEqual({
      item: BlockId.Dirt,
      count: 4
    });
    expect(right.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 1 });

    expect(actions.click('chest', 53, 'primary').cursor).toBeNull();
    expect(right.getSlot(26)).toEqual({ item: BlockId.Dirt, count: 8 });
    expect(actions.click('chest', 54, 'primary').changed).toBe(false);
  });

  it('double-click collects matching stacks across both combined chest halves', () => {
    const inventory = new ItemInventory(36, [{ item: BlockId.Dirt, count: 5 }]);
    const left = new ChestInventory();
    const right = new ChestInventory();
    left.setSlot(0, { item: BlockId.Dirt, count: 10 });
    right.setSlot(0, { item: BlockId.Dirt, count: 20 });
    const actions = new InventoryActions(inventory, new CraftingGrid());
    actions.setChest(new CombinedChestInventory(left, right));

    expect(actions.doubleClick('chest', 0)).toEqual({
      changed: true,
      cursor: { item: BlockId.Dirt, count: 35 }
    });
    expect(left.getSlot(0)).toBeNull();
    expect(right.getSlot(0)).toBeNull();
    expect(inventory.getSlot(0)).toBeNull();
  });

  it('shift-moves both directions and gives an open chest routing priority', () => {
    const inventory = new ItemInventory(36, [
      { item: ARMOR_ITEM_IDS.ironHelmet, count: 1 },
      { item: 'raw_iron', count: 5 },
      { item: BlockId.Stone, count: 12 }
    ]);
    const chest = new ChestInventory();
    chest.setSlot(5, { item: BlockId.Wood, count: 7 });
    const equipment = new ArmorEquipment();
    const furnace = new FurnaceStateMachine();
    const actions = new InventoryActions(inventory, new CraftingGrid(), equipment);
    actions.setFurnace(furnace);
    actions.setChest(chest);

    expect(actions.click('hotbar', 0, 'primary', true).changed).toBe(true);
    expect(actions.click('hotbar', 1, 'primary', true).changed).toBe(true);
    expect(actions.click('hotbar', 2, 'primary', true).changed).toBe(true);
    expect(chest.getSlot(0)?.item).toBe(ARMOR_ITEM_IDS.ironHelmet);
    expect(chest.getSlot(1)).toEqual({ item: 'raw_iron', count: 5 });
    expect(chest.getSlot(2)).toEqual({ item: BlockId.Stone, count: 12 });
    expect(equipment.getSlot(0)).toBeNull();
    expect(furnace.getSlot('input')).toBeNull();
    expect(inventory.getSlot(9)).toBeNull();

    expect(actions.click('chest', 5, 'primary', true).changed).toBe(true);
    expect(chest.getSlot(5)).toBeNull();
    expect(inventory.getSlot(0)).toEqual({ item: BlockId.Wood, count: 7 });
  });

  it('keeps full transfers unchanged and commits only the amount that fits', () => {
    const fullInventory = new ItemInventory(
      36,
      Array.from({ length: 36 }, () => ({ item: BlockId.Dirt, count: 64 } as const))
    );
    const sourceChest = new ChestInventory();
    sourceChest.setSlot(0, { item: BlockId.Stone, count: 5 });
    const fullActions = new InventoryActions(fullInventory, new CraftingGrid());
    fullActions.setChest(sourceChest);

    expect(fullActions.click('chest', 0, 'primary', true).changed).toBe(false);
    expect(sourceChest.getSlot(0)).toEqual({ item: BlockId.Stone, count: 5 });

    fullInventory.setSlot(10, { item: BlockId.Stone, count: 63 });
    expect(fullActions.click('chest', 0, 'primary', true).changed).toBe(true);
    expect(fullInventory.getSlot(10)).toEqual({ item: BlockId.Stone, count: 64 });
    expect(sourceChest.getSlot(0)).toEqual({ item: BlockId.Stone, count: 4 });

    const fullChest = new ChestInventory({
      version: 1,
      slots: Array.from({ length: 27 }, () => ({ item: BlockId.Dirt, count: 64 } as const))
    });
    const player = new ItemInventory(36, [{ item: BlockId.Stone, count: 5 }]);
    const chestActions = new InventoryActions(player, new CraftingGrid());
    chestActions.setChest(fullChest);

    expect(chestActions.click('hotbar', 0, 'primary', true).changed).toBe(false);
    expect(player.getSlot(0)).toEqual({ item: BlockId.Stone, count: 5 });
    expect(player.getSlot(9)).toBeNull();

    fullChest.setSlot(10, { item: BlockId.Stone, count: 63 });
    expect(chestActions.click('hotbar', 0, 'primary', true).changed).toBe(true);
    expect(fullChest.getSlot(10)).toEqual({ item: BlockId.Stone, count: 64 });
    expect(player.getSlot(0)).toEqual({ item: BlockId.Stone, count: 4 });
  });

  it('switches and closes active chests without mutating the previous container', () => {
    const inventory = new ItemInventory(36, [
      { item: BlockId.Dirt, count: 2 },
      { item: BlockId.Stone, count: 3 },
      { item: BlockId.Wood, count: 4 }
    ]);
    const first = new ChestInventory();
    const second = new ChestInventory();
    const actions = new InventoryActions(inventory, new CraftingGrid());

    actions.setChest(first);
    actions.click('hotbar', 0, 'primary', true);
    actions.setChest(second);
    actions.click('hotbar', 1, 'primary', true);
    actions.setChest(null);

    expect(first.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 2 });
    expect(second.getSlot(0)).toEqual({ item: BlockId.Stone, count: 3 });
    expect(actions.click('chest', 0, 'primary')).toEqual({ changed: false, cursor: null });
    expect(actions.click('hotbar', 2, 'primary', true).changed).toBe(true);
    expect(inventory.getSlot(9)).toEqual({ item: BlockId.Wood, count: 4 });
  });

  it('double-click collects matching chest then player stacks up to the limit', () => {
    const inventory = new ItemInventory(36, [
      { item: BlockId.Dirt, count: 10 },
      { item: BlockId.Stone, count: 1 },
      { item: BlockId.Dirt, count: 20 }
    ]);
    const chest = new ChestInventory();
    chest.setSlot(0, { item: BlockId.Dirt, count: 40 });
    const actions = new InventoryActions(inventory, new CraftingGrid());
    actions.setChest(chest);

    expect(actions.doubleClick('chest', 0)).toEqual({
      changed: true,
      cursor: { item: BlockId.Dirt, count: 64 }
    });
    expect(inventory.getSlot(0)).toBeNull();
    expect(inventory.getSlot(2)).toEqual({ item: BlockId.Dirt, count: 6 });
    expect(chest.getSlot(0)).toBeNull();
    expect(inventory.getSlot(1)).toEqual({ item: BlockId.Stone, count: 1 });

    expect(actions.doubleClick('hotbar', 1).changed).toBe(false);
    expect(actions.doubleClick('chest', 27).changed).toBe(false);
    expect(chest.getSlot(0)).toBeNull();
  });

  it('supports the UI first-click then double-click collection sequence', () => {
    const inventory = new ItemInventory(36, [
      { item: BlockId.Dirt, count: 10 },
      { item: BlockId.Dirt, count: 20 }
    ]);
    const chest = new ChestInventory();
    chest.setSlot(0, { item: BlockId.Dirt, count: 40 });
    const actions = new InventoryActions(inventory, new CraftingGrid());
    actions.setChest(chest);

    expect(actions.click('chest', 0, 'primary')).toEqual({
      changed: true,
      cursor: { item: BlockId.Dirt, count: 40 }
    });
    expect(actions.doubleClick('chest', 0)).toEqual({
      changed: true,
      cursor: { item: BlockId.Dirt, count: 64 }
    });
    expect(chest.getSlot(0)).toBeNull();
    expect(inventory.getSlot(0)).toBeNull();
    expect(inventory.getSlot(1)).toEqual({ item: BlockId.Dirt, count: 6 });
  });

  it('double-click fills an existing cursor in slot order without touching later stacks', () => {
    const inventory = new ItemInventory(36, [
      { item: BlockId.Planks, count: 2 },
      { item: BlockId.Planks, count: 4 }
    ]);
    const chest = new ChestInventory();
    chest.setSlot(0, { item: BlockId.Planks, count: 8 });
    const actions = new InventoryActions(inventory, new CraftingGrid());
    actions.setChest(chest);
    actions.setCursor({ item: BlockId.Planks, count: 60 });

    expect(actions.doubleClick('chest', 0)).toEqual({
      changed: true,
      cursor: { item: BlockId.Planks, count: 64 }
    });
    expect(inventory.getSlot(0)).toEqual({ item: BlockId.Planks, count: 2 });
    expect(inventory.getSlot(1)).toEqual({ item: BlockId.Planks, count: 4 });
    expect(chest.getSlot(0)).toEqual({ item: BlockId.Planks, count: 4 });
  });

  it('never double-click merges tools or armor', () => {
    const tool = TOOL_ITEM_IDS.ironPickaxe;
    const armor = ARMOR_ITEM_IDS.ironHelmet;
    const inventory = new ItemInventory(36, [
      { item: tool, count: 1, durability: 10 },
      { item: armor, count: 1, durability: 20 }
    ]);
    const chest = new ChestInventory();
    chest.setSlot(0, { item: tool, count: 1, durability: 12 });
    chest.setSlot(1, { item: armor, count: 1, durability: 22 });
    const actions = new InventoryActions(inventory, new CraftingGrid());
    actions.setChest(chest);

    expect(actions.doubleClick('hotbar', 0)).toEqual({ changed: false, cursor: null });
    actions.setCursor({ item: armor, count: 1, durability: 20 });
    expect(actions.doubleClick('chest', 1)).toEqual({
      changed: false,
      cursor: { item: armor, count: 1, durability: 20 }
    });
    expect(inventory.getSlot(0)).toEqual({ item: tool, count: 1, durability: 10 });
    expect(chest.getSlot(0)).toEqual({ item: tool, count: 1, durability: 12 });
    expect(chest.getSlot(1)).toEqual({ item: armor, count: 1, durability: 22 });
  });
});
