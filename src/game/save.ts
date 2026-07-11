import {
  ARMOR_DEFINITIONS,
  MAX_AIR_SECONDS,
  MAX_HEALTH,
  MAX_HUNGER,
  TOOL_DEFINITIONS,
  getItemStackLimit,
  isArmorItemId,
  isItemId,
  isToolItemId,
  type DamageSource,
  type InventorySnapshot,
  type ItemStack,
  type SurvivalSnapshot
} from './survival';
import {
  normalizeArmorEquipmentSnapshot,
  type ArmorEquipmentSnapshot
} from './equipment';
import { sanitizeChestFacing, sanitizeChestSnapshot } from './chest';
import type { WorldChestSave } from './chest-manager';
import { sanitizeFurnaceSnapshot } from './furnace';
import {
  BlockId,
  WORLD_SAVE_KEY,
  isBlockId,
  type PlayerSnapshot,
  type WorldDropSave,
  type WorldFurnaceSave,
  type WorldGameMode,
  type WorldSave
} from './types';

const MAX_INVENTORY_SLOTS = 256;
const MAX_EXHAUSTION = 4;
const MAX_WORLD_DROPS = 2048;
const MAX_WORLD_DROP_AGE = 300;
const MAX_WORLD_DROP_PICKUP_DELAY = 10;
const MAX_WORLD_FURNACES = 4096;
const MAX_WORLD_CHESTS = 4096;
const MAX_HORIZONTAL_WORLD_COORDINATE = 29_999_984;
const MIN_WORLD_BLOCK_Y = 0;
const MAX_WORLD_BLOCK_Y = 79;
const MIN_PLAYER_SNAPSHOT_Y = -64;
const MAX_PLAYER_SNAPSHOT_Y = 320;

