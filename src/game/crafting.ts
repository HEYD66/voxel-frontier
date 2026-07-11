import { BlockId } from './types';
import {
  ARMOR_ITEM_IDS,
  ItemInventory,
  TOOL_ITEM_IDS,
  getItemStackLimit,
  isItemId,
  type ItemId,
  type ItemStack,
  type ToolItemId
} from './survival';

export type CraftingGridDimension = 2 | 3;

export const CRAFTING_GRID_SIZE = 4;
export const CRAFTING_TABLE_GRID_SIZE = 9;

export interface CraftingRecipeDefinition {
  id: string;
  label: string;
  width: 1 | 2 | 3;
  height: 1 | 2 | 3;
  pattern: readonly (ItemId | null)[];
  output: ItemStack;
  allowHorizontalMirror?: boolean;
  shapeless?: boolean;
}

export interface CraftingMatch {
  recipe: CraftingRecipeDefinition;
  offsetX: number;
  offsetY: number;
  mirrored: boolean;
  ingredientSlots?: readonly number[];
}

export interface CraftingResult {
  crafted: boolean;
  recipeId: string | null;
  output: ItemStack | null;
  overflow: number;
}

export const PLAYER_CRAFTING_RECIPES_2X2: readonly CraftingRecipeDefinition[] = [
  {
    id: 'oak_planks',
    label: '橡木木板',
    width: 1,
    height: 1,
    pattern: [BlockId.Wood],
    output: { item: BlockId.Planks, count: 4 }
  },
  {
    id: 'sticks',
    label: '木棍',
    width: 1,
    height: 2,
    pattern: [BlockId.Planks, BlockId.Planks],
    output: { item: 'stick', count: 4 }
  },
  {
    id: 'torch',
    label: '火把',
    width: 1,
    height: 2,
    pattern: ['coal', 'stick'],
    output: { item: BlockId.Torch, count: 4 }
  },
  {
    id: 'crafting_table',
    label: '工作台',
    width: 2,
    height: 2,
    pattern: [BlockId.Planks, BlockId.Planks, BlockId.Planks, BlockId.Planks],
    output: { item: BlockId.CraftingTable, count: 1 }
  }
] as const;

export const CRAFTING_RECIPES_2X2 = PLAYER_CRAFTING_RECIPES_2X2;

const TOOL_MATERIALS = [
  {
    prefix: 'wooden',
    label: '木',
    material: BlockId.Planks,
    pickaxe: TOOL_ITEM_IDS.woodenPickaxe,
    axe: TOOL_ITEM_IDS.woodenAxe,
    shovel: TOOL_ITEM_IDS.woodenShovel,
    sword: TOOL_ITEM_IDS.woodenSword
  },
  {
    prefix: 'stone',
    label: '石',
    material: BlockId.Cobblestone,
    pickaxe: TOOL_ITEM_IDS.stonePickaxe,
    axe: TOOL_ITEM_IDS.stoneAxe,
    shovel: TOOL_ITEM_IDS.stoneShovel,
    sword: TOOL_ITEM_IDS.stoneSword
  },
  {
    prefix: 'iron',
    label: '铁',
    material: 'iron_ingot',
    pickaxe: TOOL_ITEM_IDS.ironPickaxe,
    axe: TOOL_ITEM_IDS.ironAxe,
    shovel: TOOL_ITEM_IDS.ironShovel,
    sword: TOOL_ITEM_IDS.ironSword
  },
  {
    prefix: 'diamond',
    label: '钻石',
    material: 'diamond',
    pickaxe: TOOL_ITEM_IDS.diamondPickaxe,
    axe: TOOL_ITEM_IDS.diamondAxe,
    shovel: TOOL_ITEM_IDS.diamondShovel,
    sword: TOOL_ITEM_IDS.diamondSword
  }
] as const satisfies readonly {
  prefix: string;
  label: string;
  material: ItemId;
  pickaxe: ToolItemId;
  axe: ToolItemId;
  shovel: ToolItemId;
  sword: ToolItemId;
}[];

