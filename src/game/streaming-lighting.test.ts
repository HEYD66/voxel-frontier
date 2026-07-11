import { describe, expect, it } from 'vitest';
import { MAX_LIGHT_LEVEL, TORCH_LIGHT_LEVEL } from './lighting';
import {
  StreamingLighting,
  type StreamingLightingChunkBounds
} from './streaming-lighting';
import { BlockId } from './types';

const CHUNK_SIZE = 4;
const MIN_Y = 0;
const MAX_Y = 7;

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function createLighting(
  blocks: ReadonlyMap<string, BlockId>,
  initialBounds?: StreamingLightingChunkBounds
): StreamingLighting {
  return new StreamingLighting({
    chunkSize: CHUNK_SIZE,
    minY: MIN_Y,
    maxY: MAX_Y,
    getBlock: (x, y, z) => blocks.get(key(x, y, z)) ?? BlockId.Air,
    initialBounds
  });
}

describe('StreamingLighting', () => {
  it('maps rectangular negative chunk bounds to voxel coordinates and reports every rebuilt mesh', () => {
    const lighting = createLighting(new Map());
    const update = lighting.reset({
      minChunkX: -2,
      maxChunkX: -1,
      minChunkZ: -1,
      maxChunkZ: 1
    });

    expect(lighting.chunkBounds).toEqual({
      minChunkX: -2,
      maxChunkX: -1,
      minChunkZ: -1,
      maxChunkZ: 1
    });
    expect(lighting.voxelBounds).toMatchObject({
      minX: -8,
      maxX: -1,
      minZ: -4,
      maxZ: 7
    });
    expect(update.changedChunkKeys).toEqual([
      '-2,-1',
      '-2,0',
      '-2,1',
      '-1,-1',
      '-1,0',
      '-1,1'
    ]);
    expect(lighting.getSample(-8, 2, -4)).toEqual({ sky: MAX_LIGHT_LEVEL, block: 0 });
  });

  it('propagates skylight and torch light continuously across negative chunk boundaries', () => {
    const blocks = new Map<string, BlockId>();
    for (let z = -4; z <= 3; z += 1) {
      for (let x = -4; x <= 3; x += 1) blocks.set(key(x, 5, z), BlockId.Stone);
    }
    blocks.delete(key(-1, 5, 0));
    blocks.set(key(-1, 2, 0), BlockId.Torch);
    const lighting = createLighting(blocks, {
      minChunkX: -1,
      maxChunkX: 0,
      minChunkZ: -1,
      maxChunkZ: 0
    });

    expect(lighting.getSkyLight(-1, 4, 0)).toBe(MAX_LIGHT_LEVEL);
    expect(lighting.getSkyLight(0, 4, 0)).toBe(MAX_LIGHT_LEVEL - 1);
    expect(lighting.getBlockLight(-1, 2, 0)).toBe(TORCH_LIGHT_LEVEL);
    expect(lighting.getBlockLight(0, 2, 0)).toBe(TORCH_LIGHT_LEVEL - 1);
    expect(lighting.getBlockLight(1, 2, 0)).toBe(TORCH_LIGHT_LEVEL - 2);
  });

  it('rebuilds from getBlock after a window move without retaining old sky or block light', () => {
    const blocks = new Map<string, BlockId>();
    blocks.set(key(1, 2, 1), BlockId.Torch);
    for (let z = 8; z <= 11; z += 1) {
      for (let x = 8; x <= 11; x += 1) blocks.set(key(x, 6, z), BlockId.Stone);
    }
    const lighting = createLighting(blocks, {
      minChunkX: 0,
      maxChunkX: 0,
      minChunkZ: 0,
      maxChunkZ: 0
    });
    expect(lighting.getBlockLight(1, 2, 1)).toBe(TORCH_LIGHT_LEVEL);

    const update = lighting.reset({
      minChunkX: 2,
      maxChunkX: 2,
      minChunkZ: 2,
      maxChunkZ: 2
    });

    expect(update.changedChunkKeys).toEqual(['2,2']);
    expect(lighting.getBlockLight(9, 2, 9)).toBe(0);
    expect(lighting.getSkyLight(9, 5, 9)).toBe(0);
    expect(lighting.getBlockLight(1, 2, 1)).toBe(0);
  });

  it('keeps manual emitters through rebuilds and restores them after leaving and re-entering the window', () => {
    const lighting = createLighting(new Map(), {
      minChunkX: -1,
      maxChunkX: 0,
      minChunkZ: 0,
      maxChunkZ: 0
    });
    lighting.setManualEmitter(-1, 3, 1, 12);
    expect(lighting.getBlockLight(-1, 3, 1)).toBe(12);
    expect(lighting.getBlockLight(0, 3, 1)).toBe(11);

    lighting.rebuild({
      minChunkX: -1,
      maxChunkX: 1,
      minChunkZ: 0,
      maxChunkZ: 0
    });
    expect(lighting.getBlockLight(-1, 3, 1)).toBe(12);
    expect(lighting.getBlockLight(0, 3, 1)).toBe(11);

    lighting.reset({
      minChunkX: 2,
      maxChunkX: 2,
      minChunkZ: 0,
      maxChunkZ: 0
    });
    expect(lighting.getBlockLight(8, 3, 1)).toBe(0);

    lighting.reset({
      minChunkX: -1,
      maxChunkX: 0,
      minChunkZ: 0,
      maxChunkZ: 0
    });
    expect(lighting.getBlockLight(-1, 3, 1)).toBe(12);

    lighting.removeManualEmitter(-1, 3, 1);
    expect(lighting.getBlockLight(-1, 3, 1)).toBe(0);
  });

  it('updates blocks incrementally and returns only active chunk mesh keys', () => {
    const blocks = new Map<string, BlockId>();
    const lighting = createLighting(blocks, {
      minChunkX: -1,
      maxChunkX: 0,
      minChunkZ: 0,
      maxChunkZ: 0
    });

    blocks.set(key(-1, 3, 1), BlockId.Torch);
    const added = lighting.updateBlock(-1, 3, 1);
    expect(lighting.getBlockLight(0, 3, 1)).toBe(TORCH_LIGHT_LEVEL - 1);
    expect(added.changedChunkKeys).toContain('-1,0');
    expect(added.changedChunkKeys).toContain('0,0');
    expect(added.changedChunkKeys.every((chunkKey) => chunkKey === '-1,0' || chunkKey === '0,0')).toBe(true);

    blocks.delete(key(-1, 3, 1));
    const removed = lighting.updateBlock(-1, 3, 1);
    expect(lighting.getBlockLight(0, 3, 1)).toBe(0);
    expect(removed.changedChunkKeys).toContain('-1,0');
    expect(removed.changedChunkKeys).toContain('0,0');
    expect(lighting.updateBlock(20, 3, 1).changedChunkKeys).toEqual([]);
  });

  it.each([
    ['x', { minChunkX: -1, maxChunkX: 3, minChunkZ: -1, maxChunkZ: 1 }],
    ['z', { minChunkX: -2, maxChunkX: 2, minChunkZ: 0, maxChunkZ: 2 }],
    ['diagonal', { minChunkX: -1, maxChunkX: 3, minChunkZ: 0, maxChunkZ: 2 }]
  ] as const)('matches a fresh full rebuild after a one-chunk %s shift', (_direction, nextBounds) => {
    const blocks = createShiftFixture();
    const initialBounds = {
      minChunkX: -2,
      maxChunkX: 2,
      minChunkZ: -1,
      maxChunkZ: 1
    } as const;
    const actual = createShiftLighting(blocks, initialBounds);
    const emitters = [
      [-18, 4, 3, 12],
      [52, 4, 5, 13],
      [-31, 4, -4, 10]
    ] as const;
    for (const [x, y, z, level] of emitters) actual.setManualEmitter(x, y, z, level);

    actual.reset(nextBounds);
    const rebuilt = createShiftLighting(blocks, nextBounds);
    for (const [x, y, z, level] of emitters) rebuilt.setManualEmitter(x, y, z, level);

    expectLightingWindowsEqual(actual, rebuilt, nextBounds);
  });

  it('stays equal to full rebuilds across repeated positive and negative window shifts', () => {
    const blocks = createShiftFixture();
    const initialBounds = {
      minChunkX: -2,
      maxChunkX: 2,
      minChunkZ: -1,
      maxChunkZ: 1
    } as const;
    const actual = createShiftLighting(blocks, initialBounds);
    actual.setManualEmitter(-18, 4, 3, 12);
    actual.setManualEmitter(52, 4, 5, 13);

    const path: readonly StreamingLightingChunkBounds[] = [
      { minChunkX: -1, maxChunkX: 3, minChunkZ: -1, maxChunkZ: 1 },
      { minChunkX: -1, maxChunkX: 3, minChunkZ: 0, maxChunkZ: 2 },
      { minChunkX: -2, maxChunkX: 2, minChunkZ: -1, maxChunkZ: 1 },
      { minChunkX: -3, maxChunkX: 1, minChunkZ: -2, maxChunkZ: 0 }
    ];

    for (const bounds of path) {
      actual.reset(bounds);
      const rebuilt = createShiftLighting(blocks, bounds);
      rebuilt.setManualEmitter(-18, 4, 3, 12);
      rebuilt.setManualEmitter(52, 4, 5, 13);
      expectLightingWindowsEqual(actual, rebuilt, bounds);
    }
  });

  it('matches full rebuilds through deterministic random negative-coordinate shifts and mutations', () => {
    const blocks = createShiftFixture();
    let bounds: StreamingLightingChunkBounds = {
      minChunkX: -3,
      maxChunkX: 1,
      minChunkZ: -2,
      maxChunkZ: 0
    };
    const actual = createShiftLighting(blocks, bounds);
    const manualEmitters = new Map<string, readonly [number, number, number, number]>();
    let randomState = 0x6d2b79f5;
    const random = (): number => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 0x100000000;
    };
    const mutationBlocks = [
      BlockId.Air,
      BlockId.Stone,
      BlockId.Glass,
      BlockId.Leaves,
      BlockId.Water,
      BlockId.Torch,
      BlockId.DiamondOre
    ] as const;

    for (let step = 0; step < 10; step += 1) {
      const minX = bounds.minChunkX * SHIFT_CHUNK_SIZE;
      const maxX = (bounds.maxChunkX + 1) * SHIFT_CHUNK_SIZE - 1;
      const minZ = bounds.minChunkZ * SHIFT_CHUNK_SIZE;
      const maxZ = (bounds.maxChunkZ + 1) * SHIFT_CHUNK_SIZE - 1;
      for (let mutation = 0; mutation < 3; mutation += 1) {
        const x = minX + Math.floor(random() * (maxX - minX + 1));
        const y = 1 + Math.floor(random() * 6);
        const z = minZ + Math.floor(random() * (maxZ - minZ + 1));
        const id = mutationBlocks[Math.floor(random() * mutationBlocks.length)]!;
        if (id === BlockId.Air) blocks.delete(key(x, y, z));
        else blocks.set(key(x, y, z), id);
        actual.updateBlock(x, y, z);
      }

      const emitterX = minX - SHIFT_CHUNK_SIZE + Math.floor(random() * (maxX - minX + SHIFT_CHUNK_SIZE * 2 + 1));
      const emitterY = 2 + Math.floor(random() * 4);
      const emitterZ = minZ - SHIFT_CHUNK_SIZE + Math.floor(random() * (maxZ - minZ + SHIFT_CHUNK_SIZE * 2 + 1));
      const emitterLevel = 8 + Math.floor(random() * 8);
      const emitterKey = key(emitterX, emitterY, emitterZ);
      manualEmitters.set(emitterKey, [emitterX, emitterY, emitterZ, emitterLevel]);
      actual.setManualEmitter(emitterX, emitterY, emitterZ, emitterLevel);
      if (manualEmitters.size > 4) {
        const oldest = manualEmitters.values().next().value;
        if (oldest) {
          actual.removeManualEmitter(oldest[0], oldest[1], oldest[2]);
          manualEmitters.delete(key(oldest[0], oldest[1], oldest[2]));
        }
      }

      let deltaX = Math.floor(random() * 3) - 1;
      let deltaZ = Math.floor(random() * 3) - 1;
      if (deltaX === 0 && deltaZ === 0) deltaX = step % 2 === 0 ? 1 : -1;
      bounds = {
        minChunkX: bounds.minChunkX + deltaX,
        maxChunkX: bounds.maxChunkX + deltaX,
        minChunkZ: bounds.minChunkZ + deltaZ,
        maxChunkZ: bounds.maxChunkZ + deltaZ
      };
      actual.reset(bounds);

      const rebuilt = createShiftLighting(blocks, bounds);
      for (const [x, y, z, level] of manualEmitters.values()) {
        rebuilt.setManualEmitter(x, y, z, level);
      }
      expectLightingWindowsEqual(actual, rebuilt, bounds);
    }
  });
});

