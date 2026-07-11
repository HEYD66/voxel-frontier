import * as THREE from 'three';
import { BlockId } from './types';

export const MAX_LIGHT_LEVEL = 15;
export const TORCH_LIGHT_LEVEL = 14;
const LIGHT_UPDATE_RADIUS = MAX_LIGHT_LEVEL;

export interface VoxelLightingBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  chunkSize: number;
}

export interface VoxelLightSample {
  sky: number;
  block: number;
}

export interface VoxelLightingUpdate {
  readonly changedChunks: ReadonlyArray<readonly [number, number]>;
}

export interface VoxelDaylightUniform {
  value: number;
}

type BlockReader = (x: number, y: number, z: number) => BlockId;

interface Region {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

const SKY_SEED_OFFSETS = [
  [-1, 0, 0],
  [1, 0, 0],
  [0, 0, -1],
  [0, 0, 1]
] as const;

const BLOCK_OPACITY = new Uint8Array([
  1,  // Air
  16, // Grass
  16, // Dirt
  16, // Stone
  16, // Sand
  16, // Wood
  2,  // Leaves
  16, // Planks
  16, // Bricks
  1,  // Glass
  3,  // Water
  16, // Coal ore
  16, // Iron ore
  16, // Snow
  16, // Cobblestone
  16, // Bedrock
  16, // Crafting table
  16, // Furnace
  1,  // Torch
  1,  // Chest
  16  // Diamond ore
]);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function propagationOpacity(id: BlockId): number {
  return BLOCK_OPACITY[id] ?? 16;
}

export class VoxelLighting {
  private readonly width: number;
  private readonly depth: number;
  private readonly height: number;
  private readonly layerArea: number;
  private skyLight: Uint8Array;
  private blockLight: Uint8Array;
  private opacity: Uint8Array;
  private manualEmitters = new Map<number, number>();
  private blockEmitters = new Map<number, number>();

  constructor(
    private bounds: VoxelLightingBounds,
    private readonly getBlock: BlockReader
  ) {
    this.width = bounds.maxX - bounds.minX + 1;
    this.depth = bounds.maxZ - bounds.minZ + 1;
    this.height = bounds.maxY - bounds.minY + 1;
    this.layerArea = this.width * this.depth;
    const volume = this.layerArea * this.height;
    this.skyLight = new Uint8Array(volume);
    this.blockLight = new Uint8Array(volume);
    this.opacity = new Uint8Array(volume);
  }

  rebuild(refreshOpacity = true): void {
    if (refreshOpacity) this.refreshOpacity();
    this.refreshBlockEmitters();
    this.rebuildSkyLight();
    this.rebuildBlockLight();
  }

  shiftBounds(nextBounds: VoxelLightingBounds): boolean {
    if (!this.canShiftTo(nextBounds)) return false;
    const previousBounds = this.bounds;
    const overlap: Region = {
      minX: Math.max(previousBounds.minX, nextBounds.minX),
      maxX: Math.min(previousBounds.maxX, nextBounds.maxX),
      minY: this.bounds.minY,
      maxY: this.bounds.maxY,
      minZ: Math.max(previousBounds.minZ, nextBounds.minZ),
      maxZ: Math.min(previousBounds.maxZ, nextBounds.maxZ)
    };
    if (overlap.minX > overlap.maxX || overlap.minZ > overlap.maxZ) return false;

    const nextSkyLight = new Uint8Array(this.skyLight.length);
    const nextBlockLight = new Uint8Array(this.blockLight.length);
    const nextOpacity = new Uint8Array(this.opacity.length);
    const nextManualEmitters = this.remapEmitters(this.manualEmitters, nextBounds);
    const nextBlockEmitters = this.remapEmitters(this.blockEmitters, nextBounds);
    const copyLength = overlap.maxX - overlap.minX + 1;

    for (let y = overlap.minY; y <= overlap.maxY; y += 1) {
      for (let z = overlap.minZ; z <= overlap.maxZ; z += 1) {
        const previousIndex = this.indexOf(overlap.minX, y, z);
        const nextIndex = this.indexForBounds(nextBounds, overlap.minX, y, z);
        nextSkyLight.set(
          this.skyLight.subarray(previousIndex, previousIndex + copyLength),
          nextIndex
        );
        nextBlockLight.set(
          this.blockLight.subarray(previousIndex, previousIndex + copyLength),
          nextIndex
        );
        nextOpacity.set(
          this.opacity.subarray(previousIndex, previousIndex + copyLength),
          nextIndex
        );
      }
    }

    this.bounds = { ...nextBounds };
    this.skyLight = nextSkyLight;
    this.blockLight = nextBlockLight;
    this.opacity = nextOpacity;
    this.manualEmitters = nextManualEmitters;
    this.blockEmitters = nextBlockEmitters;
    this.refreshShiftedOpacity(overlap);

    for (const region of this.shiftedBoundaryRegions(previousBounds, nextBounds)) {
      this.rebuildSkyRegionUntracked(region);
      this.rebuildBlockRegionUntracked(region);
    }
    return true;
  }

