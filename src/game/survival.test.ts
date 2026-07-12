import { describe, expect, it } from 'vitest';
import { BlockId } from './types';
import {
  ARMOR_DEFINITIONS,
  ARMOR_ITEM_IDS,
  FOOD_DEFINITIONS,
  ItemInventory,
  MAX_AIR_SECONDS,
  MAX_HEALTH,
  MAX_HUNGER,
  SurvivalSystem,
  TOOL_DEFINITIONS,
  TOOL_ITEM_IDS,
  createToolStack,
  getArmorDefinition,
  getItemStackLimit,
  getMeleeDamage,
  getMiningProfile,
  isArmorItemId,
  isFoodItemId,
  isItemId,
  isToolItemId,
  type SurvivalEvent,
  type SurvivalSnapshot
} from './survival';

function snapshot(overrides: Partial<SurvivalSnapshot> = {}): SurvivalSnapshot {
  return {
    version: 1,
    health: MAX_HEALTH,
    hunger: MAX_HUNGER,
    saturation: 5,
    exhaustion: 0,
    air: MAX_AIR_SECONDS,
    dead: false,
    deathCause: null,
    inventory: { slots: Array.from({ length: 9 }, () => null) },
    ...overrides
  };
}

describe('ItemInventory', () => {
  it('fills existing stacks, respects 64-item limits, and keeps tools unstacked', () => {
    const inventory = new ItemInventory(4);

    expect(inventory.add(BlockId.Dirt, 70)).toBe(0);
    expect(inventory.getSlot(0)).toEqual({ item: BlockId.Dirt, count: 64 });
    expect(inventory.getSlot(1)).toEqual({ item: BlockId.Dirt, count: 6 });
    expect(inventory.add(TOOL_ITEM_IDS.woodenPickaxe, 2)).toBe(0);
    expect(inventory.getSlot(2)).toEqual({
      item: TOOL_ITEM_IDS.woodenPickaxe,
      count: 1,
      durability: TOOL_DEFINITIONS[TOOL_ITEM_IDS.woodenPickaxe].maxDurability
    });
    expect(inventory.getSlot(3)?.count).toBe(1);
    expect(inventory.add(BlockId.Stone, 1)).toBe(1);
  });

  it('damages and removes a tool exactly when durability reaches zero', () => {
    const inventory = new ItemInventory(2, [createToolStack('pickaxe', 'stone', 2)]);

    expect(inventory.damageTool(0)).toMatchObject({ broken: false, remainingDurability: 1 });
    expect(inventory.damageTool(0)).toMatchObject({ broken: true, remainingDurability: 0 });
    expect(inventory.getSlot(0)).toBeNull();
  });

  it('accepts mob drops as ordinary 64-stack inventory items', () => {
    const inventory = new ItemInventory(4);

    expect(inventory.add('raw_pork', 65)).toBe(0);
    expect(inventory.getSlot(0)).toEqual({ item: 'raw_pork', count: 64 });
    expect(inventory.getSlot(1)).toEqual({ item: 'raw_pork', count: 1 });
    expect(inventory.add('raw_mutton', 2)).toBe(0);
    expect(inventory.add('wool', 3)).toBe(0);
    expect(inventory.add('rotten_flesh', 1)).toBe(1);
    expect(isItemId('cooked_pork')).toBe(true);
    expect(isItemId('cooked_mutton')).toBe(true);
    expect(isItemId('stick')).toBe(true);
    expect(isItemId('diamond')).toBe(true);
  });

  it('accepts gunpowder as a stackable resource item', () => {
    const inventory = new ItemInventory(2);

    expect(isItemId('gunpowder')).toBe(true);
    expect(getItemStackLimit('gunpowder')).toBe(64);
    expect(inventory.add('gunpowder', 65)).toBe(0);
    expect(inventory.getSnapshot().slots).toEqual([
      { item: 'gunpowder', count: 64 },
      { item: 'gunpowder', count: 1 }
    ]);
  });

  it('creates every sword at full durability with authoritative melee damage', () => {
    const swords = [
      {
        tier: 'wood',
        item: TOOL_ITEM_IDS.woodenSword,
        maxDurability: 59,
        meleeDamage: 4
      },
      {
        tier: 'stone',
        item: TOOL_ITEM_IDS.stoneSword,
        maxDurability: 131,
        meleeDamage: 5
      },
      {
        tier: 'iron',
        item: TOOL_ITEM_IDS.ironSword,
        maxDurability: 250,
        meleeDamage: 6
      },
      {
        tier: 'diamond',
        item: TOOL_ITEM_IDS.diamondSword,
        maxDurability: 1561,
        meleeDamage: 7
      }
    ] as const;

    for (const sword of swords) {
      const stack = createToolStack('sword', sword.tier);
      expect(stack).toEqual({
        item: sword.item,
        count: 1,
        durability: sword.maxDurability
      });
      expect(TOOL_DEFINITIONS[sword.item]).toMatchObject({
        kind: 'sword',
        tier: sword.tier,
        maxDurability: sword.maxDurability,
        meleeDamage: sword.meleeDamage
      });
      expect(getMeleeDamage(stack)).toBe(sword.meleeDamage);
      expect(getMeleeDamage(sword.item)).toBe(sword.meleeDamage);
      expect(getItemStackLimit(sword.item)).toBe(1);
      expect(isItemId(sword.item)).toBe(true);
    }

    expect(getMeleeDamage(null)).toBe(1);
    expect(getMeleeDamage(BlockId.Dirt)).toBe(1);
    expect(getMeleeDamage(createToolStack('axe', 'wood'))).toBe(7);
  });

  it('normalizes every sword tier to a single-item tool stack', () => {
    const swords = [
      TOOL_ITEM_IDS.woodenSword,
      TOOL_ITEM_IDS.stoneSword,
      TOOL_ITEM_IDS.ironSword,
      TOOL_ITEM_IDS.diamondSword
    ] as const;
    const inventory = new ItemInventory(
      swords.length,
      swords.map((item) => ({ item, count: 64, durability: 10 }))
    );

    swords.forEach((item, index) => {
      expect(inventory.getSlot(index)).toEqual({ item, count: 1, durability: 10 });
    });
  });

  it('defines every iron and diamond armor piece with original-style stats', () => {
    const armor = [
      {
        item: ARMOR_ITEM_IDS.ironHelmet,
        slot: 'head',
        defense: 2,
        toughness: 0,
        maxDurability: 165
      },
      {
        item: ARMOR_ITEM_IDS.ironChestplate,
        slot: 'chest',
        defense: 6,
        toughness: 0,
        maxDurability: 240
      },
      {
        item: ARMOR_ITEM_IDS.ironLeggings,
        slot: 'legs',
        defense: 5,
        toughness: 0,
        maxDurability: 225
      },
      {
        item: ARMOR_ITEM_IDS.ironBoots,
        slot: 'feet',
        defense: 2,
        toughness: 0,
        maxDurability: 195
      },
      {
        item: ARMOR_ITEM_IDS.diamondHelmet,
        slot: 'head',
        defense: 3,
        toughness: 2,
        maxDurability: 363
      },
      {
        item: ARMOR_ITEM_IDS.diamondChestplate,
        slot: 'chest',
        defense: 8,
        toughness: 2,
        maxDurability: 528
      },
      {
        item: ARMOR_ITEM_IDS.diamondLeggings,
        slot: 'legs',
        defense: 6,
        toughness: 2,
        maxDurability: 495
      },
      {
        item: ARMOR_ITEM_IDS.diamondBoots,
        slot: 'feet',
        defense: 3,
        toughness: 2,
        maxDurability: 429
      }
    ] as const;

    for (const piece of armor) {
      expect(ARMOR_DEFINITIONS[piece.item]).toEqual({
        id: piece.item,
        slot: piece.slot,
        defense: piece.defense,
        toughness: piece.toughness,
        maxDurability: piece.maxDurability
      });
      expect(getArmorDefinition(piece.item)).toBe(ARMOR_DEFINITIONS[piece.item]);
      expect(isArmorItemId(piece.item)).toBe(true);
      expect(isToolItemId(piece.item)).toBe(false);
      expect(isItemId(piece.item)).toBe(true);
      expect(getItemStackLimit(piece.item)).toBe(1);
    }

    expect(isArmorItemId('iron_ingot')).toBe(false);
    expect(getArmorDefinition('iron_ingot')).toBeNull();
    expect(getArmorDefinition(BlockId.Dirt)).toBeNull();
  });

  it('defines beef, leather, and all four leather armor pieces with standard stats', () => {
    expect(FOOD_DEFINITIONS.raw_beef).toMatchObject({
      hunger: 3,
      saturation: 1.8,
      exhaustion: 0
    });
    expect(FOOD_DEFINITIONS.cooked_beef).toMatchObject({
      hunger: 8,
      saturation: 12.8,
      exhaustion: 0
    });
    expect(isFoodItemId('raw_beef')).toBe(true);
    expect(isFoodItemId('cooked_beef')).toBe(true);
    expect(isItemId('leather')).toBe(true);

    const armor = [
      [ARMOR_ITEM_IDS.leatherHelmet, 'head', 1, 55],
      [ARMOR_ITEM_IDS.leatherTunic, 'chest', 3, 80],
      [ARMOR_ITEM_IDS.leatherPants, 'legs', 2, 75],
      [ARMOR_ITEM_IDS.leatherBoots, 'feet', 1, 65]
    ] as const;
    for (const [item, slot, defense, maxDurability] of armor) {
      expect(ARMOR_DEFINITIONS[item]).toMatchObject({
        id: item,
        slot,
        defense,
        toughness: 0,
        maxDurability
      });
      expect(isArmorItemId(item)).toBe(true);
      expect(getItemStackLimit(item)).toBe(1);
    }

    const inventory = new ItemInventory(4, armor.map(([item]) => ({
      item,
      count: 64,
      durability: 9_999
    })));
    armor.forEach(([item, , , maxDurability], index) => {
      expect(inventory.getSlot(index)).toEqual({ item, count: 1, durability: maxDurability });
    });
  });

  it('uses exact diamond tool speed, harvest, durability, and melee values', () => {
    const expected = [
      [TOOL_ITEM_IDS.diamondPickaxe, 'pickaxe', 5],
      [TOOL_ITEM_IDS.diamondAxe, 'axe', 9],
      [TOOL_ITEM_IDS.diamondShovel, 'shovel', 5.5],
      [TOOL_ITEM_IDS.diamondSword, 'sword', 7]
    ] as const;

    for (const [item, kind, meleeDamage] of expected) {
      expect(TOOL_DEFINITIONS[item]).toMatchObject({
        kind,
        tier: 'diamond',
        harvestLevel: 4,
        speed: 8,
        maxDurability: 1561,
        meleeDamage
      });
    }
  });

  it('normalizes armor as unstackable damageable items', () => {
    const inventory = new ItemInventory(5, [
      { item: ARMOR_ITEM_IDS.ironHelmet, count: 64 },
      { item: ARMOR_ITEM_IDS.ironChestplate, count: 3, durability: 9999 },
      { item: ARMOR_ITEM_IDS.ironLeggings, count: 2, durability: 1 },
      { item: ARMOR_ITEM_IDS.ironBoots, count: 1, durability: 0 },
      { item: ARMOR_ITEM_IDS.ironBoots, count: 1, durability: Number.NaN }
    ]);

    expect(inventory.getSlot(0)).toEqual({
      item: ARMOR_ITEM_IDS.ironHelmet,
      count: 1,
      durability: 165
    });
    expect(inventory.getSlot(1)).toEqual({
      item: ARMOR_ITEM_IDS.ironChestplate,
      count: 1,
      durability: 240
    });
    expect(inventory.getSlot(2)).toEqual({
      item: ARMOR_ITEM_IDS.ironLeggings,
      count: 1,
      durability: 1
    });
    expect(inventory.getSlot(3)).toBeNull();
    expect(inventory.getSlot(4)).toBeNull();

    expect(inventory.add(ARMOR_ITEM_IDS.ironBoots, 3)).toBe(1);
    expect(inventory.getSlot(3)).toEqual({
      item: ARMOR_ITEM_IDS.ironBoots,
      count: 1,
      durability: 195
    });
    expect(inventory.getSlot(4)).toEqual({
      item: ARMOR_ITEM_IDS.ironBoots,
      count: 1,
      durability: 195
    });
  });
});