const TOOL_RECIPES_3X3: readonly CraftingRecipeDefinition[] = TOOL_MATERIALS.flatMap(
  (tier): CraftingRecipeDefinition[] => [
    {
      id: `${tier.prefix}_pickaxe`,
      label: `${tier.label}镐`,
      width: 3,
      height: 3,
      pattern: [
        tier.material,
        tier.material,
        tier.material,
        null,
        'stick',
        null,
        null,
        'stick',
        null
      ],
      output: { item: tier.pickaxe, count: 1 }
    },
    {
      id: `${tier.prefix}_axe`,
      label: `${tier.label}斧`,
      width: 2,
      height: 3,
      pattern: [tier.material, tier.material, tier.material, 'stick', null, 'stick'],
      output: { item: tier.axe, count: 1 },
      allowHorizontalMirror: true
    },
    {
      id: `${tier.prefix}_shovel`,
      label: `${tier.label}锹`,
      width: 1,
      height: 3,
      pattern: [tier.material, 'stick', 'stick'],
      output: { item: tier.shovel, count: 1 }
    },
    {
      id: `${tier.prefix}_sword`,
      label: `${tier.label}剑`,
      width: 1,
      height: 3,
      pattern: [tier.material, tier.material, 'stick'],
      output: { item: tier.sword, count: 1 }
    }
  ]
);

const LEATHER_ARMOR_RECIPES_3X3: readonly CraftingRecipeDefinition[] = [
  {
    id: 'leather_helmet',
    label: '皮革帽子',
    width: 3,
    height: 2,
    pattern: [
      'leather', 'leather', 'leather',
      'leather', null, 'leather'
    ],
    output: { item: ARMOR_ITEM_IDS.leatherHelmet, count: 1 }
  },
  {
    id: 'leather_tunic',
    label: '皮革上衣',
    width: 3,
    height: 3,
    pattern: [
      'leather', null, 'leather',
      'leather', 'leather', 'leather',
      'leather', 'leather', 'leather'
    ],
    output: { item: ARMOR_ITEM_IDS.leatherTunic, count: 1 }
  },
  {
    id: 'leather_pants',
    label: '皮革裤子',
    width: 3,
    height: 3,
    pattern: [
      'leather', 'leather', 'leather',
      'leather', null, 'leather',
      'leather', null, 'leather'
    ],
    output: { item: ARMOR_ITEM_IDS.leatherPants, count: 1 }
  },
  {
    id: 'leather_boots',
    label: '皮革靴子',
    width: 3,
    height: 2,
    pattern: [
      'leather', null, 'leather',
      'leather', null, 'leather'
    ],
    output: { item: ARMOR_ITEM_IDS.leatherBoots, count: 1 }
  }
];

const IRON_ARMOR_RECIPES_3X3: readonly CraftingRecipeDefinition[] = [
  {
    id: 'iron_helmet',
    label: '铁头盔',
    width: 3,
    height: 2,
    pattern: [
      'iron_ingot', 'iron_ingot', 'iron_ingot',
      'iron_ingot', null, 'iron_ingot'
    ],
    output: { item: ARMOR_ITEM_IDS.ironHelmet, count: 1 }
  },
  {
    id: 'iron_chestplate',
    label: '铁胸甲',
    width: 3,
    height: 3,
    pattern: [
      'iron_ingot', null, 'iron_ingot',
      'iron_ingot', 'iron_ingot', 'iron_ingot',
      'iron_ingot', 'iron_ingot', 'iron_ingot'
    ],
    output: { item: ARMOR_ITEM_IDS.ironChestplate, count: 1 }
  },
  {
    id: 'iron_leggings',
    label: '铁护腿',
    width: 3,
    height: 3,
    pattern: [
      'iron_ingot', 'iron_ingot', 'iron_ingot',
      'iron_ingot', null, 'iron_ingot',
      'iron_ingot', null, 'iron_ingot'
    ],
    output: { item: ARMOR_ITEM_IDS.ironLeggings, count: 1 }
  },
  {
    id: 'iron_boots',
    label: '铁靴子',
    width: 3,
    height: 2,
    pattern: [
      'iron_ingot', null, 'iron_ingot',
      'iron_ingot', null, 'iron_ingot'
    ],
    output: { item: ARMOR_ITEM_IDS.ironBoots, count: 1 }
  }
];