  syncChunk(originX: number, originZ: number, blocks: Uint8Array, chunkSize: number, height: number): void {
    const safeHeight = Math.min(height, this.height);
    const baseX = originX - this.bounds.minX;
    const baseZ = originZ - this.bounds.minZ;
    for (let y = 0; y < safeHeight; y += 1) {
      for (let localZ = 0; localZ < chunkSize; localZ += 1) {
        for (let localX = 0; localX < chunkSize; localX += 1) {
          const worldLocalX = baseX + localX;
          const worldLocalZ = baseZ + localZ;
          if (worldLocalX < 0 || worldLocalX >= this.width || worldLocalZ < 0 || worldLocalZ >= this.depth) continue;
          const targetIndex = worldLocalX + this.width * worldLocalZ + this.layerArea * y;
          const sourceIndex = localX + chunkSize * (localZ + chunkSize * y);
          this.opacity[targetIndex] = propagationOpacity((blocks[sourceIndex] ?? BlockId.Air) as BlockId);
        }
      }
    }
  }

  updateBlock(x: number, y: number, z: number): VoxelLightingUpdate {
    const blockX = Math.floor(x);
    const blockY = Math.floor(y);
    const blockZ = Math.floor(z);
    const index = this.indexOf(blockX, blockY, blockZ);
    if (index < 0) return { changedChunks: [] };
    const block = this.getBlock(blockX, blockY, blockZ);
    const previousOpacity = this.opacity[index] ?? 16;
    const nextOpacity = propagationOpacity(block);
    const opacityChanged = previousOpacity !== nextOpacity;
    this.opacity[index] = nextOpacity;
    const emitterChanged = this.syncBlockEmitter(index, block);
    const skyUpdate = opacityChanged
      ? this.rebuildSkyColumn(blockX, blockZ)
      : { changedChunks: [] };
    if (!emitterChanged && (!opacityChanged || !this.hasEmitters())) return skyUpdate;
    const blockUpdate = this.rebuildBlockRegion(this.localLightRegion(blockX, blockY, blockZ));
    return this.mergeUpdates(skyUpdate, blockUpdate);
  }

  setEmitter(x: number, y: number, z: number, level = 14): VoxelLightingUpdate {
    const blockX = Math.floor(x);
    const blockY = Math.floor(y);
    const blockZ = Math.floor(z);
    const index = this.indexOf(blockX, blockY, blockZ);
    if (index < 0) return { changedChunks: [] };
    const safeLevel = Math.round(clamp(level, 0, MAX_LIGHT_LEVEL));
    if ((this.manualEmitters.get(index) ?? 0) === safeLevel) return { changedChunks: [] };
    if (safeLevel === 0) this.manualEmitters.delete(index);
    else this.manualEmitters.set(index, safeLevel);
    return this.rebuildBlockRegion(this.localLightRegion(blockX, blockY, blockZ));
  }

  removeEmitter(x: number, y: number, z: number): VoxelLightingUpdate {
    return this.setEmitter(x, y, z, 0);
  }

  getSkyLight(x: number, y: number, z: number): number {
    const index = this.indexOf(Math.floor(x), Math.floor(y), Math.floor(z));
    return index < 0 ? MAX_LIGHT_LEVEL : this.skyLight[index] ?? 0;
  }

  getBlockLight(x: number, y: number, z: number): number {
    const index = this.indexOf(Math.floor(x), Math.floor(y), Math.floor(z));
    return index < 0 ? 0 : this.blockLight[index] ?? 0;
  }

  getSample(x: number, y: number, z: number): VoxelLightSample {
    return {
      sky: this.getSkyLight(x, y, z),
      block: this.getBlockLight(x, y, z)
    };
  }

