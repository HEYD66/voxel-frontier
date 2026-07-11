import {
  TOOL_DEFINITIONS,
  TOOL_ITEM_IDS,
  getItemStackLimit,
  isItemId,
  isToolItemId,
  type ItemId,
  type ItemStack
} from './survival';
import { BlockId } from './types';

export const FURNACE_COOK_DURATION = 10;
const TIMER_EPSILON = 1e-9;

export type FurnaceSlot = 'input' | 'fuel' | 'output';

export interface FurnaceRecipeDefinition {
  id: string;
  input: ItemId;
  output: ItemStack;
  cookDuration: number;
}

export interface FurnaceFuelDefinition {
  item: ItemId;
  burnDuration: number;
}

export interface FurnaceSnapshot {
  version: 1;
  input: ItemStack | null;
  fuel: ItemStack | null;
  output: ItemStack | null;
  /** Remaining burn time in seconds. */
  burnTime: number;
  /** Total duration of the currently consumed fuel item in seconds. */
  burnDuration: number;
  /** Accumulated progress for the current input in seconds. */
  cookTime: number;
  /** Required duration for one smelting operation in seconds. */
  cookDuration: number;
}

export interface FurnaceUpdateResult {
  elapsed: number;
  fuelConsumed: number;
  itemsSmelted: number;
  burning: boolean;
  slotsChanged: boolean;
  progressChanged: boolean;
  changed: boolean;
}

export const FURNACE_RECIPES: readonly FurnaceRecipeDefinition[] = [
  {
    id: 'stone',
    input: BlockId.Cobblestone,
    output: { item: BlockId.Stone, count: 1 },
    cookDuration: FURNACE_COOK_DURATION
  },
  {
    id: 'iron_ingot',
    input: 'raw_iron',
    output: { item: 'iron_ingot', count: 1 },
    cookDuration: FURNACE_COOK_DURATION
  },
  {
    id: 'cooked_pork',
    input: 'raw_pork',
    output: { item: 'cooked_pork', count: 1 },
    cookDuration: FURNACE_COOK_DURATION
  },
  {
    id: 'cooked_mutton',
    input: 'raw_mutton',
    output: { item: 'cooked_mutton', count: 1 },
    cookDuration: FURNACE_COOK_DURATION
  },
  {
    id: 'cooked_beef',
    input: 'raw_beef',
    output: { item: 'cooked_beef', count: 1 },
    cookDuration: FURNACE_COOK_DURATION
  },
  {
    id: 'glass',
    input: BlockId.Sand,
    output: { item: BlockId.Glass, count: 1 },
    cookDuration: FURNACE_COOK_DURATION
  }
];

export const FURNACE_FUELS: readonly FurnaceFuelDefinition[] = [
  { item: 'coal', burnDuration: 80 },
  { item: BlockId.Wood, burnDuration: 15 },
  { item: BlockId.Planks, burnDuration: 15 },
  { item: BlockId.CraftingTable, burnDuration: 15 },
  { item: 'stick', burnDuration: 5 },
  { item: TOOL_ITEM_IDS.woodenPickaxe, burnDuration: 10 },
  { item: TOOL_ITEM_IDS.woodenAxe, burnDuration: 10 },
  { item: TOOL_ITEM_IDS.woodenShovel, burnDuration: 10 },
  { item: TOOL_ITEM_IDS.woodenSword, burnDuration: 10 }
];

const RECIPE_BY_INPUT = new Map<ItemId, FurnaceRecipeDefinition>(
  FURNACE_RECIPES.map((recipe) => [recipe.input, recipe])
);
const FUEL_DURATION_BY_ITEM = new Map<ItemId, number>(
  FURNACE_FUELS.map((fuel) => [fuel.item, fuel.burnDuration])
);
const VALID_FUEL_BURN_DURATIONS = new Set<number>([
  0,
  ...FURNACE_FUELS.map((fuel) => fuel.burnDuration)
]);

export function getFurnaceRecipe(item: unknown): FurnaceRecipeDefinition | null {
  if (!isItemId(item)) return null;
  return RECIPE_BY_INPUT.get(item) ?? null;
}

export function getFuelBurnDuration(item: unknown): number {
  if (!isItemId(item)) return 0;
  return FUEL_DURATION_BY_ITEM.get(item) ?? 0;
}

export function isFurnaceFuel(item: unknown): item is ItemId {
  return getFuelBurnDuration(item) > 0;
}

export function canInsertIntoFurnaceSlot(
  slot: FurnaceSlot,
  value: ItemStack | ItemId | null
): boolean {
  const item = value && typeof value === 'object' ? value.item : value;
  if (slot === 'input') return getFurnaceRecipe(item) !== null;
  if (slot === 'fuel') return isFurnaceFuel(item);
  return false;
}