export function loadWorldSave(): WorldSave | null {
  try {
    const raw = localStorage.getItem(WORLD_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorldSave>;
    if (
      parsed.version !== 1 ||
      typeof parsed.seed !== 'number' ||
      !Number.isFinite(parsed.seed) ||
      !Array.isArray(parsed.edits)
    ) return null;
    const edits: WorldSave['edits'] = [];
    for (const edit of parsed.edits) {
      if (!Array.isArray(edit) || edit.length !== 4) continue;
      const [x, y, z, id] = edit;
      if (![x, y, z, id].every(Number.isFinite)) continue;
      if (
        !isHorizontalWorldCoordinate(x) ||
        !isWorldBlockY(y) ||
        !isHorizontalWorldCoordinate(z)
      ) continue;
      const blockId = Math.trunc(id);
      if (!isBlockId(blockId)) continue;
      edits.push([Math.trunc(x), Math.trunc(y), Math.trunc(z), blockId]);
    }
    return {
      version: 1,
      seed: parsed.seed >>> 0,
      edits,
      player: isPlayerSnapshot(parsed.player) ? parsed.player : undefined,
      hotbar: Array.isArray(parsed.hotbar)
        ? parsed.hotbar
            .slice(0, 9)
            .map((id) => Number(id))
            .filter((id): id is BlockId => isBlockId(id) && id > BlockId.Air)
        : undefined,
      timeOfDay:
        typeof parsed.timeOfDay === 'number' && Number.isFinite(parsed.timeOfDay)
          ? parsed.timeOfDay
          : 0.32,
      survival: sanitizeSurvivalSnapshot(parsed.survival),
      mode: isWorldGameMode(parsed.mode) ? parsed.mode : undefined,
      crafting: sanitizeCraftingSnapshot(parsed.crafting),
      cursor: sanitizeOptionalItemStack(parsed.cursor),
      equipment: normalizeArmorEquipmentSnapshot(parsed.equipment),
      drops: sanitizeWorldDrops(parsed.drops),
      furnaces: sanitizeWorldFurnaces(parsed.furnaces),
      chests: sanitizeWorldChests(parsed.chests)
    };
  } catch {
    return null;
  }
}

export function writeWorldSave(save: WorldSave): boolean {
  try {
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearWorldSave(): void {
  try {
    localStorage.removeItem(WORLD_SAVE_KEY);
  } catch {
    // A new world can still replace the old save later in the session.
  }
}

export function createWorldSave(
  seed: number,
  edits: WorldSave['edits'],
  player: PlayerSnapshot,
  timeOfDay: number,
  hotbar?: readonly BlockId[],
  survival?: SurvivalSnapshot,
  mode?: WorldGameMode,
  crafting?: InventorySnapshot,
  cursor?: ItemStack | null,
  drops?: readonly WorldDropSave[],
  furnaces?: readonly WorldFurnaceSave[],
  equipment?: ArmorEquipmentSnapshot,
  chests?: readonly WorldChestSave[]
): WorldSave {
  const normalizedTime = Number.isFinite(timeOfDay)
    ? ((timeOfDay % 1) + 1) % 1
    : 0.32;
  return {
    version: 1,
    seed: seed >>> 0,
    edits,
    player,
    hotbar: hotbar?.slice(0, 9),
    timeOfDay: normalizedTime,
    survival: sanitizeSurvivalSnapshot(survival),
    mode: isWorldGameMode(mode) ? mode : undefined,
    crafting: sanitizeCraftingSnapshot(crafting),
    cursor: sanitizeOptionalItemStack(cursor),
    equipment: normalizeArmorEquipmentSnapshot(equipment),
    drops: sanitizeWorldDrops(drops),
    furnaces: sanitizeWorldFurnaces(furnaces),
    chests: sanitizeWorldChests(chests, Number.POSITIVE_INFINITY)
  };
}

function isPlayerSnapshot(value: unknown): value is PlayerSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<PlayerSnapshot>;
  return (
    Array.isArray(snapshot.position) &&
    snapshot.position.length === 3 &&
    snapshot.position.every(Number.isFinite) &&
    isHorizontalWorldCoordinate(snapshot.position[0]) &&
    snapshot.position[1] >= MIN_PLAYER_SNAPSHOT_Y &&
    snapshot.position[1] <= MAX_PLAYER_SNAPSHOT_Y &&
    isHorizontalWorldCoordinate(snapshot.position[2]) &&
    typeof snapshot.yaw === 'number' &&
    Number.isFinite(snapshot.yaw) &&
    typeof snapshot.pitch === 'number' &&
    Number.isFinite(snapshot.pitch) &&
    typeof snapshot.selectedSlot === 'number' &&
    Number.isFinite(snapshot.selectedSlot)
  );
}

function sanitizeSurvivalSnapshot(value: unknown): SurvivalSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const snapshot = value as Partial<SurvivalSnapshot>;
  if (
    snapshot.version !== 1 ||
    !isFiniteNumber(snapshot.health) ||
    !isFiniteNumber(snapshot.hunger) ||
    !isFiniteNumber(snapshot.saturation) ||
    !isFiniteNumber(snapshot.exhaustion) ||
    !isFiniteNumber(snapshot.air) ||
    typeof snapshot.dead !== 'boolean' ||
    !isNullableDamageSource(snapshot.deathCause)
  ) {
    return undefined;
  }

  const inventory = sanitizeInventorySnapshot(snapshot.inventory);
  if (!inventory) return undefined;

  const hunger = clamp(snapshot.hunger, 0, MAX_HUNGER);
  const dead = snapshot.dead || snapshot.health <= 0;
  return {
    version: 1,
    health: dead ? 0 : clamp(snapshot.health, 0, MAX_HEALTH),
    hunger,
    saturation: Math.min(hunger, clamp(snapshot.saturation, 0, MAX_HUNGER)),
    exhaustion: clamp(snapshot.exhaustion, 0, MAX_EXHAUSTION),
    air: clamp(snapshot.air, 0, MAX_AIR_SECONDS),
    dead,
    deathCause: dead ? snapshot.deathCause : null,
    inventory
  };
}

function sanitizeInventorySnapshot(value: unknown): InventorySnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const inventory = value as Partial<InventorySnapshot>;
  if (
    !Array.isArray(inventory.slots) ||
    inventory.slots.length < 1 ||
    inventory.slots.length > MAX_INVENTORY_SLOTS
  ) {
    return undefined;
  }

  const slots: Array<ItemStack | null> = [];
  for (const value of inventory.slots) {
    if (value === null) {
      slots.push(null);
      continue;
    }
    const stack = sanitizeItemStack(value);
    if (!stack) return undefined;
    slots.push(stack);
  }
  return { slots };
}

function sanitizeCraftingSnapshot(value: unknown): InventorySnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const inventory = value as Partial<InventorySnapshot>;
  if (!Array.isArray(inventory.slots) || inventory.slots.length !== 4) return undefined;

  const slots: Array<ItemStack | null> = [];
  for (const value of inventory.slots) {
    if (value === null) {
      slots.push(null);
      continue;
    }
    const stack = sanitizeItemStack(value);
    if (!stack) return undefined;
    slots.push(stack);
  }
  return { slots };
}

function sanitizeOptionalItemStack(value: unknown): ItemStack | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return sanitizeItemStack(value);
}

function sanitizeWorldDrops(rawValue: unknown): WorldDropSave[] | undefined {
  if (!Array.isArray(rawValue)) return undefined;
  const drops: WorldDropSave[] = [];
  for (const value of rawValue.slice(0, MAX_WORLD_DROPS)) {
    const drop = sanitizeWorldDrop(value);
    if (drop) drops.push(drop);
  }
  return drops;
}

