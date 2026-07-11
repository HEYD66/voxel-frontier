import { describe, expect, it } from 'vitest';
import { BlockId } from '../types';
import { MAX_LIGHT_LEVEL, TORCH_LIGHT_LEVEL, VoxelLighting } from '../lighting';

const SIZE = 7;
const HEIGHT = 6;

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function createLighting(
  blocks: Map<string, BlockId>,
  size = SIZE,
  height = HEIGHT
): VoxelLighting {
  const lighting = new VoxelLighting({
    minX: 0,
    maxX: size - 1,
    minY: 0,
    maxY: height - 1,
    minZ: 0,
    maxZ: size - 1,
    chunkSize: 4
  }, (x, y, z) => blocks.get(key(x, y, z)) ?? BlockId.Air);
  lighting.rebuild();
  return lighting;
}

function expectSameLight(
  actual: VoxelLighting,
  expected: VoxelLighting,
  size = SIZE,
  height = HEIGHT
): void {
  for (let y = 0; y < height; y += 1) {
    for (let z = 0; z < size; z += 1) {
      for (let x = 0; x < size; x += 1) {
        expect(actual.getSample(x, y, z)).toEqual(expected.getSample(x, y, z));
      }
    }
  }
}

describe('VoxelLighting', () => {
  it('spreads skylight sideways below an isolated opaque block', () => {
    const blocks = new Map<string, BlockId>();
    blocks.set(key(3, 3, 3), BlockId.Furnace);
    const lighting = createLighting(blocks);

    expect(lighting.getSkyLight(3, 5, 3)).toBe(MAX_LIGHT_LEVEL);
    expect(lighting.getSkyLight(3, 3, 3)).toBe(0);
    expect(lighting.getSkyLight(3, 2, 3)).toBe(MAX_LIGHT_LEVEL - 1);
  });

  it('lets skylight and block light propagate through a chest with opacity one', () => {
    const blocks = new Map<string, BlockId>();
    blocks.set(key(0, 1, 0), BlockId.Chest);
    const lighting = createLighting(blocks, 1, 3);

    expect(lighting.getSkyLight(0, 1, 0)).toBe(MAX_LIGHT_LEVEL);
    expect(lighting.getSkyLight(0, 0, 0)).toBe(MAX_LIGHT_LEVEL);

    lighting.setEmitter(0, 2, 0, MAX_LIGHT_LEVEL);
    expect(lighting.getBlockLight(0, 1, 0)).toBe(MAX_LIGHT_LEVEL - 1);
    expect(lighting.getBlockLight(0, 0, 0)).toBe(MAX_LIGHT_LEVEL - 2);
  });

  it.each([
    [BlockId.Glass, MAX_LIGHT_LEVEL - 1],
    [BlockId.Torch, MAX_LIGHT_LEVEL - 1],
    [BlockId.Chest, MAX_LIGHT_LEVEL - 1],
    [BlockId.Leaves, MAX_LIGHT_LEVEL - 2],
    [BlockId.Water, MAX_LIGHT_LEVEL - 3]
  ])('uses block opacity while spreading skylight through block %s', (id, expectedLevel) => {
    const blocks = new Map<string, BlockId>();
    for (let z = 0; z < SIZE; z += 1) {
      for (let x = 0; x < SIZE; x += 1) blocks.set(key(x, 3, z), BlockId.Stone);
    }
    blocks.delete(key(1, 3, 3));
    blocks.set(key(2, 2, 3), id);

    const lighting = createLighting(blocks);

    expect(lighting.getSkyLight(1, 2, 3)).toBe(MAX_LIGHT_LEVEL);
    expect(lighting.getSkyLight(2, 2, 3)).toBe(expectedLevel);
  });

  it('updates a blocked column after a roof block is removed', () => {
    const blocks = new Map<string, BlockId>();
    for (let z = 0; z < SIZE; z += 1) {
      for (let x = 0; x < SIZE; x += 1) blocks.set(key(x, 3, z), BlockId.Stone);
    }
    const lighting = createLighting(blocks);
    expect(lighting.getSkyLight(3, 2, 3)).toBe(0);

    blocks.delete(key(3, 3, 3));
    const update = lighting.updateBlock(3, 3, 3);
    expect(lighting.getSkyLight(3, 2, 3)).toBe(MAX_LIGHT_LEVEL);
    expect(update.changedChunks.length).toBeGreaterThan(0);
    expectSameLight(lighting, createLighting(blocks));

    blocks.set(key(3, 3, 3), BlockId.Stone);
    const restored = lighting.updateBlock(3, 3, 3);
    expect(lighting.getSkyLight(3, 2, 3)).toBe(0);
    expect(restored.changedChunks.length).toBeGreaterThan(0);
    expectSameLight(lighting, createLighting(blocks));
  });

  it('matches a full rebuild across the radius-15 incremental boundary', () => {
    const size = 35;
    const height = 5;
    const center = 17;
    const blocks = new Map<string, BlockId>();
    for (let z = 0; z < size; z += 1) {
      for (let x = 0; x < size; x += 1) blocks.set(key(x, 3, z), BlockId.Stone);
    }
    const lighting = createLighting(blocks, size, height);

    blocks.delete(key(center, 3, center));
    const opened = lighting.updateBlock(center, 3, center);

    expect(lighting.getSkyLight(center + 14, 2, center)).toBe(1);
    expect(lighting.getSkyLight(center + 15, 2, center)).toBe(0);
    expect(opened.changedChunks).toContainEqual([7, 4]);
    expectSameLight(lighting, createLighting(blocks, size, height), size, height);

    blocks.set(key(center, 3, center), BlockId.Stone);
    lighting.updateBlock(center, 3, center);
    expectSameLight(lighting, createLighting(blocks, size, height), size, height);
  });

  it('attenuates local light and stops propagation through opaque blocks', () => {
    const blocks = new Map<string, BlockId>();
    const lighting = createLighting(blocks);
    lighting.setEmitter(1, 2, 3, MAX_LIGHT_LEVEL);
    expect(lighting.getBlockLight(1, 2, 3)).toBe(MAX_LIGHT_LEVEL);
    expect(lighting.getBlockLight(2, 2, 3)).toBe(MAX_LIGHT_LEVEL - 1);
    expect(lighting.getBlockLight(3, 2, 3)).toBe(MAX_LIGHT_LEVEL - 2);

    blocks.set(key(2, 2, 3), BlockId.Stone);
    lighting.updateBlock(2, 2, 3);
    expect(lighting.getBlockLight(2, 2, 3)).toBe(0);
    expect(lighting.getBlockLight(3, 2, 3)).toBeLessThan(MAX_LIGHT_LEVEL - 2);
  });

  it('automatically emits level 14 light from torch blocks without blocking skylight', () => {
    const blocks = new Map<string, BlockId>();
    blocks.set(key(3, 3, 3), BlockId.Torch);
    const lighting = createLighting(blocks);

    expect(lighting.getSkyLight(3, 2, 3)).toBe(MAX_LIGHT_LEVEL);
    expect(lighting.getBlockLight(3, 3, 3)).toBe(TORCH_LIGHT_LEVEL);
    expect(lighting.getBlockLight(4, 3, 3)).toBe(TORCH_LIGHT_LEVEL - 1);
  });

  it('updates torch emitters when a block is added and removed', () => {
    const blocks = new Map<string, BlockId>();
    const lighting = createLighting(blocks);

    blocks.set(key(3, 2, 3), BlockId.Torch);
    const added = lighting.updateBlock(3, 2, 3);
    expect(lighting.getBlockLight(3, 2, 3)).toBe(TORCH_LIGHT_LEVEL);
    expect(lighting.getBlockLight(4, 2, 3)).toBe(TORCH_LIGHT_LEVEL - 1);
    expect(added.changedChunks.length).toBeGreaterThan(0);

    blocks.delete(key(3, 2, 3));
    const removed = lighting.updateBlock(3, 2, 3);
    expect(lighting.getBlockLight(3, 2, 3)).toBe(0);
    expect(lighting.getBlockLight(4, 2, 3)).toBe(0);
    expect(removed.changedChunks.length).toBeGreaterThan(0);
  });
});
