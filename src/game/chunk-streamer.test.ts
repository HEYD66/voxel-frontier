import { describe, expect, it } from 'vitest';
import {
  ChunkStreamPlanner,
  blockToChunkCoordinate,
  chunkKey,
  type ChunkStreamPlan,
  type PlannedChunk
} from './chunk-streamer';

function expectNearToFar(chunks: readonly PlannedChunk[]): void {
  for (let index = 1; index < chunks.length; index += 1) {
    expect(chunks[index]!.distance).toBeGreaterThanOrEqual(chunks[index - 1]!.distance);
  }
}

function expectVisibleNeighborsLoaded(plan: ChunkStreamPlan): void {
  const loaded = new Set(plan.simulationKeys);
  for (const chunk of plan.visible) {
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        expect(loaded.has(chunkKey(chunk.x + dx, chunk.z + dz))).toBe(true);
      }
    }
  }
}

describe('ChunkStreamPlanner', () => {
  it('builds exact visible, dependency, and R+2 simulation squares near-to-far', () => {
    const planner = new ChunkStreamPlanner({ visibleRadius: 2 });
    const plan = planner.planForChunk(0, 0);

    expect(plan.visibleKeys).toHaveLength(25);
    expect(plan.dependencyKeys).toHaveLength(49);
    expect(plan.simulationKeys).toHaveLength(81);
    expect(plan.loads).toHaveLength(81);
    expect(plan.unloads).toHaveLength(0);
    expect(plan.visible[0]).toMatchObject({ x: 0, z: 0, key: '0,0', distance: 0 });
    expect(plan.loads[0]).toMatchObject({ key: '0,0', distance: 0 });
    expect(plan.loads.at(-1)?.distance).toBe(4);
    expectNearToFar(plan.loads);
    expectNearToFar(plan.visible);
    expectVisibleNeighborsLoaded(plan);
    expect(planner.loadedCount).toBe(81);
  });

  it('supports a compact R+1 halo while preserving every visible neighbor', () => {
    const planner = new ChunkStreamPlanner({ visibleRadius: 2, halo: 1 });
    const plan = planner.planForChunk(5, -4);

    expect(planner.hysteresis).toBe(0);
    expect(plan.visibleKeys).toHaveLength(25);
    expect(plan.simulationKeys).toHaveLength(49);
    expect(plan.simulationRadius).toBe(3);
    expectVisibleNeighborsLoaded(plan);
  });

  it('holds its anchor for one chunk and shifts only the changed window strips', () => {
    const planner = new ChunkStreamPlanner({ visibleRadius: 2, halo: 2, hysteresis: 1 });
    const initial = planner.planForChunk(0, 0);
    const withinHysteresis = planner.planForChunk(1, 0);
    const shifted = planner.planForChunk(2, 0);

    expect(initial.anchorChanged).toBe(true);
    expect(withinHysteresis.anchorChanged).toBe(false);
    expect(withinHysteresis.anchor).toEqual({ x: 0, z: 0 });
    expect(withinHysteresis.visible[0]).toMatchObject({ x: 1, z: 0 });
    expect(withinHysteresis.loads).toHaveLength(0);
    expect(withinHysteresis.unloads).toHaveLength(0);
    expectVisibleNeighborsLoaded(withinHysteresis);

    expect(shifted.anchorChanged).toBe(true);
    expect(shifted.anchor).toEqual({ x: 2, z: 0 });
    expect(shifted.loads).toHaveLength(18);
    expect(shifted.unloads).toHaveLength(18);
    expect(shifted.loads.length).toBeLessThan(shifted.simulationKeys.length);
    expectNearToFar(shifted.loads);
    expect(planner.loadedCount).toBe(81);
  });

  it('uses floor division and stable keys across negative block coordinates', () => {
    expect(blockToChunkCoordinate(-0.001, -16)).toEqual({ x: -1, z: -1 });
    expect(blockToChunkCoordinate(-16.001, 15.999)).toEqual({ x: -2, z: 0 });
    expect(chunkKey(-0, -3)).toBe('0,-3');

    const planner = new ChunkStreamPlanner({ visibleRadius: 1 });
    const plan = planner.planForBlock(-16.001, -0.001);
    expect(plan.focus).toEqual({ x: -2, z: -1 });
    expect(plan.anchor).toEqual({ x: -2, z: -1 });
    expect(plan.visibleKeys).toContain('-3,-2');
    expect(plan.visibleKeys).toContain('-1,0');
    expect(plan.simulationKeys).toHaveLength(49);
  });

  it('reconciles render-distance growth and shrinkage with exact deltas', () => {
    const planner = new ChunkStreamPlanner({ visibleRadius: 2 });
    planner.planForChunk(0, 0);

    const grown = planner.planForChunk(0, 0, 4);
    expect(grown.radiusChanged).toBe(true);
    expect(grown.visibleKeys).toHaveLength(81);
    expect(grown.simulationKeys).toHaveLength(169);
    expect(grown.loads).toHaveLength(88);
    expect(grown.unloads).toHaveLength(0);
    expect(planner.loadedCount).toBe(169);

    const shrunk = planner.planForChunk(0, 0, 1);
    expect(shrunk.radiusChanged).toBe(true);
    expect(shrunk.visibleKeys).toHaveLength(9);
    expect(shrunk.simulationKeys).toHaveLength(49);
    expect(shrunk.loads).toHaveLength(0);
    expect(shrunk.unloads).toHaveLength(120);
    expect(planner.loadedCount).toBe(49);
    expect(new Set(planner.getLoadedKeys())).toEqual(new Set(shrunk.simulationKeys));
  });

  it('keeps a stable loaded set without leaking while crossing more than 20 chunks', () => {
    const planner = new ChunkStreamPlanner({ visibleRadius: 3 });
    const side = 2 * (3 + 2) + 1;
    const expectedCount = side * side;
    let previousKeys = new Set<string>();

    for (let chunkX = -4; chunkX <= 24; chunkX += 1) {
      const plan = planner.planForChunk(chunkX, -3);
      const currentKeys = new Set(plan.simulationKeys);
      expect(currentKeys.size).toBe(expectedCount);
      expect(planner.loadedCount).toBe(expectedCount);
      expect(planner.getLoadedKeys()).toHaveLength(expectedCount);
      expectVisibleNeighborsLoaded(plan);

      if (previousKeys.size > 0) {
        const actualLoads = [...currentKeys].filter((key) => !previousKeys.has(key));
        const actualUnloads = [...previousKeys].filter((key) => !currentKeys.has(key));
        expect(plan.loads.map((chunk) => chunk.key).sort()).toEqual(actualLoads.sort());
        expect(plan.unloads.map((chunk) => chunk.key).sort()).toEqual(actualUnloads.sort());
        expect(plan.loads).toHaveLength(plan.unloads.length);
      }
      previousKeys = currentKeys;
    }
  });

  it('loads the visible dependency ring before the optional outer halo', () => {
    const planner = new ChunkStreamPlanner({ visibleRadius: 2, halo: 2 });
    const plan = planner.planForChunk(7, -9);
    let lastDependencyLoad = -1;
    plan.loads.forEach((chunk, index) => {
      if (chunk.distance <= 3) lastDependencyLoad = index;
    });
    const firstOuterLoad = plan.loads.findIndex((chunk) => chunk.distance === 4);

    expect(lastDependencyLoad).toBe(48);
    expect(firstOuterLoad).toBe(49);
    expect(plan.loads.slice(0, firstOuterLoad).every((chunk) => chunk.distance <= 3)).toBe(true);
    expect(plan.loads.slice(firstOuterLoad).every((chunk) => chunk.distance === 4)).toBe(true);
  });

  it('validates configurations that could expose an unloaded mesh neighbor', () => {
    expect(() => new ChunkStreamPlanner({ visibleRadius: -1 })).toThrow(RangeError);
    expect(() => new ChunkStreamPlanner({ visibleRadius: 2, halo: 1, hysteresis: 1 })).toThrow(
      RangeError
    );
    expect(() => new ChunkStreamPlanner({ visibleRadius: 2, halo: 2, hysteresis: 2 })).toThrow(
      RangeError
    );
    expect(() => new ChunkStreamPlanner({ visibleRadius: 2, chunkSize: 0 })).toThrow(RangeError);
  });

  it('resets all planned state for world replacement without retaining keys', () => {
    const planner = new ChunkStreamPlanner({ visibleRadius: 1 });
    planner.planForChunk(12, -8);
    planner.reset();

    expect(planner.loadedCount).toBe(0);
    expect(planner.anchor).toBeNull();
    expect(planner.focus).toBeNull();
    const reloaded = planner.planForChunk(-2, 3);
    expect(reloaded.loads).toHaveLength(49);
    expect(reloaded.unloads).toHaveLength(0);
  });
});
