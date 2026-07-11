import {
  ARMOR_DEFINITIONS,
  getArmorDefinition,
  isArmorItemId,
  type ArmorItemId,
  type ArmorSlot,
  type ItemStack
} from './survival';

export const ARMOR_SLOT_ORDER: readonly ArmorSlot[] = ['head', 'chest', 'legs', 'feet'];

export interface ArmorEquipmentSnapshot {
  version: 1;
  slots: Array<ItemStack | null>;
}

export interface ArmorMitigationResult {
  incomingDamage: number;
  appliedDamage: number;
  blockedDamage: number;
  defensePoints: number;
}

export interface ArmorDurabilityResult {
  changed: boolean;
  durabilityCost: number;
  broken: ArmorItemId[];
}

export class ArmorEquipment {
  private readonly slots: Array<ItemStack | null> = ARMOR_SLOT_ORDER.map(() => null);

  constructor(snapshot?: ArmorEquipmentSnapshot | null) {
    if (snapshot) this.loadSnapshot(snapshot);
  }

  get size(): number {
    return this.slots.length;
  }

  getSlot(index: number): ItemStack | null {
    return cloneStack(this.slots[index] ?? null);
  }

  getSlots(): Array<ItemStack | null> {
    return this.slots.map(cloneStack);
  }

  getSnapshot(): ArmorEquipmentSnapshot {
    return { version: 1, slots: this.getSlots() };
  }

  loadSnapshot(snapshot: ArmorEquipmentSnapshot): void {
    const normalized = normalizeArmorEquipmentSnapshot(snapshot);
    for (let index = 0; index < this.slots.length; index += 1) {
      this.slots[index] = normalized?.slots[index] ?? null;
    }
  }

  setSlot(index: number, stack: ItemStack | null): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= this.slots.length) return false;
    if (stack === null) {
      this.slots[index] = null;
      return true;
    }
    const normalized = normalizeArmorStack(stack, ARMOR_SLOT_ORDER[index]!);
    if (!normalized) return false;
    this.slots[index] = normalized;
    return true;
  }

  getDefensePoints(): number {
    return this.slots.reduce((total, stack) => {
      const definition = stack ? getArmorDefinition(stack.item) : null;
      return total + (definition?.defense ?? 0);
    }, 0);
  }

  getToughness(): number {
    return this.slots.reduce((total, stack) => {
      const definition = stack ? getArmorDefinition(stack.item) : null;
      return total + (definition?.toughness ?? 0);
    }, 0);
  }

  mitigateDamage(amount: number): ArmorMitigationResult {
    const incomingDamage = Math.max(0, Number.isFinite(amount) ? amount : 0);
    const defensePoints = Math.min(20, this.getDefensePoints());
    const toughness = this.getToughness();
    const effectiveArmor = Math.min(
      20,
      Math.max(defensePoints / 5, defensePoints - incomingDamage / (2 + toughness / 4))
    );
    const appliedDamage = incomingDamage * (1 - effectiveArmor / 25);
    return {
      incomingDamage,
      appliedDamage,
      blockedDamage: incomingDamage - appliedDamage,
      defensePoints
    };
  }

  damageFromHit(amount: number): ArmorDurabilityResult {
    const incomingDamage = Math.max(0, Number.isFinite(amount) ? amount : 0);
    if (incomingDamage <= 0) return { changed: false, durabilityCost: 0, broken: [] };

    const durabilityCost = Math.max(1, Math.floor(incomingDamage / 4));
    const broken: ArmorItemId[] = [];
    let changed = false;
    for (let index = 0; index < this.slots.length; index += 1) {
      const stack = this.slots[index];
      if (!stack || !isArmorItemId(stack.item)) continue;
      const definition = ARMOR_DEFINITIONS[stack.item];
      const remaining = (stack.durability ?? definition.maxDurability) - durabilityCost;
      changed = true;
      if (remaining <= 0) {
        broken.push(stack.item);
        this.slots[index] = null;
      } else {
        this.slots[index] = { ...stack, durability: remaining };
      }
    }
    return { changed, durabilityCost, broken };
  }

  takeAll(): ItemStack[] {
    const contents = this.getSlots().filter((stack): stack is ItemStack => stack !== null);
    this.clear();
    return contents;
  }

  clear(): void {
    this.slots.fill(null);
  }
}

export function armorSlotToIndex(slot: ArmorSlot): number {
  return ARMOR_SLOT_ORDER.indexOf(slot);
}

export function normalizeArmorEquipmentSnapshot(value: unknown): ArmorEquipmentSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const snapshot = value as Partial<ArmorEquipmentSnapshot>;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.slots) || snapshot.slots.length !== 4) {
    return undefined;
  }
  return {
    version: 1,
    slots: ARMOR_SLOT_ORDER.map((slot, index) => normalizeArmorStack(snapshot.slots![index], slot))
  };
}

function normalizeArmorStack(stack: ItemStack | null | undefined, slot: ArmorSlot): ItemStack | null {
  if (!stack || !isArmorItemId(stack.item)) return null;
  if (!Number.isFinite(stack.count) || Math.trunc(stack.count) <= 0) return null;
  const definition = ARMOR_DEFINITIONS[stack.item];
  if (definition.slot !== slot) return null;
  const durability = Math.trunc(stack.durability ?? definition.maxDurability);
  if (!Number.isFinite(durability) || durability <= 0) return null;
  return {
    item: stack.item,
    count: 1,
    durability: Math.min(definition.maxDurability, durability)
  };
}

function cloneStack(stack: ItemStack | null): ItemStack | null {
  return stack ? { ...stack } : null;
}