export function sanitizeFurnaceSnapshot(value: unknown): FurnaceSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<FurnaceSnapshot>;
  if (candidate.version !== 1) return undefined;

  const input = sanitizeSerializedStack(candidate.input);
  const fuel = sanitizeSerializedStack(candidate.fuel);
  const output = sanitizeSerializedStack(candidate.output);
  if (input === undefined || fuel === undefined || output === undefined) return undefined;
  if (input && getFurnaceRecipe(input.item) === null) return undefined;
  if (fuel && !isFurnaceFuel(fuel.item)) return undefined;
  if (
    output &&
    !FURNACE_RECIPES.some((recipe) => recipe.output.item === output.item)
  ) {
    return undefined;
  }
  if (
    !isFiniteNumber(candidate.burnTime) ||
    !isFiniteNumber(candidate.burnDuration) ||
    !isFiniteNumber(candidate.cookTime) ||
    !isFiniteNumber(candidate.cookDuration)
  ) {
    return undefined;
  }

  const burnDuration = VALID_FUEL_BURN_DURATIONS.has(candidate.burnDuration)
    ? candidate.burnDuration
    : 0;
  const burnTime = clamp(candidate.burnTime, 0, burnDuration);
  const recipe = input ? getFurnaceRecipe(input.item) : null;
  const cookDuration = recipe?.cookDuration ?? FURNACE_COOK_DURATION;
  const cookTime =
    recipe &&
    candidate.cookDuration === cookDuration &&
    candidate.cookTime < cookDuration
      ? clamp(candidate.cookTime, 0, cookDuration)
      : 0;
  return {
    version: 1,
    input,
    fuel,
    output,
    burnTime,
    burnDuration,
    cookTime,
    cookDuration
  };
}

export class FurnaceStateMachine {
  private inputSlot: ItemStack | null = null;
  private fuelSlot: ItemStack | null = null;
  private outputSlot: ItemStack | null = null;
  private burnTimeValue = 0;
  private burnDurationValue = 0;
  private cookTimeValue = 0;
  private cookDurationValue = FURNACE_COOK_DURATION;

  constructor(snapshot?: unknown) {
    if (snapshot !== undefined) this.loadSnapshot(snapshot);
  }

  get burning(): boolean {
    return this.burnTimeValue > TIMER_EPSILON;
  }

  get burnProgress(): number {
    if (this.burnDurationValue <= 0) return 0;
    return clamp(this.burnTimeValue / this.burnDurationValue, 0, 1);
  }

  get cookProgress(): number {
    if (this.cookDurationValue <= 0) return 0;
    return clamp(this.cookTimeValue / this.cookDurationValue, 0, 1);
  }

  getSlot(slot: FurnaceSlot): ItemStack | null {
    return cloneStack(this.getSlotReference(slot));
  }

  getSnapshot(): FurnaceSnapshot {
    return {
      version: 1,
      input: cloneStack(this.inputSlot),
      fuel: cloneStack(this.fuelSlot),
      output: cloneStack(this.outputSlot),
      burnTime: this.burnTimeValue,
      burnDuration: this.burnDurationValue,
      cookTime: this.cookTimeValue,
      cookDuration: this.cookDurationValue
    };
  }

  loadSnapshot(value: unknown): boolean {
    const snapshot = sanitizeFurnaceSnapshot(value);
    if (!snapshot) return false;
    this.inputSlot = cloneStack(snapshot.input);
    this.fuelSlot = cloneStack(snapshot.fuel);
    this.outputSlot = cloneStack(snapshot.output);
    this.burnTimeValue = snapshot.burnTime;
    this.burnDurationValue = snapshot.burnDuration;
    this.cookTimeValue = snapshot.cookTime;
    this.cookDurationValue = snapshot.cookDuration;
    return true;
  }

  setSlot(slot: FurnaceSlot, stack: ItemStack | null): boolean {
    const normalized = normalizeStack(stack);
    const previous = this.getSlotReference(slot);
    if (stacksEqual(previous, normalized)) return false;

    if (slot === 'input') {
      const inputChanged = previous?.item !== normalized?.item;
      this.inputSlot = normalized;
      if (inputChanged) {
        const recipe = normalized ? getFurnaceRecipe(normalized.item) : null;
        this.cookTimeValue = 0;
        this.cookDurationValue = recipe?.cookDuration ?? FURNACE_COOK_DURATION;
      }
    } else if (slot === 'fuel') {
      this.fuelSlot = normalized;
    } else {
      this.outputSlot = normalized;
    }
    return true;
  }