  private refreshOpacity(): void {
    for (let y = this.bounds.minY; y <= this.bounds.maxY; y += 1) {
      for (let z = this.bounds.minZ; z <= this.bounds.maxZ; z += 1) {
        for (let x = this.bounds.minX; x <= this.bounds.maxX; x += 1) {
          const index = this.indexOf(x, y, z);
          this.opacity[index] = propagationOpacity(this.getBlock(x, y, z));
        }
      }
    }
  }

  private refreshBlockEmitters(): void {
    this.blockEmitters.clear();
    for (let y = this.bounds.minY; y <= this.bounds.maxY; y += 1) {
      for (let z = this.bounds.minZ; z <= this.bounds.maxZ; z += 1) {
        for (let x = this.bounds.minX; x <= this.bounds.maxX; x += 1) {
          if (this.getBlock(x, y, z) !== BlockId.Torch) continue;
          const index = this.indexOf(x, y, z);
          if (index >= 0) this.blockEmitters.set(index, TORCH_LIGHT_LEVEL);
        }
      }
    }
  }

  private syncBlockEmitter(index: number, block: BlockId): boolean {
    const level = block === BlockId.Torch ? TORCH_LIGHT_LEVEL : 0;
    if ((this.blockEmitters.get(index) ?? 0) === level) return false;
    if (level === 0) this.blockEmitters.delete(index);
    else this.blockEmitters.set(index, level);
    return true;
  }

  private hasEmitters(): boolean {
    return this.manualEmitters.size > 0 || this.blockEmitters.size > 0;
  }

  private forEachEmitter(callback: (index: number, level: number) => void): void {
    for (const [index, level] of this.manualEmitters) callback(index, level);
    for (const [index, level] of this.blockEmitters) callback(index, level);
  }

  private rebuildSkyLight(): void {
    this.skyLight.fill(0);
    for (let z = this.bounds.minZ; z <= this.bounds.maxZ; z += 1) {
      for (let x = this.bounds.minX; x <= this.bounds.maxX; x += 1) {
        this.seedDirectSkyColumn(x, z);
      }
    }
    const buckets = this.createBuckets();
    this.seedRegionLight(this.skyLight, buckets, {
      minX: this.bounds.minX,
      maxX: this.bounds.maxX,
      minY: this.bounds.minY,
      maxY: this.bounds.maxY,
      minZ: this.bounds.minZ,
      maxZ: this.bounds.maxZ
    });
    this.propagate(this.skyLight, buckets);
  }

  private rebuildSkyColumn(x: number, z: number): VoxelLightingUpdate {
    const region: Region = {
      minX: Math.max(this.bounds.minX, x - LIGHT_UPDATE_RADIUS),
      maxX: Math.min(this.bounds.maxX, x + LIGHT_UPDATE_RADIUS),
      minY: this.bounds.minY,
      maxY: this.bounds.maxY,
      minZ: Math.max(this.bounds.minZ, z - LIGHT_UPDATE_RADIUS),
      maxZ: Math.min(this.bounds.maxZ, z + LIGHT_UPDATE_RADIUS)
    };
    return this.rebuildSkyRegion(region);
  }

  private rebuildSkyRegion(region: Region): VoxelLightingUpdate {
    const light = this.skyLight;
    const regionWidth = region.maxX - region.minX + 1;
    const regionHeight = region.maxY - region.minY + 1;
    const regionDepth = region.maxZ - region.minZ + 1;
    const previousLight = new Uint8Array(regionWidth * regionDepth * regionHeight);
    let snapshotIndex = 0;

    for (let y = region.minY; y <= region.maxY; y += 1) {
      for (let z = region.minZ; z <= region.maxZ; z += 1) {
        for (let x = region.minX; x <= region.maxX; x += 1) {
          const index = this.indexOf(x, y, z);
          previousLight[snapshotIndex] = light[index] ?? 0;
          light[index] = 0;
          snapshotIndex += 1;
        }
      }
    }

    for (let z = region.minZ; z <= region.maxZ; z += 1) {
      for (let x = region.minX; x <= region.maxX; x += 1) {
        this.seedDirectSkyColumn(x, z, region.minY, region.maxY);
      }
    }

    const buckets = this.createBuckets();
    this.seedRegionLight(light, buckets, region);
    this.seedRegionBoundary(light, buckets, region, false);
    this.propagate(light, buckets, region);

    const changedChunkKeys = new Set<string>();
    snapshotIndex = 0;
    for (let y = region.minY; y <= region.maxY; y += 1) {
      for (let z = region.minZ; z <= region.maxZ; z += 1) {
        for (let x = region.minX; x <= region.maxX; x += 1) {
          const index = this.indexOf(x, y, z);
          if (previousLight[snapshotIndex] !== light[index]) {
            this.addChangedChunks(changedChunkKeys, x, z);
          }
          snapshotIndex += 1;
        }
      }
    }

    return {
      changedChunks: [...changedChunkKeys].map((key) => {
        const [chunkX = 0, chunkZ = 0] = key.split(',').map(Number);
        return [chunkX, chunkZ] as const;
      })
    };
  }

