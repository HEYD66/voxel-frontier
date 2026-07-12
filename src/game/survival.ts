import { BlockId, isBlockId } from './types';

export const MAX_HEALTH = 20;
export const MAX_HUNGER = 20;
export const MAX_AIR_SECONDS = 15;
export const DEFAULT_INVENTORY_SLOTS = 36;
export const ITEM_STACK_LIMIT = 64;

const EXHAUSTION_THRESHOLD = 4;
const NATURAL_REGEN_INTERVAL = 4;
const STARVATION_INTERVAL = 4;
const DROWNING_DAMAGE_INTERVAL = 1;
const AIR_RECOVERY_PER_SECOND = 5;
const PASSIVE_EXHAUSTION_PER_SECOND = 0.002;

export type DamageSource = 'fall' | 'drowning' | 'starvation' | 'explosion' | 'generic';
export type HealSource = 'natural' | 'food' | 'respawn' | 'generic';
export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'sword';
export type ToolTier = 'wood' | 'stone' | 'iron' | 'diamond';
export type ArmorSlot = 'head' | 'chest' | 'legs' | 'feet';
export type ResourceItemId =
  | 'coal'
  | 'gunpowder'
  | 'raw_iron'
  | 'iron_ingot'
  | 'diamond'
  | 'wool'
  | 'leather'
  | 'stick';
export type FoodItemId =
  | 'raw_pork'
  | 'cooked_pork'
  | 'raw_mutton'
  | 'cooked_mutton'
  | 'raw_beef'
  | 'cooked_beef'
  | 'rotten_flesh';

export const TOOL_ITEM_IDS = {
  woodenPickaxe: 'wooden_pickaxe',
  stonePickaxe: 'stone_pickaxe',
  ironPickaxe: 'iron_pickaxe',
  woodenAxe: 'wooden_axe',
  stoneAxe: 'stone_axe',
  ironAxe: 'iron_axe',
  woodenShovel: 'wooden_shovel',
  stoneShovel: 'stone_shovel',
  ironShovel: 'iron_shovel',
  woodenSword: 'wooden_sword',
  stoneSword: 'stone_sword',
  ironSword: 'iron_sword',
  diamondPickaxe: 'diamond_pickaxe',
  diamondAxe: 'diamond_axe',
  diamondShovel: 'diamond_shovel',
  diamondSword: 'diamond_sword'
} as const;

export const ARMOR_ITEM_IDS = {
  leatherHelmet: 'leather_helmet',
  leatherTunic: 'leather_tunic',
  leatherPants: 'leather_pants',
  leatherBoots: 'leather_boots',
  ironHelmet: 'iron_helmet',
  ironChestplate: 'iron_chestplate',
  ironLeggings: 'iron_leggings',
  ironBoots: 'iron_boots',
  diamondHelmet: 'diamond_helmet',
  diamondChestplate: 'diamond_chestplate',
  diamondLeggings: 'diamond_leggings',
  diamondBoots: 'diamond_boots'
} as const;

export type ToolItemId = (typeof TOOL_ITEM_IDS)[keyof typeof TOOL_ITEM_IDS];
export type ArmorItemId = (typeof ARMOR_ITEM_IDS)[keyof typeof ARMOR_ITEM_IDS];
export type ItemId = BlockId | ResourceItemId | FoodItemId | ToolItemId | ArmorItemId;

export interface ItemStack {
  item: ItemId;
  count: number;
  durability?: number;
}

export interface InventorySnapshot {
  slots: Array<ItemStack | null>;
}

export interface ToolDefinition {
  id: ToolItemId;
  kind: ToolKind;
  tier: ToolTier;
  harvestLevel: number;
  speed: number;
  maxDurability: number;
  meleeDamage: number;
}

export interface ArmorDefinition {
  id: ArmorItemId;
  slot: ArmorSlot;
  defense: number;
  toughness: number;
  maxDurability: number;
}

export interface FoodDefinition {
  id: FoodItemId;
  hunger: number;
  saturation: number;
  exhaustion: number;
}

export const FOOD_DEFINITIONS: Readonly<Record<FoodItemId, FoodDefinition>> = {
  raw_pork: { id: 'raw_pork', hunger: 3, saturation: 1.8, exhaustion: 0 },
  cooked_pork: { id: 'cooked_pork', hunger: 8, saturation: 12.8, exhaustion: 0 },
  raw_mutton: { id: 'raw_mutton', hunger: 2, saturation: 1.2, exhaustion: 0 },
  cooked_mutton: { id: 'cooked_mutton', hunger: 6, saturation: 9.6, exhaustion: 0 },
  raw_beef: { id: 'raw_beef', hunger: 3, saturation: 1.8, exhaustion: 0 },
  cooked_beef: { id: 'cooked_beef', hunger: 8, saturation: 12.8, exhaustion: 0 },
  rotten_flesh: { id: 'rotten_flesh', hunger: 4, saturation: 0.8, exhaustion: 4 }
};