describe('mining and drops', () => {
  it('uses tool kind and harvest tier for speed and drop eligibility', () => {
    const handStone = getMiningProfile(BlockId.Stone);
    const woodStone = getMiningProfile(BlockId.Stone, createToolStack('pickaxe', 'wood'));
    const woodIron = getMiningProfile(BlockId.IronOre, createToolStack('pickaxe', 'wood'));
    const stoneIron = getMiningProfile(BlockId.IronOre, createToolStack('pickaxe', 'stone'));
    const stoneDiamond = getMiningProfile(BlockId.DiamondOre, createToolStack('pickaxe', 'stone'));
    const ironDiamond = getMiningProfile(BlockId.DiamondOre, createToolStack('pickaxe', 'iron'));
    const diamondDiamond = getMiningProfile(BlockId.DiamondOre, createToolStack('pickaxe', 'diamond'));

    expect(handStone).toMatchObject({ breakable: true, canHarvest: false, drop: null });
    expect(handStone.duration).toBeCloseTo(7.5);
    expect(woodStone).toMatchObject({
      effectiveTool: true,
      canHarvest: true,
      drop: { item: BlockId.Cobblestone, count: 1 }
    });
    expect(woodStone.duration).toBeCloseTo(1.125);
    expect(woodIron.canHarvest).toBe(false);
    expect(woodIron.drop).toBeNull();
    expect(stoneIron.drop).toEqual({ item: 'raw_iron', count: 1 });
    expect(stoneDiamond).toMatchObject({ canHarvest: false, drop: null });
    expect(ironDiamond).toMatchObject({
      effectiveTool: true,
      canHarvest: true,
      drop: { item: 'diamond', count: 1 }
    });
    expect(diamondDiamond.drop).toEqual({ item: 'diamond', count: 1 });
    expect(diamondDiamond.duration).toBeLessThan(ironDiamond.duration);
    expect(getMiningProfile(BlockId.Bedrock).breakable).toBe(false);

    const handCraftingTable = getMiningProfile(BlockId.CraftingTable);
    const axeCraftingTable = getMiningProfile(BlockId.CraftingTable, createToolStack('axe', 'wood'));
    expect(handCraftingTable).toMatchObject({
      breakable: true,
      effectiveTool: false,
      canHarvest: true,
      drop: { item: BlockId.CraftingTable, count: 1 }
    });
    expect(handCraftingTable.duration).toBeCloseTo(3.75);
    expect(axeCraftingTable.effectiveTool).toBe(true);
    expect(axeCraftingTable.duration).toBeCloseTo(1.875);
    expect(isItemId(BlockId.CraftingTable)).toBe(true);

    const handFurnace = getMiningProfile(BlockId.Furnace);
    const pickaxeFurnace = getMiningProfile(BlockId.Furnace, createToolStack('pickaxe', 'wood'));
    expect(handFurnace).toMatchObject({
      breakable: true,
      effectiveTool: false,
      canHarvest: false,
      drop: null
    });
    expect(handFurnace.duration).toBeCloseTo(17.5);
    expect(pickaxeFurnace).toMatchObject({
      effectiveTool: true,
      canHarvest: true,
      drop: { item: BlockId.Furnace, count: 1 }
    });
    expect(pickaxeFurnace.duration).toBeCloseTo(2.625);
    expect(isItemId(BlockId.Furnace)).toBe(true);

    const handTorch = getMiningProfile(BlockId.Torch);
    expect(handTorch).toMatchObject({
      breakable: true,
      effectiveTool: false,
      canHarvest: true,
      drop: { item: BlockId.Torch, count: 1 }
    });
    expect(handTorch.duration).toBeCloseTo(0.075);
    expect(isItemId(BlockId.Torch)).toBe(true);

    const handChest = getMiningProfile(BlockId.Chest);
    const axeChest = getMiningProfile(BlockId.Chest, createToolStack('axe', 'wood'));
    expect(handChest).toMatchObject({
      breakable: true,
      effectiveTool: false,
      canHarvest: true,
      drop: { item: BlockId.Chest, count: 1 }
    });
    expect(handChest.duration).toBeCloseTo(3.75);
    expect(axeChest).toMatchObject({
      effectiveTool: true,
      canHarvest: true,
      drop: { item: BlockId.Chest, count: 1 }
    });
    expect(axeChest.duration).toBeCloseTo(1.875);
    expect(isItemId(BlockId.Chest)).toBe(true);
  });

  it('does not treat swords as effective mining tools', () => {
    const handStone = getMiningProfile(BlockId.Stone);
    const swordStone = getMiningProfile(BlockId.Stone, createToolStack('sword', 'iron'));
    const handWood = getMiningProfile(BlockId.Wood);
    const swordWood = getMiningProfile(BlockId.Wood, createToolStack('sword', 'iron'));

    expect(swordStone).toMatchObject({
      effectiveTool: false,
      canHarvest: false,
      drop: null,
      tool: { kind: 'sword', tier: 'iron' }
    });
    expect(swordStone.duration).toBe(handStone.duration);
    expect(swordWood).toMatchObject({
      effectiveTool: false,
      canHarvest: true,
      drop: { item: BlockId.Wood, count: 1 }
    });
    expect(swordWood.duration).toBe(handWood.duration);
  });

  it('charges swords two durability, ordinary tools one, and nothing for bedrock', () => {
    const survival = new SurvivalSystem({ inventorySlots: 4 });
    survival.inventory.setSlot(0, createToolStack('sword', 'iron', 10));
    survival.inventory.setSlot(1, createToolStack('shovel', 'iron', 10));

    expect(survival.breakBlock(BlockId.Dirt, 0)).toMatchObject({
      breakable: true,
      toolDamaged: true,
      toolBroke: false
    });
    expect(survival.inventory.getSlot(0)?.durability).toBe(8);

    expect(survival.breakBlock(BlockId.Dirt, 1)).toMatchObject({
      breakable: true,
      toolDamaged: true,
      toolBroke: false
    });
    expect(survival.inventory.getSlot(1)?.durability).toBe(9);

    expect(survival.breakBlock(BlockId.Bedrock, 0)).toMatchObject({
      breakable: false,
      toolDamaged: false,
      toolBroke: false
    });
    expect(survival.inventory.getSlot(0)?.durability).toBe(8);
    survival.dispose();
  });

  it('collects a drop and emits tool break when the last durability is consumed', () => {
    const survival = new SurvivalSystem({ inventorySlots: 4 });
    const events: SurvivalEvent[] = [];
    survival.onEvent((event) => events.push(event));
    survival.inventory.setSlot(0, createToolStack('pickaxe', 'wood', 1));

    const result = survival.breakBlock(BlockId.Stone, 0);

    expect(result).toMatchObject({
      breakable: true,
      canHarvest: true,
      collectedCount: 1,
      toolDamaged: true,
      toolBroke: true
    });
    expect(survival.inventory.count(BlockId.Cobblestone)).toBe(1);
    expect(events.some((event) => event.type === 'tool-broken')).toBe(true);
    expect(events.some((event) => event.type === 'block-break')).toBe(true);
    survival.dispose();
  });
});

