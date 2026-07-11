import { describe, expect, it } from 'vitest';
import { ARMOR_ITEM_IDS, type ItemStack } from './survival';
import {
  ArmorEquipment,
  armorSlotToIndex,
  normalizeArmorEquipmentSnapshot
} from './equipment';

describe('ArmorEquipment', () => {
  it('accepts only the matching armor item for each equipment slot', () => {
    const equipment = new ArmorEquipment();

    expect(equipment.setSlot(0, { item: ARMOR_ITEM_IDS.ironHelmet, count: 4 })).toBe(true);
    expect(equipment.getSlot(0)).toEqual({
      item: ARMOR_ITEM_IDS.ironHelmet,
      count: 1,
      durability: 165
    });
    expect(equipment.setSlot(0, { item: ARMOR_ITEM_IDS.ironBoots, count: 1 })).toBe(false);
    expect(equipment.setSlot(4, null)).toBe(false);
    expect(armorSlotToIndex('feet')).toBe(3);
  });

  it('rejects zero, negative, non-finite, and non-numeric armor counts', () => {
    const equipment = new ArmorEquipment();
    const invalidCounts = [0, -3, Number.NaN, '1'] as const;

    for (const count of invalidCounts) {
      expect(equipment.setSlot(0, {
        item: ARMOR_ITEM_IDS.ironHelmet,
        count
      } as unknown as ItemStack)).toBe(false);
      expect(equipment.getSlot(0)).toBeNull();
    }
  });

  it('provides the iron set defense points and vanilla-style reduction', () => {
    const equipment = new ArmorEquipment({
      version: 1,
      slots: [
        { item: ARMOR_ITEM_IDS.ironHelmet, count: 1 },
        { item: ARMOR_ITEM_IDS.ironChestplate, count: 1 },
        { item: ARMOR_ITEM_IDS.ironLeggings, count: 1 },
        { item: ARMOR_ITEM_IDS.ironBoots, count: 1 }
      ]
    });

    expect(equipment.getDefensePoints()).toBe(15);
    expect(equipment.mitigateDamage(10)).toEqual({
      incomingDamage: 10,
      appliedDamage: 6,
      blockedDamage: 4,
      defensePoints: 15
    });
    expect(equipment.mitigateDamage(Number.NaN).appliedDamage).toBe(0);
  });

  it('applies diamond defense and toughness using the original-style formula', () => {
    const equipment = new ArmorEquipment({
      version: 1,
      slots: [
        { item: ARMOR_ITEM_IDS.diamondHelmet, count: 1 },
        { item: ARMOR_ITEM_IDS.diamondChestplate, count: 1 },
        { item: ARMOR_ITEM_IDS.diamondLeggings, count: 1 },
        { item: ARMOR_ITEM_IDS.diamondBoots, count: 1 }
      ]
    });

    expect(equipment.getDefensePoints()).toBe(20);
    expect(equipment.getToughness()).toBe(8);
    expect(equipment.mitigateDamage(10).appliedDamage).toBeCloseTo(3, 12);
    expect(equipment.mitigateDamage(10).blockedDamage).toBeCloseTo(7, 12);
  });

  it('round-trips the leather set with seven defense and no toughness', () => {
    const snapshot = {
      version: 1 as const,
      slots: [
        { item: ARMOR_ITEM_IDS.leatherHelmet, count: 1 },
        { item: ARMOR_ITEM_IDS.leatherTunic, count: 1 },
        { item: ARMOR_ITEM_IDS.leatherPants, count: 1 },
        { item: ARMOR_ITEM_IDS.leatherBoots, count: 1 }
      ]
    };
    const equipment = new ArmorEquipment(snapshot);

    expect(equipment.getDefensePoints()).toBe(7);
    expect(equipment.getToughness()).toBe(0);
    expect(equipment.getSnapshot()).toEqual({
      version: 1,
      slots: [
        { item: ARMOR_ITEM_IDS.leatherHelmet, count: 1, durability: 55 },
        { item: ARMOR_ITEM_IDS.leatherTunic, count: 1, durability: 80 },
        { item: ARMOR_ITEM_IDS.leatherPants, count: 1, durability: 75 },
        { item: ARMOR_ITEM_IDS.leatherBoots, count: 1, durability: 65 }
      ]
    });
  });

  it('damages every equipped piece and removes armor that breaks', () => {
    const equipment = new ArmorEquipment({
      version: 1,
      slots: [
        { item: ARMOR_ITEM_IDS.ironHelmet, count: 1, durability: 2 },
        { item: ARMOR_ITEM_IDS.ironChestplate, count: 1, durability: 20 },
        null,
        { item: ARMOR_ITEM_IDS.ironBoots, count: 1, durability: 1 }
      ]
    });

    expect(equipment.damageFromHit(8)).toEqual({
      changed: true,
      durabilityCost: 2,
      broken: [ARMOR_ITEM_IDS.ironHelmet, ARMOR_ITEM_IDS.ironBoots]
    });
    expect(equipment.getSlot(0)).toBeNull();
    expect(equipment.getSlot(1)?.durability).toBe(18);
    expect(equipment.getSlot(3)).toBeNull();
  });

  it('normalizes persisted armor and preserves a safe round trip', () => {
    const normalized = normalizeArmorEquipmentSnapshot({
      version: 1,
      slots: [
        { item: ARMOR_ITEM_IDS.ironHelmet, count: 99, durability: 9999 },
        { item: ARMOR_ITEM_IDS.ironBoots, count: 1, durability: 195 },
        { item: ARMOR_ITEM_IDS.ironLeggings, count: 1, durability: 0 },
        { item: ARMOR_ITEM_IDS.ironBoots, count: 1, durability: 12 }
      ]
    });

    expect(normalized).toEqual({
      version: 1,
      slots: [
        { item: ARMOR_ITEM_IDS.ironHelmet, count: 1, durability: 165 },
        null,
        null,
        { item: ARMOR_ITEM_IDS.ironBoots, count: 1, durability: 12 }
      ]
    });
    const equipment = new ArmorEquipment(normalized);
    expect(equipment.getSnapshot()).toEqual(normalized);
    expect(equipment.takeAll()).toEqual([
      { item: ARMOR_ITEM_IDS.ironHelmet, count: 1, durability: 165 },
      { item: ARMOR_ITEM_IDS.ironBoots, count: 1, durability: 12 }
    ]);
    expect(equipment.getSlots()).toEqual([null, null, null, null]);
  });
});
