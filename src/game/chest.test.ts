import { describe, expect, it, vi } from 'vitest';
import {
  ARMOR_DEFINITIONS,
  ARMOR_ITEM_IDS,
  TOOL_DEFINITIONS,
  TOOL_ITEM_IDS,
  type ItemStack
} from './survival';
import { BlockId } from './types';
import {
  CHEST_FACINGS,
  CHEST_SLOT_COUNT,
  ChestInventory,
  chestFacingFromLookDirection,
  chestFacingFromYaw,
  isChestFacing,
  sanitizeChestFacing,
  sanitizeChestSnapshot
} from './chest';

describe('ChestFacing', () => {
  it('recognizes only the four cardinal persisted values and defaults unsafe values', () => {
    expect(CHEST_FACINGS).toEqual(['north', 'south', 'east', 'west']);
    for (const facing of CHEST_FACINGS) {
      expect(isChestFacing(facing)).toBe(true);
      expect(sanitizeChestFacing(facing)).toBe(facing);
    }

    for (const value of [undefined, null, '', 'up', 'North', 1, {}, ['south']]) {
      expect(isChestFacing(value)).toBe(false);
      expect(sanitizeChestFacing(value)).toBe('north');
    }
  });

  it('faces the chest toward the player for yaw and look vectors', () => {
    expect(chestFacingFromYaw(0)).toBe('south');
    expect(chestFacingFromYaw(Math.PI / 2)).toBe('east');
    expect(chestFacingFromYaw(Math.PI)).toBe('north');
    expect(chestFacingFromYaw(-Math.PI / 2)).toBe('west');
    expect(chestFacingFromYaw(Math.PI * 4)).toBe('south');

    expect(chestFacingFromLookDirection(0, -1)).toBe('south');
    expect(chestFacingFromLookDirection(-1, 0)).toBe('east');
    expect(chestFacingFromLookDirection(0, 1)).toBe('north');
    expect(chestFacingFromLookDirection(1, 0)).toBe('west');
  });

  it('uses stable half-open yaw sectors and safe non-finite fallbacks', () => {
    const epsilon = 1e-9;
    expect(chestFacingFromYaw(Math.PI / 4 - epsilon)).toBe('south');
    expect(chestFacingFromYaw(Math.PI / 4)).toBe('east');
    expect(chestFacingFromYaw(Math.PI / 4 + epsilon)).toBe('east');
    expect(chestFacingFromYaw(-Math.PI / 4 - epsilon)).toBe('west');
    expect(chestFacingFromYaw(-Math.PI / 4)).toBe('south');
    expect(chestFacingFromYaw(-Math.PI / 4 + epsilon)).toBe('south');
    expect(chestFacingFromYaw(Number.NaN)).toBe('north');
    expect(chestFacingFromYaw(Number.POSITIVE_INFINITY)).toBe('north');
    expect(chestFacingFromLookDirection(0, 0)).toBe('north');
    expect(chestFacingFromLookDirection(Number.NaN, 1)).toBe('north');
  });
});