  private rebuildSkyRegionUntracked(region: Region): void {
    this.clearLightRegion(this.skyLight, region);
    for (let z = region.minZ; z <= region.maxZ; z += 1) {
      for (let x = region.minX; x <= region.maxX; x += 1) {
        this.seedDirectSkyColumn(x, z, region.minY, region.maxY);
      }
    }
    const buckets = this.createBuckets();
    this.seedRegionLight(this.skyLight, buckets, region);
    this.seedRegionBoundary(this.skyLight, buckets, region, false);
    this.propagate(this.skyLight, buckets, region);
  }

  private rebuildBlockLight(): void {
    this.blockLight.fill(0);
    const buckets = this.createBuckets();
    this.forEachEmitter((index, level) => {
      if (level <= (this.blockLight[index] ?? 0)) return;
      this.blockLight[index] = level;
      buckets[level]!.push(index);
    });
    this.propagate(this.blockLight, buckets);
  }

  private rebuildBlockRegion(region: Region): VoxelLightingUpdate {
    const light = this.blockLight;
    const regionWidth = region.maxX - region.minX + 1;
    const regionHeight = region.maxY - region.minY + 1;
    const regionDepth = region.maxZ - region.minZ + 1;
    const regionVolume = regionWidth * regionDepth * regionHeight;
    const previousLight = new Uint8Array(regionVolume);
    let snapshotIndex = 0;

    for (let y = region.minY; y <= region.maxY; y += 1) {
      for (let z = region.minZ; z <= region.maxZ; z += 1) {
        for (let x = region.minX; x <= region.maxX; x += 1) {
          const index = this.indexOf(x, y, z);
          previousLight[snapshotIndex] = light[index] ?? 0;
          light[index] = 0;
          snapshotIndex += 1;
        }
      }
    }

    const buckets = this.createBuckets();
    this.forEachEmitter((index, level) => {
      const [x, y, z] = this.coordinatesOf(index);
      if (x < region.minX || x > region.maxX
        || y < region.minY || y > region.maxY
        || z < region.minZ || z > region.maxZ) return;
      if (level <= (light[index] ?? 0)) return;
      light[index] = level;
      buckets[level]!.push(index);
    });
    this.seedRegionBoundary(light, buckets, region, true);
    this.propagate(light, buckets, region);

    const changedChunkKeys = new Set<string>();
    snapshotIndex = 0;
    for (let y = region.minY; y <= region.maxY; y += 1) {
      for (let z = region.minZ; z <= region.maxZ; z += 1) {
        for (let x = region.minX; x <= region.maxX; x += 1) {
          const index = this.indexOf(x, y, z);
          if (previousLight[snapshotIndex] !== light[index]) {
            this.addChangedChunks(changedChunkKeys, x, z);
          }
          snapshotIndex += 1;
        }
      }
    }

    return {
      changedChunks: [...changedChunkKeys].map((key) => {
        const [chunkX = 0, chunkZ = 0] = key.split(',').map(Number);
        return [chunkX, chunkZ] as const;
      })
    };
  }

  private rebuildBlockRegionUntracked(region: Region): void {
    this.clearLightRegion(this.blockLight, region);
    const buckets = this.createBuckets();
    this.forEachEmitter((index, level) => {
      const [x, y, z] = this.coordinatesOf(index);
      if (x < region.minX || x > region.maxX
        || y < region.minY || y > region.maxY
        || z < region.minZ || z > region.maxZ) return;
      if (level <= (this.blockLight[index] ?? 0)) return;
      this.blockLight[index] = level;
      buckets[level]!.push(index);
    });
    this.seedRegionBoundary(this.blockLight, buckets, region, true);
    this.propagate(this.blockLight, buckets, region);
  }

