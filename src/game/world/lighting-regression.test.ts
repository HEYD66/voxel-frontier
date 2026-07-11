import { describe, expect, it } from 'vitest';
import { VoxelLighting } from '../lighting';
import { BlockId } from '../types';

const SIZE = 11;
const HEIGHT = 8;

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function createLighting(blocks: ReadonlyMap<string, BlockId>): VoxelLighting {
  const lighting = new VoxelLighting({
    minX: 0,
    maxX: SIZE - 1,
    minY: 0,
    maxY: HEIGHT - 1,
    minZ: 0,
    maxZ: SIZE - 1,
    chunkSize: 4
  }, (x, y, z) => blocks.get(key(x, y, z)) ?? BlockId.Air);
  lighting.rebuild();
  return lighting;
}

function expectLightingToMatch(
  incremental: VoxelLighting,
  rebuilt: VoxelLighting,
  step: number
): void {
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let z = 0; z < SIZE; z += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        expect(
          incremental.getSample(x, y, z),
          `lighting mismatch after mutation ${step} at ${x},${y},${z}`
        ).toEqual(rebuilt.getSample(x, y, z));
      }
    }
  }
}

describe('VoxelLighting incremental regression', () => {
  it('matches a full rebuild across opaque, transparent, and emitting block changes', () => {
    const blocks = new Map<string, BlockId>();
    const incremental = createLighting(blocks);
    const mutations: ReadonlyArray<readonly [number, number, number, BlockId]> = [
      [5, 5, 5, BlockId.Stone],
      [5, 4, 5, BlockId.Leaves],
      [4, 4, 5, BlockId.Water],
      [6, 4, 5, BlockId.Glass],
      [5, 3, 5, BlockId.Torch],
      [5, 5, 5, BlockId.Air],
      [5, 3, 5, BlockId.Glass],
      [0, 6, 0, BlockId.Furnace],
      [0, 6, 0, BlockId.Air],
      [5, 4, 5, BlockId.Air]
    ];

    mutations.forEach(([x, y, z, id], step) => {
      if (id === BlockId.Air) blocks.delete(key(x, y, z));
      else blocks.set(key(x, y, z), id);
      incremental.updateBlock(x, y, z);
      expectLightingToMatch(incremental, createLighting(blocks), step + 1);
    });
  });
});
