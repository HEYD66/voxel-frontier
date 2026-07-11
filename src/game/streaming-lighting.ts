import {
  MAX_LIGHT_LEVEL,
  VoxelLighting,
  type VoxelLightSample,
  type VoxelLightingBounds,
  type VoxelLightingUpdate
} from './lighting';
import type { BlockId } from './types';

export interface StreamingLightingChunkBounds {
  minChunkX: number;
  maxChunkX: number;
  minChunkZ: number;
  maxChunkZ: number;
}

export interface StreamingLightingOptions {
  chunkSize: number;
  minY: number;
  maxY: number;
  getBlock: (x: number, y: number, z: number) => BlockId;
  initialBounds?: StreamingLightingChunkBounds;
}

export interface StreamingLightingUpdate {
  readonly changedChunks: ReadonlyArray<readonly [number, number]>;
  readonly changedChunkKeys: ReadonlyArray<string>;
}

interface ManualEmitter {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly level: number;
}

const EMPTY_UPDATE: StreamingLightingUpdate = Object.freeze({
  changedChunks: Object.freeze([]),
  changedChunkKeys: Object.freeze([])
});

export function streamingLightingChunkKey(chunkX: number, chunkZ: number): string {
  return `${Math.floor(chunkX)},${Math.floor(chunkZ)}`;
}

export class StreamingLighting {
  private readonly chunkSize: number;
  private readonly minY: number;
  private readonly maxY: number;
  private readonly getBlock: StreamingLightingOptions['getBlock'];
  private readonly manualEmitters = new Map<string, ManualEmitter>();
  private activeBounds: StreamingLightingChunkBounds | null = null;
  private lighting: VoxelLighting | null = null;

  constructor(options: StreamingLightingOptions) {
    this.chunkSize = positiveInteger(options.chunkSize, 'chunkSize');
    this.minY = integer(options.minY, 'minY');
    this.maxY = integer(options.maxY, 'maxY');
    if (this.minY > this.maxY) throw new RangeError('minY must be less than or equal to maxY.');
    this.getBlock = options.getBlock;
    if (options.initialBounds) this.reset(options.initialBounds);
  }

  get chunkBounds(): StreamingLightingChunkBounds | null {
    return this.activeBounds ? { ...this.activeBounds } : null;
  }

  get voxelBounds(): VoxelLightingBounds | null {
    return this.activeBounds ? this.toVoxelBounds(this.activeBounds) : null;
  }

  reset(bounds: StreamingLightingChunkBounds): StreamingLightingUpdate {
    const nextBounds = normalizeChunkBounds(bounds);
    const voxelBounds = this.toVoxelBounds(nextBounds);
    let lighting = this.lighting;
    if (!lighting || !lighting.shiftBounds(voxelBounds)) {
      lighting = new VoxelLighting(voxelBounds, this.getBlock);
      lighting.rebuild();
    }

    this.activeBounds = nextBounds;
    this.lighting = lighting;
    for (const emitter of this.manualEmitters.values()) {
      if (!this.containsVoxel(emitter.x, emitter.y, emitter.z)) continue;
      lighting.setEmitter(emitter.x, emitter.y, emitter.z, emitter.level);
    }

    return this.fullWindowUpdate(nextBounds);
  }

  rebuild(bounds: StreamingLightingChunkBounds | null = this.activeBounds): StreamingLightingUpdate {
    if (!bounds) return EMPTY_UPDATE;
    return this.reset(bounds);
  }

  getSkyLight(x: number, y: number, z: number): number {
    return this.lighting?.getSkyLight(x, y, z) ?? MAX_LIGHT_LEVEL;
  }

  getBlockLight(x: number, y: number, z: number): number {
    return this.lighting?.getBlockLight(x, y, z) ?? 0;
  }

  getSample(x: number, y: number, z: number): VoxelLightSample {
    return {
      sky: this.getSkyLight(x, y, z),
      block: this.getBlockLight(x, y, z)
    };
  }

  updateBlock(x: number, y: number, z: number): StreamingLightingUpdate {
    if (!this.lighting || !this.containsVoxel(x, y, z)) return EMPTY_UPDATE;
    return this.normalizeUpdate(this.lighting.updateBlock(x, y, z));
  }

  setManualEmitter(x: number, y: number, z: number, level = 14): StreamingLightingUpdate {
    const blockX = Math.floor(x);
    const blockY = Math.floor(y);
    const blockZ = Math.floor(z);
    const safeLevel = Math.max(0, Math.min(MAX_LIGHT_LEVEL, Math.round(level)));
    const key = voxelKey(blockX, blockY, blockZ);
    const previousLevel = this.manualEmitters.get(key)?.level ?? 0;
    if (safeLevel === 0) this.manualEmitters.delete(key);
    else this.manualEmitters.set(key, { x: blockX, y: blockY, z: blockZ, level: safeLevel });
    if (previousLevel === safeLevel || !this.lighting || !this.containsVoxel(blockX, blockY, blockZ)) {
      return EMPTY_UPDATE;
    }
    return this.normalizeUpdate(this.lighting.setEmitter(blockX, blockY, blockZ, safeLevel));
  }