  private clearLightRegion(light: Uint8Array, region: Region): void {
    const rowLength = region.maxX - region.minX + 1;
    for (let y = region.minY; y <= region.maxY; y += 1) {
      for (let z = region.minZ; z <= region.maxZ; z += 1) {
        const rowStart = this.indexOf(region.minX, y, z);
        light.fill(0, rowStart, rowStart + rowLength);
      }
    }
  }

  private seedDirectSkyColumn(
    x: number,
    z: number,
    minimumY = this.bounds.minY,
    maximumY = this.bounds.maxY
  ): void {
    let level = MAX_LIGHT_LEVEL;
    const columnIndex = (x - this.bounds.minX) + this.width * (z - this.bounds.minZ);
    for (let y = this.bounds.maxY; y >= minimumY; y -= 1) {
      const index = columnIndex + this.layerArea * (y - this.bounds.minY);
      const opacity = this.opacity[index] ?? 16;
      const attenuation = opacity >= MAX_LIGHT_LEVEL ? MAX_LIGHT_LEVEL : Math.max(0, opacity - 1);
      if (attenuation >= MAX_LIGHT_LEVEL) level = 0;
      else level = Math.max(0, level - attenuation);
      if (y > maximumY) continue;
      this.skyLight[index] = level;
    }
  }

  private seedRegionBoundary(
    light: Uint8Array,
    buckets: number[][],
    region: Region,
    includeVertical: boolean
  ): void {
    for (let y = region.minY; y <= region.maxY; y += 1) {
      for (let z = region.minZ; z <= region.maxZ; z += 1) {
        this.seedFromOutside(light, buckets, region.minX, y, z, -1, 0, 0, region);
        this.seedFromOutside(light, buckets, region.maxX, y, z, 1, 0, 0, region);
      }
      for (let x = region.minX; x <= region.maxX; x += 1) {
        this.seedFromOutside(light, buckets, x, y, region.minZ, 0, 0, -1, region);
        this.seedFromOutside(light, buckets, x, y, region.maxZ, 0, 0, 1, region);
      }
    }
    if (!includeVertical) return;
    for (let z = region.minZ; z <= region.maxZ; z += 1) {
      for (let x = region.minX; x <= region.maxX; x += 1) {
        this.seedFromOutside(light, buckets, x, region.minY, z, 0, -1, 0, region);
        this.seedFromOutside(light, buckets, x, region.maxY, z, 0, 1, 0, region);
      }
    }
  }

  private seedRegionLight(light: Uint8Array, buckets: number[][], region: Region): void {
    for (let y = region.minY; y <= region.maxY; y += 1) {
      for (let z = region.minZ; z <= region.maxZ; z += 1) {
        for (let x = region.minX; x <= region.maxX; x += 1) {
          const index = this.indexOf(x, y, z);
          const level = light[index] ?? 0;
          if (level <= 1 || !this.hasPropagationTarget(light, level, x, y, z, region)) continue;
          buckets[level]!.push(index);
        }
      }
    }
  }

  private hasPropagationTarget(
    light: Uint8Array,
    sourceLevel: number,
    x: number,
    y: number,
    z: number,
    region: Region
  ): boolean {
    for (const [offsetX, offsetY, offsetZ] of SKY_SEED_OFFSETS) {
      const targetX = x + offsetX;
      const targetY = y + offsetY;
      const targetZ = z + offsetZ;
      if (targetX < region.minX || targetX > region.maxX
        || targetY < region.minY || targetY > region.maxY
        || targetZ < region.minZ || targetZ > region.maxZ) continue;
      const targetIndex = this.indexOf(targetX, targetY, targetZ);
      const opacity = this.opacity[targetIndex] ?? 16;
      if (opacity >= MAX_LIGHT_LEVEL) continue;
      if (sourceLevel - opacity > (light[targetIndex] ?? 0)) return true;
    }
    return false;
  }

  private seedFromOutside(
    light: Uint8Array,
    buckets: number[][],
    x: number,
    y: number,
    z: number,
    offsetX: number,
    offsetY: number,
    offsetZ: number,
    region: Region
  ): void {
    const outsideX = x + offsetX;
    const outsideY = y + offsetY;
    const outsideZ = z + offsetZ;
    if (outsideX >= region.minX && outsideX <= region.maxX
      && outsideY >= region.minY && outsideY <= region.maxY
      && outsideZ >= region.minZ && outsideZ <= region.maxZ) return;
    const outsideIndex = this.indexOf(outsideX, outsideY, outsideZ);
    const insideIndex = this.indexOf(x, y, z);
    if (outsideIndex < 0 || insideIndex < 0) return;
    const opacity = this.opacity[insideIndex] ?? 16;
    if (opacity >= MAX_LIGHT_LEVEL) return;
    const candidate = Math.max(0, (light[outsideIndex] ?? 0) - opacity);
    if (candidate <= (light[insideIndex] ?? 0)) return;
    light[insideIndex] = candidate;
    buckets[candidate]!.push(insideIndex);
  }

