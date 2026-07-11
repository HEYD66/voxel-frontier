import { describe, expect, it } from 'vitest';
import {
  calculateChargedAttack,
  getAttackDamageMultiplier,
  getAttackSpeed,
  getAttackStrength,
  getAttackTiming,
  getChargedAttackDamage,
  getFullChargeSeconds
} from './combat';
import { TOOL_ITEM_IDS, type ItemStack, type ToolItemId } from './survival';
import { BlockId } from './types';

function heldTool(item: ToolItemId): ItemStack {
  return { item, count: 1 };
}

describe('attack timing', () => {
  it('uses empty-hand speed for no item and non-tool items', () => {
    expect(getAttackTiming(null)).toEqual({
      attackSpeed: 4,
      fullChargeSeconds: 0.25
    });
    expect(getAttackSpeed({ item: BlockId.Dirt, count: 64 })).toBe(4);
    expect(getFullChargeSeconds({ item: 'cooked_pork', count: 1 })).toBe(0.25);
  });

  const toolSpeeds: ReadonlyArray<readonly [ToolItemId, number]> = [
    [TOOL_ITEM_IDS.woodenSword, 1.6],
    [TOOL_ITEM_IDS.stoneSword, 1.6],
    [TOOL_ITEM_IDS.ironSword, 1.6],
    [TOOL_ITEM_IDS.diamondSword, 1.6],
    [TOOL_ITEM_IDS.woodenPickaxe, 1.2],
    [TOOL_ITEM_IDS.stonePickaxe, 1.2],
    [TOOL_ITEM_IDS.ironPickaxe, 1.2],
    [TOOL_ITEM_IDS.diamondPickaxe, 1.2],
    [TOOL_ITEM_IDS.woodenShovel, 1],
    [TOOL_ITEM_IDS.stoneShovel, 1],
    [TOOL_ITEM_IDS.ironShovel, 1],
    [TOOL_ITEM_IDS.diamondShovel, 1],
    [TOOL_ITEM_IDS.woodenAxe, 0.8],
    [TOOL_ITEM_IDS.stoneAxe, 0.8],
    [TOOL_ITEM_IDS.ironAxe, 0.9],
    [TOOL_ITEM_IDS.diamondAxe, 1]
  ];

  for (const [item, expectedSpeed] of toolSpeeds) {
    it(`uses the expected attack speed for ${item}`, () => {
      const timing = getAttackTiming(heldTool(item));
      expect(timing.attackSpeed).toBe(expectedSpeed);
      expect(timing.fullChargeSeconds).toBeCloseTo(1 / expectedSpeed, 12);
    });
  }
});

describe('attack strength', () => {
  it('scales elapsed time from zero to a full empty-hand charge', () => {
    expect(getAttackStrength(0, null)).toBe(0);
    expect(getAttackStrength(0.125, null)).toBeCloseTo(0.5, 12);
    expect(getAttackStrength(0.25, null)).toBe(1);
    expect(getAttackStrength(10, null)).toBe(1);
  });

  it('uses the held weapon full-charge duration', () => {
    const sword = heldTool(TOOL_ITEM_IDS.ironSword);
    const ironAxe = heldTool(TOOL_ITEM_IDS.ironAxe);

    expect(getAttackStrength(0.3125, sword)).toBeCloseTo(0.5, 12);
    expect(getAttackStrength(0.625, sword)).toBe(1);
    expect(getAttackStrength(1 / 1.8, ironAxe)).toBeCloseTo(0.5, 12);
    expect(getAttackStrength(1 / 0.9, ironAxe)).toBe(1);
  });

  it('safely rejects negative and non-finite elapsed times', () => {
    expect(getAttackStrength(-1, null)).toBe(0);
    expect(getAttackStrength(Number.NaN, null)).toBe(0);
    expect(getAttackStrength(Number.POSITIVE_INFINITY, null)).toBe(0);
    expect(getAttackStrength(Number.NEGATIVE_INFINITY, null)).toBe(0);
  });
});

describe('charged attack damage', () => {
  it('uses the Java-style quadratic damage multiplier', () => {
    expect(getAttackDamageMultiplier(0)).toBeCloseTo(0.2, 12);
    expect(getAttackDamageMultiplier(0.25)).toBeCloseTo(0.25, 12);
    expect(getAttackDamageMultiplier(0.5)).toBeCloseTo(0.4, 12);
    expect(getAttackDamageMultiplier(1)).toBe(1);
  });

  it('clamps strength and handles non-finite values safely', () => {
    expect(getAttackDamageMultiplier(-1)).toBeCloseTo(0.2, 12);
    expect(getAttackDamageMultiplier(2)).toBe(1);
    expect(getAttackDamageMultiplier(Number.NaN)).toBeCloseTo(0.2, 12);
    expect(getAttackDamageMultiplier(Number.POSITIVE_INFINITY)).toBeCloseTo(0.2, 12);
  });

  it('applies the multiplier to non-negative finite base damage', () => {
    expect(getChargedAttackDamage(10, 0)).toBeCloseTo(2, 12);
    expect(getChargedAttackDamage(10, 0.5)).toBeCloseTo(4, 12);
    expect(getChargedAttackDamage(10, 1)).toBe(10);
    expect(getChargedAttackDamage(-10, 1)).toBe(0);
    expect(getChargedAttackDamage(Number.NaN, 1)).toBe(0);
    expect(getChargedAttackDamage(Number.POSITIVE_INFINITY, 1)).toBe(0);
  });

  it('returns timing, strength, multiplier, and damage together', () => {
    expect(calculateChargedAttack(6, 0.3125, heldTool(TOOL_ITEM_IDS.stoneSword))).toEqual({
      attackSpeed: 1.6,
      fullChargeSeconds: 0.625,
      strength: 0.5,
      damageMultiplier: 0.4,
      damage: 2.4000000000000004
    });
  });
});
