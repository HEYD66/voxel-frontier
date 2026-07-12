import { describe, expect, it } from 'vitest';
import {
  BLOCK_EXPLOSION_RESISTANCE,
  CREEPER_CANCEL_DISTANCE,
  CREEPER_EXPLOSION_POWER,
  CREEPER_FUSE_SECONDS,
  CREEPER_IGNITE_DISTANCE,
  EXPLOSION_BOUNDARY_RAY_COUNT,
  calculateExplosionDamage,
  calculateExplosionImpact,
  getBlockExplosionResistance,
  getExplosionDropSurvivalChance,
  isBlockDestructibleByExplosion,
  sampleExplosionExposure,
  shouldExplosionDropSurvive,
  traceExplosionBlocks,
  type ExplosionAffectedBlock
} from './explosion';
import { BlockId } from './types';

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function traceFilledExplosion(id: BlockId, seed = 123): ExplosionAffectedBlock[] {
  return traceExplosionBlocks({
    center: { x: 0.5, y: 0.5, z: 0.5 },
    power: CREEPER_EXPLOSION_POWER,
    seed,
    getBlock: () => id
  });
}

describe('explosion constants and block resistance', () => {
  it('uses the original creeper timing and distance thresholds', () => {
    expect(CREEPER_IGNITE_DISTANCE).toBe(3);
    expect(CREEPER_CANCEL_DISTANCE).toBe(7);
    expect(CREEPER_FUSE_SECONDS).toBe(1.5);
    expect(CREEPER_EXPLOSION_POWER).toBe(3);
    expect(EXPLOSION_BOUNDARY_RAY_COUNT).toBe(1352);
  });

  it('models weak, structural, liquid, and unbreakable resistance tiers', () => {
    expect(BLOCK_EXPLOSION_RESISTANCE[BlockId.Torch]).toBe(0);
    expect(getBlockExplosionResistance(BlockId.Glass)).toBe(0.3);
    expect(getBlockExplosionResistance(BlockId.Stone)).toBe(6);
    expect(getBlockExplosionResistance(BlockId.Water)).toBe(100);
    expect(getBlockExplosionResistance(BlockId.Bedrock)).toBe(3_600_000);
    expect(getBlockExplosionResistance(999)).toBe(0);
    expect(isBlockDestructibleByExplosion(BlockId.Stone)).toBe(true);
    expect(isBlockDestructibleByExplosion(BlockId.Air)).toBe(false);
    expect(isBlockDestructibleByExplosion(BlockId.Water)).toBe(false);
    expect(isBlockDestructibleByExplosion(BlockId.Bedrock)).toBe(false);
  });
});

describe('Java-style boundary ray tracing', () => {
  it('returns no blocks for invalid blasts and never queries the world', () => {
    let queries = 0;
    const getBlock = (): BlockId => {
      queries += 1;
      return BlockId.Stone;
    };

    expect(traceExplosionBlocks({
      center: { x: 0, y: 0, z: 0 },
      power: 0,
      getBlock
    })).toEqual([]);
    expect(traceExplosionBlocks({
      center: { x: Number.NaN, y: 0, z: 0 },
      getBlock
    })).toEqual([]);
    expect(queries).toBe(0);
  });

  it('is deterministic for a seed and varies its irregular shell across seeds', () => {
    const first = traceFilledExplosion(BlockId.Torch, 8675309);
    const repeated = traceFilledExplosion(BlockId.Torch, 8675309);
    const anotherSeed = traceFilledExplosion(BlockId.Torch, 8675310);

    expect(first).toEqual(repeated);
    expect(first.length).toBeGreaterThan(100);
    expect(anotherSeed).not.toEqual(first);
    expect(new Set(first.map((block) => key(block.x, block.y, block.z))).size).toBe(first.length);
  });

  it('attenuates through resistant blocks and protects water and bedrock', () => {
    const weak = traceFilledExplosion(BlockId.Torch);
    const resistant = traceFilledExplosion(BlockId.Stone);

    expect(resistant.length).toBeGreaterThan(0);
    expect(weak.length).toBeGreaterThan(resistant.length);
    expect(traceFilledExplosion(BlockId.Water)).toEqual([]);
    expect(traceFilledExplosion(BlockId.Bedrock)).toEqual([]);
  });

  it('floors negative world coordinates and returns stable near-to-far results', () => {
    const occupied = new Map<string, BlockId>([
      ['-1,-1,-1', BlockId.Torch],
      ['-2,-1,-1', BlockId.Glass]
    ]);
    const blocks = traceExplosionBlocks({
      center: { x: -0.1, y: -0.1, z: -0.1 },
      seed: 4,
      getBlock: (x, y, z) => occupied.get(key(x, y, z)) ?? BlockId.Air
    });

    expect(blocks[0]).toEqual({ x: -1, y: -1, z: -1, id: BlockId.Torch });
    expect(blocks).toContainEqual({ x: -2, y: -1, z: -1, id: BlockId.Glass });
  });

  it('supports world-specific resistance and destruction policies', () => {
    let resistanceQueries = 0;
    let destructionQueries = 0;
    const blocks = traceExplosionBlocks({
      center: { x: 0.5, y: 0.5, z: 0.5 },
      seed: 8,
      getBlock: () => BlockId.Stone,
      getResistance: (_id, x) => {
        resistanceQueries += 1;
        return x === 0 ? Number.NaN : 10_000;
      },
      canDestroyBlock: (_id, x, y, z, remainingStrength) => {
        destructionQueries += 1;
        return x === 0 && y === 0 && z === 0 && remainingStrength > 0;
      }
    });

    expect(resistanceQueries).toBeGreaterThanOrEqual(EXPLOSION_BOUNDARY_RAY_COUNT);
    expect(destructionQueries).toBeGreaterThan(0);
    expect(blocks).toEqual([{ x: 0, y: 0, z: 0, id: BlockId.Stone }]);
  });
});