  private propagate(light: Uint8Array, buckets: number[][], region?: Region): void {
    for (let level = MAX_LIGHT_LEVEL; level > 1; level -= 1) {
      const bucket = buckets[level]!;
      let index: number | undefined;
      while ((index = bucket.pop()) !== undefined) {
        if (light[index] !== level) continue;
        const localY = Math.floor(index / this.layerArea);
        const remainder = index - localY * this.layerArea;
        const localZ = Math.floor(remainder / this.width);
        const localX = remainder - localZ * this.width;
        const x = localX + this.bounds.minX;
        const y = localY + this.bounds.minY;
        const z = localZ + this.bounds.minZ;
        this.propagateTo(light, buckets, level, x - 1, y, z, region);
        this.propagateTo(light, buckets, level, x + 1, y, z, region);
        this.propagateTo(light, buckets, level, x, y - 1, z, region);
        this.propagateTo(light, buckets, level, x, y + 1, z, region);
        this.propagateTo(light, buckets, level, x, y, z - 1, region);
        this.propagateTo(light, buckets, level, x, y, z + 1, region);
      }
    }
  }

  private propagateTo(
    light: Uint8Array,
    buckets: number[][],
    sourceLevel: number,
    x: number,
    y: number,
    z: number,
    region?: Region
  ): void {
    if (region && (x < region.minX || x > region.maxX
      || y < region.minY || y > region.maxY
      || z < region.minZ || z > region.maxZ)) return;
    const index = this.indexOf(x, y, z);
    if (index < 0) return;
    const opacity = this.opacity[index] ?? 16;
    if (opacity >= MAX_LIGHT_LEVEL) return;
    const candidate = sourceLevel - opacity;
    if (candidate <= 0 || candidate <= (light[index] ?? 0)) return;
    light[index] = candidate;
    buckets[candidate]!.push(index);
  }

  private createBuckets(): number[][] {
    return Array.from({ length: MAX_LIGHT_LEVEL + 1 }, () => [] as number[]);
  }

  private localLightRegion(x: number, y: number, z: number): Region {
    return {
      minX: Math.max(this.bounds.minX, x - LIGHT_UPDATE_RADIUS),
      maxX: Math.min(this.bounds.maxX, x + LIGHT_UPDATE_RADIUS),
      minY: Math.max(this.bounds.minY, y - LIGHT_UPDATE_RADIUS),
      maxY: Math.min(this.bounds.maxY, y + LIGHT_UPDATE_RADIUS),
      minZ: Math.max(this.bounds.minZ, z - LIGHT_UPDATE_RADIUS),
      maxZ: Math.min(this.bounds.maxZ, z + LIGHT_UPDATE_RADIUS)
    };
  }

  private canShiftTo(nextBounds: VoxelLightingBounds): boolean {
    return nextBounds.maxX - nextBounds.minX + 1 === this.width
      && nextBounds.maxZ - nextBounds.minZ + 1 === this.depth
      && nextBounds.maxY - nextBounds.minY + 1 === this.height
      && nextBounds.minY === this.bounds.minY
      && nextBounds.maxY === this.bounds.maxY
      && nextBounds.chunkSize === this.bounds.chunkSize
      && (
        nextBounds.minX !== this.bounds.minX
        || nextBounds.minZ !== this.bounds.minZ
      );
  }

  private remapEmitters(
    emitters: ReadonlyMap<number, number>,
    nextBounds: VoxelLightingBounds
  ): Map<number, number> {
    const remapped = new Map<number, number>();
    for (const [index, level] of emitters) {
      const [x, y, z] = this.coordinatesOf(index);
      const nextIndex = this.indexForBounds(nextBounds, x, y, z);
      if (nextIndex >= 0) remapped.set(nextIndex, level);
    }
    return remapped;
  }

