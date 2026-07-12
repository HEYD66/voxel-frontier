import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHEST_SLOT_COUNT } from './chest';
import { createWorldSave, clearWorldSave, loadWorldSave, writeWorldSave } from './save';
import {
  ARMOR_DEFINITIONS,
  ARMOR_ITEM_IDS,
  MAX_AIR_SECONDS,
  MAX_HEALTH,
  TOOL_DEFINITIONS,
  TOOL_ITEM_IDS,
  type SurvivalSnapshot
} from './survival';
import { BlockId, MAX_BLOCK_ID, WORLD_SAVE_KEY } from './types';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

function baseSave(): Record<string, unknown> {
  return {
    version: 1,
    seed: 1234,
    edits: [[1, 2, 3, BlockId.Stone]],
    player: { position: [0.5, 10, 0.5], yaw: 0.25, pitch: -0.1, selectedSlot: 2 },
    hotbar: [BlockId.Grass, BlockId.Stone],
    timeOfDay: 0.42
  };
}

function survivalSnapshot(overrides: Partial<SurvivalSnapshot> = {}): SurvivalSnapshot {
  return {
    version: 1,
    health: 18,
    hunger: 16,
    saturation: 4,
    exhaustion: 1,
    air: 12,
    dead: false,
    deathCause: null,
    inventory: { slots: Array.from({ length: 9 }, () => null) },
    ...overrides
  };
}