const DIAMOND_ARMOR_RECIPES_3X3: readonly CraftingRecipeDefinition[] = [
  {
    id: 'diamond_helmet',
    label: '钻石头盔',
    width: 3,
    height: 2,
    pattern: [
      'diamond', 'diamond', 'diamond',
      'diamond', null, 'diamond'
    ],
    output: { item: ARMOR_ITEM_IDS.diamondHelmet, count: 1 }
  },
  {
    id: 'diamond_chestplate',
    label: '钻石胸甲',
    width: 3,
    height: 3,
    pattern: [
      'diamond', null, 'diamond',
      'diamond', 'diamond', 'diamond',
      'diamond', 'diamond', 'diamond'
    ],
    output: { item: ARMOR_ITEM_IDS.diamondChestplate, count: 1 }
  },
  {
    id: 'diamond_leggings',
    label: '钻石护腿',
    width: 3,
    height: 3,
    pattern: [
      'diamond', 'diamond', 'diamond',
      'diamond', null, 'diamond',
      'diamond', null, 'diamond'
    ],
    output: { item: ARMOR_ITEM_IDS.diamondLeggings, count: 1 }
  },
  {
    id: 'diamond_boots',
    label: '钻石靴子',
    width: 3,
    height: 2,
    pattern: [
      'diamond', null, 'diamond',
      'diamond', null, 'diamond'
    ],
    output: { item: ARMOR_ITEM_IDS.diamondBoots, count: 1 }
  }
];

export const FURNACE_RECIPE_3X3: CraftingRecipeDefinition = {
  id: 'furnace',
  label: '熔炉',
  width: 3,
  height: 3,
  pattern: [
    BlockId.Cobblestone,
    BlockId.Cobblestone,
    BlockId.Cobblestone,
    BlockId.Cobblestone,
    null,
    BlockId.Cobblestone,
    BlockId.Cobblestone,
    BlockId.Cobblestone,
    BlockId.Cobblestone
  ],
  output: { item: BlockId.Furnace, count: 1 }
};

export const CHEST_RECIPE_3X3: CraftingRecipeDefinition = {
  id: 'chest',
  label: '箱子',
  width: 3,
  height: 3,
  pattern: [
    BlockId.Planks,
    BlockId.Planks,
    BlockId.Planks,
    BlockId.Planks,
    null,
    BlockId.Planks,
    BlockId.Planks,
    BlockId.Planks,
    BlockId.Planks
  ],
  output: { item: BlockId.Chest, count: 1 }
};

export const CRAFTING_TABLE_RECIPES_3X3: readonly CraftingRecipeDefinition[] = [
  ...PLAYER_CRAFTING_RECIPES_2X2,
  FURNACE_RECIPE_3X3,
  CHEST_RECIPE_3X3,
  ...TOOL_RECIPES_3X3,
  ...LEATHER_ARMOR_RECIPES_3X3,
  ...IRON_ARMOR_RECIPES_3X3,
  ...DIAMOND_ARMOR_RECIPES_3X3
];

export const CRAFTING_RECIPES_3X3 = CRAFTING_TABLE_RECIPES_3X3;

export class CraftingGrid {
  private readonly slots: Array<ItemStack | null>;

  constructor(public readonly dimension: CraftingGridDimension = 2) {
    this.slots = Array.from({ length: dimension * dimension }, () => null);
  }

  get size(): number {
    return this.slots.length;
  }

  getSlot(index: number): ItemStack | null {
    const stack = this.slots[this.normalizeIndex(index)] ?? null;
    return stack ? { ...stack } : null;
  }

  getSlots(): Array<ItemStack | null> {
    return this.slots.map((stack) => (stack ? { ...stack } : null));
  }

  setSlot(index: number, stack: ItemStack | null): boolean {
    const slot = this.normalizeIndex(index);
    if (slot < 0) return false;
    const normalized = normalizeCraftingStack(stack);
    const previous = this.slots[slot];
    if (stacksEqual(previous ?? null, normalized)) return false;
    this.slots[slot] = normalized;
    return true;
  }