const SHIFT_CHUNK_SIZE = 16;
const SHIFT_MAX_Y = 7;

function createShiftFixture(): Map<string, BlockId> {
  const blocks = new Map<string, BlockId>();
  for (let z = -48; z <= 48; z += 1) {
    for (let x = -64; x <= 79; x += 1) {
      const pattern = positiveModulo(x * 31 + z * 17, 29);
      if (pattern === 0 || pattern === 1) continue;
      const roof = pattern % 11 === 0
        ? BlockId.Leaves
        : pattern % 13 === 0
          ? BlockId.Water
          : pattern % 17 === 0
            ? BlockId.Glass
            : pattern % 19 === 0
              ? BlockId.DiamondOre
              : BlockId.Stone;
      blocks.set(key(x, 6, z), roof);
      if (pattern % 7 === 0) blocks.set(key(x, 2, z), BlockId.Stone);
    }
  }
  for (const [x, y, z] of [
    [-29, 4, 2],
    [-2, 4, -7],
    [46, 4, 6],
    [60, 4, -5],
    [8, 3, 24]
  ] as const) {
    blocks.set(key(x, y, z), BlockId.Torch);
  }
  return blocks;
}

function createShiftLighting(
  blocks: ReadonlyMap<string, BlockId>,
  initialBounds: StreamingLightingChunkBounds
): StreamingLighting {
  return new StreamingLighting({
    chunkSize: SHIFT_CHUNK_SIZE,
    minY: 0,
    maxY: SHIFT_MAX_Y,
    getBlock: (x, y, z) => blocks.get(key(x, y, z)) ?? BlockId.Air,
    initialBounds
  });
}