  removeManualEmitter(x: number, y: number, z: number): StreamingLightingUpdate {
    return this.setManualEmitter(x, y, z, 0);
  }

  setEmitter(x: number, y: number, z: number, level = 14): StreamingLightingUpdate {
    return this.setManualEmitter(x, y, z, level);
  }

  removeEmitter(x: number, y: number, z: number): StreamingLightingUpdate {
    return this.removeManualEmitter(x, y, z);
  }

  private containsVoxel(x: number, y: number, z: number): boolean {
    const bounds = this.activeBounds;
    if (!bounds) return false;
    const blockX = Math.floor(x);
    const blockY = Math.floor(y);
    const blockZ = Math.floor(z);
    return blockX >= bounds.minChunkX * this.chunkSize
      && blockX < (bounds.maxChunkX + 1) * this.chunkSize
      && blockZ >= bounds.minChunkZ * this.chunkSize
      && blockZ < (bounds.maxChunkZ + 1) * this.chunkSize
      && blockY >= this.minY
      && blockY <= this.maxY;
  }

  private toVoxelBounds(bounds: StreamingLightingChunkBounds): VoxelLightingBounds {
    return {
      minX: bounds.minChunkX * this.chunkSize,
      maxX: (bounds.maxChunkX + 1) * this.chunkSize - 1,
      minY: this.minY,
      maxY: this.maxY,
      minZ: bounds.minChunkZ * this.chunkSize,
      maxZ: (bounds.maxChunkZ + 1) * this.chunkSize - 1,
      chunkSize: this.chunkSize
    };
  }

  private fullWindowUpdate(bounds: StreamingLightingChunkBounds): StreamingLightingUpdate {
    const chunks: Array<readonly [number, number]> = [];
    for (let chunkX = bounds.minChunkX; chunkX <= bounds.maxChunkX; chunkX += 1) {
      for (let chunkZ = bounds.minChunkZ; chunkZ <= bounds.maxChunkZ; chunkZ += 1) {
        chunks.push([chunkX, chunkZ]);
      }
    }
    return createUpdate(chunks);
  }

  private normalizeUpdate(update: VoxelLightingUpdate): StreamingLightingUpdate {
    const bounds = this.activeBounds;
    if (!bounds) return EMPTY_UPDATE;
    return createUpdate(update.changedChunks.filter(([chunkX, chunkZ]) =>
      chunkX >= bounds.minChunkX
      && chunkX <= bounds.maxChunkX
      && chunkZ >= bounds.minChunkZ
      && chunkZ <= bounds.maxChunkZ
    ));
  }
}

function createUpdate(
  chunks: ReadonlyArray<readonly [number, number]>
): StreamingLightingUpdate {
  const unique = new Map<string, readonly [number, number]>();
  for (const [chunkX, chunkZ] of chunks) {
    const safeChunkX = Math.floor(chunkX);
    const safeChunkZ = Math.floor(chunkZ);
    unique.set(streamingLightingChunkKey(safeChunkX, safeChunkZ), [safeChunkX, safeChunkZ]);
  }
  const changedChunks = [...unique.values()].sort(([firstX, firstZ], [secondX, secondZ]) =>
    firstX - secondX || firstZ - secondZ
  );
  return {
    changedChunks,
    changedChunkKeys: changedChunks.map(([chunkX, chunkZ]) =>
      streamingLightingChunkKey(chunkX, chunkZ)
    )
  };
}

function normalizeChunkBounds(bounds: StreamingLightingChunkBounds): StreamingLightingChunkBounds {
  const minChunkX = integer(bounds.minChunkX, 'minChunkX');
  const maxChunkX = integer(bounds.maxChunkX, 'maxChunkX');
  const minChunkZ = integer(bounds.minChunkZ, 'minChunkZ');
  const maxChunkZ = integer(bounds.maxChunkZ, 'maxChunkZ');
  if (minChunkX > maxChunkX) {
    throw new RangeError('minChunkX must be less than or equal to maxChunkX.');
  }
  if (minChunkZ > maxChunkZ) {
    throw new RangeError('minChunkZ must be less than or equal to maxChunkZ.');
  }
  return { minChunkX, maxChunkX, minChunkZ, maxChunkZ };
}

function integer(value: number, name: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError(`${name} must be a finite integer.`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  const result = integer(value, name);
  if (result <= 0) throw new RangeError(`${name} must be greater than zero.`);
  return result;
}

function voxelKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}