  addToSlot(index: number, stack: ItemStack): number {
    const slot = this.normalizeIndex(index);
    if (slot < 0 || !isItemId(stack.item)) {
      return Math.max(0, Math.trunc(Number.isFinite(stack.count) ? stack.count : 0));
    }
    const incoming = Math.max(0, Math.trunc(Number.isFinite(stack.count) ? stack.count : 0));
    if (incoming === 0) return 0;
    const existing = this.slots[slot];
    const limit = getItemStackLimit(stack.item);
    if (existing && existing.item !== stack.item) return incoming;
    if (existing?.durability !== undefined || stack.durability !== undefined) {
      if (existing) return incoming;
      this.slots[slot] = { ...stack, count: 1 };
      return incoming - 1;
    }
    const current = existing?.count ?? 0;
    const transfer = Math.min(limit - current, incoming);
    if (transfer <= 0) return incoming;
    this.slots[slot] = { item: stack.item, count: current + transfer };
    return incoming - transfer;
  }

  removeFromSlot(index: number, count = 1): ItemStack | null {
    const slot = this.normalizeIndex(index);
    if (slot < 0) return null;
    const existing = this.slots[slot];
    if (!existing) return null;
    const amount = Math.min(
      existing.count,
      Math.max(1, Math.trunc(Number.isFinite(count) ? count : 1))
    );
    const removed: ItemStack = { item: existing.item, count: amount };
    if (existing.durability !== undefined) removed.durability = existing.durability;
    existing.count -= amount;
    if (existing.count <= 0) this.slots[slot] = null;
    return removed;
  }

  findMatch(
    recipes: readonly CraftingRecipeDefinition[] = this.getDefaultRecipes()
  ): CraftingMatch | null {
    for (const recipe of recipes) {
      if (!this.recipeFits(recipe)) continue;
      if (recipe.shapeless) {
        const match = this.findShapelessMatch(recipe);
        if (match) return match;
        continue;
      }
      for (let offsetY = 0; offsetY <= this.dimension - recipe.height; offsetY += 1) {
        for (let offsetX = 0; offsetX <= this.dimension - recipe.width; offsetX += 1) {
          if (this.matchesAt(recipe, offsetX, offsetY, false)) {
            return { recipe, offsetX, offsetY, mirrored: false };
          }
          if (
            recipe.allowHorizontalMirror &&
            recipe.width > 1 &&
            this.matchesAt(recipe, offsetX, offsetY, true)
          ) {
            return { recipe, offsetX, offsetY, mirrored: true };
          }
        }
      }
    }
    return null;
  }

  getOutput(
    recipes: readonly CraftingRecipeDefinition[] = this.getDefaultRecipes()
  ): ItemStack | null {
    const match = this.findMatch(recipes);
    return match ? { ...match.recipe.output } : null;
  }

  takeOutput(
    recipes: readonly CraftingRecipeDefinition[] = this.getDefaultRecipes()
  ): CraftingResult {
    const match = this.findMatch(recipes);
    if (!match) return { crafted: false, recipeId: null, output: null, overflow: 0 };
    const output = { ...match.recipe.output };
    this.consumeMatch(match);
    return { crafted: true, recipeId: match.recipe.id, output, overflow: 0 };
  }

  craftInto(
    inventory: ItemInventory,
    recipes: readonly CraftingRecipeDefinition[] = this.getDefaultRecipes()
  ): CraftingResult {
    const match = this.findMatch(recipes);
    if (!match) return { crafted: false, recipeId: null, output: null, overflow: 0 };
    const output = { ...match.recipe.output };
    if (getInventoryCapacity(inventory, output.item) < output.count) {
      return { crafted: false, recipeId: match.recipe.id, output, overflow: output.count };
    }
    const overflow = inventory.addStack(output);
    if (overflow > 0) throw new Error('Inventory capacity changed during crafting.');
    this.consumeMatch(match);
    return { crafted: true, recipeId: match.recipe.id, output, overflow: 0 };
  }