function sanitizeWorldFurnaces(rawValue: unknown): WorldFurnaceSave[] | undefined {
  if (!Array.isArray(rawValue)) return undefined;
  const furnaces: WorldFurnaceSave[] = [];
  const occupied = new Set<string>();
  for (const value of rawValue.slice(0, MAX_WORLD_FURNACES)) {
    if (!value || typeof value !== 'object') continue;
    const candidate = value as Partial<WorldFurnaceSave>;
    const position = sanitizeBlockPosition(candidate.position);
    const state = sanitizeFurnaceSnapshot(candidate.state);
    if (!position || !state) continue;
    const key = position.join(',');
    if (occupied.has(key)) continue;
    occupied.add(key);
    furnaces.push({ position, state });
  }
  return furnaces;
}

function sanitizeWorldChests(
  rawValue: unknown,
  maximumEntries = MAX_WORLD_CHESTS
): WorldChestSave[] | undefined {
  if (!Array.isArray(rawValue)) return undefined;
  const chests: WorldChestSave[] = [];
  const occupied = new Set<string>();
  for (const value of rawValue.slice(0, maximumEntries)) {
    if (!value || typeof value !== 'object') continue;
    const candidate = value as Partial<WorldChestSave>;
    const position = sanitizeBlockPosition(candidate.position);
    const state = sanitizeChestSnapshot(candidate.state);
    if (!position || !state) continue;
    const key = position.join(',');
    if (occupied.has(key)) continue;
    occupied.add(key);
    chests.push({
      position,
      state,
      facing: sanitizeChestFacing(candidate.facing)
    });
  }
  return chests;
}

function sanitizeBlockPosition(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isFiniteNumber)) {
    return undefined;
  }
  const position = value.map((coordinate) => Math.trunc(coordinate));
  if (
    !isHorizontalWorldCoordinate(position[0]) ||
    !isHorizontalWorldCoordinate(position[2]) ||
    !isWorldBlockY(position[1])
  ) return undefined;
  return [position[0]!, position[1]!, position[2]!];
}

function sanitizeWorldDrop(value: unknown): WorldDropSave | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const drop = value as Partial<WorldDropSave>;
  const stack = sanitizeItemStack(drop.stack);
  const position = sanitizeWorldPositionTuple(drop.position);
  const velocity = sanitizeVectorTuple(drop.velocity);
  if (
    !stack ||
    !position ||
    !velocity ||
    !isFiniteNumber(drop.age) ||
    !isFiniteNumber(drop.pickupDelay)
  ) {
    return undefined;
  }
  return {
    stack,
    position,
    velocity,
    age: clamp(drop.age, 0, MAX_WORLD_DROP_AGE),
    pickupDelay: clamp(drop.pickupDelay, 0, MAX_WORLD_DROP_PICKUP_DELAY)
  };
}

function sanitizeVectorTuple(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(isFiniteNumber)) return undefined;
  return [value[0]!, value[1]!, value[2]!];
}

function sanitizeWorldPositionTuple(value: unknown): [number, number, number] | undefined {
  const position = sanitizeVectorTuple(value);
  if (
    !position ||
    !isHorizontalWorldCoordinate(position[0]) ||
    !isHorizontalWorldCoordinate(position[2])
  ) return undefined;
  return position;
}

function sanitizeItemStack(value: unknown): ItemStack | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const stack = value as Partial<ItemStack>;
  if (!isItemId(stack.item) || !isFiniteNumber(stack.count)) return undefined;

  const stackLimit = getItemStackLimit(stack.item);
  const rawCount = Math.trunc(stack.count);
  if (rawCount <= 0) return undefined;
  const count = Math.min(stackLimit, rawCount);
  if (!isToolItemId(stack.item) && !isArmorItemId(stack.item)) {
    return { item: stack.item, count };
  }

  const definition = isToolItemId(stack.item)
    ? TOOL_DEFINITIONS[stack.item]
    : ARMOR_DEFINITIONS[stack.item];
  if (stack.durability !== undefined && !isFiniteNumber(stack.durability)) return undefined;
  const rawDurability = Math.trunc(stack.durability ?? definition.maxDurability);
  if (rawDurability <= 0) return undefined;
  const durability = Math.min(definition.maxDurability, rawDurability);
  return { item: stack.item, count: 1, durability };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isHorizontalWorldCoordinate(value: unknown): value is number {
  return isFiniteNumber(value) && Math.abs(value) <= MAX_HORIZONTAL_WORLD_COORDINATE;
}

function isWorldBlockY(value: unknown): value is number {
  return (
    isFiniteNumber(value) &&
    Math.trunc(value) >= MIN_WORLD_BLOCK_Y &&
    Math.trunc(value) <= MAX_WORLD_BLOCK_Y
  );
}

function isNullableDamageSource(value: unknown): value is DamageSource | null {
  return value === null || isDamageSource(value);
}

function isDamageSource(value: unknown): value is DamageSource {
  return value === 'fall' || value === 'drowning' || value === 'starvation' || value === 'generic';
}

function isWorldGameMode(value: unknown): value is WorldGameMode {
  return value === 'survival' || value === 'creative';
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
