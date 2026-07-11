import { describe, expect, it } from 'vitest';
import { BLOCK_ATLAS_LAYOUT, BLOCK_DEFINITIONS, getBlockDefinition } from './blocks';
import { BlockId, MAX_BLOCK_ID, HOTBAR_BLOCKS, isBlockId } from './types';

describe('block definitions', () => {
  it('appends world blocks without changing legacy block ids', () => {
    expect(BlockId.Bedrock).toBe(15);
    expect(BlockId.CraftingTable).toBe(16);
    expect(BlockId.Furnace).toBe(17);
    expect(BlockId.Torch).toBe(18);
    expect(BlockId.Chest).toBe(19);
    expect(BlockId.DiamondOre).toBe(20);
    expect(MAX_BLOCK_ID).toBe(BlockId.DiamondOre);
    expect(isBlockId(BlockId.Bedrock)).toBe(true);
    expect(isBlockId(BlockId.CraftingTable)).toBe(true);
    expect(isBlockId(BlockId.Furnace)).toBe(true);
    expect(isBlockId(BlockId.Torch)).toBe(true);
    expect(isBlockId(BlockId.Chest)).toBe(true);
    expect(isBlockId(BlockId.DiamondOre)).toBe(true);
    expect(isBlockId(MAX_BLOCK_ID + 1)).toBe(false);
    expect(isBlockId(2.5)).toBe(false);
    expect(BLOCK_DEFINITIONS).toHaveLength(MAX_BLOCK_ID + 1);
  });

  it('defines a solid crafting table with distinct procedural face tiles', () => {
    const definition = getBlockDefinition(BlockId.CraftingTable);
    const tileCount = BLOCK_ATLAS_LAYOUT.columns * BLOCK_ATLAS_LAYOUT.rows;

    expect(definition).toMatchObject({
      id: BlockId.CraftingTable,
      name: 'crafting_table',
      label: 'Crafting Table',
      solid: true,
      transparent: false,
      liquid: false
    });
    expect(new Set(Object.values(definition.atlas)).size).toBe(3);
    expect(Object.values(definition.atlas).every((tile) => tile >= 0 && tile < tileCount)).toBe(true);
    expect(HOTBAR_BLOCKS).not.toContain(BlockId.CraftingTable);
  });

  it('defines a solid furnace with four procedural faces and side fallback for legacy blocks', () => {
    const definition = getBlockDefinition(BlockId.Furnace);
    const stone = getBlockDefinition(BlockId.Stone);
    const tileCount = BLOCK_ATLAS_LAYOUT.columns * BLOCK_ATLAS_LAYOUT.rows;

    expect(definition).toMatchObject({
      id: BlockId.Furnace,
      name: 'furnace',
      label: 'Furnace',
      solid: true,
      transparent: false,
      liquid: false
    });
    expect(new Set(Object.values(definition.atlas)).size).toBe(4);
    expect(Object.values(definition.atlas).every((tile) => tile >= 0 && tile < tileCount)).toBe(true);
    expect(stone.atlas.front).toBe(stone.atlas.side);
    expect(BLOCK_DEFINITIONS.some((block) => block.id === BlockId.Furnace)).toBe(true);
  });

  it('defines a non-solid torch with transparent original face tiles', () => {
    const definition = getBlockDefinition(BlockId.Torch);
    const tileCount = BLOCK_ATLAS_LAYOUT.columns * BLOCK_ATLAS_LAYOUT.rows;

    expect(definition).toMatchObject({
      id: BlockId.Torch,
      name: 'torch',
      label: 'Torch',
      solid: false,
      transparent: true,
      liquid: false
    });
    expect(definition.atlas.front).toBe(definition.atlas.side);
    expect(new Set(Object.values(definition.atlas)).size).toBe(3);
    expect(Object.values(definition.atlas).every((tile) => tile >= 0 && tile < tileCount)).toBe(true);
    expect(HOTBAR_BLOCKS).not.toContain(BlockId.Torch);
  });

  it('defines a solid opaque chest with four original procedural face tiles', () => {
    const definition = getBlockDefinition(BlockId.Chest);
    const tileCount = BLOCK_ATLAS_LAYOUT.columns * BLOCK_ATLAS_LAYOUT.rows;

    expect(definition).toMatchObject({
      id: BlockId.Chest,
      name: 'chest',
      label: '箱子',
      solid: true,
      transparent: false,
      liquid: false,
      creativeCategory: 'building'
    });
    expect(new Set(Object.values(definition.atlas)).size).toBe(4);
    expect(definition.atlas.front).not.toBe(definition.atlas.side);
    expect(definition.atlas.top).not.toBe(definition.atlas.side);
    expect(Object.values(definition.atlas).every((tile) => tile >= 0 && tile < tileCount)).toBe(true);
    expect(HOTBAR_BLOCKS).not.toContain(BlockId.Chest);
  });

  it('defines diamond ore as an opaque procedural ore without changing legacy tiles', () => {
    const definition = getBlockDefinition(BlockId.DiamondOre);
    const tileCount = BLOCK_ATLAS_LAYOUT.columns * BLOCK_ATLAS_LAYOUT.rows;

    expect(definition).toMatchObject({
      id: BlockId.DiamondOre,
      name: 'diamond_ore',
      label: 'Diamond Ore',
      solid: true,
      transparent: false,
      creativeCategory: 'ore'
    });
    expect(new Set(Object.values(definition.atlas))).toEqual(new Set([32]));
    expect(definition.atlas.top).toBeLessThan(tileCount);
    expect(BLOCK_ATLAS_LAYOUT).toMatchObject({ columns: 8, rows: 5, tileSize: 16 });
  });
});