describe('ChestInventory', () => {
  it('provides 27 independent slots and cloned snapshots', () => {
    const chest = new ChestInventory();

    expect(chest.size).toBe(CHEST_SLOT_COUNT);
    expect(chest.getSlots()).toEqual(Array.from({ length: 27 }, () => null));
    chest.setSlot(26, { item: BlockId.Dirt, count: 3 });

    const snapshot = chest.getSnapshot();
    expect(snapshot).toMatchObject({ version: 1 });
    expect(snapshot.slots).toHaveLength(27);
    expect(snapshot.slots[26]).toEqual({ item: BlockId.Dirt, count: 3 });
    snapshot.slots[26]!.count = 40;
    expect(chest.getSlot(26)).toEqual({ item: BlockId.Dirt, count: 3 });
  });

  it('caps ordinary stacks and reports per-slot or whole-chest overflow', () => {
    const chest = new ChestInventory();
    chest.setSlot(0, { item: BlockId.Cobblestone, count: 63 });

    expect(chest.insert(0, { item: BlockId.Cobblestone, count: 4 })).toBe(3);
    expect(chest.getSlot(0)).toEqual({ item: BlockId.Cobblestone, count: 64 });
    expect(chest.insert(0, { item: BlockId.Dirt, count: 5 })).toBe(5);
    expect(chest.addStack({ item: BlockId.Dirt, count: 70 })).toBe(0);
    expect(chest.getSlot(1)).toEqual({ item: BlockId.Dirt, count: 64 });
    expect(chest.getSlot(2)).toEqual({ item: BlockId.Dirt, count: 6 });
  });

  it('stores tools and armor as separate one-item stacks with safe durability', () => {
    const chest = new ChestInventory();
    const pickaxe = TOOL_ITEM_IDS.ironPickaxe;
    const helmet = ARMOR_ITEM_IDS.ironHelmet;

    expect(chest.addStack({ item: pickaxe, count: 2, durability: 9999 })).toBe(0);
    expect(chest.getSlot(0)).toEqual({
      item: pickaxe,
      count: 1,
      durability: TOOL_DEFINITIONS[pickaxe].maxDurability
    });
    expect(chest.getSlot(1)).toEqual(chest.getSlot(0));
    expect(chest.insert(0, { item: pickaxe, count: 1, durability: 1 })).toBe(1);

    chest.setSlot(2, { item: helmet, count: 30 });
    expect(chest.getSlot(2)).toEqual({
      item: helmet,
      count: 1,
      durability: ARMOR_DEFINITIONS[helmet].maxDurability
    });
  });

  it('rejects malformed containers while cleaning unsafe individual slots', () => {
    const slots = Array.from({ length: CHEST_SLOT_COUNT }, () => null) as unknown[];
    slots[0] = { item: BlockId.Planks, count: 999, durability: 7 };
    slots[1] = { item: TOOL_ITEM_IDS.woodenAxe, count: 9, durability: 9999 };
    slots[2] = { item: ARMOR_ITEM_IDS.ironBoots, count: 1, durability: 0 };
    slots[3] = { item: 'not_an_item', count: 12 };
    slots[4] = { item: BlockId.Stone, count: -2 };
    slots[5] = 'invalid';

    expect(sanitizeChestSnapshot({ version: 2, slots })).toBeUndefined();
    expect(sanitizeChestSnapshot({ version: 1, slots: slots.slice(1) })).toBeUndefined();
    expect(sanitizeChestSnapshot({ version: 1, slots: 'invalid' })).toBeUndefined();

    const sanitized = sanitizeChestSnapshot({ version: 1, slots });
    expect(sanitized?.slots[0]).toEqual({ item: BlockId.Planks, count: 64 });
    expect(sanitized?.slots[1]).toEqual({
      item: TOOL_ITEM_IDS.woodenAxe,
      count: 1,
      durability: TOOL_DEFINITIONS[TOOL_ITEM_IDS.woodenAxe].maxDurability
    });
    expect(sanitized?.slots.slice(2, 6)).toEqual([null, null, null, null]);
  });

  it('preserves state when a load is rejected and emits safe loaded snapshots', () => {
    const chest = new ChestInventory();
    const listener = vi.fn();
    chest.subscribe(listener);
    chest.setSlot(0, { item: BlockId.Dirt, count: 2 });

    expect(chest.loadSnapshot({ version: 1, slots: [] })).toBe(false);
    expect(chest.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 2 });

    const slots = Array.from({ length: CHEST_SLOT_COUNT }, () => null) as Array<ItemStack | null>;
    slots[4] = { item: BlockId.Wood, count: 7 };
    expect(chest.loadSnapshot({ version: 1, slots })).toBe(true);
    expect(chest.getSlot(0)).toBeNull();
    expect(chest.getSlot(4)).toEqual({ item: BlockId.Wood, count: 7 });
    expect(listener).toHaveBeenLastCalledWith(chest.getSnapshot());
  });

  it('returns every occupied slot in order and clears the chest', () => {
    const chest = new ChestInventory();
    chest.setSlot(3, { item: 'coal', count: 8 });
    chest.setSlot(20, { item: TOOL_ITEM_IDS.stoneShovel, count: 1, durability: 12 });

    expect(chest.takeAllContents()).toEqual([
      { item: 'coal', count: 8 },
      { item: TOOL_ITEM_IDS.stoneShovel, count: 1, durability: 12 }
    ]);
    expect(chest.getSlots().every((stack) => stack === null)).toBe(true);
  });
});
