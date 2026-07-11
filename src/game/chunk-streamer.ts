export interface ChunkCoordinate {
  x: number;
  z: number;
}

export interface PlannedChunk extends ChunkCoordinate {
  key: string;
  /** Chebyshev distance from the current focus chunk. */
  distance: number;
}

export interface ChunkStreamPlannerOptions {
  visibleRadius: number;
  /** Extra loaded/simulated rings outside the visible square. */
  halo?: 1 | 2;
  /** Maximum anchor drift in chunks. Must leave one ring for mesh neighbors. */
  hysteresis?: number;
  chunkSize?: number;
}

export interface ChunkStreamPlan {
  focus: ChunkCoordinate;
  anchor: ChunkCoordinate;
  visibleRadius: number;
  dependencyRadius: number;
  simulationRadius: number;
  anchorChanged: boolean;
  radiusChanged: boolean;
  loads: readonly PlannedChunk[];
  unloads: readonly PlannedChunk[];
  visible: readonly PlannedChunk[];
  visibleKeys: readonly string[];
  dependencyKeys: readonly string[];
  simulationKeys: readonly string[];
}

const DEFAULT_CHUNK_SIZE = 16;

export function chunkKey(chunkX: number, chunkZ: number): string {
  return `${normalizeChunkCoordinate(chunkX)},${normalizeChunkCoordinate(chunkZ)}`;
}

export function blockToChunkCoordinate(
  blockX: number,
  blockZ: number,
  chunkSize = DEFAULT_CHUNK_SIZE
): ChunkCoordinate {
  const size = normalizePositiveInteger(chunkSize, 'chunkSize');
  return {
    x: normalizeZero(Math.floor(normalizeFinite(blockX, 'blockX') / size)),
    z: normalizeZero(Math.floor(normalizeFinite(blockZ, 'blockZ') / size))
  };
}

/**
 * Stateful target-set planner. It owns only coordinates, so loading, generation,
 * meshing, simulation, and disposal remain under VoxelWorld's control.
 */
export class ChunkStreamPlanner {
  public readonly halo: 1 | 2;
  public readonly hysteresis: number;
  public readonly chunkSize: number;

  private visibleRadiusValue: number;
  private anchorValue: ChunkCoordinate | null = null;
  private focusValue: ChunkCoordinate | null = null;
  private loaded = new Map<string, ChunkCoordinate>();

  constructor(options: ChunkStreamPlannerOptions) {
    this.visibleRadiusValue = normalizeRadius(options.visibleRadius);
    this.halo = options.halo ?? 2;
    if (this.halo !== 1 && this.halo !== 2) {
      throw new RangeError('halo must be 1 or 2');
    }

    const maximumHysteresis = this.halo - 1;
    this.hysteresis = options.hysteresis ?? maximumHysteresis;
    if (
      !Number.isInteger(this.hysteresis) ||
      this.hysteresis < 0 ||
      this.hysteresis > maximumHysteresis
    ) {
      throw new RangeError(`hysteresis must be an integer from 0 to ${maximumHysteresis}`);
    }
    this.chunkSize = normalizePositiveInteger(
      options.chunkSize ?? DEFAULT_CHUNK_SIZE,
      'chunkSize'
    );
  }

  get visibleRadius(): number {
    return this.visibleRadiusValue;
  }

  get simulationRadius(): number {
    return this.visibleRadiusValue + this.halo;
  }

  get loadedCount(): number {
    return this.loaded.size;
  }

  get anchor(): ChunkCoordinate | null {
    return this.anchorValue ? { ...this.anchorValue } : null;
  }

  get focus(): ChunkCoordinate | null {
    return this.focusValue ? { ...this.focusValue } : null;
  }

  planForBlock(
    blockX: number,
    blockZ: number,
    visibleRadius = this.visibleRadiusValue
  ): ChunkStreamPlan {
    const focus = blockToChunkCoordinate(blockX, blockZ, this.chunkSize);
    return this.planForChunk(focus.x, focus.z, visibleRadius);
  }