  private refreshShiftedOpacity(overlap: Region): void {
    if (this.bounds.minX < overlap.minX) {
      this.refreshOpacityRegion({
        minX: this.bounds.minX,
        maxX: overlap.minX - 1,
        minY: this.bounds.minY,
        maxY: this.bounds.maxY,
        minZ: this.bounds.minZ,
        maxZ: this.bounds.maxZ
      });
    }
    if (overlap.maxX < this.bounds.maxX) {
      this.refreshOpacityRegion({
        minX: overlap.maxX + 1,
        maxX: this.bounds.maxX,
        minY: this.bounds.minY,
        maxY: this.bounds.maxY,
        minZ: this.bounds.minZ,
        maxZ: this.bounds.maxZ
      });
    }
    if (this.bounds.minZ < overlap.minZ) {
      this.refreshOpacityRegion({
        minX: overlap.minX,
        maxX: overlap.maxX,
        minY: this.bounds.minY,
        maxY: this.bounds.maxY,
        minZ: this.bounds.minZ,
        maxZ: overlap.minZ - 1
      });
    }
    if (overlap.maxZ < this.bounds.maxZ) {
      this.refreshOpacityRegion({
        minX: overlap.minX,
        maxX: overlap.maxX,
        minY: this.bounds.minY,
        maxY: this.bounds.maxY,
        minZ: overlap.maxZ + 1,
        maxZ: this.bounds.maxZ
      });
    }
  }

  private refreshOpacityRegion(region: Region): void {
    for (let y = region.minY; y <= region.maxY; y += 1) {
      for (let z = region.minZ; z <= region.maxZ; z += 1) {
        for (let x = region.minX; x <= region.maxX; x += 1) {
          const index = this.indexOf(x, y, z);
          const block = this.getBlock(x, y, z);
          this.opacity[index] = propagationOpacity(block);
          this.syncBlockEmitter(index, block);
        }
      }
    }
  }

  private shiftedBoundaryRegions(
    previousBounds: VoxelLightingBounds,
    nextBounds: VoxelLightingBounds
  ): Region[] {
    const xRegions: Region[] = [];
    const zRegions: Region[] = [];
    if (previousBounds.minX !== nextBounds.minX) {
      xRegions.push({
        minX: nextBounds.minX,
        maxX: Math.min(
          nextBounds.maxX,
          Math.max(previousBounds.minX, nextBounds.minX) + LIGHT_UPDATE_RADIUS
        ),
        minY: nextBounds.minY,
        maxY: nextBounds.maxY,
        minZ: nextBounds.minZ,
        maxZ: nextBounds.maxZ
      });
    }
    if (previousBounds.maxX !== nextBounds.maxX) {
      xRegions.push({
        minX: Math.max(
          nextBounds.minX,
          Math.min(previousBounds.maxX, nextBounds.maxX) - LIGHT_UPDATE_RADIUS
        ),
        maxX: nextBounds.maxX,
        minY: nextBounds.minY,
        maxY: nextBounds.maxY,
        minZ: nextBounds.minZ,
        maxZ: nextBounds.maxZ
      });
    }
    if (previousBounds.minZ !== nextBounds.minZ) {
      zRegions.push({
        minX: nextBounds.minX,
        maxX: nextBounds.maxX,
        minY: nextBounds.minY,
        maxY: nextBounds.maxY,
        minZ: nextBounds.minZ,
        maxZ: Math.min(
          nextBounds.maxZ,
          Math.max(previousBounds.minZ, nextBounds.minZ) + LIGHT_UPDATE_RADIUS
        )
      });
    }
    if (previousBounds.maxZ !== nextBounds.maxZ) {
      zRegions.push({
        minX: nextBounds.minX,
        maxX: nextBounds.maxX,
        minY: nextBounds.minY,
        maxY: nextBounds.maxY,
        minZ: Math.max(
          nextBounds.minZ,
          Math.min(previousBounds.maxZ, nextBounds.maxZ) - LIGHT_UPDATE_RADIUS
        ),
        maxZ: nextBounds.maxZ
      });
    }
    return [
      ...mergeXRegions(xRegions),
      ...mergeZRegions(zRegions)
    ];
  }

  private indexForBounds(
    bounds: VoxelLightingBounds,
    x: number,
    y: number,
    z: number
  ): number {
    if (x < bounds.minX || x > bounds.maxX
      || z < bounds.minZ || z > bounds.maxZ
      || y < bounds.minY || y > bounds.maxY) return -1;
    const localX = x - bounds.minX;
    const localY = y - bounds.minY;
    const localZ = z - bounds.minZ;
    return localX + this.width * localZ + this.layerArea * localY;
  }