function expectLightingWindowsEqual(
  actual: StreamingLighting,
  rebuilt: StreamingLighting,
  bounds: StreamingLightingChunkBounds
): void {
  const minX = bounds.minChunkX * SHIFT_CHUNK_SIZE;
  const maxX = (bounds.maxChunkX + 1) * SHIFT_CHUNK_SIZE - 1;
  const minZ = bounds.minChunkZ * SHIFT_CHUNK_SIZE;
  const maxZ = (bounds.maxChunkZ + 1) * SHIFT_CHUNK_SIZE - 1;
  let mismatch: {
    position: readonly [number, number, number];
    actual: ReturnType<StreamingLighting['getSample']>;
    rebuilt: ReturnType<StreamingLighting['getSample']>;
  } | null = null;

  for (let y = 0; y <= SHIFT_MAX_Y && !mismatch; y += 1) {
    for (let z = minZ; z <= maxZ && !mismatch; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const actualSample = actual.getSample(x, y, z);
        const rebuiltSample = rebuilt.getSample(x, y, z);
        if (actualSample.sky === rebuiltSample.sky && actualSample.block === rebuiltSample.block) {
          continue;
        }
        mismatch = {
          position: [x, y, z],
          actual: actualSample,
          rebuilt: rebuiltSample
        };
        break;
      }
    }
  }
  expect(mismatch).toBeNull();
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
