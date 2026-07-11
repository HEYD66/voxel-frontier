import { CraftingGrid, type CraftingRecipeDefinition } from './crafting';
import {
  FurnaceStateMachine,
  getFurnaceRecipe,
  isFurnaceFuel,
  type FurnaceSlot
} from './furnace';
import {
  TOOL_DEFINITIONS,
  getArmorDefinition,
  getItemStackLimit,
  isArmorItemId,
  isToolItemId,
  ItemInventory,
  type ItemStack
} from './survival';
import { ArmorEquipment, armorSlotToIndex } from './equipment';
import type { InventoryArea } from './ui';

export type InventoryButton = 'primary' | 'secondary';
export type InventoryActionArea = InventoryArea | 'chest';

export interface InventoryActionResult {
  changed: boolean;
  cursor: ItemStack | null;
}

/** Minimal mutable storage contract shared by single and combined chests. */
export interface ChestInventoryContainer {
  readonly size: number;
  getSlot(index: number): ItemStack | null;
  setSlot(index: number, stack: ItemStack | null): boolean;
  remove(index: number, count?: number): ItemStack | null;
  addStack(stack: ItemStack): number;
}

export class InventoryActions {
  private cursorStack: ItemStack | null = null;
  private furnace: FurnaceStateMachine | null = null;
  private chest: ChestInventoryContainer | null = null;

  constructor(
    private readonly inventory: ItemInventory,
    private crafting: CraftingGrid,
    private readonly equipment = new ArmorEquipment()
  ) {}

  setCraftingGrid(crafting: CraftingGrid): void {
    this.crafting = crafting;
  }

  setFurnace(furnace: FurnaceStateMachine | null): void {
    this.furnace = furnace;
  }

  setChest(chest: ChestInventoryContainer | null): void {
    this.chest = chest;
  }

  get cursor(): ItemStack | null {
    return cloneStack(this.cursorStack);
  }

  setCursor(stack: ItemStack | null): void {
    this.cursorStack = cloneStack(stack);
  }

  takeCraftOutput(
    recipes?: readonly CraftingRecipeDefinition[]
  ): InventoryActionResult {
    const preview = recipes
      ? this.crafting.getOutput(recipes)
      : this.crafting.getOutput();
    if (!preview) return { changed: false, cursor: this.cursor };

    const output = normalizeCraftedStack(preview);
    if (!canCursorAccept(this.cursorStack, output)) {
      return { changed: false, cursor: this.cursor };
    }

    const result = recipes
      ? this.crafting.takeOutput(recipes)
      : this.crafting.takeOutput();
    if (!result.crafted || !result.output) {
      return { changed: false, cursor: this.cursor };
    }

    const taken = normalizeCraftedStack(result.output);
    if (!this.cursorStack) this.cursorStack = taken;
    else this.cursorStack.count += taken.count;
    return { changed: true, cursor: this.cursor };
  }

  click(
    area: InventoryActionArea,
    index: number,
    button: InventoryButton,
    shiftKey = false
  ): InventoryActionResult {
    const furnaceSlot = getFurnaceSlot(area);
    if (furnaceSlot) {
      if (index !== 0 || !this.furnace) return { changed: false, cursor: this.cursor };
      return this.clickFurnace(furnaceSlot, button, shiftKey);
    }
    if (area === 'craft-output') {
      if (index !== 0) return { changed: false, cursor: this.cursor };
      return shiftKey
        ? { changed: false, cursor: this.cursor }
        : this.takeCraftOutput();
    }
    if (area === 'armor') {
      return this.clickArmor(index, button, shiftKey);
    }
    if (area === 'offhand') {
      return { changed: false, cursor: this.cursor };
    }
    if (area === 'crafting') {
      if (!Number.isInteger(index) || index < 0 || index >= this.crafting.size) {
        return { changed: false, cursor: this.cursor };
      }
      return this.clickCrafting(index, button, shiftKey);
    }
    if (area === 'chest') {
      if (!this.chest || !isValidSlotIndex(index, this.chest.size)) {
        return { changed: false, cursor: this.cursor };
      }
      return shiftKey
        ? this.shiftStorage(this.chest, index, this.inventory)
        : this.clickStorage(this.chest, index, button);
    }
    if (area !== 'hotbar' && area !== 'main') return { changed: false, cursor: this.cursor };
    if (!Number.isInteger(index) || index < 0) return { changed: false, cursor: this.cursor };
    const areaSize = area === 'hotbar'
      ? Math.min(9, this.inventory.size)
      : Math.min(27, Math.max(0, this.inventory.size - 9));
    if (index >= areaSize) return { changed: false, cursor: this.cursor };
    const inventoryIndex = area === 'hotbar' ? index : index + 9;
    if (shiftKey) {
      const stack = this.inventory.getSlot(inventoryIndex);
      if (this.chest) {
        return this.shiftStorage(this.inventory, inventoryIndex, this.chest);
      }
      if (stack && isArmorItemId(stack.item)) {
        const armorResult = this.shiftInventoryToArmor(inventoryIndex, stack);
        if (armorResult.changed) return armorResult;
      }
      if (
        this.furnace &&
        stack &&
        (getFurnaceRecipe(stack.item) !== null || isFurnaceFuel(stack.item))
      ) {
        return this.shiftInventoryToFurnace(inventoryIndex, stack);
      }
      return this.shiftInventory(inventoryIndex, area === 'hotbar' ? [9, 36] : [0, 9]);
    }
    return this.clickInventory(inventoryIndex, button);
  }