  canAccept(slot: FurnaceSlot, value: ItemStack | ItemId | null): boolean {
    return canInsertIntoFurnaceSlot(slot, value);
  }

  insert(slot: FurnaceSlot, stack: ItemStack): number {
    const requested = normalizeCount(stack.count);
    if (
      requested <= 0 ||
      !isItemId(stack.item) ||
      !canInsertIntoFurnaceSlot(slot, stack)
    ) {
      return requested;
    }
    const limit = getItemStackLimit(stack.item);
    const existing = this.getSlotReference(slot);
    if (
      existing &&
      (existing.item !== stack.item || existing.durability !== stack.durability)
    ) {
      return requested;
    }

    const transfer = Math.min(requested, Math.max(0, limit - (existing?.count ?? 0)));
    if (transfer <= 0) return requested;
    const next: ItemStack = {
      item: stack.item,
      count: (existing?.count ?? 0) + transfer
    };
    if (isToolItemId(stack.item)) {
      next.count = 1;
      next.durability = normalizeToolDurability(stack);
    }
    this.setSlot(slot, next);
    return requested - transfer;
  }

  remove(slot: FurnaceSlot, count = 1): ItemStack | null {
    const existing = this.getSlotReference(slot);
    if (!existing) return null;
    const amount = Math.min(existing.count, Math.max(1, normalizeCount(count)));
    const removed: ItemStack = { item: existing.item, count: amount };
    if (existing.durability !== undefined) removed.durability = existing.durability;
    const remaining = existing.count - amount;
    this.setSlot(slot, remaining > 0 ? { ...existing, count: remaining } : null);
    return removed;
  }

  canSmelt(): boolean {
    const recipe = this.inputSlot ? getFurnaceRecipe(this.inputSlot.item) : null;
    return recipe !== null && this.hasOutputCapacity(recipe.output);
  }

  update(deltaTime: number): FurnaceUpdateResult {
    const elapsed = isFiniteNumber(deltaTime) && deltaTime > 0 ? deltaTime : 0;
    const before = this.getSnapshot();
    let remaining = elapsed;
    let fuelConsumed = 0;
    let itemsSmelted = 0;

    while (remaining > TIMER_EPSILON) {
      let recipe = this.getActiveRecipe();
      let canSmelt = recipe !== null && this.hasOutputCapacity(recipe.output);

      if (!this.burning && canSmelt) {
        const fuelDuration = this.fuelSlot
          ? getFuelBurnDuration(this.fuelSlot.item)
          : 0;
        if (fuelDuration > 0) {
          this.consumeFuel();
          this.burnTimeValue = fuelDuration;
          this.burnDurationValue = fuelDuration;
          fuelConsumed += 1;
        }
      }

      if (!this.burning) {
        this.decayCookProgress(remaining);
        remaining = 0;
        break;
      }

      recipe = this.getActiveRecipe();
      canSmelt = recipe !== null && this.hasOutputCapacity(recipe.output);
      if (!canSmelt || !recipe) {
        const step = Math.min(remaining, this.burnTimeValue);
        this.burnTimeValue -= step;
        this.decayCookProgress(step);
        remaining -= step;
        this.normalizeTimers();
        continue;
      }

      this.cookDurationValue = recipe.cookDuration;
      const timeToCook = Math.max(0, this.cookDurationValue - this.cookTimeValue);
      if (timeToCook <= TIMER_EPSILON) {
        if (this.completeSmelt(recipe)) {
          itemsSmelted += recipe.output.count;
          this.cookTimeValue = 0;
        } else {
          this.decayCookProgress(remaining);
          remaining = 0;
        }
        continue;
      }

      const step = Math.min(remaining, this.burnTimeValue, timeToCook);
      this.burnTimeValue -= step;
      this.cookTimeValue += step;
      remaining -= step;

      if (this.cookTimeValue >= this.cookDurationValue - TIMER_EPSILON) {
        if (this.completeSmelt(recipe)) {
          itemsSmelted += recipe.output.count;
          this.cookTimeValue = 0;
        }
      }
      this.normalizeTimers();
    }

    this.normalizeTimers();
    const after = this.getSnapshot();
    const slotsChanged = !snapshotSlotsEqual(before, after);
    const progressChanged = !snapshotProgressEqual(before, after);
    return {
      elapsed,
      fuelConsumed,
      itemsSmelted,
      burning: this.burning,
      slotsChanged,
      progressChanged,
      changed: slotsChanged || progressChanged
    };
  }

  takeAllContents(): ItemStack[] {
    const contents = [this.inputSlot, this.fuelSlot, this.outputSlot]
      .filter((stack): stack is ItemStack => stack !== null)
      .map((stack) => ({ ...stack }));
    this.clear();
    return contents;
  }