  private mergeUpdates(first: VoxelLightingUpdate, second: VoxelLightingUpdate): VoxelLightingUpdate {
    const keys = new Set<string>();
    for (const [x, z] of first.changedChunks) keys.add(`${x},${z}`);
    for (const [x, z] of second.changedChunks) keys.add(`${x},${z}`);
    return {
      changedChunks: [...keys].map((key) => {
        const [chunkX = 0, chunkZ = 0] = key.split(',').map(Number);
        return [chunkX, chunkZ] as const;
      })
    };
  }

  private addChangedChunks(keys: Set<string>, x: number, z: number): void {
    const chunkX = Math.floor(x / this.bounds.chunkSize);
    const chunkZ = Math.floor(z / this.bounds.chunkSize);
    keys.add(`${chunkX},${chunkZ}`);
    keys.add(`${Math.floor((x - 1) / this.bounds.chunkSize)},${chunkZ}`);
    keys.add(`${Math.floor((x + 1) / this.bounds.chunkSize)},${chunkZ}`);
    keys.add(`${chunkX},${Math.floor((z - 1) / this.bounds.chunkSize)}`);
    keys.add(`${chunkX},${Math.floor((z + 1) / this.bounds.chunkSize)}`);
  }

  private indexOf(x: number, y: number, z: number): number {
    if (x < this.bounds.minX || x > this.bounds.maxX
      || z < this.bounds.minZ || z > this.bounds.maxZ
      || y < this.bounds.minY || y > this.bounds.maxY) return -1;
    const localX = x - this.bounds.minX;
    const localY = y - this.bounds.minY;
    const localZ = z - this.bounds.minZ;
    return localX + this.width * localZ + this.layerArea * localY;
  }

  private coordinatesOf(index: number): [number, number, number] {
    const localY = Math.floor(index / this.layerArea);
    const remainder = index - localY * this.layerArea;
    const localZ = Math.floor(remainder / this.width);
    const localX = remainder - localZ * this.width;
    return [
      localX + this.bounds.minX,
      localY + this.bounds.minY,
      localZ + this.bounds.minZ
    ];
  }
}

function mergeXRegions(regions: Region[]): Region[] {
  if (regions.length < 2) return regions;
  const [first, second] = regions;
  if (!first || !second || first.maxX + 1 < second.minX) return regions;
  return [{
    minX: Math.min(first.minX, second.minX),
    maxX: Math.max(first.maxX, second.maxX),
    minY: first.minY,
    maxY: first.maxY,
    minZ: first.minZ,
    maxZ: first.maxZ
  }];
}

function mergeZRegions(regions: Region[]): Region[] {
  if (regions.length < 2) return regions;
  const [first, second] = regions;
  if (!first || !second || first.maxZ + 1 < second.minZ) return regions;
  return [{
    minX: first.minX,
    maxX: first.maxX,
    minY: first.minY,
    maxY: first.maxY,
    minZ: Math.min(first.minZ, second.minZ),
    maxZ: Math.max(first.maxZ, second.maxZ)
  }];
}

export function installVoxelLightingShader(
  material: THREE.MeshLambertMaterial,
  daylightUniform: VoxelDaylightUniform
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.voxelDaylight = daylightUniform;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <color_pars_vertex>',
        `#include <color_pars_vertex>
attribute vec3 voxelLight;
varying vec3 vVoxelLight;`
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
vVoxelLight = voxelLight;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <color_pars_fragment>',
        `#include <color_pars_fragment>
uniform float voxelDaylight;
varying vec3 vVoxelLight;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
vec3 voxelBaseColor = diffuseColor.rgb * vVoxelLight.x;
float voxelSky = clamp(vVoxelLight.y * voxelDaylight, 0.0, 1.0);
float voxelDiffuse = mix(0.09, 1.0, voxelSky);
diffuseColor.rgb = voxelBaseColor * voxelDiffuse;`
      )
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        `vec3 voxelWarmLight = vec3(1.0, 0.47, 0.18) * pow(clamp(vVoxelLight.z, 0.0, 1.0), 1.25);
vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance + voxelBaseColor * voxelWarmLight * 1.35;`
      );
  };
  material.customProgramCacheKey = () => 'voxel-lighting-v1';
  material.needsUpdate = true;
}