  fillRecipeFromInventory(
    inventory: ItemInventory,
    recipe: CraftingRecipeDefinition,
    batches = 1
  ): boolean {
    const requestedBatches = Math.trunc(Number.isFinite(batches) ? batches : 0);
    if (requestedBatches <= 0 || !this.recipeFits(recipe)) return false;

    const ingredients = getRecipeIngredients(recipe);
    if (ingredients.length === 0) return false;
    if (ingredients.some((item) => requestedBatches > getItemStackLimit(item))) return false;

    const inventorySlots = inventory.getSnapshot().slots.map(cloneItemStack);
    const existingMatch = this.findMatch([recipe]);
    if (existingMatch) {
      const ingredientSlots = getMatchIngredientSlots(existingMatch, this.dimension);
      if (ingredientSlots.length !== ingredients.length) return false;

      const nextGridSlots = this.getSlots();
      for (const slot of ingredientSlots) {
        const stack = nextGridSlots[slot];
        if (!stack || stack.count + requestedBatches > getItemStackLimit(stack.item)) return false;
      }

      if (!removeRecipeIngredients(
        inventorySlots,
        getRecipeIngredientCounts(recipe, requestedBatches)
      )) return false;

      for (const slot of ingredientSlots) nextGridSlots[slot]!.count += requestedBatches;
      this.replaceSlots(nextGridSlots);
      inventory.loadSnapshot({ slots: inventorySlots });
      return true;
    }

    const inventorySlotCount = inventorySlots.length;
    const pooledSlots = [
      ...inventorySlots,
      ...this.getSlots()
    ].map(cloneItemStack);
    const removedDurabilities = removeRecipeIngredients(
      pooledSlots,
      getRecipeIngredientCounts(recipe, requestedBatches)
    );
    if (!removedDurabilities) return false;

    const nextInventorySlots = pooledSlots.slice(0, inventorySlotCount);
    for (const stack of pooledSlots.slice(inventorySlotCount)) {
      if (!stack) continue;
      if (addStackToInventorySlots(nextInventorySlots, stack) > 0) return false;
    }

    const nextGridSlots = createRecipeGridSlots(
      recipe,
      this.dimension,
      requestedBatches,
      removedDurabilities
    );
    if (!nextGridSlots) return false;

    this.replaceSlots(nextGridSlots);
    inventory.loadSnapshot({ slots: nextInventorySlots });
    return true;
  }

  returnItems(inventory: ItemInventory): ItemStack[] {
    const overflow: ItemStack[] = [];
    for (let index = 0; index < this.slots.length; index += 1) {
      const stack = this.slots[index];
      if (!stack) continue;
      const remaining = inventory.addStack(stack);
      if (remaining > 0) overflow.push({ ...stack, count: remaining });
      this.slots[index] = null;
    }
    return overflow;
  }

  clear(): void {
    this.slots.fill(null);
  }

  private getDefaultRecipes(): readonly CraftingRecipeDefinition[] {
    return this.dimension === 3
      ? CRAFTING_TABLE_RECIPES_3X3
      : PLAYER_CRAFTING_RECIPES_2X2;
  }

  private recipeFits(recipe: CraftingRecipeDefinition): boolean {
    const ingredients = getRecipeIngredients(recipe);
    return (
      Number.isInteger(recipe.width) &&
      Number.isInteger(recipe.height) &&
      recipe.width > 0 &&
      recipe.height > 0 &&
      recipe.width <= this.dimension &&
      recipe.height <= this.dimension &&
      recipe.pattern.length === recipe.width * recipe.height &&
      recipe.pattern.every((item) => item === null || isItemId(item)) &&
      ingredients.length > 0 &&
      ingredients.length <= this.size
    );
  }

  private consumeMatch(match: CraftingMatch): void {
    if (match.recipe.shapeless) {
      for (const slot of match.ingredientSlots ?? []) this.removeFromSlot(slot, 1);
      return;
    }
    for (let patternY = 0; patternY < match.recipe.height; patternY += 1) {
      for (let patternX = 0; patternX < match.recipe.width; patternX += 1) {
        if (getPatternItem(match.recipe, patternX, patternY, match.mirrored) === null) {
          continue;
        }
        const gridIndex =
          match.offsetX + patternX + (match.offsetY + patternY) * this.dimension;
        this.removeFromSlot(gridIndex, 1);
      }
    }
  }