export const TOOL_DEFINITIONS: Readonly<Record<ToolItemId, ToolDefinition>> = {
  [TOOL_ITEM_IDS.woodenPickaxe]: toolDefinition(TOOL_ITEM_IDS.woodenPickaxe, 'pickaxe', 'wood'),
  [TOOL_ITEM_IDS.stonePickaxe]: toolDefinition(TOOL_ITEM_IDS.stonePickaxe, 'pickaxe', 'stone'),
  [TOOL_ITEM_IDS.ironPickaxe]: toolDefinition(TOOL_ITEM_IDS.ironPickaxe, 'pickaxe', 'iron'),
  [TOOL_ITEM_IDS.woodenAxe]: toolDefinition(TOOL_ITEM_IDS.woodenAxe, 'axe', 'wood'),
  [TOOL_ITEM_IDS.stoneAxe]: toolDefinition(TOOL_ITEM_IDS.stoneAxe, 'axe', 'stone'),
  [TOOL_ITEM_IDS.ironAxe]: toolDefinition(TOOL_ITEM_IDS.ironAxe, 'axe', 'iron'),
  [TOOL_ITEM_IDS.woodenShovel]: toolDefinition(TOOL_ITEM_IDS.woodenShovel, 'shovel', 'wood'),
  [TOOL_ITEM_IDS.stoneShovel]: toolDefinition(TOOL_ITEM_IDS.stoneShovel, 'shovel', 'stone'),
  [TOOL_ITEM_IDS.ironShovel]: toolDefinition(TOOL_ITEM_IDS.ironShovel, 'shovel', 'iron'),
  [TOOL_ITEM_IDS.woodenSword]: toolDefinition(TOOL_ITEM_IDS.woodenSword, 'sword', 'wood'),
  [TOOL_ITEM_IDS.stoneSword]: toolDefinition(TOOL_ITEM_IDS.stoneSword, 'sword', 'stone'),
  [TOOL_ITEM_IDS.ironSword]: toolDefinition(TOOL_ITEM_IDS.ironSword, 'sword', 'iron'),
  [TOOL_ITEM_IDS.diamondPickaxe]: toolDefinition(TOOL_ITEM_IDS.diamondPickaxe, 'pickaxe', 'diamond'),
  [TOOL_ITEM_IDS.diamondAxe]: toolDefinition(TOOL_ITEM_IDS.diamondAxe, 'axe', 'diamond'),
  [TOOL_ITEM_IDS.diamondShovel]: toolDefinition(TOOL_ITEM_IDS.diamondShovel, 'shovel', 'diamond'),
  [TOOL_ITEM_IDS.diamondSword]: toolDefinition(TOOL_ITEM_IDS.diamondSword, 'sword', 'diamond')
};

export const ARMOR_DEFINITIONS: Readonly<Record<ArmorItemId, ArmorDefinition>> = {
  [ARMOR_ITEM_IDS.leatherHelmet]: {
    id: ARMOR_ITEM_IDS.leatherHelmet,
    slot: 'head',
    defense: 1,
    toughness: 0,
    maxDurability: 55
  },
  [ARMOR_ITEM_IDS.leatherTunic]: {
    id: ARMOR_ITEM_IDS.leatherTunic,
    slot: 'chest',
    defense: 3,
    toughness: 0,
    maxDurability: 80
  },
  [ARMOR_ITEM_IDS.leatherPants]: {
    id: ARMOR_ITEM_IDS.leatherPants,
    slot: 'legs',
    defense: 2,
    toughness: 0,
    maxDurability: 75
  },
  [ARMOR_ITEM_IDS.leatherBoots]: {
    id: ARMOR_ITEM_IDS.leatherBoots,
    slot: 'feet',
    defense: 1,
    toughness: 0,
    maxDurability: 65
  },
  [ARMOR_ITEM_IDS.ironHelmet]: {
    id: ARMOR_ITEM_IDS.ironHelmet,
    slot: 'head',
    defense: 2,
    toughness: 0,
    maxDurability: 165
  },
  [ARMOR_ITEM_IDS.ironChestplate]: {
    id: ARMOR_ITEM_IDS.ironChestplate,
    slot: 'chest',
    defense: 6,
    toughness: 0,
    maxDurability: 240
  },
  [ARMOR_ITEM_IDS.ironLeggings]: {
    id: ARMOR_ITEM_IDS.ironLeggings,
    slot: 'legs',
    defense: 5,
    toughness: 0,
    maxDurability: 225
  },
  [ARMOR_ITEM_IDS.ironBoots]: {
    id: ARMOR_ITEM_IDS.ironBoots,
    slot: 'feet',
    defense: 2,
    toughness: 0,
    maxDurability: 195
  },
  [ARMOR_ITEM_IDS.diamondHelmet]: {
    id: ARMOR_ITEM_IDS.diamondHelmet,
    slot: 'head',
    defense: 3,
    toughness: 2,
    maxDurability: 363
  },
  [ARMOR_ITEM_IDS.diamondChestplate]: {
    id: ARMOR_ITEM_IDS.diamondChestplate,
    slot: 'chest',
    defense: 8,
    toughness: 2,
    maxDurability: 528
  },
  [ARMOR_ITEM_IDS.diamondLeggings]: {
    id: ARMOR_ITEM_IDS.diamondLeggings,
    slot: 'legs',
    defense: 6,
    toughness: 2,
    maxDurability: 495
  },
  [ARMOR_ITEM_IDS.diamondBoots]: {
    id: ARMOR_ITEM_IDS.diamondBoots,
    slot: 'feet',
    defense: 3,
    toughness: 2,
    maxDurability: 429
  }
};

export interface ToolDamageResult {
  damaged: boolean;
  broken: boolean;
  item: ToolItemId | null;
  remainingDurability: number | null;
}

export type InventoryListener = (snapshot: InventorySnapshot) => void;

