import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BlockId } from './types';
import { VoxelWorld } from './world';
import {
  GENERATED_CHUNK_SIZE,
  GENERATED_CHUNK_VOLUME,
  GENERATED_DIAMOND_MAX_Y,
  GENERATED_WORLD_HEIGHT,
  generateChunk,
  generatedChunkIndex,
  generatedPositiveModulo,
  sampleGeneratedBlock
} from './world-generator';

beforeAll(() => {
  const context = {
    imageSmoothingEnabled: false,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    clearRect: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined
  };
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => context
    })
  });
});

describe('pure world chunk generation', () => {
  it('uses the legacy 16x80x16 storage order', () => {
    expect(GENERATED_CHUNK_VOLUME).toBe(16 * 80 * 16);
    expect(generatedChunkIndex(0, 0, 0)).toBe(0);
    expect(generatedChunkIndex(15, 0, 0)).toBe(15);
    expect(generatedChunkIndex(0, 0, 1)).toBe(16);
    expect(generatedChunkIndex(0, 1, 0)).toBe(256);
    expect(generatedPositiveModulo(-1, 16)).toBe(15);
  });

  it('is independent of generation order and repeated unload-style regeneration', () => {
    const seed = 0x12345678;
    const coordinates = [[-7, 4], [3, -5], [0, 0], [-2, -3]] as const;
    const forward = new Map(coordinates.map(([x, z]) => [`${x},${z}`, generateChunk(seed, x, z).blocks]));

    for (const [x, z] of [...coordinates].reverse()) {
      const expected = forward.get(`${x},${z}`);
      expect(generateChunk(seed, x, z).blocks).toEqual(expected);
      expect(generateChunk(seed, x, z).blocks).toEqual(expected);
    }
  });

  it('maps negative world coordinates to the correct local cells', () => {
    const seed = 0x51a7;
    const chunk = generateChunk(seed, -3, -2);
    expect(chunk.chunkX).toBe(-3);
    expect(chunk.chunkZ).toBe(-2);

    for (const [localX, y, localZ] of [[0, 0, 0], [15, 1, 15], [7, 37, 4], [2, 79, 12]] as const) {
      const worldX = chunk.chunkX * GENERATED_CHUNK_SIZE + localX;
      const worldZ = chunk.chunkZ * GENERATED_CHUNK_SIZE + localZ;
      expect(chunk.blocks[generatedChunkIndex(localX, y, localZ)]).toBe(
        sampleGeneratedBlock(seed, worldX, y, worldZ)
      );
    }
  });

  it('matches point sampling throughout positive and negative chunks', () => {
    const seed = 91;
    for (const [chunkX, chunkZ] of [[2, -3], [-4, 1]] as const) {
      const chunk = generateChunk(seed, chunkX, chunkZ);
      for (let localZ = 0; localZ < GENERATED_CHUNK_SIZE; localZ += 1) {
        for (let localX = 0; localX < GENERATED_CHUNK_SIZE; localX += 1) {
          for (let y = 0; y < GENERATED_WORLD_HEIGHT; y += 7) {
            expect(chunk.blocks[generatedChunkIndex(localX, y, localZ)]).toBe(
              sampleGeneratedBlock(
                seed,
                chunkX * GENERATED_CHUNK_SIZE + localX,
                y,
                chunkZ * GENERATED_CHUNK_SIZE + localZ
              )
            );
          }
        }
      }
    }
    expect(sampleGeneratedBlock(seed, 0, -1, 0)).toBe(BlockId.Air);
    expect(sampleGeneratedBlock(seed, 0, GENERATED_WORLD_HEIGHT, 0)).toBe(BlockId.Air);
  });

  it('generates rare diamond veins only in the low stone layers', () => {
    const seed = 0x51a7cafe;
    let diamonds = 0;
    let iron = 0;
    let coal = 0;

    for (let chunkZ = -2; chunkZ <= 1; chunkZ += 1) {
      for (let chunkX = -2; chunkX <= 1; chunkX += 1) {
        const chunk = generateChunk(seed, chunkX, chunkZ);
        for (let localZ = 0; localZ < GENERATED_CHUNK_SIZE; localZ += 1) {
          for (let localX = 0; localX < GENERATED_CHUNK_SIZE; localX += 1) {
            for (let y = 1; y < GENERATED_WORLD_HEIGHT; y += 1) {
              const id = chunk.blocks[generatedChunkIndex(localX, y, localZ)] as BlockId;
              if (id === BlockId.DiamondOre) {
                diamonds += 1;
                expect(y).toBeLessThanOrEqual(GENERATED_DIAMOND_MAX_Y);
              } else if (id === BlockId.IronOre) {
                iron += 1;
              } else if (id === BlockId.CoalOre) {
                coal += 1;
              }
            }
          }
        }
      }
    }

    expect(diamonds).toBeGreaterThan(0);
    expect(diamonds).toBeLessThan(iron);
    expect(diamonds).toBeLessThan(coal);
  });

  it('keeps diamond-capable generation deterministic in far streamed chunks', () => {
    const seed = 0x1234abcd;
    const chunkX = 1_000_000;
    const chunkZ = -1_000_000;
    const first = generateChunk(seed, chunkX, chunkZ);
    const second = generateChunk(seed, chunkX, chunkZ);

    expect(second.blocks).toEqual(first.blocks);
    for (const [localX, y, localZ] of [[0, 2, 0], [15, 9, 15], [7, 15, 4], [3, 16, 12]] as const) {
      const worldX = chunkX * GENERATED_CHUNK_SIZE + localX;
      const worldZ = chunkZ * GENERATED_CHUNK_SIZE + localZ;
      expect(first.blocks[generatedChunkIndex(localX, y, localZ)]).toBe(
        sampleGeneratedBlock(seed, worldX, y, worldZ)
      );
    }
  });

  it('places a tree across a chunk seam without depending on which half is generated first', () => {
    const seed = 0x12345678;
    let seam: { chunkX: number; chunkZ: number; z: number; y: number } | null = null;

    for (let chunkZ = -3; chunkZ <= 3 && !seam; chunkZ += 1) {
      for (let chunkX = -3; chunkX <= 2 && !seam; chunkX += 1) {
        const left = generateChunk(seed, chunkX, chunkZ);
        const right = generateChunk(seed, chunkX + 1, chunkZ);
        for (let localZ = 0; localZ < GENERATED_CHUNK_SIZE && !seam; localZ += 1) {
          for (let y = 1; y < GENERATED_WORLD_HEIGHT && !seam; y += 1) {
            const leftId = left.blocks[generatedChunkIndex(15, y, localZ)] as BlockId;
            const rightId = right.blocks[generatedChunkIndex(0, y, localZ)] as BlockId;
            const treeBlocks = new Set([BlockId.Wood, BlockId.Leaves]);
            if (treeBlocks.has(leftId) && treeBlocks.has(rightId)) {
              seam = { chunkX, chunkZ, z: localZ, y };
            }
          }
        }
      }
    }

    expect(seam).not.toBeNull();
    const found = seam!;
    const firstLeft = generateChunk(seed, found.chunkX, found.chunkZ).blocks;
    const firstRight = generateChunk(seed, found.chunkX + 1, found.chunkZ).blocks;
    const secondRight = generateChunk(seed, found.chunkX + 1, found.chunkZ).blocks;
    const secondLeft = generateChunk(seed, found.chunkX, found.chunkZ).blocks;
    expect(secondLeft).toEqual(firstLeft);
    expect(secondRight).toEqual(firstRight);
  });

  it('preserves every generated voxel in legacy interior chunks', () => {
    const seed = 0x12345678;
    const legacy = new VoxelWorld(seed);
    try {
      for (const [chunkX, chunkZ] of [[-3, -3], [-1, 2], [0, 0], [2, -2]] as const) {
        const generated = generateChunk(seed, chunkX, chunkZ);
        for (let localZ = 0; localZ < GENERATED_CHUNK_SIZE; localZ += 1) {
          for (let localX = 0; localX < GENERATED_CHUNK_SIZE; localX += 1) {
            for (let y = 0; y < GENERATED_WORLD_HEIGHT; y += 1) {
              expect(generated.blocks[generatedChunkIndex(localX, y, localZ)]).toBe(
                legacy.getBlock(
                  chunkX * GENERATED_CHUNK_SIZE + localX,
                  y,
                  chunkZ * GENERATED_CHUNK_SIZE + localZ
                )
              );
            }
          }
        }
      }
    } finally {
      legacy.dispose();
    }
  });
});