describe('SurvivalSystem vitals', () => {
  it('records explosion as the death source', () => {
    const survival = new SurvivalSystem();

    expect(survival.takeDamage(MAX_HEALTH, 'explosion')).toBe(MAX_HEALTH);
    expect(survival.dead).toBe(true);
    expect(survival.deathCause).toBe('explosion');
    const restored = new SurvivalSystem({ snapshot: survival.getSnapshot() });
    expect(restored.deathCause).toBe('explosion');
    restored.dispose();
    survival.dispose();
  });

  it('regenerates from high hunger and converts exhaustion into saturation loss', () => {
    const survival = new SurvivalSystem({ snapshot: snapshot({ health: 16 }) });

    survival.update(8);

    expect(survival.health).toBe(18);
    expect(survival.hunger).toBe(20);
    expect(survival.saturation).toBe(4);
    survival.dispose();
  });

  it('starves to death, drops inventory, and resets vitals on respawn', () => {
    const startingSnapshot = snapshot({
      health: 3,
      hunger: 0,
      saturation: 0,
      inventory: { slots: [{ item: BlockId.Wood, count: 3 }, ...Array.from({ length: 8 }, () => null)] }
    });
    const survival = new SurvivalSystem({ snapshot: startingSnapshot });
    const events: SurvivalEvent[] = [];
    survival.onEvent((event) => events.push(event));

    survival.update(12);

    expect(survival.dead).toBe(true);
    expect(survival.health).toBe(0);
    expect(survival.deathCause).toBe('starvation');
    expect(survival.inventory.count(BlockId.Wood)).toBe(0);
    const death = events.find((event) => event.type === 'death');
    expect(death).toMatchObject({ source: 'starvation', droppedInventory: [{ item: BlockId.Wood, count: 3 }] });

    survival.respawn();
    expect(survival.getVitals()).toMatchObject({
      health: MAX_HEALTH,
      hunger: MAX_HUNGER,
      air: MAX_AIR_SECONDS,
      dead: false
    });
    survival.dispose();
  });

  it('depletes air before drowning and recovers breath out of water', () => {
    const survival = new SurvivalSystem();

    survival.update(MAX_AIR_SECONDS, { headUnderwater: true });
    expect(survival.air).toBe(0);
    expect(survival.health).toBe(MAX_HEALTH);
    survival.update(1, { headUnderwater: true });
    expect(survival.health).toBe(MAX_HEALTH - 2);
    survival.update(3, { headUnderwater: false });
    expect(survival.air).toBe(MAX_AIR_SECONDS);
    survival.dispose();
  });

  it('applies a three-block safe fall threshold and movement exhaustion deterministically', () => {
    const survival = new SurvivalSystem();

    expect(survival.applyFallDamage(3)).toBe(0);
    expect(survival.applyFallDamage(7.2)).toBe(5);
    expect(survival.health).toBe(15);
    survival.recordMovement(40, true);
    expect(survival.saturation).toBe(4);
    survival.dispose();
  });

  it('consumes meat drops and applies the low-quality rotten flesh penalty', () => {
    const survival = new SurvivalSystem({
      snapshot: snapshot({ hunger: 10, saturation: 2 })
    });
    survival.inventory.add('raw_pork', 1);
    survival.inventory.add('rotten_flesh', 1);

    expect(survival.consumeFood('raw_pork')).toBe(true);
    expect(survival.hunger).toBe(13);
    expect(survival.saturation).toBeCloseTo(3.8);
    expect(survival.consumeFood('rotten_flesh')).toBe(true);
    expect(survival.hunger).toBe(17);
    expect(survival.saturation).toBeCloseTo(3.6);
    expect(survival.inventory.count('raw_pork')).toBe(0);
    expect(survival.inventory.count('rotten_flesh')).toBe(0);
    survival.dispose();
  });

  it('consumes cooked meat with its higher hunger and saturation values', () => {
    expect(FOOD_DEFINITIONS.cooked_pork).toMatchObject({
      hunger: 8,
      saturation: 12.8,
      exhaustion: 0
    });
    expect(FOOD_DEFINITIONS.cooked_mutton).toMatchObject({
      hunger: 6,
      saturation: 9.6,
      exhaustion: 0
    });
    expect(isFoodItemId('cooked_pork')).toBe(true);
    expect(isFoodItemId('cooked_mutton')).toBe(true);
    expect(FOOD_DEFINITIONS.cooked_beef).toMatchObject({
      hunger: 8,
      saturation: 12.8,
      exhaustion: 0
    });
    expect(isFoodItemId('cooked_beef')).toBe(true);

    const pork = new SurvivalSystem({
      snapshot: snapshot({
        hunger: 5,
        saturation: 0,
        inventory: {
          slots: [{ item: 'cooked_pork', count: 2 }, ...Array.from({ length: 8 }, () => null)]
        }
      })
    });
    expect(pork.consumeFood('cooked_pork')).toBe(true);
    expect(pork.hunger).toBe(13);
    expect(pork.saturation).toBeCloseTo(12.8);
    expect(pork.inventory.getSlot(0)).toEqual({ item: 'cooked_pork', count: 1 });
    pork.dispose();

    const mutton = new SurvivalSystem({
      snapshot: snapshot({
        hunger: 8,
        saturation: 0,
        inventory: {
          slots: [{ item: 'cooked_mutton', count: 1 }, ...Array.from({ length: 8 }, () => null)]
        }
      })
    });
    expect(mutton.consumeFood('cooked_mutton')).toBe(true);
    expect(mutton.hunger).toBe(14);
    expect(mutton.saturation).toBeCloseTo(9.6);
    expect(mutton.inventory.getSlot(0)).toBeNull();
    mutton.dispose();
  });
});