  private matchesAt(
    recipe: CraftingRecipeDefinition,
    offsetX: number,
    offsetY: number,
    mirrored: boolean
  ): boolean {
    for (let gridY = 0; gridY < this.dimension; gridY += 1) {
      for (let gridX = 0; gridX < this.dimension; gridX += 1) {
        const inside =
          gridX >= offsetX &&
          gridX < offsetX + recipe.width &&
          gridY >= offsetY &&
          gridY < offsetY + recipe.height;
        const expected = inside
          ? getPatternItem(recipe, gridX - offsetX, gridY - offsetY, mirrored)
          : null;
        const actual = this.slots[gridX + gridY * this.dimension]?.item ?? null;
        if (actual !== expected) return false;
      }
    }
    return true;
  }

  private findShapelessMatch(recipe: CraftingRecipeDefinition): CraftingMatch | null {
    const remaining = [...getRecipeIngredients(recipe)];
    const ingredientSlots: number[] = [];

    for (let slot = 0; slot < this.slots.length; slot += 1) {
      const stack = this.slots[slot];
      if (!stack) continue;
      const ingredientIndex = remaining.indexOf(stack.item);
      if (ingredientIndex < 0) return null;
      remaining.splice(ingredientIndex, 1);
      ingredientSlots.push(slot);
    }

    if (remaining.length > 0 || ingredientSlots.length === 0) return null;
    return {
      recipe,
      offsetX: 0,
      offsetY: 0,
      mirrored: false,
      ingredientSlots
    };
  }

  private replaceSlots(slots: readonly (ItemStack | null)[]): void {
    for (let index = 0; index < this.slots.length; index += 1) {
      this.slots[index] = cloneItemStack(slots[index] ?? null);
    }
  }

  private normalizeIndex(index: number): number {
    const normalized = Math.trunc(Number.isFinite(index) ? index : -1);
    return normalized >= 0 && normalized < this.slots.length ? normalized : -1;
  }
}

function getRecipeIngredients(recipe: CraftingRecipeDefinition): ItemId[] {
  const ingredients: ItemId[] = [];
  for (const item of recipe.pattern) {
    if (item !== null && isItemId(item)) ingredients.push(item);
  }
  return ingredients;
}

function getRecipeIngredientCounts(
  recipe: CraftingRecipeDefinition,
  batches: number
): Map<ItemId, number> {
  const counts = new Map<ItemId, number>();
  for (const item of getRecipeIngredients(recipe)) {
    counts.set(item, (counts.get(item) ?? 0) + batches);
  }
  return counts;
}

function getMatchIngredientSlots(match: CraftingMatch, dimension: number): number[] {
  if (match.recipe.shapeless) return [...(match.ingredientSlots ?? [])];
  const slots: number[] = [];
  for (let patternY = 0; patternY < match.recipe.height; patternY += 1) {
    for (let patternX = 0; patternX < match.recipe.width; patternX += 1) {
      if (getPatternItem(match.recipe, patternX, patternY, match.mirrored) === null) continue;
      slots.push(match.offsetX + patternX + (match.offsetY + patternY) * dimension);
    }
  }
  return slots;
}

function createRecipeGridSlots(
  recipe: CraftingRecipeDefinition,
  dimension: CraftingGridDimension,
  batches: number,
  removedDurabilities: Map<ItemId, Array<number | undefined>>
): Array<ItemStack | null> | null {
  const slots: Array<ItemStack | null> = Array.from(
    { length: dimension * dimension },
    () => null
  );
  let shapelessSlot = 0;

  for (let patternY = 0; patternY < recipe.height; patternY += 1) {
    for (let patternX = 0; patternX < recipe.width; patternX += 1) {
      const item = getPatternItem(recipe, patternX, patternY, false);
      if (item === null) continue;
      const stack = createRecipeIngredientStack(item, batches, removedDurabilities);
      if (!stack) return null;
      const slot = recipe.shapeless
        ? shapelessSlot++
        : patternX + patternY * dimension;
      slots[slot] = stack;
    }
  }

  return slots;
}