  doubleClick(area: InventoryActionArea, index: number): InventoryActionResult {
    const selected = this.getStorageSlot(area, index);
    if (!selected) return { changed: false, cursor: this.cursor };
    const target = this.cursorStack ?? selected.storage.getSlot(selected.index);
    if (!target || !isCollectibleStack(target)) {
      return { changed: false, cursor: this.cursor };
    }

    const capacity = getItemStackLimit(target.item) - (this.cursorStack?.count ?? 0);
    if (capacity <= 0) return { changed: false, cursor: this.cursor };

    const removals: Array<{ storage: SlotStorage; index: number; count: number }> = [];
    let remaining = capacity;
    const sources: SlotStorage[] = this.chest
      ? [this.chest, this.inventory]
      : [this.inventory];

    for (const storage of sources) {
      for (let sourceIndex = 0; sourceIndex < storage.size && remaining > 0; sourceIndex += 1) {
        const stack = storage.getSlot(sourceIndex);
        if (!stack || !canStack(stack, target)) continue;
        const count = Math.min(stack.count, remaining);
        if (count <= 0) continue;
        removals.push({ storage, index: sourceIndex, count });
        remaining -= count;
      }
      if (remaining <= 0) break;
    }

    if (removals.length === 0) return { changed: false, cursor: this.cursor };

    let collected = 0;
    for (const removal of removals) {
      const removed = removal.storage.remove(removal.index, removal.count);
      collected += removed?.count ?? 0;
    }
    if (collected <= 0) return { changed: false, cursor: this.cursor };

    if (this.cursorStack) this.cursorStack.count += collected;
    else this.cursorStack = { item: target.item, count: collected };
    return { changed: true, cursor: this.cursor };
  }

  private clickArmor(
    index: number,
    _button: InventoryButton,
    shiftKey: boolean
  ): InventoryActionResult {
    if (!Number.isInteger(index) || index < 0 || index >= this.equipment.size) {
      return { changed: false, cursor: this.cursor };
    }
    const equipped = this.equipment.getSlot(index);
    if (shiftKey) {
      if (!equipped) return { changed: false, cursor: this.cursor };
      const remaining = this.inventory.addStack(equipped);
      if (remaining > 0) return { changed: false, cursor: this.cursor };
      this.equipment.setSlot(index, null);
      return { changed: true, cursor: this.cursor };
    }

    if (!this.cursorStack) {
      if (!equipped) return { changed: false, cursor: null };
      this.cursorStack = equipped;
      this.equipment.setSlot(index, null);
      return { changed: true, cursor: this.cursor };
    }

    const definition = getArmorDefinition(this.cursorStack.item);
    if (!definition || armorSlotToIndex(definition.slot) !== index) {
      return { changed: false, cursor: this.cursor };
    }
    const cursor = this.cursorStack;
    if (!this.equipment.setSlot(index, cursor)) {
      return { changed: false, cursor: this.cursor };
    }
    this.cursorStack = equipped;
    return { changed: true, cursor: this.cursor };
  }