export class ItemInventory {
  private readonly slots: Array<ItemStack | null>;
  private readonly listeners = new Set<InventoryListener>();

  constructor(size = DEFAULT_INVENTORY_SLOTS, initialSlots: readonly (ItemStack | null)[] = []) {
    const safeSize = Math.max(1, Math.min(256, Math.trunc(Number.isFinite(size) ? size : DEFAULT_INVENTORY_SLOTS)));
    this.slots = Array.from({ length: safeSize }, (_, index) => normalizeStack(initialSlots[index]));
  }

  get size(): number {
    return this.slots.length;
  }

  subscribe(listener: InventoryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSlot(index: number): ItemStack | null {
    return cloneStack(this.slots[normalizeSlotIndex(index, this.size)] ?? null);
  }

  getSnapshot(): InventorySnapshot {
    return { slots: this.slots.map(cloneStack) };
  }

  loadSnapshot(snapshot: InventorySnapshot): void {
    for (let index = 0; index < this.size; index += 1) {
      this.slots[index] = normalizeStack(snapshot.slots[index]);
    }
    this.emitChange();
  }

  setSlot(index: number, stack: ItemStack | null): boolean {
    const slot = normalizeSlotIndex(index, this.size);
    if (slot < 0) return false;
    const normalized = normalizeStack(stack);
    if (stacksEqual(this.slots[slot] ?? null, normalized)) return false;
    this.slots[slot] = normalized;
    this.emitChange();
    return true;
  }

  add(item: ItemId, count = 1, durability?: number): number {
    if (!isItemId(item)) return Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
    let remaining = Math.max(0, Math.trunc(Number.isFinite(count) ? count : 0));
    if (remaining === 0) return 0;

    const stackLimit = getItemStackLimit(item);
    let changed = false;
    if (stackLimit > 1) {
      for (const stack of this.slots) {
        if (!stack || stack.item !== item || stack.count >= stackLimit) continue;
        const transfer = Math.min(stackLimit - stack.count, remaining);
        stack.count += transfer;
        remaining -= transfer;
        changed = changed || transfer > 0;
        if (remaining === 0) break;
      }
    }

    while (remaining > 0) {
      const emptySlot = this.slots.indexOf(null);
      if (emptySlot < 0) break;
      const transfer = Math.min(stackLimit, remaining);
      const stack = normalizeStack({ item, count: transfer, durability });
      if (!stack) break;
      this.slots[emptySlot] = stack;
      remaining -= transfer;
      changed = true;
    }

    if (changed) this.emitChange();
    return remaining;
  }

  addStack(stack: ItemStack): number {
    return this.add(stack.item, stack.count, stack.durability);
  }

  remove(index: number, count = 1): ItemStack | null {
    const slot = normalizeSlotIndex(index, this.size);
    if (slot < 0) return null;
    const stack = this.slots[slot];
    if (!stack) return null;

    const removedCount = Math.min(stack.count, Math.max(1, Math.trunc(Number.isFinite(count) ? count : 1)));
    const removed: ItemStack = { item: stack.item, count: removedCount };
    if (stack.durability !== undefined) removed.durability = stack.durability;
    stack.count -= removedCount;
    if (stack.count <= 0) this.slots[slot] = null;
    this.emitChange();
    return removed;
  }

  count(item: ItemId): number {
    return this.slots.reduce((total, stack) => total + (stack?.item === item ? stack.count : 0), 0);
  }

  findFirst(item: ItemId): number {
    return this.slots.findIndex((stack) => stack?.item === item);
  }

  damageTool(index: number, amount = 1): ToolDamageResult {
    const slot = normalizeSlotIndex(index, this.size);
    const stack = slot >= 0 ? this.slots[slot] : null;
    if (!stack || !isToolItemId(stack.item)) {
      return { damaged: false, broken: false, item: null, remainingDurability: null };
    }

    const definition = TOOL_DEFINITIONS[stack.item];
    const damage = Math.max(0, Math.trunc(Number.isFinite(amount) ? amount : 0));
    if (damage === 0) {
      return {
        damaged: false,
        broken: false,
        item: stack.item,
        remainingDurability: stack.durability ?? definition.maxDurability
      };
    }

    const remainingDurability = (stack.durability ?? definition.maxDurability) - damage;
    if (remainingDurability <= 0) {
      const item = stack.item;
      this.slots[slot] = null;
      this.emitChange();
      return { damaged: true, broken: true, item, remainingDurability: 0 };
    }

    stack.durability = remainingDurability;
    this.emitChange();
    return { damaged: true, broken: false, item: stack.item, remainingDurability };
  }

  clear(): ItemStack[] {
    const removed = this.slots.flatMap((stack) => (stack ? [cloneStack(stack)!] : []));
    if (removed.length === 0) return removed;
    this.slots.fill(null);
    this.emitChange();
    return removed;
  }

  private emitChange(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export interface BlockDrop {
  item: ItemId;
  count: number;
}

export interface BlockMiningRule {
  hardness: number;
  effectiveTool?: ToolKind;
  requiredHarvestLevel?: number;
  drop?: BlockDrop;
}

export const BLOCK_MINING_RULES: Readonly<Record<BlockId, BlockMiningRule>> = {
  [BlockId.Air]: { hardness: Number.POSITIVE_INFINITY },
  [BlockId.Grass]: { hardness: 0.6, effectiveTool: 'shovel', drop: { item: BlockId.Dirt, count: 1 } },
  [BlockId.Dirt]: { hardness: 0.5, effectiveTool: 'shovel', drop: { item: BlockId.Dirt, count: 1 } },
  [BlockId.Stone]: {
    hardness: 1.5,
    effectiveTool: 'pickaxe',
    requiredHarvestLevel: 1,
    drop: { item: BlockId.Cobblestone, count: 1 }
  },
  [BlockId.Sand]: { hardness: 0.5, effectiveTool: 'shovel', drop: { item: BlockId.Sand, count: 1 } },
  [BlockId.Wood]: { hardness: 2, effectiveTool: 'axe', drop: { item: BlockId.Wood, count: 1 } },
  [BlockId.Leaves]: { hardness: 0.2, effectiveTool: 'axe', drop: { item: BlockId.Leaves, count: 1 } },
  [BlockId.Planks]: { hardness: 2, effectiveTool: 'axe', drop: { item: BlockId.Planks, count: 1 } },
  [BlockId.Bricks]: {
    hardness: 2,
    effectiveTool: 'pickaxe',
    requiredHarvestLevel: 1,
    drop: { item: BlockId.Bricks, count: 1 }
  },
  [BlockId.Glass]: { hardness: 0.3 },
  [BlockId.Water]: { hardness: Number.POSITIVE_INFINITY },
  [BlockId.CoalOre]: {
    hardness: 3,
    effectiveTool: 'pickaxe',
    requiredHarvestLevel: 1,
    drop: { item: 'coal', count: 1 }
  },
  [BlockId.IronOre]: {
    hardness: 3,
    effectiveTool: 'pickaxe',
    requiredHarvestLevel: 2,
    drop: { item: 'raw_iron', count: 1 }
  },
  [BlockId.Snow]: { hardness: 0.2, effectiveTool: 'shovel', drop: { item: BlockId.Snow, count: 1 } },
  [BlockId.Cobblestone]: {
    hardness: 2,
    effectiveTool: 'pickaxe',
    requiredHarvestLevel: 1,
    drop: { item: BlockId.Cobblestone, count: 1 }
  },
  [BlockId.Bedrock]: { hardness: Number.POSITIVE_INFINITY },
  [BlockId.CraftingTable]: {
    hardness: 2.5,
    effectiveTool: 'axe',
    drop: { item: BlockId.CraftingTable, count: 1 }
  },
  [BlockId.Furnace]: {
    hardness: 3.5,
    effectiveTool: 'pickaxe',
    requiredHarvestLevel: 1,
    drop: { item: BlockId.Furnace, count: 1 }
  },
  [BlockId.Torch]: { hardness: 0.05, drop: { item: BlockId.Torch, count: 1 } },
  [BlockId.Chest]: {
    hardness: 2.5,
    effectiveTool: 'axe',
    drop: { item: BlockId.Chest, count: 1 }
  },
  [BlockId.DiamondOre]: {
    hardness: 3,
    effectiveTool: 'pickaxe',
    requiredHarvestLevel: 3,
    drop: { item: 'diamond', count: 1 }
  }
};

export interface MiningProfile {
  block: BlockId;
  breakable: boolean;
  duration: number;
  effectiveTool: boolean;
  canHarvest: boolean;
  drop: BlockDrop | null;
  tool: ToolDefinition | null;
}

export interface BlockBreakResult extends MiningProfile {
  collectedCount: number;
  overflow: ItemStack | null;
  toolDamaged: boolean;
  toolBroke: boolean;
}

export function getMiningProfile(
  block: BlockId,
  heldItem: ItemStack | ItemId | null = null
): MiningProfile {
  const safeBlock = isBlockId(block) ? block : BlockId.Air;
  const rule = BLOCK_MINING_RULES[safeBlock];
  const item = typeof heldItem === 'object' && heldItem !== null ? heldItem.item : heldItem;
  const toolDefinition = item !== null && item !== undefined && isToolItemId(item)
    ? TOOL_DEFINITIONS[item]
    : null;
  const breakable = Number.isFinite(rule.hardness);
  const effectiveTool = toolDefinition !== null && toolDefinition.kind === rule.effectiveTool;
  const requiredHarvestLevel = rule.requiredHarvestLevel ?? 0;
  const canHarvest =
    requiredHarvestLevel === 0 ||
    (effectiveTool && toolDefinition.harvestLevel >= requiredHarvestLevel);
  const speed = effectiveTool && toolDefinition ? toolDefinition.speed : 1;
  const duration = breakable
    ? Math.max(0.05, (rule.hardness * (canHarvest ? 1.5 : 5)) / speed)
    : Number.POSITIVE_INFINITY;
  return {
    block: safeBlock,
    breakable,
    duration,
    effectiveTool,
    canHarvest,
    drop: canHarvest && rule.drop ? { ...rule.drop } : null,
    tool: toolDefinition ? { ...toolDefinition } : null
  };
}

export function createToolStack(kind: ToolKind, tier: ToolTier, durability?: number): ItemStack {
  const item = TOOL_ID_BY_KIND[tier][kind];
  const definition = TOOL_DEFINITIONS[item];
  const safeDurability = Number.isFinite(durability)
    ? Math.trunc(durability!)
    : definition.maxDurability;
  return {
    item,
    count: 1,
    durability: Math.max(1, Math.min(definition.maxDurability, safeDurability))
  };
}

export function getMeleeDamage(
  heldItem: ItemStack | ItemId | null | undefined
): number {
  const item = typeof heldItem === 'object' && heldItem !== null
    ? heldItem.item
    : heldItem;
  return item !== null && item !== undefined && isToolItemId(item)
    ? TOOL_DEFINITIONS[item].meleeDamage
    : 1;
}

export function getItemStackLimit(item: ItemId): number {
  return isToolItemId(item) || isArmorItemId(item) ? 1 : isItemId(item) ? ITEM_STACK_LIMIT : 0;
}

export function isToolItemId(item: unknown): item is ToolItemId {
  return typeof item === 'string' && TOOL_ITEM_ID_SET.has(item);
}

export function isArmorItemId(item: unknown): item is ArmorItemId {
  return typeof item === 'string' && ARMOR_ITEM_ID_SET.has(item);
}

export function getArmorDefinition(item: unknown): ArmorDefinition | null {
  return isArmorItemId(item) ? ARMOR_DEFINITIONS[item] : null;
}

export interface SurvivalVitals {
  health: number;
  maxHealth: number;
  hunger: number;
  maxHunger: number;
  saturation: number;
  air: number;
  maxAir: number;
  dead: boolean;
}

export interface SurvivalSnapshot {
  version: 1;
  health: number;
  hunger: number;
  saturation: number;
  exhaustion: number;
  air: number;
  dead: boolean;
  deathCause: DamageSource | null;
  inventory: InventorySnapshot;
}

export interface SurvivalUpdateContext {
  headUnderwater?: boolean;
  distanceMoved?: number;
  sprinting?: boolean;
  swimming?: boolean;
  jumped?: boolean;
}

export type SurvivalEvent =
  | { type: 'vitals'; vitals: SurvivalVitals }
  | { type: 'damage'; source: DamageSource; amount: number; health: number }
  | { type: 'heal'; source: HealSource; amount: number; health: number }
  | { type: 'death'; source: DamageSource; droppedInventory: ItemStack[] }
  | { type: 'respawn'; vitals: SurvivalVitals }
  | { type: 'inventory'; inventory: InventorySnapshot }
  | { type: 'tool-broken'; slot: number; item: ToolItemId }
  | { type: 'block-break'; result: BlockBreakResult };

export type SurvivalEventListener = (event: SurvivalEvent) => void;

export interface SurvivalSystemOptions {
  inventorySlots?: number;
  keepInventory?: boolean;
  snapshot?: SurvivalSnapshot;
}

export class SurvivalSystem {
  public readonly inventory: ItemInventory;

  private healthValue = MAX_HEALTH;
  private hungerValue = MAX_HUNGER;
  private saturationValue = 5;
  private exhaustionValue = 0;
  private airValue = MAX_AIR_SECONDS;
  private deadValue = false;
  private deathCauseValue: DamageSource | null = null;
  private regenerationElapsed = 0;
  private starvationElapsed = 0;
  private drowningElapsed = 0;
  private readonly listeners = new Set<SurvivalEventListener>();
  private readonly keepInventory: boolean;
  private readonly unsubscribeInventory: () => void;

  constructor(options: SurvivalSystemOptions = {}) {
    this.keepInventory = options.keepInventory ?? false;
    this.inventory = new ItemInventory(
      options.inventorySlots ?? options.snapshot?.inventory.slots.length ?? DEFAULT_INVENTORY_SLOTS
    );
    this.unsubscribeInventory = this.inventory.subscribe((inventory) => {
      this.emit({ type: 'inventory', inventory });
    });
    if (options.snapshot) this.applySnapshot(options.snapshot);
  }

  get health(): number {
    return this.healthValue;
  }

  get hunger(): number {
    return this.hungerValue;
  }

  get saturation(): number {
    return this.saturationValue;
  }

  get air(): number {
    return this.airValue;
  }

  get dead(): boolean {
    return this.deadValue;
  }

  get deathCause(): DamageSource | null {
    return this.deathCauseValue;
  }

  onEvent(listener: SurvivalEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribeInventory();
    this.listeners.clear();
  }

  getVitals(): SurvivalVitals {
    return {
      health: this.healthValue,
      maxHealth: MAX_HEALTH,
      hunger: this.hungerValue,
      maxHunger: MAX_HUNGER,
      saturation: this.saturationValue,
      air: this.airValue,
      maxAir: MAX_AIR_SECONDS,
      dead: this.deadValue
    };
  }

  getSnapshot(): SurvivalSnapshot {
    return {
      version: 1,
      health: this.healthValue,
      hunger: this.hungerValue,
      saturation: this.saturationValue,
      exhaustion: this.exhaustionValue,
      air: this.airValue,
      dead: this.deadValue,
      deathCause: this.deathCauseValue,
      inventory: this.inventory.getSnapshot()
    };
  }

  applySnapshot(snapshot: SurvivalSnapshot): void {
    const before = this.getVitals();
    this.healthValue = clampFinite(snapshot.health, 0, MAX_HEALTH, MAX_HEALTH);
    this.hungerValue = clampFinite(snapshot.hunger, 0, MAX_HUNGER, MAX_HUNGER);
    this.saturationValue = Math.min(
      this.hungerValue,
      clampFinite(snapshot.saturation, 0, MAX_HUNGER, 5)
    );
    this.exhaustionValue = clampFinite(snapshot.exhaustion, 0, EXHAUSTION_THRESHOLD, 0);
    this.airValue = clampFinite(snapshot.air, 0, MAX_AIR_SECONDS, MAX_AIR_SECONDS);
    this.deadValue = snapshot.dead === true || this.healthValue <= 0;
    if (this.deadValue) this.healthValue = 0;
    this.deathCauseValue = isDamageSource(snapshot.deathCause) ? snapshot.deathCause : null;
    this.regenerationElapsed = 0;
    this.starvationElapsed = 0;
    this.drowningElapsed = 0;
    this.inventory.loadSnapshot(snapshot.inventory);
    this.emitVitalsIfChanged(before);
  }

  update(deltaTime: number, context: SurvivalUpdateContext = {}): void {
    if (this.deadValue) return;
    const dt = clampFinite(deltaTime, 0, 3600, 0);
    if (dt <= 0) return;
    const before = this.getVitals();

    this.exhaustionValue += PASSIVE_EXHAUSTION_PER_SECOND * dt;
    const distance = Math.max(0, Number.isFinite(context.distanceMoved) ? context.distanceMoved! : 0);
    if (distance > 0) {
      const exhaustionPerMeter = context.sprinting ? 0.1 : context.swimming ? 0.01 : 0.01;
      this.exhaustionValue += distance * exhaustionPerMeter;
    }
    if (context.jumped) this.exhaustionValue += context.sprinting ? 0.2 : 0.05;
    this.consumeExhaustion();

    this.updateAir(dt, context.headUnderwater === true);
    if (!this.deadValue) this.updateRegeneration(dt);
    if (!this.deadValue) this.updateStarvation(dt);
    this.emitVitalsIfChanged(before);
  }

  takeDamage(amount: number, source: DamageSource = 'generic'): number {
    const before = this.getVitals();
    const applied = this.takeDamageInternal(amount, source);
    this.emitVitalsIfChanged(before);
    return applied;
  }

  applyFallDamage(fallDistance: number): number {
    const damage = Math.ceil(Math.max(0, Number.isFinite(fallDistance) ? fallDistance - 3 : 0));
    return damage > 0 ? this.takeDamage(damage, 'fall') : 0;
  }

  heal(amount: number, source: HealSource = 'generic'): number {
    const before = this.getVitals();
    const applied = this.healInternal(amount, source);
    this.emitVitalsIfChanged(before);
    return applied;
  }

  feed(food: number, saturation = 0): void {
    if (this.deadValue) return;
    const before = this.getVitals();
    this.hungerValue = Math.min(MAX_HUNGER, this.hungerValue + Math.max(0, finiteOrZero(food)));
    this.saturationValue = Math.min(
      this.hungerValue,
      this.saturationValue + Math.max(0, finiteOrZero(saturation))
    );
    if (this.hungerValue > 0) this.starvationElapsed = 0;
    this.emitVitalsIfChanged(before);
  }

  consumeFood(item: FoodItemId, slot: number | null = null): boolean {
    if (this.deadValue || this.hungerValue >= MAX_HUNGER || !isFoodItemId(item)) return false;
    const sourceSlot = slot === null ? this.inventory.findFirst(item) : slot;
    const stack = this.inventory.getSlot(sourceSlot);
    if (!stack || stack.item !== item) return false;

    const before = this.getVitals();
    const definition = FOOD_DEFINITIONS[item];
    this.inventory.remove(sourceSlot, 1);
    this.hungerValue = Math.min(MAX_HUNGER, this.hungerValue + definition.hunger);
    this.saturationValue = Math.min(
      this.hungerValue,
      this.saturationValue + definition.saturation
    );
    this.exhaustionValue += definition.exhaustion;
    this.consumeExhaustion();
    if (this.hungerValue > 0) this.starvationElapsed = 0;
    this.emitVitalsIfChanged(before);
    return true;
  }

  addExhaustion(amount: number): void {
    if (this.deadValue) return;
    const before = this.getVitals();
    this.exhaustionValue += Math.max(0, finiteOrZero(amount));
    this.consumeExhaustion();
    this.emitVitalsIfChanged(before);
  }

  recordMovement(distance: number, sprinting = false, swimming = false): void {
    const exhaustionPerMeter = sprinting ? 0.1 : swimming ? 0.01 : 0.01;
    this.addExhaustion(Math.max(0, finiteOrZero(distance)) * exhaustionPerMeter);
  }

  recordJump(sprinting = false): void {
    this.addExhaustion(sprinting ? 0.2 : 0.05);
  }

  respawn(): void {
    const before = this.getVitals();
    this.healthValue = MAX_HEALTH;
    this.hungerValue = MAX_HUNGER;
    this.saturationValue = 5;
    this.exhaustionValue = 0;
    this.airValue = MAX_AIR_SECONDS;
    this.deadValue = false;
    this.deathCauseValue = null;
    this.regenerationElapsed = 0;
    this.starvationElapsed = 0;
    this.drowningElapsed = 0;
    const vitals = this.getVitals();
    this.emit({ type: 'respawn', vitals });
    this.emitVitalsIfChanged(before);
  }

  getBlockMiningProfile(block: BlockId, toolSlot: number | null = null): MiningProfile {
    const heldStack = toolSlot === null ? null : this.inventory.getSlot(toolSlot);
    return getMiningProfile(block, heldStack);
  }

  breakBlock(block: BlockId, toolSlot: number | null = null): BlockBreakResult {
    const profile = this.getBlockMiningProfile(block, toolSlot);
    let toolDamaged = false;
    let toolBroke = false;
    if (profile.breakable && toolSlot !== null && profile.tool) {
      const durabilityCost = profile.tool.kind === 'sword' ? 2 : 1;
      const toolDamage = this.inventory.damageTool(toolSlot, durabilityCost);
      toolDamaged = toolDamage.damaged;
      toolBroke = toolDamage.broken;
      if (toolDamage.broken && toolDamage.item) {
        this.emit({ type: 'tool-broken', slot: toolSlot, item: toolDamage.item });
      }
    }

    let collectedCount = 0;
    let overflow: ItemStack | null = null;
    if (profile.breakable && profile.drop) {
      const remaining = this.inventory.add(profile.drop.item, profile.drop.count);
      collectedCount = profile.drop.count - remaining;
      if (remaining > 0) overflow = { item: profile.drop.item, count: remaining };
    }

    const result: BlockBreakResult = {
      ...profile,
      drop: profile.drop ? { ...profile.drop } : null,
      collectedCount,
      overflow,
      toolDamaged,
      toolBroke
    };
    this.emit({ type: 'block-break', result: cloneBlockBreakResult(result) });
    return result;
  }

  private updateAir(dt: number, headUnderwater: boolean): void {
    if (!headUnderwater) {
      this.airValue = Math.min(MAX_AIR_SECONDS, this.airValue + AIR_RECOVERY_PER_SECOND * dt);
      this.drowningElapsed = 0;
      return;
    }

    const breathableTime = Math.min(this.airValue, dt);
    this.airValue = Math.max(0, this.airValue - breathableTime);
    this.drowningElapsed += dt - breathableTime;
    while (this.drowningElapsed >= DROWNING_DAMAGE_INTERVAL && !this.deadValue) {
      this.drowningElapsed -= DROWNING_DAMAGE_INTERVAL;
      this.takeDamageInternal(2, 'drowning');
    }
  }

  private updateRegeneration(dt: number): void {
    if (this.healthValue >= MAX_HEALTH || this.hungerValue < 18) {
      this.regenerationElapsed = 0;
      return;
    }

    this.regenerationElapsed += dt;
    while (
      this.regenerationElapsed >= NATURAL_REGEN_INTERVAL &&
      this.healthValue < MAX_HEALTH &&
      this.hungerValue >= 18 &&
      !this.deadValue
    ) {
      this.regenerationElapsed -= NATURAL_REGEN_INTERVAL;
      this.healInternal(1, 'natural');
      this.exhaustionValue += 3;
      this.consumeExhaustion();
    }
  }

  private updateStarvation(dt: number): void {
    if (this.hungerValue > 0) {
      this.starvationElapsed = 0;
      return;
    }

    this.starvationElapsed += dt;
    while (this.starvationElapsed >= STARVATION_INTERVAL && !this.deadValue) {
      this.starvationElapsed -= STARVATION_INTERVAL;
      this.takeDamageInternal(1, 'starvation');
    }
  }

  private consumeExhaustion(): void {
    while (this.exhaustionValue >= EXHAUSTION_THRESHOLD) {
      this.exhaustionValue -= EXHAUSTION_THRESHOLD;
      if (this.saturationValue > 0) {
        this.saturationValue = Math.max(0, this.saturationValue - 1);
      } else if (this.hungerValue > 0) {
        this.hungerValue = Math.max(0, this.hungerValue - 1);
      }
    }
  }

  private takeDamageInternal(amount: number, source: DamageSource): number {
    if (this.deadValue) return 0;
    const damage = Math.max(0, finiteOrZero(amount));
    const applied = Math.min(this.healthValue, damage);
    if (applied <= 0) return 0;
    this.healthValue -= applied;
    this.regenerationElapsed = 0;
    this.emit({ type: 'damage', source, amount: applied, health: this.healthValue });
    if (this.healthValue <= 0) this.die(source);
    return applied;
  }

  private healInternal(amount: number, source: HealSource): number {
    if (this.deadValue) return 0;
    const healing = Math.max(0, finiteOrZero(amount));
    const applied = Math.min(MAX_HEALTH - this.healthValue, healing);
    if (applied <= 0) return 0;
    this.healthValue += applied;
    this.emit({ type: 'heal', source, amount: applied, health: this.healthValue });
    return applied;
  }

  private die(source: DamageSource): void {
    if (this.deadValue) return;
    this.healthValue = 0;
    this.deadValue = true;
    this.deathCauseValue = source;
    const droppedInventory = this.keepInventory ? [] : this.inventory.clear();
    this.emit({ type: 'death', source, droppedInventory });
  }

  private emitVitalsIfChanged(before: SurvivalVitals): void {
    const after = this.getVitals();
    if (!vitalsEqual(before, after)) this.emit({ type: 'vitals', vitals: after });
  }

  private emit(event: SurvivalEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

const TOOL_ITEM_ID_SET = new Set<string>(Object.values(TOOL_ITEM_IDS));
const ARMOR_ITEM_ID_SET = new Set<string>(Object.values(ARMOR_ITEM_IDS));
const RESOURCE_ITEM_ID_SET = new Set<string>([
  'coal',
  'gunpowder',
  'raw_iron',
  'iron_ingot',
  'diamond',
  'wool',
  'leather',
  'stick'
]);
const FOOD_ITEM_ID_SET = new Set<string>([
  'raw_pork',
  'cooked_pork',
  'raw_mutton',
  'cooked_mutton',
  'raw_beef',
  'cooked_beef',
  'rotten_flesh'
]);

const TOOL_ID_BY_KIND: Readonly<Record<ToolTier, Record<ToolKind, ToolItemId>>> = {
  wood: {
    pickaxe: TOOL_ITEM_IDS.woodenPickaxe,
    axe: TOOL_ITEM_IDS.woodenAxe,
    shovel: TOOL_ITEM_IDS.woodenShovel,
    sword: TOOL_ITEM_IDS.woodenSword
  },
  stone: {
    pickaxe: TOOL_ITEM_IDS.stonePickaxe,
    axe: TOOL_ITEM_IDS.stoneAxe,
    shovel: TOOL_ITEM_IDS.stoneShovel,
    sword: TOOL_ITEM_IDS.stoneSword
  },
  iron: {
    pickaxe: TOOL_ITEM_IDS.ironPickaxe,
    axe: TOOL_ITEM_IDS.ironAxe,
    shovel: TOOL_ITEM_IDS.ironShovel,
    sword: TOOL_ITEM_IDS.ironSword
  },
  diamond: {
    pickaxe: TOOL_ITEM_IDS.diamondPickaxe,
    axe: TOOL_ITEM_IDS.diamondAxe,
    shovel: TOOL_ITEM_IDS.diamondShovel,
    sword: TOOL_ITEM_IDS.diamondSword
  }
};

function toolDefinition(id: ToolItemId, kind: ToolKind, tier: ToolTier): ToolDefinition {
  const tierStats: Record<ToolTier, [harvestLevel: number, speed: number, durability: number]> = {
    wood: [1, 2, 59],
    stone: [2, 4, 131],
    iron: [3, 6, 250],
    diamond: [4, 8, 1561]
  };
  const [harvestLevel, speed, maxDurability] = tierStats[tier];
  const meleeDamage: Readonly<Record<ToolKind, Record<ToolTier, number>>> = {
    pickaxe: { wood: 2, stone: 3, iron: 4, diamond: 5 },
    axe: { wood: 7, stone: 9, iron: 9, diamond: 9 },
    shovel: { wood: 2.5, stone: 3.5, iron: 4.5, diamond: 5.5 },
    sword: { wood: 4, stone: 5, iron: 6, diamond: 7 }
  };
  return {
    id,
    kind,
    tier,
    harvestLevel,
    speed,
    maxDurability,
    meleeDamage: meleeDamage[kind][tier]
  };
}

export function isItemId(item: unknown): item is ItemId {
  return (
    isBlockItemId(item) ||
    isToolItemId(item) ||
    isArmorItemId(item) ||
    isFoodItemId(item) ||
    (typeof item === 'string' && RESOURCE_ITEM_ID_SET.has(item))
  );
}

export function isFoodItemId(item: unknown): item is FoodItemId {
  return typeof item === 'string' && FOOD_ITEM_ID_SET.has(item);
}

function isBlockItemId(item: unknown): item is BlockId {
  return (
    isBlockId(item) &&
    item > BlockId.Air &&
    item !== BlockId.Water
  );
}

function normalizeStack(stack: ItemStack | null | undefined): ItemStack | null {
  if (!stack || !isItemId(stack.item)) return null;
  const limit = getItemStackLimit(stack.item);
  const rawCount = Math.trunc(Number.isFinite(stack.count) ? stack.count : 0);
  if (rawCount <= 0) return null;
  const count = Math.min(limit, rawCount);
  const maxDurability = isToolItemId(stack.item)
    ? TOOL_DEFINITIONS[stack.item].maxDurability
    : isArmorItemId(stack.item)
      ? ARMOR_DEFINITIONS[stack.item].maxDurability
      : null;
  if (maxDurability === null) return { item: stack.item, count };
  const durability = Math.trunc(stack.durability ?? maxDurability);
  if (!Number.isFinite(durability) || durability <= 0) return null;
  return {
    item: stack.item,
    count: 1,
    durability: Math.min(maxDurability, durability)
  };
}

function cloneStack(stack: ItemStack | null): ItemStack | null {
  if (!stack) return null;
  const clone: ItemStack = { item: stack.item, count: stack.count };
  if (stack.durability !== undefined) clone.durability = stack.durability;
  return clone;
}

function stacksEqual(left: ItemStack | null, right: ItemStack | null): boolean {
  return (
    left?.item === right?.item &&
    left?.count === right?.count &&
    left?.durability === right?.durability
  );
}

function normalizeSlotIndex(index: number, size: number): number {
  if (!Number.isFinite(index)) return -1;
  const slot = Math.trunc(index);
  return slot >= 0 && slot < size ? slot : -1;
}

function cloneBlockBreakResult(result: BlockBreakResult): BlockBreakResult {
  return {
    ...result,
    tool: result.tool ? { ...result.tool } : null,
    drop: result.drop ? { ...result.drop } : null,
    overflow: cloneStack(result.overflow)
  };
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clampFinite(value: number, minimum: number, maximum: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;
}

function isDamageSource(value: unknown): value is DamageSource {
  return value === 'fall' ||
    value === 'drowning' ||
    value === 'starvation' ||
    value === 'explosion' ||
    value === 'generic';
}

function vitalsEqual(left: SurvivalVitals, right: SurvivalVitals): boolean {
  return (
    left.health === right.health &&
    left.hunger === right.hunger &&
    left.saturation === right.saturation &&
    left.air === right.air &&
    left.dead === right.dead
  );
}