function createRecipeIngredientStack(
  item: ItemId,
  batches: number,
  removedDurabilities: Map<ItemId, Array<number | undefined>>
): ItemStack | null {
  if (batches > getItemStackLimit(item)) return null;
  const stack: ItemStack = { item, count: batches };
  if (getItemStackLimit(item) === 1) {
    const durability = removedDurabilities.get(item)?.shift();
    if (durability !== undefined) stack.durability = durability;
  }
  return stack;
}

function removeRecipeIngredients(
  slots: Array<ItemStack | null>,
  counts: ReadonlyMap<ItemId, number>
): Map<ItemId, Array<number | undefined>> | null {
  const removedDurabilities = new Map<ItemId, Array<number | undefined>>();

  for (const [item, required] of counts) {
    let remaining = required;
    for (let index = 0; index < slots.length && remaining > 0; index += 1) {
      const stack = slots[index];
      if (!stack || stack.item !== item) continue;
      const removed = Math.min(stack.count, remaining);
      if (getItemStackLimit(item) === 1) {
        const durabilities = removedDurabilities.get(item) ?? [];
        for (let count = 0; count < removed; count += 1) {
          durabilities.push(stack.durability);
        }
        removedDurabilities.set(item, durabilities);
      }
      stack.count -= removed;
      remaining -= removed;
      if (stack.count <= 0) slots[index] = null;
    }
    if (remaining > 0) return null;
  }

  return removedDurabilities;
}

function addStackToInventorySlots(
  slots: Array<ItemStack | null>,
  stack: Readonly<ItemStack>
): number {
  const limit = getItemStackLimit(stack.item);
  let remaining = stack.count;

  if (limit > 1 && stack.durability === undefined) {
    for (const existing of slots) {
      if (
        !existing ||
        existing.item !== stack.item ||
        existing.durability !== undefined ||
        existing.count >= limit
      ) {
        continue;
      }
      const transferred = Math.min(limit - existing.count, remaining);
      existing.count += transferred;
      remaining -= transferred;
      if (remaining === 0) return 0;
    }
  }

  for (let index = 0; index < slots.length && remaining > 0; index += 1) {
    if (slots[index]) continue;
    const transferred = Math.min(limit, remaining);
    const moved: ItemStack = { item: stack.item, count: transferred };
    if (stack.durability !== undefined) moved.durability = stack.durability;
    slots[index] = moved;
    remaining -= transferred;
  }
  return remaining;
}

function cloneItemStack(stack: ItemStack | null): ItemStack | null {
  if (!stack) return null;
  const clone: ItemStack = { item: stack.item, count: stack.count };
  if (stack.durability !== undefined) clone.durability = stack.durability;
  return clone;
}

function getPatternItem(
  recipe: CraftingRecipeDefinition,
  patternX: number,
  patternY: number,
  mirrored: boolean
): ItemId | null {
  const sourceX = mirrored ? recipe.width - 1 - patternX : patternX;
  return recipe.pattern[sourceX + patternY * recipe.width] ?? null;
}

function normalizeCraftingStack(stack: ItemStack | null): ItemStack | null {
  if (!stack || !isItemId(stack.item)) return null;
  const count = Math.max(
    1,
    Math.min(
      getItemStackLimit(stack.item),
      Math.trunc(Number.isFinite(stack.count) ? stack.count : 1)
    )
  );
  const normalized: ItemStack = { item: stack.item, count };
  if (stack.durability !== undefined) {
    normalized.durability = Math.max(
      1,
      Math.trunc(Number.isFinite(stack.durability) ? stack.durability : 1)
    );
  }
  return normalized;
}

function stacksEqual(a: ItemStack | null, b: ItemStack | null): boolean {
  return a?.item === b?.item && a?.count === b?.count && a?.durability === b?.durability;
}

function getInventoryCapacity(inventory: ItemInventory, item: ItemId): number {
  const limit = getItemStackLimit(item);
  let capacity = 0;
  for (const slot of inventory.getSnapshot().slots) {
    if (!slot) capacity += limit;
    else if (slot.item === item && limit > 1) capacity += Math.max(0, limit - slot.count);
  }
  return capacity;
}