  private shiftInventoryToArmor(
    inventoryIndex: number,
    stack: ItemStack
  ): InventoryActionResult {
    const definition = getArmorDefinition(stack.item);
    if (!definition) return { changed: false, cursor: this.cursor };
    const equipmentIndex = armorSlotToIndex(definition.slot);
    if (equipmentIndex < 0 || this.equipment.getSlot(equipmentIndex)) {
      return { changed: false, cursor: this.cursor };
    }
    const removed = this.inventory.remove(inventoryIndex, 1);
    if (!removed || !this.equipment.setSlot(equipmentIndex, removed)) {
      if (removed) this.inventory.addStack(removed);
      return { changed: false, cursor: this.cursor };
    }
    return { changed: true, cursor: this.cursor };
  }

  returnCursor(): ItemStack[] {
    if (!this.cursorStack) return [];
    const cursor = this.cursorStack;
    const remaining = this.inventory.addStack(cursor);
    this.cursorStack = null;
    return remaining > 0 ? [{ ...cursor, count: remaining }] : [];
  }

  returnCursorAndCrafting(): ItemStack[] {
    const overflow = this.returnCursor();
    overflow.push(...this.crafting.returnItems(this.inventory));
    return overflow;
  }

  private clickFurnace(
    slotName: FurnaceSlot,
    button: InventoryButton,
    shiftKey: boolean
  ): InventoryActionResult {
    const furnace = this.furnace;
    if (!furnace) return { changed: false, cursor: this.cursor };
    if (shiftKey) return this.shiftFurnaceToInventory(slotName);

    const slot = furnace.getSlot(slotName);
    if (slotName === 'output') {
      if (!slot) return { changed: false, cursor: this.cursor };
      if (!this.cursorStack) {
        const amount = button === 'secondary' ? Math.ceil(slot.count / 2) : slot.count;
        this.cursorStack = furnace.remove('output', amount);
        return { changed: true, cursor: this.cursor };
      }
      if (!canStack(slot, this.cursorStack)) {
        return { changed: false, cursor: this.cursor };
      }
      const capacity = getItemStackLimit(slot.item) - this.cursorStack.count;
      const amount = button === 'secondary'
        ? Math.min(1, capacity)
        : Math.min(slot.count, capacity);
      if (amount <= 0) return { changed: false, cursor: this.cursor };
      const removed = furnace.remove('output', amount);
      if (!removed) return { changed: false, cursor: this.cursor };
      this.cursorStack.count += removed.count;
      return { changed: true, cursor: this.cursor };
    }

    if (!this.cursorStack) {
      if (!slot) return { changed: false, cursor: null };
      const amount = button === 'secondary' ? Math.ceil(slot.count / 2) : slot.count;
      this.cursorStack = furnace.remove(slotName, amount);
      return { changed: true, cursor: this.cursor };
    }

    if (!furnace.canAccept(slotName, this.cursorStack)) {
      return { changed: false, cursor: this.cursor };
    }
    if (!slot) {
      const amount = button === 'secondary' ? 1 : this.cursorStack.count;
      const remaining = furnace.insert(slotName, { ...this.cursorStack, count: amount });
      const moved = amount - remaining;
      if (moved <= 0) return { changed: false, cursor: this.cursor };
      this.cursorStack.count -= moved;
      if (this.cursorStack.count <= 0) this.cursorStack = null;
      return { changed: true, cursor: this.cursor };
    }

    if (canStack(slot, this.cursorStack)) {
      const amount = button === 'secondary' ? 1 : this.cursorStack.count;
      const remaining = furnace.insert(slotName, { ...this.cursorStack, count: amount });
      const moved = amount - remaining;
      if (moved <= 0) return { changed: false, cursor: this.cursor };
      this.cursorStack.count -= moved;
      if (this.cursorStack.count <= 0) this.cursorStack = null;
      return { changed: true, cursor: this.cursor };
    }

    if (button === 'secondary') return { changed: false, cursor: this.cursor };
    furnace.setSlot(slotName, this.cursorStack);
    this.cursorStack = slot;
    return { changed: true, cursor: this.cursor };
  }

  private shiftFurnaceToInventory(slotName: FurnaceSlot): InventoryActionResult {
    const furnace = this.furnace;
    const stack = furnace?.getSlot(slotName) ?? null;
    if (!furnace || !stack) return { changed: false, cursor: this.cursor };
    const remaining = this.inventory.addStack(stack);
    const moved = stack.count - remaining;
    if (moved <= 0) return { changed: false, cursor: this.cursor };
    furnace.remove(slotName, moved);
    return { changed: true, cursor: this.cursor };
  }