describe('explosion exposure and entity damage', () => {
  const center = { x: 0, y: 1, z: 0 };
  const playerBounds = {
    minX: -0.3,
    minY: 0,
    minZ: -0.3,
    maxX: 0.3,
    maxY: 1.8,
    maxZ: 0.3
  };

  it('samples the entity volume using the Java exposure grid', () => {
    const samples: Array<{ x: number; y: number; z: number }> = [];
    const exposure = sampleExplosionExposure(center, playerBounds, (sample) => {
      samples.push({ ...sample });
      return samples.length % 3 === 0;
    });

    expect(samples).toHaveLength(45);
    expect(exposure).toBeCloseTo(1 / 3, 10);
    expect(samples[0]).toEqual({
      x: expect.closeTo(-0.2545454545, 9),
      y: 0,
      z: expect.closeTo(-0.2545454545, 9)
    });
  });

  it('reports fully open, fully occluded, and invalid volumes', () => {
    expect(sampleExplosionExposure(center, playerBounds, () => true)).toBe(1);
    expect(sampleExplosionExposure(center, playerBounds, () => false)).toBe(0);
    expect(sampleExplosionExposure(center, {
      ...playerBounds,
      maxX: -1
    }, () => true)).toBe(0);
  });

  it('uses the original distance, exposure, and power damage curve', () => {
    expect(calculateExplosionImpact(0, 1)).toBe(1);
    expect(calculateExplosionImpact(3, 1)).toBe(0.5);
    expect(calculateExplosionDamage(0, 1)).toBe(43);
    expect(calculateExplosionDamage(3, 1)).toBe(16);
    expect(calculateExplosionDamage(6, 1)).toBe(1);
    expect(calculateExplosionDamage(0, 0)).toBe(1);
    expect(calculateExplosionDamage(6.001, 1)).toBe(0);
    expect(calculateExplosionDamage(-1, 1)).toBe(0);
    expect(calculateExplosionDamage(0, 2)).toBe(43);
  });
});

describe('deterministic explosion drops', () => {
  it('uses the Java explosion-decay chance of one over power', () => {
    expect(getExplosionDropSurvivalChance(0)).toBe(1);
    expect(getExplosionDropSurvivalChance(1)).toBe(1);
    expect(getExplosionDropSurvivalChance(3)).toBeCloseTo(1 / 3);
    expect(getExplosionDropSurvivalChance(Number.POSITIVE_INFINITY)).toBe(0);
    expect(getExplosionDropSurvivalChance(Number.NaN)).toBe(0);
  });

  it('is stable by seed and coordinate without depending on traversal order', () => {
    const coordinates = Array.from({ length: 1000 }, (_, index) => ({
      x: index - 500,
      y: index % 64,
      z: index * 17 - 8000
    }));
    const forward = coordinates.map(({ x, y, z }) => (
      shouldExplosionDropSurvive(x, y, z, 3, 991)
    ));
    const reverse = [...coordinates].reverse().map(({ x, y, z }) => (
      shouldExplosionDropSurvive(x, y, z, 3, 991)
    )).reverse();

    expect(reverse).toEqual(forward);
    expect(forward.filter(Boolean).length).toBeGreaterThan(250);
    expect(forward.filter(Boolean).length).toBeLessThan(420);
    expect(shouldExplosionDropSurvive(0, 0, 0, 1, 12)).toBe(true);
    expect(shouldExplosionDropSurvive(Number.NaN, 0, 0, 3, 12)).toBe(false);
  });
});
