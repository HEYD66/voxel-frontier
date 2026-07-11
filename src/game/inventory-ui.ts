import type { CraftingRecipeDefinition } from './crafting';
import {
  ARMOR_DEFINITIONS,
  getItemStackLimit,
  isArmorItemId,
  isFoodItemId,
  isToolItemId,
  TOOL_DEFINITIONS,
  type ItemId,
  type ItemStack
} from './survival';
import { BlockId } from './types';
import type {
  CraftingRecipe,
  InventoryItemIcon,
  InventoryItemStack,
  SurvivalInventoryState
} from './ui';

export function toInventoryItemStack(stack: ItemStack | null): InventoryItemStack | null {
  if (!stack) return null;
  const itemId = stack.item;
  const uiStack: InventoryItemStack = {
    itemId,
    count: stack.count,
    maxCount: getItemStackLimit(itemId),
    icon: getItemIcon(itemId)
  };
  if (typeof itemId === 'number') uiStack.block = itemId as BlockId;
  if (isToolItemId(itemId)) {
    const definition = TOOL_DEFINITIONS[itemId];
    uiStack.durability = {
      current: stack.durability ?? definition.maxDurability,
      max: definition.maxDurability
    };
  } else if (isArmorItemId(itemId)) {
    const definition = ARMOR_DEFINITIONS[itemId];
    uiStack.durability = {
      current: stack.durability ?? definition.maxDurability,
      max: definition.maxDurability
    };
  }
  return uiStack;
}

export function createSurvivalInventoryState(
  inventorySlots: readonly (ItemStack | null)[],
  craftingSlots: readonly (ItemStack | null)[],
  craftOutput: ItemStack | null,
  cursor: ItemStack | null,
  armorSlots: readonly (ItemStack | null)[] = []
): SurvivalInventoryState {
  return {
    main: inventorySlots.slice(9, 36).map(toInventoryItemStack),
    hotbar: inventorySlots.slice(0, 9).map(toInventoryItemStack),
    crafting: craftingSlots.slice(0, 9).map(toInventoryItemStack),
    craftOutput: toInventoryItemStack(craftOutput),
    armor: Array.from({ length: 4 }, (_, index) => toInventoryItemStack(armorSlots[index] ?? null)),
    offhand: null,
    cursor: toInventoryItemStack(cursor)
  };
}

export function createUICraftingRecipes(
  recipes: readonly CraftingRecipeDefinition[]
): CraftingRecipe[] {
  return recipes.map((recipe) => {
    const ingredientCounts = new Map<ItemId, number>();
    for (const item of recipe.pattern) {
      if (item === null) continue;
      ingredientCounts.set(item, (ingredientCounts.get(item) ?? 0) + 1);
    }
    return {
      id: recipe.id,
      label: recipe.label,
      output: toInventoryItemStack(recipe.output)!,
      ingredients: [...ingredientCounts].map(([itemId, count]) => ({ itemId, count })),
      pattern: recipe.pattern.map((item) => (item === null ? null : String(item))),
      unlocked: true,
      craftable: false
    };
  });
}

function getItemIcon(item: ItemStack['item']): InventoryItemIcon {
  if (typeof item === 'number') return 'block';
  if (item.endsWith('_pickaxe')) return 'pickaxe';
  if (item.endsWith('_axe')) return 'axe';
  if (item.endsWith('_shovel')) return 'shovel';
  if (item.endsWith('_sword')) return 'sword';
  if (isArmorItemId(item)) return 'armor';
  if (isFoodItemId(item)) return 'food';
  return 'material';
}

export function isBlockItem(stack: ItemStack | null): stack is ItemStack & { item: BlockId } {
  return stack !== null && typeof stack.item === 'number' && stack.item > BlockId.Air;
}