  private shiftInventoryToFurnace(index: number, stack: ItemStack): InventoryActionResult {
    const furnace = this.furnace;
    if (!furnace) return { changed: false, cursor: this.cursor };
    const slotName: FurnaceSlot = getFurnaceRecipe(stack.item) !== null ? 'input' : 'fuel';
    const remaining = furnace.insert(slotName, stack);
    const moved = stack.count - remaining;
    if (moved <= 0) return { changed: false, cursor: this.cursor };
    this.inventory.remove(index, moved);
    return { changed: true, cursor: this.cursor };
  }

  private clickInventory(index: number, button: InventoryButton): InventoryActionResult {
    return this.clickStorage(this.inventory, index, button);
  }

  private clickStorage(
    storage: SlotStorage,
    index: number,
    button: InventoryButton
  ): InventoryActionResult {
    const slot = storage.getSlot(index);
    if (!this.cursorStack) {
      if (!slot) return { changed: false, cursor: null };
      const amount = button === 'secondary' ? Math.ceil(slot.count / 2) : slot.count;
      this.cursorStack = storage.remove(index, amount);
      return { changed: true, cursor: this.cursor };
    }

    if (!slot) {
      const amount = button === 'secondary' ? 1 : this.cursorStack.count;
      const placed = { ...this.cursorStack, count: amount };
      storage.setSlot(index, placed);
      this.cursorStack.count -= amount;
      if (this.cursorStack.count <= 0) this.cursorStack = null;
      return { changed: true, cursor: this.cursor };
    }

    if (canStack(slot, this.cursorStack)) {
      const limit = getItemStackLimit(slot.item);
      const amount = button === 'secondary'
        ? Math.min(1, limit - slot.count)
        : Math.min(this.cursorStack.count, limit - slot.count);
      if (amount <= 0) return { changed: false, cursor: this.cursor };
      storage.setSlot(index, { ...slot, count: slot.count + amount });
      this.cursorStack.count -= amount;
      if (this.cursorStack.count <= 0) this.cursorStack = null;
      return { changed: true, cursor: this.cursor };
    }

    if (button === 'secondary') return { changed: false, cursor: this.cursor };
    storage.setSlot(index, this.cursorStack);
    this.cursorStack = slot;
    return { changed: true, cursor: this.cursor };
  }

  private clickCrafting(index: number, button: InventoryButton, shiftKey: boolean): InventoryActionResult {
    if (shiftKey) {
      const stack = this.crafting.getSlot(index);
      if (!stack) return { changed: false, cursor: this.cursor };
      const remaining = this.inventory.addStack(stack);
      const moved = stack.count - remaining;
      if (moved <= 0) return { changed: false, cursor: this.cursor };
      this.crafting.removeFromSlot(index, moved);
      return { changed: true, cursor: this.cursor };
    }

    const slot = this.crafting.getSlot(index);
    if (!this.cursorStack) {
      if (!slot) return { changed: false, cursor: null };
      const amount = button === 'secondary' ? Math.ceil(slot.count / 2) : slot.count;
      this.cursorStack = this.crafting.removeFromSlot(index, amount);
      return { changed: true, cursor: this.cursor };
    }

    if (!slot) {
      const amount = button === 'secondary' ? 1 : this.cursorStack.count;
      const remaining = this.crafting.addToSlot(index, { ...this.cursorStack, count: amount });
      const moved = amount - remaining;
      if (moved <= 0) return { changed: false, cursor: this.cursor };
      this.cursorStack.count -= moved;
      if (this.cursorStack.count <= 0) this.cursorStack = null;
      return { changed: true, cursor: this.cursor };
    }

    if (canStack(slot, this.cursorStack)) {
      const amount = button === 'secondary' ? 1 : this.cursorStack.count;
      const remaining = this.crafting.addToSlot(index, { ...this.cursorStack, count: amount });
      const moved = amount - remaining;
      if (moved <= 0) return { changed: false, cursor: this.cursor };
      this.cursorStack.count -= moved;
      if (this.cursorStack.count <= 0) this.cursorStack = null;
      return { changed: true, cursor: this.cursor };
    }

    if (button === 'secondary') return { changed: false, cursor: this.cursor };
    this.crafting.setSlot(index, this.cursorStack);
    this.cursorStack = slot;
    return { changed: true, cursor: this.cursor };
  }