  clear(): void {
    this.inputSlot = null;
    this.fuelSlot = null;
    this.outputSlot = null;
    this.burnTimeValue = 0;
    this.burnDurationValue = 0;
    this.cookTimeValue = 0;
    this.cookDurationValue = FURNACE_COOK_DURATION;
  }

  private getSlotReference(slot: FurnaceSlot): ItemStack | null {
    if (slot === 'input') return this.inputSlot;
    if (slot === 'fuel') return this.fuelSlot;
    return this.outputSlot;
  }

  private getActiveRecipe(): FurnaceRecipeDefinition | null {
    return this.inputSlot ? getFurnaceRecipe(this.inputSlot.item) : null;
  }

  private hasOutputCapacity(output: ItemStack): boolean {
    const limit = getItemStackLimit(output.item);
    if (!this.outputSlot) return output.count <= limit;
    return (
      this.outputSlot.item === output.item &&
      this.outputSlot.durability === output.durability &&
      this.outputSlot.count + output.count <= limit
    );
  }

  private consumeFuel(): void {
    if (!this.fuelSlot) return;
    this.fuelSlot.count -= 1;
    if (this.fuelSlot.count <= 0) this.fuelSlot = null;
  }

  private completeSmelt(recipe: FurnaceRecipeDefinition): boolean {
    if (
      !this.inputSlot ||
      this.inputSlot.item !== recipe.input ||
      !this.hasOutputCapacity(recipe.output)
    ) {
      return false;
    }

    this.inputSlot.count -= 1;
    if (this.inputSlot.count <= 0) this.inputSlot = null;
    if (!this.outputSlot) {
      this.outputSlot = cloneStack(recipe.output);
    } else {
      this.outputSlot.count += recipe.output.count;
    }
    return true;
  }

  private decayCookProgress(duration: number): void {
    if (duration <= 0 || this.cookTimeValue <= 0) return;
    this.cookTimeValue = Math.max(0, this.cookTimeValue - duration * 2);
  }

  private normalizeTimers(): void {
    if (this.burnTimeValue <= TIMER_EPSILON) this.burnTimeValue = 0;
    if (this.cookTimeValue <= TIMER_EPSILON) this.cookTimeValue = 0;
    this.burnTimeValue = Math.min(this.burnTimeValue, this.burnDurationValue);
    this.cookTimeValue = Math.min(this.cookTimeValue, this.cookDurationValue);
  }
}

function sanitizeSerializedStack(value: unknown): ItemStack | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<ItemStack>;
  if (!isItemId(candidate.item) || !isFiniteNumber(candidate.count)) return undefined;
  if (isToolItemId(candidate.item) && candidate.durability !== undefined) {
    if (!isFiniteNumber(candidate.durability)) return undefined;
  }
  return normalizeStack(candidate as ItemStack);
}

function normalizeStack(stack: ItemStack | null): ItemStack | null {
  if (!stack || !isItemId(stack.item) || !isFiniteNumber(stack.count)) return null;
  const count = Math.max(1, Math.min(getItemStackLimit(stack.item), Math.trunc(stack.count)));
  if (!isToolItemId(stack.item)) return { item: stack.item, count };
  return {
    item: stack.item,
    count: 1,
    durability: normalizeToolDurability(stack)
  };
}

function normalizeToolDurability(stack: ItemStack): number {
  if (!isToolItemId(stack.item)) return 0;
  const maximum = TOOL_DEFINITIONS[stack.item].maxDurability;
  const durability = isFiniteNumber(stack.durability)
    ? Math.trunc(stack.durability)
    : maximum;
  return Math.max(1, Math.min(maximum, durability));
}

function cloneStack(stack: ItemStack | null): ItemStack | null {
  return stack ? { ...stack } : null;
}

function stacksEqual(a: ItemStack | null, b: ItemStack | null): boolean {
  return a?.item === b?.item && a?.count === b?.count && a?.durability === b?.durability;
}

function snapshotSlotsEqual(a: FurnaceSnapshot, b: FurnaceSnapshot): boolean {
  return (
    stacksEqual(a.input, b.input) &&
    stacksEqual(a.fuel, b.fuel) &&
    stacksEqual(a.output, b.output)
  );
}

function snapshotProgressEqual(a: FurnaceSnapshot, b: FurnaceSnapshot): boolean {
  return (
    a.burnTime === b.burnTime &&
    a.burnDuration === b.burnDuration &&
    a.cookTime === b.cookTime &&
    a.cookDuration === b.cookDuration
  );
}

function normalizeCount(value: number): number {
  return Math.max(0, Math.trunc(isFiniteNumber(value) ? value : 0));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