describe('world save survival compatibility', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads legacy version-1 saves without requiring new fields', () => {
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(baseSave()));

    const loaded = loadWorldSave();

    expect(loaded).not.toBeNull();
    expect(loaded?.seed).toBe(1234);
    expect(loaded?.edits).toEqual([[1, 2, 3, BlockId.Stone]]);
    expect(loaded?.survival).toBeUndefined();
    expect(loaded?.mode).toBeUndefined();
    expect(loaded?.crafting).toBeUndefined();
    expect(loaded?.cursor).toBeUndefined();
    expect(loaded?.equipment).toBeUndefined();
    expect(loaded?.drops).toBeUndefined();
    expect(loaded?.furnaces).toBeUndefined();
    expect(loaded?.chests).toBeUndefined();
  });

  it('round-trips torch edits and creative hotbars through version-1 saves', () => {
    const torchEdit: [number, number, number, BlockId] = [12, 34, -5, BlockId.Torch];
    const hotbar = [BlockId.Grass, BlockId.Torch, BlockId.Furnace];
    const save = createWorldSave(
      4321,
      [torchEdit],
      { position: [0.5, 10, 0.5], yaw: 0, pitch: 0, selectedSlot: 1 },
      0.6,
      hotbar,
      undefined,
      'creative'
    );

    expect(writeWorldSave(save)).toBe(true);
    const loaded = loadWorldSave();

    expect(loaded?.version).toBe(1);
    expect(loaded?.mode).toBe('creative');
    expect(loaded?.edits).toEqual([torchEdit]);
    expect(loaded?.hotbar).toEqual(hotbar);
  });

  it('round-trips all four armor equipment slots through the world save', () => {
    const equipment = {
      version: 1 as const,
      slots: [
        { item: ARMOR_ITEM_IDS.ironHelmet, count: 1, durability: 160 },
        { item: ARMOR_ITEM_IDS.ironChestplate, count: 1, durability: 230 },
        { item: ARMOR_ITEM_IDS.ironLeggings, count: 1, durability: 210 },
        { item: ARMOR_ITEM_IDS.ironBoots, count: 1, durability: 180 }
      ]
    };
    const save = createWorldSave(
      77,
      [],
      { position: [0.5, 4, 0.5], yaw: 0, pitch: 0, selectedSlot: 0 },
      0.25,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      equipment
    );

    expect(save.equipment).toEqual(equipment);
    expect(writeWorldSave(save)).toBe(true);
    expect(loadWorldSave()?.equipment).toEqual(equipment);
  });

  it('cleans wrong armor slots and forged equipment durability', () => {
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({
      ...baseSave(),
      equipment: {
        version: 1,
        slots: [
          { item: ARMOR_ITEM_IDS.ironBoots, count: 9, durability: 9999 },
          { item: ARMOR_ITEM_IDS.ironChestplate, count: 9, durability: 9999 },
          { item: ARMOR_ITEM_IDS.ironLeggings, count: 9, durability: -50 },
          { item: ARMOR_ITEM_IDS.ironBoots, count: 9, durability: 7 }
        ]
      }
    }));

    expect(loadWorldSave()?.equipment).toEqual({
      version: 1,
      slots: [
        null,
        {
          item: ARMOR_ITEM_IDS.ironChestplate,
          count: 1,
          durability: ARMOR_DEFINITIONS[ARMOR_ITEM_IDS.ironChestplate].maxDurability
        },
        null,
        { item: ARMOR_ITEM_IDS.ironBoots, count: 1, durability: 7 }
      ]
    });

    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({
      ...baseSave(),
      equipment: {
        version: 1,
        slots: [null, null, null]
      }
    }));
    expect(loadWorldSave()?.equipment).toBeUndefined();
  });

  it('rejects zero, negative, non-finite, and string counts in equipment snapshots', () => {
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({
      ...baseSave(),
      equipment: {
        version: 1,
        slots: [
          { item: ARMOR_ITEM_IDS.ironHelmet, count: 0, durability: 10 },
          { item: ARMOR_ITEM_IDS.ironChestplate, count: -2, durability: 10 },
          { item: ARMOR_ITEM_IDS.ironLeggings, count: Number.NaN, durability: 10 },
          { item: ARMOR_ITEM_IDS.ironBoots, count: '1', durability: 10 }
        ]
      }
    }));

    expect(loadWorldSave()?.equipment).toEqual({
      version: 1,
      slots: [null, null, null, null]
    });
  });

  it('keeps cooked food and cooking furnaces inside the version-1 save schema', () => {
    const cookingState = {
      version: 1 as const,
      input: { item: 'raw_pork' as const, count: 2 },
      fuel: { item: 'coal' as const, count: 1 },
      output: { item: 'cooked_pork' as const, count: 3 },
      burnTime: 70,
      burnDuration: 80,
      cookTime: 4,
      cookDuration: 10
    };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({
      ...baseSave(),
      survival: survivalSnapshot({
        inventory: {
          slots: [
            { item: 'cooked_pork', count: 12 },
            { item: 'cooked_mutton', count: 7 },
            ...Array.from({ length: 7 }, () => null)
          ]
        }
      }),
      cursor: { item: 'cooked_mutton', count: 5 },
      drops: [
        {
          stack: { item: 'cooked_pork', count: 2 },
          position: [1, 2, 3],
          velocity: [0, 0, 0],
          age: 1,
          pickupDelay: 0
        }
      ],
      furnaces: [{ position: [4, 5, 6], state: cookingState }]
    }));

    const loaded = loadWorldSave();
    expect(loaded?.version).toBe(1);
    expect(loaded?.survival?.inventory.slots.slice(0, 2)).toEqual([
      { item: 'cooked_pork', count: 12 },
      { item: 'cooked_mutton', count: 7 }
    ]);
    expect(loaded?.cursor).toEqual({ item: 'cooked_mutton', count: 5 });
    expect(loaded?.drops?.[0]?.stack).toEqual({ item: 'cooked_pork', count: 2 });
    expect(loaded?.furnaces).toEqual([{ position: [4, 5, 6], state: cookingState }]);

    expect(writeWorldSave(loaded!)).toBe(true);
    expect(loadWorldSave()).toEqual(loaded);
  });

  it('accepts appended blocks in edits, hotbars, and item stacks while rejecting ids above the shared bound', () => {
    const raw = {
      ...baseSave(),
      edits: [
        [1, 2, 3, BlockId.Bedrock],
        [4, 5, 6, BlockId.CraftingTable],
        [7, 8, 9, BlockId.Furnace],
        [10, 11, 12, MAX_BLOCK_ID + 1]
      ],
      hotbar: [BlockId.Bedrock, BlockId.CraftingTable, BlockId.Furnace, MAX_BLOCK_ID + 1],
      survival: survivalSnapshot({
        inventory: { slots: [{ item: BlockId.Furnace, count: 12 }] }
      })
    };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(raw));

    const loaded = loadWorldSave();

    expect(loaded?.edits).toEqual([
      [1, 2, 3, BlockId.Bedrock],
      [4, 5, 6, BlockId.CraftingTable],
      [7, 8, 9, BlockId.Furnace]
    ]);
    expect(loaded?.hotbar).toEqual([BlockId.Bedrock, BlockId.CraftingTable, BlockId.Furnace]);
    expect(loaded?.survival?.inventory.slots).toEqual([
      { item: BlockId.Furnace, count: 12 }
    ]);
  });

  it('sanitizes vitals, item counts, and tool durability in a valid snapshot', () => {
    const raw = {
      ...baseSave(),
      mode: 'survival',
      survival: {
        version: 1,
        health: 99,
        hunger: -4,
        saturation: 18,
        exhaustion: 20,
        air: 80,
        dead: false,
        deathCause: null,
        inventory: {
          slots: [
            { item: BlockId.Dirt, count: 900, durability: 5 },
            { item: TOOL_ITEM_IDS.woodenPickaxe, count: 12, durability: 900 },
            { item: 'raw_pork', count: 3 },
            null
          ]
        }
      }
    };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(raw));

    const loaded = loadWorldSave();

    expect(loaded?.mode).toBe('survival');
    expect(loaded?.survival).toMatchObject({
      health: MAX_HEALTH,
      hunger: 0,
      saturation: 0,
      exhaustion: 4,
      air: MAX_AIR_SECONDS,
      dead: false,
      deathCause: null
    });
    expect(loaded?.survival?.inventory.slots).toEqual([
      { item: BlockId.Dirt, count: 64 },
      {
        item: TOOL_ITEM_IDS.woodenPickaxe,
        count: 1,
        durability: TOOL_DEFINITIONS[TOOL_ITEM_IDS.woodenPickaxe].maxDurability
      },
      { item: 'raw_pork', count: 3 },
      null
    ]);
  });

  it('clamps saved sword stacks to one item and each tier maximum durability', () => {
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({
      ...baseSave(),
      survival: survivalSnapshot({
        inventory: {
          slots: [
            { item: TOOL_ITEM_IDS.woodenSword, count: 64, durability: 9_999 },
            { item: TOOL_ITEM_IDS.stoneSword, count: 64, durability: 9_999 },
            { item: TOOL_ITEM_IDS.ironSword, count: 64, durability: 9_999 },
            { item: TOOL_ITEM_IDS.diamondSword, count: 64, durability: 9_999 }
          ]
        }
      })
    }));

    expect(loadWorldSave()?.survival?.inventory.slots).toEqual([
      { item: TOOL_ITEM_IDS.woodenSword, count: 1, durability: 59 },
      { item: TOOL_ITEM_IDS.stoneSword, count: 1, durability: 131 },
      { item: TOOL_ITEM_IDS.ironSword, count: 1, durability: 250 },
      { item: TOOL_ITEM_IDS.diamondSword, count: 1, durability: 1561 }
    ]);
  });

  it('round-trips diamond ore, resources, tools, and armor through the v1 schema', () => {
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({
      ...baseSave(),
      edits: [[123, 7, -456, BlockId.DiamondOre]],
      survival: survivalSnapshot({
        inventory: {
          slots: [
            { item: 'diamond', count: 80 },
            { item: TOOL_ITEM_IDS.diamondPickaxe, count: 8, durability: 9_999 },
            { item: ARMOR_ITEM_IDS.diamondChestplate, count: 4, durability: 9_999 }
          ]
        }
      }),
      equipment: {
        version: 1,
        slots: [
          { item: ARMOR_ITEM_IDS.diamondHelmet, count: 1, durability: 200 },
          null,
          null,
          { item: ARMOR_ITEM_IDS.diamondBoots, count: 1, durability: 300 }
        ]
      }
    }));

    const loaded = loadWorldSave();
    expect(loaded?.edits).toEqual([[123, 7, -456, BlockId.DiamondOre]]);
    expect(loaded?.survival?.inventory.slots).toEqual([
      { item: 'diamond', count: 64 },
      { item: TOOL_ITEM_IDS.diamondPickaxe, count: 1, durability: 1561 },
      { item: ARMOR_ITEM_IDS.diamondChestplate, count: 1, durability: 528 }
    ]);
    expect(loaded?.equipment?.slots).toEqual([
      { item: ARMOR_ITEM_IDS.diamondHelmet, count: 1, durability: 200 },
      null,
      null,
      { item: ARMOR_ITEM_IDS.diamondBoots, count: 1, durability: 300 }
    ]);
  });

  it('sanitizes gunpowder in inventory, cursor, and persisted world drops', () => {
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({
      ...baseSave(),
      survival: survivalSnapshot({
        inventory: { slots: [{ item: 'gunpowder', count: 80 }] }
      }),
      cursor: { item: 'gunpowder', count: 5 },
      drops: [{
        stack: { item: 'gunpowder', count: 90 },
        position: [2, 3, 4],
        velocity: [0.1, 0.2, 0.3],
        age: 1,
        pickupDelay: 0.25
      }]
    }));

    const loaded = loadWorldSave();
    expect(loaded?.survival?.inventory.slots).toEqual([{ item: 'gunpowder', count: 64 }]);
    expect(loaded?.cursor).toEqual({ item: 'gunpowder', count: 5 });
    expect(loaded?.drops).toEqual([{
      stack: { item: 'gunpowder', count: 64 },
      position: [2, 3, 4],
      velocity: [0.1, 0.2, 0.3],
      age: 1,
      pickupDelay: 0.25
    }]);
  });

  it('sanitizes and round-trips beef, leather, and leather armor', () => {
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({
      ...baseSave(),
      survival: survivalSnapshot({
        inventory: {
          slots: [
            { item: 'raw_beef', count: 70 },
            { item: 'cooked_beef', count: 12 },
            { item: 'leather', count: 9 },
            { item: ARMOR_ITEM_IDS.leatherTunic, count: 4, durability: 999 }
          ]
        }
      }),
      equipment: {
        version: 1,
        slots: [
          { item: ARMOR_ITEM_IDS.leatherHelmet, count: 3, durability: 999 },
          { item: ARMOR_ITEM_IDS.leatherTunic, count: 1, durability: 40 },
          { item: ARMOR_ITEM_IDS.leatherPants, count: 1, durability: 30 },
          { item: ARMOR_ITEM_IDS.leatherBoots, count: 1, durability: 20 }
        ]
      },
      drops: [{
        stack: { item: 'raw_beef', count: 2 },
        position: [2, 3, 4],
        velocity: [0, 0, 0],
        age: 1,
        pickupDelay: 0
      }]
    }));

    const loaded = loadWorldSave();
    expect(loaded?.survival?.inventory.slots).toEqual([
      { item: 'raw_beef', count: 64 },
      { item: 'cooked_beef', count: 12 },
      { item: 'leather', count: 9 },
      { item: ARMOR_ITEM_IDS.leatherTunic, count: 1, durability: 80 }
    ]);
    expect(loaded?.equipment?.slots).toEqual([
      { item: ARMOR_ITEM_IDS.leatherHelmet, count: 1, durability: 55 },
      { item: ARMOR_ITEM_IDS.leatherTunic, count: 1, durability: 40 },
      { item: ARMOR_ITEM_IDS.leatherPants, count: 1, durability: 30 },
      { item: ARMOR_ITEM_IDS.leatherBoots, count: 1, durability: 20 }
    ]);
    expect(loaded?.drops?.[0]?.stack).toEqual({ item: 'raw_beef', count: 2 });
  });

  it('normalizes dead snapshots and preserves a valid death cause', () => {
    const raw = {
      ...baseSave(),
      survival: survivalSnapshot({ health: 12, dead: true, deathCause: 'fall' })
    };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(raw));

    expect(loadWorldSave()?.survival).toMatchObject({
      health: 0,
      dead: true,
      deathCause: 'fall'
    });
  });

  it('drops only malformed survival data while retaining the world save', () => {
    const malformedItem = {
      ...baseSave(),
      mode: 'creative',
      survival: {
        ...survivalSnapshot(),
        inventory: { slots: [{ item: 'emerald', count: 1 }] }
      }
    };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(malformedItem));

    const loaded = loadWorldSave();

    expect(loaded?.seed).toBe(1234);
    expect(loaded?.mode).toBe('creative');
    expect(loaded?.survival).toBeUndefined();

    const malformedVitals = {
      ...baseSave(),
      survival: { ...survivalSnapshot(), health: 'full' }
    };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(malformedVitals));
    expect(loadWorldSave()?.survival).toBeUndefined();
  });

  it('rejects impossible inventory slot counts without throwing', () => {
    const raw = {
      ...baseSave(),
      survival: survivalSnapshot({
        inventory: { slots: Array.from({ length: 257 }, () => null) }
      })
    };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(raw));

    expect(() => loadWorldSave()).not.toThrow();
    expect(loadWorldSave()?.survival).toBeUndefined();
  });

  it('extends createWorldSave without changing existing callers', () => {
    const legacy = createWorldSave(
      42,
      [],
      { position: [0.5, 4, 0.5], yaw: 0, pitch: 0, selectedSlot: 0 },
      1.25,
      [BlockId.Grass]
    );
    expect(legacy).toMatchObject({ seed: 42, timeOfDay: 0.25 });
    expect(legacy.survival).toBeUndefined();
    expect(legacy.mode).toBeUndefined();
    expect(legacy.crafting).toBeUndefined();
    expect(legacy.cursor).toBeUndefined();
    expect(legacy.drops).toBeUndefined();

    const extended = createWorldSave(
      42,
      [],
      { position: [0.5, 4, 0.5], yaw: 0, pitch: 0, selectedSlot: 0 },
      0.5,
      [BlockId.Grass],
      survivalSnapshot({
        inventory: { slots: [{ item: TOOL_ITEM_IDS.stonePickaxe, count: 5, durability: 999 }] }
      }),
      'survival',
      {
        slots: [
          { item: BlockId.Planks, count: 80 },
          null,
          { item: TOOL_ITEM_IDS.woodenAxe, count: 5, durability: 500 },
          { item: 'stick', count: 3 }
        ]
      },
      { item: 'raw_mutton', count: 90 },
      [
        {
          stack: { item: BlockId.Cobblestone, count: 100 },
          position: [1, 2, 3],
          velocity: [0.5, 2, -0.5],
          age: 450,
          pickupDelay: 20
        }
      ],
      [
        {
          position: [4.8, 5.2, -6.9],
          state: {
            version: 1,
            input: { item: 'raw_iron', count: 90 },
            fuel: { item: 'coal', count: 2 },
            output: { item: 'iron_ingot', count: 3 },
            burnTime: 90,
            burnDuration: 80,
            cookTime: 20,
            cookDuration: 10
          }
        }
      ]
    );
    expect(extended.mode).toBe('survival');
    expect(extended.survival?.inventory.slots[0]).toEqual({
      item: TOOL_ITEM_IDS.stonePickaxe,
      count: 1,
      durability: TOOL_DEFINITIONS[TOOL_ITEM_IDS.stonePickaxe].maxDurability
    });
    expect(extended.crafting?.slots).toEqual([
      { item: BlockId.Planks, count: 64 },
      null,
      {
        item: TOOL_ITEM_IDS.woodenAxe,
        count: 1,
        durability: TOOL_DEFINITIONS[TOOL_ITEM_IDS.woodenAxe].maxDurability
      },
      { item: 'stick', count: 3 }
    ]);
    expect(extended.cursor).toEqual({ item: 'raw_mutton', count: 64 });
    expect(extended.drops).toEqual([
      {
        stack: { item: BlockId.Cobblestone, count: 64 },
        position: [1, 2, 3],
        velocity: [0.5, 2, -0.5],
        age: 300,
        pickupDelay: 10
      }
    ]);
    expect(extended.furnaces).toEqual([
      {
        position: [4, 5, -6],
        state: {
          version: 1,
          input: { item: 'raw_iron', count: 64 },
          fuel: { item: 'coal', count: 2 },
          output: { item: 'iron_ingot', count: 3 },
          burnTime: 80,
          burnDuration: 80,
          cookTime: 0,
          cookDuration: 10
        }
      }
    ]);
  });

  it('skips malformed furnace block entities without rejecting the world', () => {
    const validState = {
      version: 1,
      input: { item: 'raw_iron', count: 2 },
      fuel: { item: 'coal', count: 1 },
      output: { item: 'iron_ingot', count: 1 },
      burnTime: 20,
      burnDuration: 80,
      cookTime: 4,
      cookDuration: 10
    };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({
      ...baseSave(),
      furnaces: [
        { position: [1, 2, 3], state: validState },
        { position: [1, 2, 3], state: validState },
        { position: [4, 5], state: validState },
        { position: [7, 8, 9], state: { ...validState, fuel: { item: BlockId.Dirt, count: 1 } } },
        { position: [10, 11, 12], state: { ...validState, input: { item: 'stick', count: 1 } } }
      ]
    }));

    const loaded = loadWorldSave();
    expect(loaded?.seed).toBe(1234);
    expect(loaded?.furnaces).toEqual([{ position: [1, 2, 3], state: validState }]);
  });

  it('deduplicates normalized furnace coordinates and neutralizes forged timers', () => {
    const validState = {
      version: 1 as const,
      input: { item: 'raw_iron' as const, count: 2 },
      fuel: { item: 'coal' as const, count: 1 },
      output: null,
      burnTime: 12,
      burnDuration: 80,
      cookTime: 4,
      cookDuration: 10
    };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({
      ...baseSave(),
      furnaces: [
        { position: [4.9, 5.2, -6.8], state: validState },
        {
          position: [4, 5, -6],
          state: { ...validState, input: { item: 'raw_iron', count: 40 } }
        },
        {
          position: [8, 9, 10],
          state: {
            ...validState,
            burnTime: 86_400,
            burnDuration: 86_400,
            cookTime: 9,
            cookDuration: 0.001
          }
        },
        { position: [30_000_000, 0, 0], state: validState }
      ]
    }));

    expect(loadWorldSave()?.furnaces).toEqual([
      { position: [4, 5, -6], state: validState },
      {
        position: [8, 9, 10],
        state: {
          ...validState,
          burnTime: 0,
          burnDuration: 0,
          cookTime: 0,
          cookDuration: 10
        }
      }
    ]);
  });

  it('round-trips and sanitizes 27-slot chest block entities', () => {
    const slots = Array.from({ length: CHEST_SLOT_COUNT }, () => null) as Array<{
      item: BlockId | 'coal';
      count: number;
    } | null>;
    slots[0] = { item: BlockId.Planks, count: 999 };
    slots[26] = { item: 'coal', count: 12 };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({
      ...baseSave(),
      chests: [
        { position: [4.9, 5.2, -6.8], state: { version: 1, slots }, facing: 'west' },
        { position: [4, 5, -6], state: { version: 1, slots }, facing: 'south' },
        { position: [8, 9, 10], state: { version: 1, slots: [] } },
        { position: [30_000_000, 0, 0], state: { version: 1, slots } }
      ]
    }));

    expect(loadWorldSave()?.chests).toEqual([
      {
        position: [4, 5, -6],
        facing: 'west',
        state: {
          version: 1,
          slots: [
            { item: BlockId.Planks, count: 64 },
            ...Array.from({ length: CHEST_SLOT_COUNT - 2 }, () => null),
            { item: 'coal', count: 12 }
          ]
        }
      }
    ]);
  });

  it('keeps chest storage after the equipment argument in createWorldSave', () => {
    const equipment = {
      version: 1 as const,
      slots: [
        { item: ARMOR_ITEM_IDS.ironHelmet, count: 1, durability: 32 },
        null,
        null,
        null
      ]
    };
    const slots = Array.from({ length: CHEST_SLOT_COUNT }, () => null) as Array<{
      item: BlockId;
      count: number;
    } | null>;
    slots[26] = { item: BlockId.Chest, count: 999 };

    const save = createWorldSave(
      88,
      [],
      { position: [0.5, 4, 0.5], yaw: 0, pitch: 0, selectedSlot: 0 },
      0.25,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      equipment,
      [{ position: [4.9, 5.2, -6.8], state: { version: 1, slots } }]
    );

    expect(save.equipment).toEqual(equipment);
    expect(save.chests).toEqual([
      {
        position: [4, 5, -6],
        facing: 'north',
        state: {
          version: 1,
          slots: [
            ...Array.from({ length: CHEST_SLOT_COUNT - 1 }, () => null),
            { item: BlockId.Chest, count: 64 }
          ]
        }
      }
    ]);
    expect(writeWorldSave(save)).toBe(true);
    expect(loadWorldSave()?.chests).toEqual(save.chests);
  });

  it('does not silently truncate trusted runtime chest saves', () => {
    const slots = Array.from({ length: CHEST_SLOT_COUNT }, () => null);
    const chests = Array.from({ length: 4097 }, (_, index) => ({
      position: [index, 0, 0] as [number, number, number],
      state: { version: 1 as const, slots }
    }));

    const save = createWorldSave(
      89,
      [],
      { position: [0.5, 4, 0.5], yaw: 0, pitch: 0, selectedSlot: 0 },
      0.25,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      chests
    );

    expect(save.chests).toHaveLength(4097);
    expect(save.chests?.[4096]?.position).toEqual([4096, 0, 0]);
  });

  it('accepts Minecraft-width chest coordinates at the world bound and cleans unsafe slots', () => {
    const slots = Array.from({ length: CHEST_SLOT_COUNT }, () => null) as unknown[];
    slots[0] = { item: 'not_an_item', count: 4 };
    slots[1] = { item: TOOL_ITEM_IDS.ironPickaxe, count: 8, durability: 9999 };
    slots[2] = { item: ARMOR_ITEM_IDS.ironBoots, count: 1, durability: 0 };
    slots[26] = { item: BlockId.Cobblestone, count: 3 };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({
      ...baseSave(),
      chests: [
        {
          position: [29_999_984, 79, -29_999_984],
          state: { version: 1, slots }
        },
        {
          position: [-29_999_985, 0, 0],
          state: { version: 1, slots }
        }
      ]
    }));

    const loaded = loadWorldSave()?.chests;
    expect(loaded).toHaveLength(1);
    expect(loaded?.[0]?.position).toEqual([29_999_984, 79, -29_999_984]);
    expect(loaded?.[0]?.state.slots[0]).toBeNull();
    expect(loaded?.[0]?.state.slots[1]).toEqual({
      item: TOOL_ITEM_IDS.ironPickaxe,
      count: 1,
      durability: TOOL_DEFINITIONS[TOOL_ITEM_IDS.ironPickaxe].maxDurability
    });
    expect(loaded?.[0]?.state.slots[2]).toBeNull();
    expect(loaded?.[0]?.state.slots[26]).toEqual({
      item: BlockId.Cobblestone,
      count: 3
    });
  });

  it('keeps far-away v1 players, edits, furnaces, chests, and drops inside the world border', () => {
    const furnaceState = {
      version: 1 as const,
      input: { item: 'raw_iron' as const, count: 1 },
      fuel: { item: 'coal' as const, count: 1 },
      output: null,
      burnTime: 0,
      burnDuration: 0,
      cookTime: 0,
      cookDuration: 10
    };
    const farPlayer = [20_000_000.5, 10, -20_000_000.5] as const;
    const farFurnace = [29_999_984, 12, -29_999_984] as const;
    const farChest = [-29_999_984, 20, 29_999_984] as const;
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({
      ...baseSave(),
      player: { position: farPlayer, yaw: 0.5, pitch: -0.25, selectedSlot: 4 },
      edits: [
        [29_999_984, 79, -29_999_984, BlockId.Stone],
        [-29_999_984, 0, 29_999_984, BlockId.Chest]
      ],
      furnaces: [{ position: farFurnace, state: furnaceState }],
      chests: [{
        position: farChest,
        state: { version: 1, slots: Array.from({ length: CHEST_SLOT_COUNT }, () => null) },
        facing: 'east'
      }],
      drops: [{
        stack: { item: 'stick', count: 1 },
        position: [20_000_000.25, 8, -20_000_000.75],
        velocity: [0, 0, 0],
        age: 1,
        pickupDelay: 0
      }]
    }));

    const loaded = loadWorldSave();
    expect(loaded?.version).toBe(1);
    expect(loaded?.player?.position).toEqual(farPlayer);
    expect(loaded?.edits).toEqual([
      [29_999_984, 79, -29_999_984, BlockId.Stone],
      [-29_999_984, 0, 29_999_984, BlockId.Chest]
    ]);
    expect(loaded?.furnaces).toEqual([{ position: farFurnace, state: furnaceState }]);
    expect(loaded?.chests?.[0]).toMatchObject({ position: farChest, facing: 'east' });
    expect(loaded?.drops?.[0]?.position).toEqual([20_000_000.25, 8, -20_000_000.75]);
  });

  it('filters block entities and edits beyond the border or vertical build range', () => {
    const furnaceState = {
      version: 1 as const,
      input: { item: 'raw_iron' as const, count: 1 },
      fuel: { item: 'coal' as const, count: 1 },
      output: null,
      burnTime: 0,
      burnDuration: 0,
      cookTime: 0,
      cookDuration: 10
    };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({
      ...baseSave(),
      player: { position: [0, 1e300, 0], yaw: 0, pitch: 0, selectedSlot: 0 },
      edits: [
        [29_999_985, 10, 0, BlockId.Stone],
        [0, 80, 0, BlockId.Stone],
        [0, -1, 0, BlockId.Stone]
      ],
      furnaces: [
        { position: [0, 80, 0], state: furnaceState },
        { position: [-29_999_985, 10, 0], state: furnaceState }
      ],
      chests: [
        { position: [0, -1, 0], state: { version: 1, slots: [] } },
        { position: [0, 10, 29_999_985], state: { version: 1, slots: [] } }
      ],
      drops: [{
        stack: { item: 'stick', count: 1 },
        position: [30_000_000, 8, 0],
        velocity: [0, 0, 0],
        age: 1,
        pickupDelay: 0
      }]
    }));

    const loaded = loadWorldSave();
    expect(loaded?.player).toBeUndefined();
    expect(loaded?.edits).toEqual([]);
    expect(loaded?.furnaces).toEqual([]);
    expect(loaded?.chests).toEqual([]);
    expect(loaded?.drops).toEqual([]);
  });

  it('loads and sanitizes a valid four-slot crafting grid and cursor stack', () => {
    const raw = {
      ...baseSave(),
      crafting: {
        slots: [
          { item: BlockId.Wood, count: 1 },
          { item: 'stick', count: 100 },
          null,
          { item: TOOL_ITEM_IDS.ironPickaxe, count: 4, durability: 9999 }
        ]
      },
      cursor: { item: TOOL_ITEM_IDS.woodenShovel, count: 8, durability: 1 }
    };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(raw));

    const loaded = loadWorldSave();

    expect(loaded?.crafting?.slots).toEqual([
      { item: BlockId.Wood, count: 1 },
      { item: 'stick', count: 64 },
      null,
      {
        item: TOOL_ITEM_IDS.ironPickaxe,
        count: 1,
        durability: TOOL_DEFINITIONS[TOOL_ITEM_IDS.ironPickaxe].maxDurability
      }
    ]);
    expect(loaded?.cursor).toEqual({
      item: TOOL_ITEM_IDS.woodenShovel,
      count: 1,
      durability: 1
    });
  });

  it('rejects zero or negative stack counts and durability instead of minting one item', () => {
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({
      ...baseSave(),
      survival: survivalSnapshot({
        inventory: {
          slots: [{ item: 'raw_pork', count: 0 }]
        }
      }),
      crafting: {
        slots: [null, { item: BlockId.Wood, count: -3 }, null, null]
      },
      cursor: { item: TOOL_ITEM_IDS.woodenShovel, count: 1, durability: 0 },
      drops: [
        {
          stack: { item: BlockId.Dirt, count: -1 },
          position: [1, 2, 3],
          velocity: [0, 0, 0],
          age: 0,
          pickupDelay: 0
        },
        {
          stack: { item: ARMOR_ITEM_IDS.ironHelmet, count: 1, durability: -2 },
          position: [2, 3, 4],
          velocity: [0, 0, 0],
          age: 0,
          pickupDelay: 0
        },
        {
          stack: { item: BlockId.Stone, count: 2 },
          position: [3, 4, 5],
          velocity: [0, 0, 0],
          age: 0,
          pickupDelay: 0
        }
      ]
    }));

    const loaded = loadWorldSave();
    expect(loaded?.survival).toBeUndefined();
    expect(loaded?.crafting).toBeUndefined();
    expect(loaded?.cursor).toBeUndefined();
    expect(loaded?.drops).toEqual([
      {
        stack: { item: BlockId.Stone, count: 2 },
        position: [3, 4, 5],
        velocity: [0, 0, 0],
        age: 0,
        pickupDelay: 0
      }
    ]);
  });

  it('rejects malformed crafting and cursor fields without rejecting the world', () => {
    const wrongSlotCount = {
      ...baseSave(),
      crafting: { slots: [{ item: BlockId.Wood, count: 1 }] },
      cursor: { item: 'emerald', count: 1 }
    };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(wrongSlotCount));

    const loaded = loadWorldSave();

    expect(loaded?.seed).toBe(1234);
    expect(loaded?.crafting).toBeUndefined();
    expect(loaded?.cursor).toBeUndefined();

    const malformedSlot = {
      ...baseSave(),
      crafting: {
        slots: [null, { item: 'emerald', count: 1 }, null, null]
      },
      cursor: null
    };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(malformedSlot));
    expect(loadWorldSave()?.crafting).toBeUndefined();
    expect(loadWorldSave()?.cursor).toBeNull();
  });

  it('loads valid world drops and clamps lifetime, delay, stacks, and tool durability', () => {
    const raw = {
      ...baseSave(),
      drops: [
        {
          stack: { item: BlockId.Dirt, count: 999 },
          position: [1.25, 8, -3.5],
          velocity: [0.5, -2, 1],
          age: 900,
          pickupDelay: 25
        },
        {
          stack: { item: TOOL_ITEM_IDS.ironPickaxe, count: 8, durability: 9999 },
          position: [0, 4, 0],
          velocity: [0, 0, 0],
          age: -4,
          pickupDelay: -2
        }
      ]
    };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(raw));

    expect(loadWorldSave()?.drops).toEqual([
      {
        stack: { item: BlockId.Dirt, count: 64 },
        position: [1.25, 8, -3.5],
        velocity: [0.5, -2, 1],
        age: 300,
        pickupDelay: 10
      },
      {
        stack: {
          item: TOOL_ITEM_IDS.ironPickaxe,
          count: 1,
          durability: TOOL_DEFINITIONS[TOOL_ITEM_IDS.ironPickaxe].maxDurability
        },
        position: [0, 4, 0],
        velocity: [0, 0, 0],
        age: 0,
        pickupDelay: 0
      }
    ]);
  });

  it('skips malicious drop entries and caps the serialized drop count', () => {
    const validDrop = {
      stack: { item: 'stick', count: 1 },
      position: [0, 2, 0],
      velocity: [0, 0, 0],
      age: 1,
      pickupDelay: 0
    };
    const raw = {
      ...baseSave(),
      drops: [
        { ...validDrop, stack: { item: 'emerald', count: 1 } },
        { ...validDrop, position: [0, 2] },
        { ...validDrop, velocity: [0, null, 0] },
        ...Array.from({ length: 2050 }, () => validDrop)
      ]
    };
    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(raw));

    const loaded = loadWorldSave();

    expect(loaded?.seed).toBe(1234);
    expect(loaded?.drops).toHaveLength(2045);
    expect(loaded?.drops?.every((drop) => drop.stack.item === 'stick')).toBe(true);

    localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify({ ...baseSave(), drops: { bad: true } }));
    expect(loadWorldSave()?.drops).toBeUndefined();
  });

  it('writes and clears through localStorage and tolerates storage failures', () => {
    const save = createWorldSave(
      7,
      [],
      { position: [0.5, 4, 0.5], yaw: 0, pitch: 0, selectedSlot: 0 },
      0.2
    );
    expect(writeWorldSave(save)).toBe(true);
    expect(loadWorldSave()?.seed).toBe(7);
    clearWorldSave();
    expect(loadWorldSave()).toBeNull();

    const throwingStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); }
    } as unknown as Storage;
    vi.stubGlobal('localStorage', throwingStorage);
    expect(loadWorldSave()).toBeNull();
    expect(writeWorldSave(save)).toBe(false);
    expect(() => clearWorldSave()).not.toThrow();
  });
});
