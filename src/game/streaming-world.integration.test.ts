import { describe, expect, it } from 'vitest';
import {
  ChunkStreamPlanner,
  chunkKey,
  type ChunkStreamPlan
} from './chunk-streamer';
import { StreamingLighting, type StreamingLightingChunkBounds } from './streaming-lighting';
import { BlockId } from './types';
import {
  GENERATED_CHUNK_SIZE,
  GENERATED_WORLD_HEIGHT,
  generateChunk,
  generatedChunkIndex,
  generatedPositiveModulo,
  type GeneratedChunk
} from './world-generator';

const SEED = 0x51a7cafe;

function reconcileChunks(
  loaded: Map<string, GeneratedChunk>,
  plan: ChunkStreamPlan
): void {
  for (const chunk of plan.unloads) {
    expect(loaded.delete(chunk.key), `missing unload ${chunk.key}`).toBe(true);
  }
  for (const chunk of plan.loads) {
    expect(loaded.has(chunk.key), `duplicate load ${chunk.key}`).toBe(false);
    loaded.set(chunk.key, generateChunk(SEED, chunk.x, chunk.z));
  }
}

function expectLoadedSetMatchesPlan(
  loaded: ReadonlyMap<string, GeneratedChunk>,
  plan: ChunkStreamPlan
): void {
  expect(loaded.size).toBe(plan.simulationKeys.length);
  expect(new Set(loaded.keys())).toEqual(new Set(plan.simulationKeys));
}

function getLoadedBlock(
  loaded: ReadonlyMap<string, GeneratedChunk>,
  x: number,
  y: number,
  z: number
): BlockId {
  const blockX = Math.floor(x);
  const blockY = Math.floor(y);
  const blockZ = Math.floor(z);
  if (blockY < 0 || blockY >= GENERATED_WORLD_HEIGHT) return BlockId.Air;
  const chunkX = Math.floor(blockX / GENERATED_CHUNK_SIZE);
  const chunkZ = Math.floor(blockZ / GENERATED_CHUNK_SIZE);
  const chunk = loaded.get(chunkKey(chunkX, chunkZ));
  if (!chunk) return BlockId.Air;
  return (chunk.blocks[generatedChunkIndex(
    generatedPositiveModulo(blockX, GENERATED_CHUNK_SIZE),
    blockY,
    generatedPositiveModulo(blockZ, GENERATED_CHUNK_SIZE)
  )] ?? BlockId.Air) as BlockId;
}

function getPlanBounds(plan: ChunkStreamPlan): StreamingLightingChunkBounds {
  const coordinates = plan.simulationKeys.map((key) => {
    const [x = 0, z = 0] = key.split(',').map(Number);
    return { x, z };
  });
  return {
    minChunkX: Math.min(...coordinates.map(({ x }) => x)),
    maxChunkX: Math.max(...coordinates.map(({ x }) => x)),
    minChunkZ: Math.min(...coordinates.map(({ z }) => z)),
    maxChunkZ: Math.max(...coordinates.map(({ z }) => z))
  };
}

describe('streaming world module integration', () => {
  it('keeps a real generated cache stable while walking 24 chunks through the legacy boundaries', () => {
    const planner = new ChunkStreamPlanner({
      visibleRadius: 1,
      halo: 1,
      hysteresis: 0,
      chunkSize: GENERATED_CHUNK_SIZE
    });
    const loaded = new Map<string, GeneratedChunk>();
    const visitedFocusChunks = new Set<number>();
    const expectedLoadedCount = 25;

    for (let focusChunkX = -7; focusChunkX <= 16; focusChunkX += 1) {
      const plan = planner.planForChunk(focusChunkX, -2);
      reconcileChunks(loaded, plan);
      expectLoadedSetMatchesPlan(loaded, plan);
      expect(planner.loadedCount).toBe(expectedLoadedCount);
      expect(loaded.size).toBe(expectedLoadedCount);
      expect(new Set(plan.loads.map(({ key }) => key)).size).toBe(plan.loads.length);
      expect(new Set(plan.unloads.map(({ key }) => key)).size).toBe(plan.unloads.length);
      if (visitedFocusChunks.size > 0) {
        expect(plan.loads).toHaveLength(5);
        expect(plan.unloads).toHaveLength(5);
      }
      visitedFocusChunks.add(focusChunkX);

      const focusChunk = loaded.get(chunkKey(focusChunkX, -2));
      expect(focusChunk).toBeDefined();
      expect(focusChunk?.chunkX).toBe(focusChunkX);
      expect(focusChunk?.chunkZ).toBe(-2);
    }

    expect(visitedFocusChunks.size).toBe(24);
    expect(Math.min(...visitedFocusChunks)).toBeLessThan(-4);
    expect(Math.max(...visitedFocusChunks)).toBeGreaterThan(3);
  });

  it('keeps manual light seamless across a negative chunk edge and clears it after a distant move', () => {
    const planner = new ChunkStreamPlanner({
      visibleRadius: 0,
      halo: 1,
      hysteresis: 0,
      chunkSize: GENERATED_CHUNK_SIZE
    });
    const loaded = new Map<string, GeneratedChunk>();
    const firstPlan = planner.planForChunk(-4, 0);
    reconcileChunks(loaded, firstPlan);

    const lighting = new StreamingLighting({
      chunkSize: GENERATED_CHUNK_SIZE,
      minY: 0,
      maxY: GENERATED_WORLD_HEIGHT - 1,
      getBlock: (x, y, z) => getLoadedBlock(loaded, x, y, z),
      initialBounds: getPlanBounds(firstPlan)
    });
    lighting.setManualEmitter(-64, 70, 0, 14);

    expect(lighting.getBlockLight(-64, 70, 0)).toBe(14);
    expect(lighting.getBlockLight(-65, 70, 0)).toBe(13);
    expect(lighting.getBlockLight(-63, 70, 0)).toBe(13);

    const distantPlan = planner.planForChunk(5, 0);
    reconcileChunks(loaded, distantPlan);
    const rebuilt = lighting.reset(getPlanBounds(distantPlan));

    expectLoadedSetMatchesPlan(loaded, distantPlan);
    expect(rebuilt.changedChunkKeys).toEqual([...distantPlan.simulationKeys].sort((left, right) => {
      const [leftX = 0, leftZ = 0] = left.split(',').map(Number);
      const [rightX = 0, rightZ = 0] = right.split(',').map(Number);
      return leftX - rightX || leftZ - rightZ;
    }));
    expect(lighting.getBlockLight(80, 70, 0)).toBe(0);
    expect(lighting.getBlockLight(-64, 70, 0)).toBe(0);
  });
});