  private shiftInventory(index: number, targetRange: readonly [number, number]): InventoryActionResult {
    const stack = this.inventory.getSlot(index);
    if (!stack) return { changed: false, cursor: this.cursor };
    let remaining = stack.count;
    const targetStart = Math.max(0, Math.min(this.inventory.size, targetRange[0]));
    const targetEnd = Math.max(targetStart, Math.min(this.inventory.size, targetRange[1]));

    for (let target = targetStart; target < targetEnd && remaining > 0; target += 1) {
      const targetStack = this.inventory.getSlot(target);
      if (!targetStack || !canStack(targetStack, stack)) continue;
      const capacity = getItemStackLimit(stack.item) - targetStack.count;
      const moved = Math.min(capacity, remaining);
      if (moved <= 0) continue;
      if (!this.inventory.setSlot(target, { ...targetStack, count: targetStack.count + moved })) {
        continue;
      }
      remaining -= moved;
    }
    for (let target = targetStart; target < targetEnd && remaining > 0; target += 1) {
      if (this.inventory.getSlot(target)) continue;
      const moved = Math.min(getItemStackLimit(stack.item), remaining);
      if (!this.inventory.setSlot(target, { ...stack, count: moved })) continue;
      remaining -= moved;
    }
    const moved = stack.count - remaining;
    if (moved <= 0) return { changed: false, cursor: this.cursor };
    this.inventory.remove(index, moved);
    return { changed: true, cursor: this.cursor };
  }

  private shiftStorage(
    source: SlotStorage,
    index: number,
    target: StackStorage
  ): InventoryActionResult {
    const stack = source.getSlot(index);
    if (!stack) return { changed: false, cursor: this.cursor };
    const remaining = target.addStack(stack);
    const moved = stack.count - remaining;
    if (moved <= 0) return { changed: false, cursor: this.cursor };
    source.remove(index, moved);
    return { changed: true, cursor: this.cursor };
  }

  private getStorageSlot(
    area: InventoryActionArea,
    index: number
  ): { storage: SlotStorage; index: number } | null {
    if (area === 'chest') {
      return this.chest && isValidSlotIndex(index, this.chest.size)
        ? { storage: this.chest, index }
        : null;
    }
    if (area !== 'hotbar' && area !== 'main') return null;
    const areaSize = area === 'hotbar'
      ? Math.min(9, this.inventory.size)
      : Math.min(27, Math.max(0, this.inventory.size - 9));
    if (!isValidSlotIndex(index, areaSize)) return null;
    return {
      storage: this.inventory,
      index: area === 'hotbar' ? index : index + 9
    };
  }
}

interface SlotStorage {
  readonly size: number;
  getSlot(index: number): ItemStack | null;
  setSlot(index: number, stack: ItemStack | null): boolean;
  remove(index: number, count?: number): ItemStack | null;
}

interface StackStorage extends SlotStorage {
  addStack(stack: ItemStack): number;
}

function getFurnaceSlot(area: InventoryActionArea): FurnaceSlot | null {
  if (area === 'furnace-input') return 'input';
  if (area === 'furnace-fuel') return 'fuel';
  if (area === 'furnace-output') return 'output';
  return null;
}

function canStack(a: ItemStack, b: ItemStack): boolean {
  return a.item === b.item && a.durability === undefined && b.durability === undefined;
}

function isCollectibleStack(stack: ItemStack): boolean {
  return stack.durability === undefined && getItemStackLimit(stack.item) > 1;
}

function isValidSlotIndex(index: number, size: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < size;
}

function canCursorAccept(cursor: ItemStack | null, output: ItemStack): boolean {
  const limit = getItemStackLimit(output.item);
  if (!cursor) return output.count <= limit;
  return canStack(cursor, output) && cursor.count + output.count <= limit;
}

function normalizeCraftedStack(stack: ItemStack): ItemStack {
  if (!isToolItemId(stack.item) || stack.durability !== undefined) return { ...stack };
  return {
    ...stack,
    durability: TOOL_DEFINITIONS[stack.item].maxDurability
  };
}

function cloneStack(stack: ItemStack | null): ItemStack | null {
  return stack ? { ...stack } : null;
}
