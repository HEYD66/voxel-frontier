import { describe, expect, it } from 'vitest';
import {
  CRAFTING_GRID_SIZE,
  CRAFTING_TABLE_GRID_SIZE,
  CRAFTING_TABLE_RECIPES_3X3,
  CraftingGrid,
  PLAYER_CRAFTING_RECIPES_2X2,
  type CraftingRecipeDefinition
} from './crafting';
import {
  ARMOR_DEFINITIONS,
  ARMOR_ITEM_IDS,
  ItemInventory,
  TOOL_DEFINITIONS,
  TOOL_ITEM_IDS,
  type ItemId,
  type ArmorItemId,
  type ToolItemId
} from './survival';
import { BlockId } from './types';

const TOOL_TIERS: readonly {
  material: ItemId;
  pickaxe: ToolItemId;
  axe: ToolItemId;
  shovel: ToolItemId;
  sword: ToolItemId;
}[] = [
  {
    material: BlockId.Planks,
    pickaxe: TOOL_ITEM_IDS.woodenPickaxe,
    axe: TOOL_ITEM_IDS.woodenAxe,
    shovel: TOOL_ITEM_IDS.woodenShovel,
    sword: TOOL_ITEM_IDS.woodenSword
  },
  {
    material: BlockId.Cobblestone,
    pickaxe: TOOL_ITEM_IDS.stonePickaxe,
    axe: TOOL_ITEM_IDS.stoneAxe,
    shovel: TOOL_ITEM_IDS.stoneShovel,
    sword: TOOL_ITEM_IDS.stoneSword
  },
  {
    material: 'iron_ingot',
    pickaxe: TOOL_ITEM_IDS.ironPickaxe,
    axe: TOOL_ITEM_IDS.ironAxe,
    shovel: TOOL_ITEM_IDS.ironShovel,
    sword: TOOL_ITEM_IDS.ironSword
  },
  {
    material: 'diamond',
    pickaxe: TOOL_ITEM_IDS.diamondPickaxe,
    axe: TOOL_ITEM_IDS.diamondAxe,
    shovel: TOOL_ITEM_IDS.diamondShovel,
    sword: TOOL_ITEM_IDS.diamondSword
  }
];

const LEATHER_ARMOR_RECIPES: readonly {
  id: string;
  item: ArmorItemId;
  ingredientSlots: readonly number[];
}[] = [
  {
    id: 'leather_helmet',
    item: ARMOR_ITEM_IDS.leatherHelmet,
    ingredientSlots: [0, 1, 2, 3, 5]
  },
  {
    id: 'leather_tunic',
    item: ARMOR_ITEM_IDS.leatherTunic,
    ingredientSlots: [0, 2, 3, 4, 5, 6, 7, 8]
  },
  {
    id: 'leather_pants',
    item: ARMOR_ITEM_IDS.leatherPants,
    ingredientSlots: [0, 1, 2, 3, 5, 6, 8]
  },
  {
    id: 'leather_boots',
    item: ARMOR_ITEM_IDS.leatherBoots,
    ingredientSlots: [0, 2, 3, 5]
  }
];

const IRON_ARMOR_RECIPES: readonly {
  id: string;
  item: ArmorItemId;
  ingredientSlots: readonly number[];
}[] = [
  {
    id: 'iron_helmet',
    item: ARMOR_ITEM_IDS.ironHelmet,
    ingredientSlots: [0, 1, 2, 3, 5]
  },
  {
    id: 'iron_chestplate',
    item: ARMOR_ITEM_IDS.ironChestplate,
    ingredientSlots: [0, 2, 3, 4, 5, 6, 7, 8]
  },
  {
    id: 'iron_leggings',
    item: ARMOR_ITEM_IDS.ironLeggings,
    ingredientSlots: [0, 1, 2, 3, 5, 6, 8]
  },
  {
    id: 'iron_boots',
    item: ARMOR_ITEM_IDS.ironBoots,
    ingredientSlots: [0, 2, 3, 5]
  }
];