  planForChunk(
    chunkX: number,
    chunkZ: number,
    visibleRadius = this.visibleRadiusValue
  ): ChunkStreamPlan {
    const focus = {
      x: normalizeChunkCoordinate(chunkX),
      z: normalizeChunkCoordinate(chunkZ)
    };
    const nextVisibleRadius = normalizeRadius(visibleRadius);
    const radiusChanged = nextVisibleRadius !== this.visibleRadiusValue;
    this.visibleRadiusValue = nextVisibleRadius;

    const anchorChanged = this.shouldMoveAnchor(focus);
    if (anchorChanged) this.anchorValue = { ...focus };
    const anchor = this.anchorValue!;
    this.focusValue = { ...focus };

    const simulationRadius = nextVisibleRadius + this.halo;
    const desiredLoaded = createChunkMap(anchor, simulationRadius);
    const loads = [...desiredLoaded.values()]
      .filter((chunk) => !this.loaded.has(chunkKey(chunk.x, chunk.z)))
      .sort((left, right) => compareNearToFar(left, right, focus))
      .map((chunk) => toPlannedChunk(chunk, focus));
    const unloads = [...this.loaded.values()]
      .filter((chunk) => !desiredLoaded.has(chunkKey(chunk.x, chunk.z)))
      .sort((left, right) => compareFarToNear(left, right, focus))
      .map((chunk) => toPlannedChunk(chunk, focus));

    const visibleCoordinates = createSortedSquare(focus, nextVisibleRadius, focus);
    const dependencyCoordinates = createSortedSquare(focus, nextVisibleRadius + 1, focus);
    const simulationCoordinates = createSortedSquare(anchor, simulationRadius, focus);

    // The constraint on hysteresis guarantees that all mesh-neighbor dependencies
    // are present before a chunk can enter the visible set.
    for (const dependency of dependencyCoordinates) {
      if (!desiredLoaded.has(chunkKey(dependency.x, dependency.z))) {
        throw new Error('chunk-stream invariant violated: visible neighbor is not loaded');
      }
    }

    this.loaded = desiredLoaded;
    return {
      focus: { ...focus },
      anchor: { ...anchor },
      visibleRadius: nextVisibleRadius,
      dependencyRadius: nextVisibleRadius + 1,
      simulationRadius,
      anchorChanged,
      radiusChanged,
      loads,
      unloads,
      visible: visibleCoordinates.map((chunk) => toPlannedChunk(chunk, focus)),
      visibleKeys: visibleCoordinates.map((chunk) => chunkKey(chunk.x, chunk.z)),
      dependencyKeys: dependencyCoordinates.map((chunk) => chunkKey(chunk.x, chunk.z)),
      simulationKeys: simulationCoordinates.map((chunk) => chunkKey(chunk.x, chunk.z))
    };
  }

  getLoadedKeys(): string[] {
    const focus = this.focusValue ?? this.anchorValue ?? { x: 0, z: 0 };
    return [...this.loaded.values()]
      .sort((left, right) => compareNearToFar(left, right, focus))
      .map((chunk) => chunkKey(chunk.x, chunk.z));
  }

  reset(): void {
    this.anchorValue = null;
    this.focusValue = null;
    this.loaded.clear();
  }

  private shouldMoveAnchor(focus: ChunkCoordinate): boolean {
    if (!this.anchorValue) return true;
    return chebyshevDistance(focus, this.anchorValue) > this.hysteresis;
  }
}

function createChunkMap(center: ChunkCoordinate, radius: number): Map<string, ChunkCoordinate> {
  const chunks = new Map<string, ChunkCoordinate>();
  for (let z = center.z - radius; z <= center.z + radius; z += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      const chunk = { x, z };
      chunks.set(chunkKey(x, z), chunk);
    }
  }
  return chunks;
}

function createSortedSquare(
  center: ChunkCoordinate,
  radius: number,
  focus: ChunkCoordinate
): ChunkCoordinate[] {
  return [...createChunkMap(center, radius).values()]
    .sort((left, right) => compareNearToFar(left, right, focus));
}

function toPlannedChunk(chunk: ChunkCoordinate, focus: ChunkCoordinate): PlannedChunk {
  return {
    x: chunk.x,
    z: chunk.z,
    key: chunkKey(chunk.x, chunk.z),
    distance: chebyshevDistance(chunk, focus)
  };
}

function compareNearToFar(
  left: ChunkCoordinate,
  right: ChunkCoordinate,
  focus: ChunkCoordinate
): number {
  const leftDistance = chebyshevDistance(left, focus);
  const rightDistance = chebyshevDistance(right, focus);
  if (leftDistance !== rightDistance) return leftDistance - rightDistance;

  const leftManhattan = manhattanDistance(left, focus);
  const rightManhattan = manhattanDistance(right, focus);
  if (leftManhattan !== rightManhattan) return leftManhattan - rightManhattan;
  if (left.x !== right.x) return left.x - right.x;
  return left.z - right.z;
}

function compareFarToNear(
  left: ChunkCoordinate,
  right: ChunkCoordinate,
  focus: ChunkCoordinate
): number {
  const leftDistance = chebyshevDistance(left, focus);
  const rightDistance = chebyshevDistance(right, focus);
  if (leftDistance !== rightDistance) return rightDistance - leftDistance;

  const leftManhattan = manhattanDistance(left, focus);
  const rightManhattan = manhattanDistance(right, focus);
  if (leftManhattan !== rightManhattan) return rightManhattan - leftManhattan;
  if (left.x !== right.x) return left.x - right.x;
  return left.z - right.z;
}

function chebyshevDistance(left: ChunkCoordinate, right: ChunkCoordinate): number {
  return Math.max(Math.abs(left.x - right.x), Math.abs(left.z - right.z));
}

function manhattanDistance(left: ChunkCoordinate, right: ChunkCoordinate): number {
  return Math.abs(left.x - right.x) + Math.abs(left.z - right.z);
}

function normalizeRadius(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError('visibleRadius must be a finite non-negative number');
  }
  return Math.floor(value);
}

function normalizeChunkCoordinate(value: number): number {
  return normalizeZero(Math.floor(normalizeFinite(value, 'chunk coordinate')));
}

function normalizePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function normalizeFinite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