const DIAMOND_ARMOR_RECIPES: readonly {
  id: string;
  item: ArmorItemId;
  ingredientSlots: readonly number[];
}[] = [
  {
    id: 'diamond_helmet',
    item: ARMOR_ITEM_IDS.diamondHelmet,
    ingredientSlots: [0, 1, 2, 3, 5]
  },
  {
    id: 'diamond_chestplate',
    item: ARMOR_ITEM_IDS.diamondChestplate,
    ingredientSlots: [0, 2, 3, 4, 5, 6, 7, 8]
  },
  {
    id: 'diamond_leggings',
    item: ARMOR_ITEM_IDS.diamondLeggings,
    ingredientSlots: [0, 1, 2, 3, 5, 6, 8]
  },
  {
    id: 'diamond_boots',
    item: ARMOR_ITEM_IDS.diamondBoots,
    ingredientSlots: [0, 2, 3, 5]
  }
];

describe('CraftingGrid', () => {
  it('keeps the player crafting grid at 2x2 by default', () => {
    const grid = new CraftingGrid();

    expect(CRAFTING_GRID_SIZE).toBe(4);
    expect(grid.dimension).toBe(2);
    expect(grid.size).toBe(4);
    expect(grid.getSlots()).toEqual([null, null, null, null]);
    expect(grid.setSlot(3, { item: BlockId.Wood, count: 1 })).toBe(true);
    expect(grid.setSlot(4, { item: BlockId.Wood, count: 1 })).toBe(false);
    expect(grid.getSlot(4)).toBeNull();
  });

  it('supports an explicit 3x3 crafting-table grid', () => {
    const grid = new CraftingGrid(3);

    expect(CRAFTING_TABLE_GRID_SIZE).toBe(9);
    expect(grid.dimension).toBe(3);
    expect(grid.size).toBe(9);
    expect(grid.setSlot(8, { item: BlockId.Wood, count: 1 })).toBe(true);
    expect(grid.getSlot(8)).toEqual({ item: BlockId.Wood, count: 1 });
    expect(grid.setSlot(9, { item: BlockId.Wood, count: 1 })).toBe(false);
  });

  it('fills one shaped recipe from inventory without crafting its output', () => {
    const grid = new CraftingGrid(3);
    const inventory = new ItemInventory(3, [
      { item: BlockId.Planks, count: 2 },
      { item: 'stick', count: 1 }
    ]);
    const recipe = getRecipe('wooden_sword');

    expect(grid.fillRecipeFromInventory(inventory, recipe)).toBe(true);
    expect(grid.getSlot(0)).toEqual({ item: BlockId.Planks, count: 1 });
    expect(grid.getSlot(3)).toEqual({ item: BlockId.Planks, count: 1 });
    expect(grid.getSlot(6)).toEqual({ item: 'stick', count: 1 });
    expect(grid.getOutput()).toEqual({ item: TOOL_ITEM_IDS.woodenSword, count: 1 });
    expect(inventory.count(BlockId.Planks)).toBe(0);
    expect(inventory.count('stick')).toBe(0);
    expect(inventory.count(TOOL_ITEM_IDS.woodenSword)).toBe(0);
  });

  it('fills each iron armor recipe with ingots without directly creating armor', () => {
    for (const entry of IRON_ARMOR_RECIPES) {
      const grid = new CraftingGrid(3);
      const inventory = new ItemInventory(2, [
        { item: 'iron_ingot', count: entry.ingredientSlots.length },
        null
      ]);
      const recipe = getRecipe(entry.id);

      expect(grid.fillRecipeFromInventory(inventory, recipe)).toBe(true);
      expect(grid.findMatch()).toMatchObject({ recipe: { id: entry.id } });
      expect(grid.getOutput()).toEqual({ item: entry.item, count: 1 });
      expect(inventory.count('iron_ingot')).toBe(0);
      expect(inventory.count(entry.item)).toBe(0);
      expect(grid.getSlots()).toEqual(
        Array.from({ length: 9 }, (_, slot) => (
          entry.ingredientSlots.includes(slot)
            ? { item: 'iron_ingot', count: 1 }
            : null
        ))
      );
    }
  });

  it('fills shaped player recipes into a legal 2x2 layout', () => {
    const grid = new CraftingGrid();
    const inventory = new ItemInventory(1, [{ item: BlockId.Planks, count: 2 }]);
    const recipe = getRecipe('sticks');

    expect(grid.fillRecipeFromInventory(inventory, recipe)).toBe(true);
    expect(grid.getSlots()).toEqual([
      { item: BlockId.Planks, count: 1 },
      null,
      { item: BlockId.Planks, count: 1 },
      null
    ]);
    expect(grid.getOutput()).toEqual({ item: 'stick', count: 4 });
    expect(inventory.count(BlockId.Planks)).toBe(0);
  });

  it('fills multiple batches and adds later calls to the same recipe', () => {
    const grid = new CraftingGrid(3);
    const inventory = new ItemInventory(2, [
      { item: BlockId.Planks, count: 10 },
      { item: 'stick', count: 5 }
    ]);
    const recipe = getRecipe('wooden_sword');

    expect(grid.fillRecipeFromInventory(inventory, recipe, 2)).toBe(true);
    expectRemainingCount(grid, [0, 3, 6], 2);
    expect(inventory.count(BlockId.Planks)).toBe(6);
    expect(inventory.count('stick')).toBe(3);

    expect(grid.fillRecipeFromInventory(inventory, recipe, 3)).toBe(true);
    expectRemainingCount(grid, [0, 3, 6], 5);
    expect(inventory.count(BlockId.Planks)).toBe(0);
    expect(inventory.count('stick')).toBe(0);

    const gridBeforeFailure = grid.getSlots();
    const inventoryBeforeFailure = inventory.getSnapshot();
    expect(grid.fillRecipeFromInventory(inventory, recipe)).toBe(false);
    expect(grid.getSlots()).toEqual(gridBeforeFailure);
    expect(inventory.getSnapshot()).toEqual(inventoryBeforeFailure);
  });

  it('returns an unrelated crafting grid to inventory before filling a recipe', () => {
    const grid = new CraftingGrid(3);
    const inventory = new ItemInventory(3, [
      { item: BlockId.Planks, count: 2 },
      { item: 'stick', count: 1 }
    ]);
    grid.setSlot(8, { item: BlockId.Stone, count: 4 });

    expect(grid.fillRecipeFromInventory(inventory, getRecipe('wooden_sword'))).toBe(true);
    expect(inventory.count(BlockId.Stone)).toBe(4);
    expect(inventory.count(BlockId.Planks)).toBe(0);
    expect(inventory.count('stick')).toBe(0);
    expect(grid.getOutput()?.item).toBe(TOOL_ITEM_IDS.woodenSword);
    expect(grid.getSlots().some((stack) => stack?.item === BlockId.Stone)).toBe(false);
  });

  it('uses recipe ingredients first when that frees room for existing grid items', () => {
    const grid = new CraftingGrid();
    const inventory = new ItemInventory(2, [
      { item: BlockId.Wood, count: 1 },
      { item: BlockId.Dirt, count: 64 }
    ]);
    grid.setSlot(0, { item: BlockId.Stone, count: 1 });

    expect(grid.fillRecipeFromInventory(inventory, getRecipe('oak_planks'))).toBe(true);
    expect(grid.getSlots()).toEqual([
      { item: BlockId.Wood, count: 1 },
      null,
      null,
      null
    ]);
    expect(inventory.getSnapshot().slots).toEqual([
      { item: BlockId.Stone, count: 1 },
      { item: BlockId.Dirt, count: 64 }
    ]);
  });

  it('rolls back when leftover grid items still cannot fit after taking ingredients', () => {
    const grid = new CraftingGrid();
    const inventory = new ItemInventory(2, [
      { item: BlockId.Wood, count: 1 },
      { item: BlockId.Dirt, count: 64 }
    ]);
    grid.setSlot(0, { item: BlockId.Stone, count: 1 });
    grid.setSlot(1, { item: BlockId.Sand, count: 1 });
    const gridBefore = grid.getSlots();
    const inventoryBefore = inventory.getSnapshot();

    expect(grid.fillRecipeFromInventory(inventory, getRecipe('oak_planks'))).toBe(false);
    expect(grid.getSlots()).toEqual(gridBefore);
    expect(inventory.getSnapshot()).toEqual(inventoryBefore);
  });

  it('rolls back when inventory materials are insufficient', () => {
    const grid = new CraftingGrid(3);
    const inventory = new ItemInventory(2, [
      { item: BlockId.Planks, count: 1 },
      { item: 'stick', count: 1 }
    ]);
    const inventoryBefore = inventory.getSnapshot();

    expect(grid.fillRecipeFromInventory(inventory, getRecipe('wooden_sword'))).toBe(false);
    expect(grid.getSlots()).toEqual(Array.from({ length: 9 }, () => null));
    expect(inventory.getSnapshot()).toEqual(inventoryBefore);
  });

  it('rejects recipes that do not fit the current grid dimension', () => {
    const grid = new CraftingGrid();
    const inventory = new ItemInventory(2, [
      { item: BlockId.Planks, count: 2 },
      { item: 'stick', count: 1 }
    ]);
    const inventoryBefore = inventory.getSnapshot();

    expect(grid.fillRecipeFromInventory(inventory, getRecipe('wooden_sword'))).toBe(false);
    expect(grid.getSlots()).toEqual([null, null, null, null]);
    expect(inventory.getSnapshot()).toEqual(inventoryBefore);
  });

  it('fills and consumes shapeless recipes independent of slot order', () => {
    const recipe: CraftingRecipeDefinition = {
      id: 'shapeless_binding',
      label: '混合材料',
      width: 2,
      height: 2,
      pattern: [BlockId.Planks, 'stick', BlockId.Planks, null],
      output: { item: BlockId.Bricks, count: 1 },
      shapeless: true
    };
    const grid = new CraftingGrid();
    const inventory = new ItemInventory(2, [
      { item: BlockId.Planks, count: 4 },
      { item: 'stick', count: 2 }
    ]);

    expect(grid.fillRecipeFromInventory(inventory, recipe, 2)).toBe(true);
    expect(grid.getSlots()).toEqual([
      { item: BlockId.Planks, count: 2 },
      { item: 'stick', count: 2 },
      { item: BlockId.Planks, count: 2 },
      null
    ]);
    expect(grid.getOutput([recipe])).toEqual({ item: BlockId.Bricks, count: 1 });
    expect(grid.takeOutput([recipe]).crafted).toBe(true);
    expectRemainingCount(grid, [0, 1, 2], 1);

    grid.clear();
    grid.setSlot(0, { item: BlockId.Planks, count: 1 });
    grid.setSlot(2, { item: BlockId.Planks, count: 1 });
    grid.setSlot(3, { item: 'stick', count: 1 });
    expect(grid.findMatch([recipe])).toMatchObject({
      recipe: { id: 'shapeless_binding' },
      ingredientSlots: [0, 2, 3]
    });
  });

  it('does not increase matching recipe slots beyond their stack limits', () => {
    const grid = new CraftingGrid(3);
    const inventory = new ItemInventory(2, [
      { item: BlockId.Planks, count: 2 },
      { item: 'stick', count: 1 }
    ]);
    setIngredients(grid, [0, 3], BlockId.Planks, 64);
    grid.setSlot(6, { item: 'stick', count: 64 });
    const gridBefore = grid.getSlots();
    const inventoryBefore = inventory.getSnapshot();

    expect(grid.fillRecipeFromInventory(inventory, getRecipe('wooden_sword'))).toBe(false);
    expect(grid.getSlots()).toEqual(gridBefore);
    expect(inventory.getSnapshot()).toEqual(inventoryBefore);
  });

  it('crafts four planks from one log in any 2x2 slot', () => {
    for (let slot = 0; slot < CRAFTING_GRID_SIZE; slot += 1) {
      const grid = new CraftingGrid();
      const inventory = new ItemInventory(1);
      grid.setSlot(slot, { item: BlockId.Wood, count: 1 });

      expect(grid.getOutput()).toEqual({ item: BlockId.Planks, count: 4 });
      expect(grid.craftInto(inventory)).toMatchObject({
        crafted: true,
        recipeId: 'oak_planks',
        overflow: 0
      });
      expect(inventory.count(BlockId.Planks)).toBe(4);
      expect(grid.getSlot(slot)).toBeNull();
    }
  });

  it('crafts sticks only from two vertically aligned planks', () => {
    const grid = new CraftingGrid();
    const inventory = new ItemInventory(1);

    expect(grid.addToSlot(1, { item: BlockId.Planks, count: 2 })).toBe(0);
    expect(grid.addToSlot(3, { item: BlockId.Planks, count: 1 })).toBe(0);
    expect(grid.getOutput()).toEqual({ item: 'stick', count: 4 });
    expect(grid.removeFromSlot(1, 1)).toEqual({ item: BlockId.Planks, count: 1 });
    expect(grid.addToSlot(1, { item: BlockId.Planks, count: 1 })).toBe(0);

    expect(grid.craftInto(inventory).crafted).toBe(true);
    expect(inventory.count('stick')).toBe(4);
    expect(grid.getSlot(1)).toEqual({ item: BlockId.Planks, count: 1 });
    expect(grid.getSlot(3)).toBeNull();

    grid.clear();
    grid.setSlot(0, { item: BlockId.Planks, count: 1 });
    grid.setSlot(1, { item: BlockId.Planks, count: 1 });
    expect(grid.getOutput()).toBeNull();
  });

  it('crafts a crafting table from a full 2x2 square of planks', () => {
    const grid = new CraftingGrid();
    const inventory = new ItemInventory(1);
    setIngredients(grid, [0, 1, 2, 3], BlockId.Planks);

    expect(grid.getOutput()).toEqual({ item: BlockId.CraftingTable, count: 1 });
    expect(grid.craftInto(inventory)).toMatchObject({
      crafted: true,
      recipeId: 'crafting_table',
      overflow: 0
    });
    expect(inventory.count(BlockId.CraftingTable)).toBe(1);
    expect(grid.getSlots()).toEqual([null, null, null, null]);
  });

  it('matches basic recipes at valid offsets in a 3x3 grid', () => {
    const grid = new CraftingGrid(3);

    grid.setSlot(8, { item: BlockId.Wood, count: 1 });
    expect(grid.findMatch()).toMatchObject({
      recipe: { id: 'oak_planks' },
      offsetX: 2,
      offsetY: 2
    });

    grid.clear();
    setIngredients(grid, [4, 7], BlockId.Planks);
    expect(grid.findMatch()).toMatchObject({
      recipe: { id: 'sticks' },
      offsetX: 1,
      offsetY: 1
    });

    grid.clear();
    setIngredients(grid, [4, 5, 7, 8], BlockId.Planks);
    expect(grid.findMatch()).toMatchObject({
      recipe: { id: 'crafting_table' },
      offsetX: 1,
      offsetY: 1
    });
  });

  it('crafts a furnace only from eight cobblestone around an empty center', () => {
    const grid = new CraftingGrid(3);
    setIngredients(grid, [0, 1, 2, 3, 5, 6, 7, 8], BlockId.Cobblestone);

    expect(grid.getOutput()).toEqual({ item: BlockId.Furnace, count: 1 });
    expect(grid.findMatch()).toMatchObject({ recipe: { id: 'furnace' } });

    grid.setSlot(4, { item: BlockId.Cobblestone, count: 1 });
    expect(grid.getOutput()).toBeNull();
  });

  it('crafts one chest only from eight planks around an empty center', () => {
    const grid = new CraftingGrid(3);
    const inventory = new ItemInventory(1);
    setIngredients(grid, [0, 1, 2, 3, 5, 6, 7, 8], BlockId.Planks);

    expect(grid.findMatch()).toMatchObject({ recipe: { id: 'chest', label: '箱子' } });
    expect(grid.getOutput()).toEqual({ item: BlockId.Chest, count: 1 });
    expect(grid.craftInto(inventory)).toMatchObject({
      crafted: true,
      recipeId: 'chest',
      output: { item: BlockId.Chest, count: 1 },
      overflow: 0
    });
    expect(inventory.getSlot(0)).toEqual({ item: BlockId.Chest, count: 1 });
    expect(grid.getSlots()).toEqual(Array.from({ length: 9 }, () => null));

    setIngredients(grid, [0, 1, 2, 3, 5, 6, 7, 8], BlockId.Planks);
    grid.setSlot(4, { item: BlockId.Planks, count: 1 });
    expect(grid.getOutput()).toBeNull();
  });

  it('crafts four torches from coal above a stick in the player grid', () => {
    const grid = new CraftingGrid();
    const inventory = new ItemInventory(1);
    grid.setSlot(0, { item: 'coal', count: 2 });
    grid.setSlot(2, { item: 'stick', count: 2 });

    expect(grid.findMatch()).toMatchObject({ recipe: { id: 'torch' } });
    expect(grid.getOutput()).toEqual({ item: BlockId.Torch, count: 4 });
    expect(grid.craftInto(inventory)).toMatchObject({
      crafted: true,
      recipeId: 'torch',
      output: { item: BlockId.Torch, count: 4 },
      overflow: 0
    });
    expect(inventory.getSlot(0)).toEqual({ item: BlockId.Torch, count: 4 });
    expect(grid.getSlot(0)).toEqual({ item: 'coal', count: 1 });
    expect(grid.getSlot(2)).toEqual({ item: 'stick', count: 1 });

    grid.clear();
    grid.setSlot(0, { item: 'stick', count: 1 });
    grid.setSlot(2, { item: 'coal', count: 1 });
    expect(grid.getOutput()).toBeNull();
  });

  it('does not expose 3x3 tool recipes from the player 2x2 grid', () => {
    const grid = new CraftingGrid();
    setIngredients(grid, [0, 1], BlockId.Planks);
    grid.setSlot(3, { item: 'stick', count: 1 });

    expect(grid.getOutput()).toBeNull();
    expect(grid.findMatch(CRAFTING_TABLE_RECIPES_3X3)).toBeNull();
  });

  it('crafts swords only in a three-high workbench column', () => {
    for (let column = 0; column < 3; column += 1) {
      const grid = new CraftingGrid(3);
      const inventory = new ItemInventory(1);
      setIngredients(grid, [column, column + 3], BlockId.Planks, 2);
      grid.setSlot(column + 6, { item: 'stick', count: 2 });

      expect(grid.findMatch()).toMatchObject({
        recipe: { id: 'wooden_sword' },
        offsetX: column,
        offsetY: 0
      });
      expect(grid.craftInto(inventory).recipeId).toBe('wooden_sword');
      expect(inventory.getSlot(0)).toEqual({
        item: TOOL_ITEM_IDS.woodenSword,
        count: 1,
        durability: TOOL_DEFINITIONS[TOOL_ITEM_IDS.woodenSword].maxDurability
      });
      expectRemainingCount(grid, [column, column + 3, column + 6], 1);
    }

    const playerGrid = new CraftingGrid();
    setIngredients(playerGrid, [0, 2], BlockId.Planks);
    playerGrid.setSlot(1, { item: 'stick', count: 1 });
    expect(playerGrid.findMatch(CRAFTING_TABLE_RECIPES_3X3)).toBeNull();
  });

  it('crafts every iron armor recipe at full durability only in a 3x3 grid', () => {
    for (const entry of IRON_ARMOR_RECIPES) {
      const grid = new CraftingGrid(3);
      const inventory = new ItemInventory(1);
      setIngredients(grid, entry.ingredientSlots, 'iron_ingot');

      expect(grid.findMatch()).toMatchObject({
        recipe: { id: entry.id },
        offsetX: 0,
        offsetY: 0
      });
      expect(grid.getOutput()).toEqual({ item: entry.item, count: 1 });
      expect(grid.craftInto(inventory)).toMatchObject({
        crafted: true,
        recipeId: entry.id,
        output: { item: entry.item, count: 1 },
        overflow: 0
      });
      expect(inventory.getSlot(0)).toEqual({
        item: entry.item,
        count: 1,
        durability: ARMOR_DEFINITIONS[entry.item].maxDurability
      });

      const playerGrid = new CraftingGrid();
      const playerInventory = new ItemInventory(1, [
        { item: 'iron_ingot', count: entry.ingredientSlots.length }
      ]);
      expect(PLAYER_CRAFTING_RECIPES_2X2.some((recipe) => recipe.id === entry.id)).toBe(false);
      expect(playerGrid.fillRecipeFromInventory(playerInventory, getRecipe(entry.id))).toBe(false);
      expect(playerGrid.findMatch(CRAFTING_TABLE_RECIPES_3X3)).toBeNull();
      expect(playerInventory.count('iron_ingot')).toBe(entry.ingredientSlots.length);
    }
  });

  it('crafts every leather armor recipe at full durability only in a 3x3 grid', () => {
    for (const entry of LEATHER_ARMOR_RECIPES) {
      const grid = new CraftingGrid(3);
      const inventory = new ItemInventory(1);
      setIngredients(grid, entry.ingredientSlots, 'leather');

      expect(grid.findMatch()).toMatchObject({
        recipe: { id: entry.id },
        offsetX: 0,
        offsetY: 0
      });
      expect(grid.getOutput()).toEqual({ item: entry.item, count: 1 });
      expect(grid.craftInto(inventory)).toMatchObject({
        crafted: true,
        recipeId: entry.id,
        output: { item: entry.item, count: 1 },
        overflow: 0
      });
      expect(inventory.getSlot(0)).toEqual({
        item: entry.item,
        count: 1,
        durability: ARMOR_DEFINITIONS[entry.item].maxDurability
      });

      const playerGrid = new CraftingGrid();
      const playerInventory = new ItemInventory(1, [
        { item: 'leather', count: entry.ingredientSlots.length }
      ]);
      expect(PLAYER_CRAFTING_RECIPES_2X2.some((recipe) => recipe.id === entry.id)).toBe(false);
      expect(playerGrid.fillRecipeFromInventory(playerInventory, getRecipe(entry.id))).toBe(false);
      expect(playerGrid.findMatch(CRAFTING_TABLE_RECIPES_3X3)).toBeNull();
      expect(playerInventory.count('leather')).toBe(entry.ingredientSlots.length);
    }
  });

  it('crafts every diamond armor recipe at full durability only in a 3x3 grid', () => {
    for (const entry of DIAMOND_ARMOR_RECIPES) {
      const grid = new CraftingGrid(3);
      const inventory = new ItemInventory(1);
      setIngredients(grid, entry.ingredientSlots, 'diamond');

      expect(grid.findMatch()).toMatchObject({ recipe: { id: entry.id } });
      expect(grid.getOutput()).toEqual({ item: entry.item, count: 1 });
      expect(grid.craftInto(inventory)).toMatchObject({
        crafted: true,
        recipeId: entry.id,
        output: { item: entry.item, count: 1 }
      });
      expect(inventory.getSlot(0)).toEqual({
        item: entry.item,
        count: 1,
        durability: ARMOR_DEFINITIONS[entry.item].maxDurability
      });

      const playerGrid = new CraftingGrid();
      const playerInventory = new ItemInventory(1, [
        { item: 'diamond', count: entry.ingredientSlots.length }
      ]);
      expect(playerGrid.fillRecipeFromInventory(playerInventory, getRecipe(entry.id))).toBe(false);
      expect(playerInventory.count('diamond')).toBe(entry.ingredientSlots.length);
    }
  });

  it('uses exactly three materials and two sticks for a pickaxe', () => {
    const grid = new CraftingGrid(3);
    const inventory = new ItemInventory(1);
    setIngredients(grid, [0, 1, 2], BlockId.Planks, 2);
    setIngredients(grid, [4, 7], 'stick', 2);

    expect(grid.craftInto(inventory).recipeId).toBe('wooden_pickaxe');
    expect(inventory.getSlot(0)?.item).toBe(TOOL_ITEM_IDS.woodenPickaxe);
    expect(inventory.getSlot(0)?.durability).toBeGreaterThan(0);
    expectRemainingCount(grid, [0, 1, 2, 4, 7], 1);
  });

  it('matches and consumes both horizontal axe orientations', () => {
    const cases = [
      { materialSlots: [0, 1, 3], stickSlots: [4, 7], mirrored: false },
      { materialSlots: [1, 2, 5], stickSlots: [4, 7], mirrored: true }
    ] as const;

    for (const entry of cases) {
      const grid = new CraftingGrid(3);
      const inventory = new ItemInventory(1);
      setIngredients(grid, entry.materialSlots, BlockId.Cobblestone, 2);
      setIngredients(grid, entry.stickSlots, 'stick', 2);

      expect(grid.findMatch()).toMatchObject({
        recipe: { id: 'stone_axe' },
        mirrored: entry.mirrored
      });
      expect(grid.craftInto(inventory).crafted).toBe(true);
      expect(inventory.getSlot(0)?.item).toBe(TOOL_ITEM_IDS.stoneAxe);
      expectRemainingCount(
        grid,
        [...entry.materialSlots, ...entry.stickSlots],
        1
      );
    }
  });

  it('uses one material and two sticks for a horizontally offset shovel', () => {
    const grid = new CraftingGrid(3);
    const inventory = new ItemInventory(1);
    setIngredients(grid, [2], 'iron_ingot', 2);
    setIngredients(grid, [5, 8], 'stick', 2);

    expect(grid.findMatch()).toMatchObject({
      recipe: { id: 'iron_shovel' },
      offsetX: 2,
      offsetY: 0
    });
    expect(grid.craftInto(inventory).crafted).toBe(true);
    expect(inventory.getSlot(0)?.item).toBe(TOOL_ITEM_IDS.ironShovel);
    expectRemainingCount(grid, [2, 5, 8], 1);
  });

  it('produces the correct pickaxe, axe, shovel, and sword for every material tier', () => {
    for (const tier of TOOL_TIERS) {
      const recipes = [
        { materialSlots: [0, 1, 2], stickSlots: [4, 7], output: tier.pickaxe },
        { materialSlots: [0, 1, 3], stickSlots: [4, 7], output: tier.axe },
        { materialSlots: [0], stickSlots: [3, 6], output: tier.shovel },
        { materialSlots: [0, 3], stickSlots: [6], output: tier.sword }
      ] as const;

      for (const recipe of recipes) {
        const grid = new CraftingGrid(3);
        setIngredients(grid, recipe.materialSlots, tier.material);
        setIngredients(grid, recipe.stickSlots, 'stick');
        expect(grid.getOutput()).toEqual({ item: recipe.output, count: 1 });
      }
    }
  });

  it('keeps crafting transactional when the output does not fully fit', () => {
    const grid = new CraftingGrid();
    const inventory = new ItemInventory(1, [{ item: BlockId.Planks, count: 62 }]);
    grid.setSlot(0, { item: BlockId.Wood, count: 1 });

    const result = grid.craftInto(inventory);
    expect(result).toMatchObject({
      crafted: false,
      recipeId: 'oak_planks',
      output: { item: BlockId.Planks, count: 4 },
      overflow: 4
    });
    expect(inventory.count(BlockId.Planks)).toBe(62);
    expect(grid.getSlot(0)).toEqual({ item: BlockId.Wood, count: 1 });
  });

  it('takes one output transactionally without requiring inventory capacity', () => {
    const grid = new CraftingGrid();
    grid.setSlot(3, { item: BlockId.Wood, count: 2 });

    expect(grid.takeOutput()).toEqual({
      crafted: true,
      recipeId: 'oak_planks',
      output: { item: BlockId.Planks, count: 4 },
      overflow: 0
    });
    expect(grid.getSlot(3)).toEqual({ item: BlockId.Wood, count: 1 });

    grid.clear();
    expect(grid.takeOutput()).toEqual({
      crafted: false,
      recipeId: null,
      output: null,
      overflow: 0
    });
  });

  it('returns all nine crafting-table slots and reports inventory overflow', () => {
    const grid = new CraftingGrid(3);
    const inventory = new ItemInventory(1, [{ item: BlockId.Stone, count: 64 }]);
    for (let slot = 0; slot < CRAFTING_TABLE_GRID_SIZE; slot += 1) {
      grid.setSlot(slot, { item: BlockId.Planks, count: slot + 1 });
    }

    const overflow = grid.returnItems(inventory);
    expect(overflow).toHaveLength(CRAFTING_TABLE_GRID_SIZE);
    expect(overflow).toEqual(
      Array.from({ length: CRAFTING_TABLE_GRID_SIZE }, (_, index) => ({
        item: BlockId.Planks,
        count: index + 1
      }))
    );
    expect(grid.getSlots()).toEqual(Array.from({ length: CRAFTING_TABLE_GRID_SIZE }, () => null));
    expect(inventory.count(BlockId.Stone)).toBe(64);
  });
});

function setIngredients(
  grid: CraftingGrid,
  slots: readonly number[],
  item: ItemId,
  count = 1
): void {
  for (const slot of slots) grid.setSlot(slot, { item, count });
}

function expectRemainingCount(
  grid: CraftingGrid,
  slots: readonly number[],
  count: number
): void {
  for (const slot of slots) expect(grid.getSlot(slot)?.count).toBe(count);
}

function getRecipe(id: string): CraftingRecipeDefinition {
  const recipe = CRAFTING_TABLE_RECIPES_3X3.find((candidate) => candidate.id === id);
  if (!recipe) throw new Error(`Missing crafting recipe: ${id}`);
  return recipe;
}
