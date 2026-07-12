import * as THREE from 'three';
import {
  blockFullyOccludesNeighborFace,
  getBlockWorldCollisionBoxes,
  raycastBlockShape,
  type Aabb,
  type ChestConnectionOffset
} from './block-shapes';
import {
  BLOCK_ATLAS_LAYOUT,
  BLOCK_ATLAS_WATER_TILE,
  createBlockTextureAtlas,
  getBlockDefinition
} from './blocks';
import {
  MAX_LIGHT_LEVEL,
  installVoxelLightingShader,
  type VoxelDaylightUniform,
  type VoxelLightSample
} from './lighting';
import { ChunkStreamPlanner, type ChunkStreamPlan } from './chunk-streamer';
import { StreamingLighting } from './streaming-lighting';
import { BlockId, isBlockId, type BlockFace, type BlockHit, type WorldSave } from './types';
import {
  sampleVoxelVertexAo,
  shouldFlipVoxelAoDiagonal,
  type VoxelOcclusionQuery
} from './voxel-ao';
import {
  ProceduralWaterAnimator,
  type WaterAnimationQuality
} from './water-animation';
import {
  GENERATED_CHUNK_SIZE,
  GENERATED_SEA_LEVEL,
  GENERATED_WORLD_HEIGHT,
  generateChunk,
  sampleGeneratedBlock
} from './world-generator';

export const CHUNK_SIZE = GENERATED_CHUNK_SIZE;
export const WORLD_HEIGHT = GENERATED_WORLD_HEIGHT;
export const WORLD_MIN_COORDINATE = -29_999_984;
export const WORLD_MAX_COORDINATE = 29_999_984;
export const WORLD_MIN_CHUNK = Math.floor(WORLD_MIN_COORDINATE / CHUNK_SIZE);
export const WORLD_MAX_CHUNK = Math.floor(WORLD_MAX_COORDINATE / CHUNK_SIZE);
export const SEA_LEVEL = GENERATED_SEA_LEVEL;

export type ChestConnectionResolver = (
  x: number,
  y: number,
  z: number
) => ChestConnectionOffset | null | undefined;

export const WATER_SURFACE_HEIGHT = 0.86;
const DEFAULT_INITIAL_RENDER_DISTANCE = 2;

export interface VoxelWorldStreamingState {
  readonly focus: { x: number; z: number } | null;
  readonly anchor: { x: number; z: number } | null;
  readonly visibleRadius: number;
  readonly loadedCount: number;
  readonly visibleCount: number;
  readonly loadedKeys: readonly string[];
  readonly visibleKeys: readonly string[];
}

export function shouldRenderVoxelFace(id: BlockId, neighborId: BlockId): boolean {
  if (neighborId === BlockId.Air) return true;
  if (neighborId === BlockId.Torch && id !== BlockId.Torch) return true;
  const definition = getBlockDefinition(id);
  const neighbor = getBlockDefinition(neighborId);
  if (definition.transparent && neighbor.transparent) {
    return neighborId !== id && id > neighborId;
  }
  return !blockFullyOccludesNeighborFace(neighborId);
}

interface ChunkColumn {
  readonly x: number;
  readonly z: number;
  readonly blocks: Uint8Array;
  baseBlocks: Uint8Array;
  opaqueMesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material> | null;
  transparentMesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material> | null;
}

interface GeometryBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  lights: number[];
  indices: number[];
}

interface FaceDescription {
  readonly direction: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly corners: readonly (readonly [number, number, number])[];
  readonly face: BlockFace;
  readonly shade: number;
}

const FACES: readonly FaceDescription[] = [
  {
    direction: [1, 0, 0],
    normal: [1, 0, 0],
    corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
    face: 'side',
    shade: 0.88
  },
  {
    direction: [-1, 0, 0],
    normal: [-1, 0, 0],
    corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
    face: 'side',
    shade: 0.72
  },
  {
    direction: [0, 1, 0],
    normal: [0, 1, 0],
    corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
    face: 'top',
    shade: 1
  },
  {
    direction: [0, -1, 0],
    normal: [0, -1, 0],
    corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    face: 'bottom',
    shade: 0.55
  },
  {
    direction: [0, 0, 1],
    normal: [0, 0, 1],
    corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
    face: 'side',
    shade: 0.82
  },
  {
    direction: [0, 0, -1],
    normal: [0, 0, -1],
    corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
    face: 'front',
    shade: 0.68
  }
] as const;

const FACE_UVS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, 1],
  [1, 1],
  [1, 0]
] as const;

function chunkKey(chunkX: number, chunkZ: number): string {
  return `${chunkX},${chunkZ}`;
}

function editKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function localIndex(localX: number, y: number, localZ: number): number {
  return localX + CHUNK_SIZE * (localZ + CHUNK_SIZE * y);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeRenderDistance(value: number): number {
  const finite = Number.isFinite(value) ? value : DEFAULT_INITIAL_RENDER_DISTANCE;
  return Math.max(0, Math.min(12, Math.floor(finite)));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function hash3(x: number, y: number, z: number, seed: number): number {
  let hash = seed | 0;
  hash = Math.imul(hash ^ (x | 0), 0x27d4eb2d);
  hash = Math.imul(hash ^ (y | 0), 0x165667b1);
  hash = Math.imul(hash ^ (z | 0), 0x1b873593);
  hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
  return (hash ^ (hash >>> 13)) >>> 0;
}

function createBuffers(): GeometryBuffers {
  return {
    positions: [],
    normals: [],
    uvs: [],
    lights: [],
    indices: []
  };
}

function isBlendedBlock(id: BlockId): boolean {
  return id === BlockId.Glass || id === BlockId.Water;
}

export class VoxelWorld extends THREE.Group {
  readonly seed: number;

  private readonly chunks = new Map<string, ChunkColumn>();
  private readonly edits = new Map<string, [number, number, number, BlockId]>();
  private readonly editsByChunk = new Map<string, Map<string, [number, number, number, BlockId]>>();
  private readonly atlas: THREE.CanvasTexture;
  private readonly waterAnimator: ProceduralWaterAnimator;
  private readonly opaqueMaterial: THREE.MeshLambertMaterial;
  private readonly transparentMaterial: THREE.MeshLambertMaterial;
  private readonly daylightUniform: VoxelDaylightUniform = { value: 1 };
  private readonly streamPlanner: ChunkStreamPlanner;
  private readonly lighting: StreamingLighting;
  private readonly pendingBlockUpdateChunks = new Set<string>();
  private blockUpdateBatchDepth = 0;
  private visibleChunkKeys = new Set<string>();
  private chestConnectionResolver: ChestConnectionResolver | null = null;
  private disposed = false;

  constructor(
    seed: number,
    initialRenderDistance = DEFAULT_INITIAL_RENDER_DISTANCE,
    initialFocus = new THREE.Vector3()
  ) {
    super();
    this.name = 'Voxel world';
    this.seed = Number.isFinite(seed) ? seed | 0 : 0;

    this.atlas = createBlockTextureAtlas();
    this.waterAnimator = new ProceduralWaterAnimator(
      this.atlas,
      BLOCK_ATLAS_WATER_TILE,
      BLOCK_ATLAS_LAYOUT
    );
    this.opaqueMaterial = new THREE.MeshLambertMaterial({
      name: 'Block terrain',
      map: this.atlas,
      alphaTest: 0.45
    });
    this.transparentMaterial = new THREE.MeshLambertMaterial({
      name: 'Water and glass',
      map: this.atlas,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      alphaTest: 0.02,
      side: THREE.DoubleSide
    });
    installVoxelLightingShader(this.opaqueMaterial, this.daylightUniform);
    installVoxelLightingShader(this.transparentMaterial, this.daylightUniform);

    const initialRadius = normalizeRenderDistance(initialRenderDistance);
    this.streamPlanner = new ChunkStreamPlanner({
      visibleRadius: initialRadius,
      halo: 1,
      chunkSize: CHUNK_SIZE
    });
    this.lighting = new StreamingLighting({
      chunkSize: CHUNK_SIZE,
      minY: 0,
      maxY: WORLD_HEIGHT - 1,
      getBlock: (x, y, z) => this.getBlock(x, y, z)
    });
    this.applyStreamingPlan(this.streamPlanner.planForBlock(
      Number.isFinite(initialFocus.x) ? initialFocus.x : 0,
      Number.isFinite(initialFocus.z) ? initialFocus.z : 0,
      initialRadius
    ));
  }

  getBlock(x: number, y: number, z: number): BlockId {
    const blockX = Math.floor(x);
    const blockY = Math.floor(y);
    const blockZ = Math.floor(z);
    if (!this.isInsideWorld(blockX, blockY, blockZ)) return BlockId.Air;

    const chunkX = Math.floor(blockX / CHUNK_SIZE);
    const chunkZ = Math.floor(blockZ / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(chunkX, chunkZ));
    if (chunk) {
      const localX = positiveModulo(blockX, CHUNK_SIZE);
      const localZ = positiveModulo(blockZ, CHUNK_SIZE);
      return (chunk.blocks[localIndex(localX, blockY, localZ)] ?? BlockId.Air) as BlockId;
    }

    const edit = this.edits.get(editKey(blockX, blockY, blockZ));
    if (edit) return edit[3];
    return sampleGeneratedBlock(this.seed, blockX, blockY, blockZ);
  }

  setBlock(x: number, y: number, z: number, id: BlockId): boolean {
    const blockX = Math.floor(x);
    const blockY = Math.floor(y);
    const blockZ = Math.floor(z);
    if (!this.isInsideWorld(blockX, blockY, blockZ)) return false;

    const safeId = isBlockId(id) ? id : BlockId.Air;
    const chunkX = Math.floor(blockX / CHUNK_SIZE);
    const chunkZ = Math.floor(blockZ / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(chunkX, chunkZ));
    const localX = positiveModulo(blockX, CHUNK_SIZE);
    const localZ = positiveModulo(blockZ, CHUNK_SIZE);
    const index = localIndex(localX, blockY, localZ);
    const currentId = chunk
      ? (chunk.blocks[index] ?? BlockId.Air) as BlockId
      : this.getBlock(blockX, blockY, blockZ);
    if (currentId === safeId) return false;
    if (chunk) chunk.blocks[index] = safeId;

    const key = editKey(blockX, blockY, blockZ);
    const generatedId = chunk
      ? (chunk.baseBlocks[index] ?? BlockId.Air) as BlockId
      : sampleGeneratedBlock(this.seed, blockX, blockY, blockZ);
    if (generatedId === safeId) this.deleteEdit(key, chunkX, chunkZ);
    else this.storeEdit([blockX, blockY, blockZ, safeId], chunkX, chunkZ);

    if (!chunk) return true;
    const lightingUpdate = this.lighting.updateBlock(blockX, blockY, blockZ);
    if (this.blockUpdateBatchDepth > 0) {
      this.addAffectedChunkKeys(this.pendingBlockUpdateChunks, chunkX, chunkZ, localX, localZ);
      for (const [lightChunkX, lightChunkZ] of lightingUpdate.changedChunks) {
        this.pendingBlockUpdateChunks.add(chunkKey(lightChunkX, lightChunkZ));
      }
    } else {
      this.rebuildAffectedChunks(chunkX, chunkZ, localX, localZ, lightingUpdate.changedChunks);
    }
    return true;
  }

  batchBlockUpdates<T>(callback: () => T): T {
    this.blockUpdateBatchDepth += 1;
    try {
      return callback();
    } finally {
      this.blockUpdateBatchDepth -= 1;
      if (this.blockUpdateBatchDepth === 0) this.flushBlockUpdateBatch();
    }
  }

  setDaylight(daylight: number): void {
    this.daylightUniform.value = clamp(Number.isFinite(daylight) ? daylight : 1, 0, 1);
  }

  getDaylight(): number {
    return this.daylightUniform.value;
  }

  updateVisuals(deltaTime: number): void {
    if (this.disposed) return;
    this.waterAnimator.update(deltaTime);
  }

  setVisualQuality(quality: WaterAnimationQuality): void {
    this.waterAnimator.setQuality(quality);
  }

  setLocalLight(x: number, y: number, z: number, level = 14): void {
    const update = this.lighting.setEmitter(x, y, z, level);
    this.rebuildLightingChunks(update.changedChunks);
  }

  removeLocalLight(x: number, y: number, z: number): void {
    const update = this.lighting.removeEmitter(x, y, z);
    this.rebuildLightingChunks(update.changedChunks);
  }

  getLightLevel(x: number, y: number, z: number): VoxelLightSample {
    return this.lighting.getSample(x, y, z);
  }

  setChestConnectionResolver(resolver: ChestConnectionResolver | null): void {
    this.chestConnectionResolver = resolver;
  }

  getBlockCollisionBoxes(x: number, y: number, z: number, id?: BlockId): Aabb[] {
    const blockX = Math.floor(x);
    const blockY = Math.floor(y);
    const blockZ = Math.floor(z);
    const blockId = id ?? this.getBlock(blockX, blockY, blockZ);
    const connection = blockId === BlockId.Chest
      ? this.resolveChestConnection(blockX, blockY, blockZ)
      : null;
    return getBlockWorldCollisionBoxes(blockId, blockX, blockY, blockZ, connection);
  }

  isSolid(id: BlockId): boolean;
  isSolid(x: number, y: number, z: number): boolean;
  isSolid(xOrId: number, y?: number, z?: number): boolean {
    const id = y === undefined || z === undefined
      ? xOrId as BlockId
      : this.getBlock(xOrId, y, z);
    return getBlockDefinition(id).solid;
  }

  isLiquid(id: BlockId): boolean;
  isLiquid(x: number, y: number, z: number): boolean;
  isLiquid(xOrId: number, y?: number, z?: number): boolean {
    const id = y === undefined || z === undefined
      ? xOrId as BlockId
      : this.getBlock(xOrId, y, z);
    return getBlockDefinition(id).liquid === true;
  }

  getSpawnPoint(): THREE.Vector3 {
    for (let radius = 0; radius <= 24; radius += 1) {
      for (let z = -radius; z <= radius; z += 1) {
        for (let x = -radius; x <= radius; x += 1) {
          if (radius > 0 && Math.abs(x) !== radius && Math.abs(z) !== radius) continue;
          const surfaceY = this.findWalkableSurface(x, z);
          if (surfaceY !== null) return new THREE.Vector3(x + 0.5, surfaceY + 1.01, z + 0.5);
        }
      }
    }
    return new THREE.Vector3(0.5, WORLD_HEIGHT - 2, 0.5);
  }

  setRenderDistance(chunkRadius: number, focus: THREE.Vector3): void {
    const radius = normalizeRenderDistance(chunkRadius);
    const safeX = Number.isFinite(focus.x) ? focus.x : 0;
    const safeZ = Number.isFinite(focus.z) ? focus.z : 0;
    const currentFocus = this.streamPlanner.focus;
    const nextFocusX = Math.floor(safeX / CHUNK_SIZE);
    const nextFocusZ = Math.floor(safeZ / CHUNK_SIZE);
    if (
      radius === this.streamPlanner.visibleRadius &&
      currentFocus?.x === nextFocusX &&
      currentFocus.z === nextFocusZ
    ) return;
    this.applyStreamingPlan(this.streamPlanner.planForBlock(safeX, safeZ, radius));
  }

  getStreamingState(): VoxelWorldStreamingState {
    return {
      focus: this.streamPlanner.focus,
      anchor: this.streamPlanner.anchor,
      visibleRadius: this.streamPlanner.visibleRadius,
      loadedCount: this.chunks.size,
      visibleCount: this.visibleChunkKeys.size,
      loadedKeys: [...this.chunks.keys()].sort(),
      visibleKeys: [...this.visibleChunkKeys].sort()
    };
  }

  override raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void;
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance?: number): BlockHit | null;
  override raycast(
    originOrRaycaster: THREE.Vector3 | THREE.Raycaster,
    directionOrIntersects: THREE.Vector3 | THREE.Intersection[],
    maxDistance = 6
  ): BlockHit | null | void {
    if (originOrRaycaster instanceof THREE.Raycaster) {
      super.raycast(originOrRaycaster, directionOrIntersects as THREE.Intersection[]);
      return;
    }
    const origin = originOrRaycaster;
    const direction = directionOrIntersects as THREE.Vector3;
    const directionLength = direction.length();
    if (directionLength <= Number.EPSILON || maxDistance < 0) return null;

    const dx = direction.x / directionLength;
    const dy = direction.y / directionLength;
    const dz = direction.z / directionLength;
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const stepZ = Math.sign(dz);
    const deltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dx);
    const deltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dy);
    const deltaZ = stepZ === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dz);
    let maxX = stepX > 0 ? (x + 1 - origin.x) / dx : stepX < 0 ? (origin.x - x) / -dx : Number.POSITIVE_INFINITY;
    let maxY = stepY > 0 ? (y + 1 - origin.y) / dy : stepY < 0 ? (origin.y - y) / -dy : Number.POSITIVE_INFINITY;
    let maxZ = stepZ > 0 ? (z + 1 - origin.z) / dz : stepZ < 0 ? (origin.z - z) / -dz : Number.POSITIVE_INFINITY;
    let distance = 0;
    const normal = new THREE.Vector3();

    while (distance <= maxDistance) {
      const id = this.getBlock(x, y, z);
      if (id !== BlockId.Air && !this.isLiquid(id)) {
        if (id === BlockId.Chest) {
          const shapeHit = raycastBlockShape(
            id,
            x,
            y,
            z,
            origin,
            { x: dx, y: dy, z: dz },
            maxDistance,
            this.resolveChestConnection(x, y, z)
          );
          if (shapeHit) {
            const block = new THREE.Vector3(x, y, z);
            const shapeNormal = new THREE.Vector3(
              shapeHit.normal.x,
              shapeHit.normal.y,
              shapeHit.normal.z
            );
            return {
              block,
              adjacent: block.clone().add(shapeNormal),
              normal: shapeNormal,
              distance: shapeHit.distance,
              id
            };
          }
        } else {
          const block = new THREE.Vector3(x, y, z);
          return {
            block,
            adjacent: block.clone().add(normal),
            normal: normal.clone(),
            distance,
            id
          };
        }
      }

      if (maxX <= maxY && maxX <= maxZ) {
        distance = maxX;
        if (distance > maxDistance) break;
        x += stepX;
        maxX += deltaX;
        normal.set(-stepX, 0, 0);
      } else if (maxY <= maxZ) {
        distance = maxY;
        if (distance > maxDistance) break;
        y += stepY;
        maxY += deltaY;
        normal.set(0, -stepY, 0);
      } else {
        distance = maxZ;
        if (distance > maxDistance) break;
        z += stepZ;
        maxZ += deltaZ;
        normal.set(0, 0, -stepZ);
      }
    }
    return null;
  }

  serializeEdits(): WorldSave['edits'] {
    return [...this.edits.values()]
      .map(([x, y, z, id]) => [x, y, z, id] as [number, number, number, BlockId])
      .sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  }

  loadEdits(edits: ReadonlyArray<readonly [number, number, number, BlockId]>): void {
    this.edits.clear();
    this.editsByChunk.clear();

    for (const edit of edits) {
      const x = Math.floor(edit[0]);
      const y = Math.floor(edit[1]);
      const z = Math.floor(edit[2]);
      const id = edit[3];
      if (!this.isInsideWorld(x, y, z) || !isBlockId(id)) continue;
      const chunkX = Math.floor(x / CHUNK_SIZE);
      const chunkZ = Math.floor(z / CHUNK_SIZE);
      const key = editKey(x, y, z);
      if (sampleGeneratedBlock(this.seed, x, y, z) === id) this.deleteEdit(key, chunkX, chunkZ);
      else this.storeEdit([x, y, z, id], chunkX, chunkZ);
    }

    // Support checks must observe the complete incoming edit batch, including
    // edits inside chunks that were already resident before this load.
    for (const chunk of this.chunks.values()) this.resetLoadedChunkBlocks(chunk);

    const unsupportedTorches = [...this.edits.values()].filter(([x, y, z, id]) => (
      id === BlockId.Torch && !this.hasTorchSupport(x, y, z)
    ));
    for (const [x, y, z] of unsupportedTorches) {
      const chunkX = Math.floor(x / CHUNK_SIZE);
      const chunkZ = Math.floor(z / CHUNK_SIZE);
      this.deleteEdit(editKey(x, y, z), chunkX, chunkZ);
    }

    for (const chunk of this.chunks.values()) this.resetLoadedChunkBlocks(chunk);
    this.lighting.rebuild();
    this.rebuildAllChunks();
  }

  private hasTorchSupport(x: number, y: number, z: number): boolean {
    return (
      this.isSolid(x, y - 1, z) ||
      this.isSolid(x - 1, y, z) ||
      this.isSolid(x + 1, y, z) ||
      this.isSolid(x, y, z - 1) ||
      this.isSolid(x, y, z + 1)
    );
  }

  private resolveChestConnection(x: number, y: number, z: number): ChestConnectionOffset | null {
    const connection = this.chestConnectionResolver?.(x, y, z);
    if (!connection) return null;
    const validOffset =
      (Math.abs(connection.dx) === 1 && connection.dz === 0) ||
      (connection.dx === 0 && Math.abs(connection.dz) === 1);
    if (!validOffset) return null;
    if (this.getBlock(x + connection.dx, y, z + connection.dz) !== BlockId.Chest) return null;
    return { dx: connection.dx, dz: connection.dz };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const chunk of this.chunks.values()) this.removeChunkMeshes(chunk);
    this.chunks.clear();
    this.edits.clear();
    this.editsByChunk.clear();
    this.visibleChunkKeys.clear();
    this.streamPlanner.reset();
    this.opaqueMaterial.dispose();
    this.transparentMaterial.dispose();
    this.atlas.dispose();
    this.clear();
  }

  private applyStreamingPlan(plan: ChunkStreamPlan): void {
    const previousVisible = this.visibleChunkKeys;
    for (const chunk of plan.unloads) this.unloadChunk(chunk.x, chunk.z);
    for (const chunk of plan.loads) this.loadChunk(chunk.x, chunk.z);
    this.visibleChunkKeys = new Set(plan.visibleKeys);

    if (plan.anchorChanged || plan.radiusChanged || !this.lighting.chunkBounds) {
      this.lighting.reset({
        minChunkX: plan.anchor.x - plan.simulationRadius,
        maxChunkX: plan.anchor.x + plan.simulationRadius,
        minChunkZ: plan.anchor.z - plan.simulationRadius,
        maxChunkZ: plan.anchor.z + plan.simulationRadius
      });
    }

    for (const key of previousVisible) {
      if (this.visibleChunkKeys.has(key)) continue;
      const chunk = this.chunks.get(key);
      if (chunk) this.removeChunkMeshes(chunk);
    }
    for (const key of this.visibleChunkKeys) {
      if (previousVisible.has(key)) continue;
      const chunk = this.chunks.get(key);
      if (chunk) this.rebuildChunk(chunk);
    }
  }

  private loadChunk(chunkX: number, chunkZ: number): ChunkColumn {
    const key = chunkKey(chunkX, chunkZ);
    const existing = this.chunks.get(key);
    if (existing) return existing;
    const generated = generateChunk(this.seed, chunkX, chunkZ);
    const chunk: ChunkColumn = {
      x: chunkX,
      z: chunkZ,
      blocks: generated.blocks.slice(),
      baseBlocks: generated.blocks,
      opaqueMesh: null,
      transparentMesh: null
    };
    this.chunks.set(key, chunk);
    this.applyChunkEdits(chunk);
    return chunk;
  }

  private unloadChunk(chunkX: number, chunkZ: number): void {
    const key = chunkKey(chunkX, chunkZ);
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    this.removeChunkMeshes(chunk);
    this.chunks.delete(key);
  }

  private resetLoadedChunkBlocks(chunk: ChunkColumn): void {
    chunk.blocks.set(chunk.baseBlocks);
    this.applyChunkEdits(chunk);
  }

  private applyChunkEdits(chunk: ChunkColumn): void {
    const edits = this.editsByChunk.get(chunkKey(chunk.x, chunk.z));
    if (!edits) return;
    for (const [x, y, z, id] of edits.values()) {
      chunk.blocks[localIndex(
        positiveModulo(x, CHUNK_SIZE),
        y,
        positiveModulo(z, CHUNK_SIZE)
      )] = id;
    }
  }

  private storeEdit(
    edit: [number, number, number, BlockId],
    chunkX: number,
    chunkZ: number
  ): void {
    const key = editKey(edit[0], edit[1], edit[2]);
    this.edits.set(key, edit);
    const keyForChunk = chunkKey(chunkX, chunkZ);
    let chunkEdits = this.editsByChunk.get(keyForChunk);
    if (!chunkEdits) {
      chunkEdits = new Map();
      this.editsByChunk.set(keyForChunk, chunkEdits);
    }
    chunkEdits.set(key, edit);
  }

  private deleteEdit(key: string, chunkX: number, chunkZ: number): void {
    this.edits.delete(key);
    const keyForChunk = chunkKey(chunkX, chunkZ);
    const chunkEdits = this.editsByChunk.get(keyForChunk);
    if (!chunkEdits) return;
    chunkEdits.delete(key);
    if (chunkEdits.size === 0) this.editsByChunk.delete(keyForChunk);
  }

  private findWalkableSurface(x: number, z: number): number | null {
    for (let y = WORLD_HEIGHT - 3; y >= 1; y -= 1) {
      const id = this.getBlock(x, y, z);
      if (id !== BlockId.Grass && id !== BlockId.Sand && id !== BlockId.Snow && id !== BlockId.Stone) continue;
      if (this.getBlock(x, y + 1, z) !== BlockId.Air || this.getBlock(x, y + 2, z) !== BlockId.Air) continue;
      return y;
    }
    return null;
  }

  private isInsideWorld(x: number, y: number, z: number): boolean {
    return x >= WORLD_MIN_COORDINATE && x <= WORLD_MAX_COORDINATE
      && z >= WORLD_MIN_COORDINATE && z <= WORLD_MAX_COORDINATE
      && y >= 0 && y < WORLD_HEIGHT;
  }

  private rebuildAllChunks(): void {
    for (const chunk of this.chunks.values()) {
      if (this.isChunkVisible(chunk.x, chunk.z)) this.rebuildChunk(chunk);
      else this.removeChunkMeshes(chunk);
    }
  }

  private rebuildAffectedChunks(
    chunkX: number,
    chunkZ: number,
    localX: number,
    localZ: number,
    lightingChunks: ReadonlyArray<readonly [number, number]>
  ): void {
    const keys = new Set<string>();
    this.addAffectedChunkKeys(keys, chunkX, chunkZ, localX, localZ);
    for (const [lightChunkX, lightChunkZ] of lightingChunks) keys.add(chunkKey(lightChunkX, lightChunkZ));
    for (const key of keys) {
      const chunk = this.chunks.get(key);
      if (chunk && this.visibleChunkKeys.has(key)) this.rebuildChunk(chunk);
    }
  }

  private flushBlockUpdateBatch(): void {
    if (this.pendingBlockUpdateChunks.size === 0) return;
    const keys = [...this.pendingBlockUpdateChunks];
    this.pendingBlockUpdateChunks.clear();
    for (const key of keys) {
      const chunk = this.chunks.get(key);
      if (chunk && this.visibleChunkKeys.has(key)) this.rebuildChunk(chunk);
    }
  }

  private rebuildLightingChunks(chunks: ReadonlyArray<readonly [number, number]>): void {
    const rebuilt = new Set<string>();
    for (const [chunkX, chunkZ] of chunks) {
      const key = chunkKey(chunkX, chunkZ);
      if (rebuilt.has(key)) continue;
      rebuilt.add(key);
      const chunk = this.chunks.get(key);
      if (chunk && this.visibleChunkKeys.has(key)) this.rebuildChunk(chunk);
    }
  }

  private addAffectedChunkKeys(keys: Set<string>, chunkX: number, chunkZ: number, localX: number, localZ: number): void {
    keys.add(chunkKey(chunkX, chunkZ));
    if (localX === 0) keys.add(chunkKey(chunkX - 1, chunkZ));
    if (localX === CHUNK_SIZE - 1) keys.add(chunkKey(chunkX + 1, chunkZ));
    if (localZ === 0) keys.add(chunkKey(chunkX, chunkZ - 1));
    if (localZ === CHUNK_SIZE - 1) keys.add(chunkKey(chunkX, chunkZ + 1));
  }

  private rebuildChunk(chunk: ChunkColumn): void {
    this.removeChunkMeshes(chunk);
    if (!this.isChunkVisible(chunk.x, chunk.z)) return;
    const opaque = createBuffers();
    const transparent = createBuffers();
    const isAoOccluding = this.createChunkAoOcclusionQuery(chunk);

    for (let y = 0; y < WORLD_HEIGHT; y += 1) {
      for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) {
        for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
          const id = (chunk.blocks[localIndex(localX, y, localZ)] ?? BlockId.Air) as BlockId;
          if (id === BlockId.Air || id === BlockId.Chest) continue;
          const worldX = chunk.x * CHUNK_SIZE + localX;
          const worldZ = chunk.z * CHUNK_SIZE + localZ;
          const buffers = isBlendedBlock(id) ? transparent : opaque;
          const isWaterSurface = id === BlockId.Water
            && this.neighborBlock(chunk, localX, y, localZ, [0, 1, 0]) !== BlockId.Water;

          for (const face of FACES) {
            if (y === 0 && face.direction[1] < 0) continue;
            const neighborId = this.neighborBlock(chunk, localX, y, localZ, face.direction);
            if (!shouldRenderVoxelFace(id, neighborId)) continue;
            this.appendFace(
              buffers,
              localX,
              y,
              localZ,
              worldX,
              worldZ,
              id,
              face,
              isWaterSurface,
              isAoOccluding
            );
          }
        }
      }
    }

    chunk.opaqueMesh = this.createChunkMesh(chunk, opaque, this.opaqueMaterial, false);
    chunk.transparentMesh = this.createChunkMesh(chunk, transparent, this.transparentMaterial, true);
  }

  private neighborBlock(
    chunk: ChunkColumn,
    localX: number,
    y: number,
    localZ: number,
    direction: readonly [number, number, number]
  ): BlockId {
    const nextX = localX + direction[0];
    const nextY = y + direction[1];
    const nextZ = localZ + direction[2];
    if (nextY < 0 || nextY >= WORLD_HEIGHT) return BlockId.Air;
    if (nextX >= 0 && nextX < CHUNK_SIZE && nextZ >= 0 && nextZ < CHUNK_SIZE) {
      return (chunk.blocks[localIndex(nextX, nextY, nextZ)] ?? BlockId.Air) as BlockId;
    }
    return this.getBlock(chunk.x * CHUNK_SIZE + nextX, nextY, chunk.z * CHUNK_SIZE + nextZ);
  }

  private createChunkAoOcclusionQuery(chunk: ChunkColumn): VoxelOcclusionQuery {
    const cacheWidth = CHUNK_SIZE + 2;
    const cacheDepth = CHUNK_SIZE + 2;
    const cacheHeight = WORLD_HEIGHT + 2;
    const cacheLayerArea = cacheWidth * cacheDepth;
    const cache = new Uint8Array(cacheLayerArea * cacheHeight);
    const originX = chunk.x * CHUNK_SIZE;
    const originZ = chunk.z * CHUNK_SIZE;
    return (x, y, z) => {
      const localX = x - originX + 1;
      const localY = y + 1;
      const localZ = z - originZ + 1;
      if (
        localX < 0 || localX >= cacheWidth ||
        localY < 0 || localY >= cacheHeight ||
        localZ < 0 || localZ >= cacheDepth
      ) {
        return blockFullyOccludesNeighborFace(this.getBlock(x, y, z));
      }
      const index = localX + cacheWidth * localZ + cacheLayerArea * localY;
      const cached = cache[index] ?? 0;
      if (cached !== 0) return cached === 2;
      const occluding = blockFullyOccludesNeighborFace(this.getBlock(x, y, z));
      cache[index] = occluding ? 2 : 1;
      return occluding;
    };
  }

  private appendFace(
    buffers: GeometryBuffers,
    x: number,
    y: number,
    z: number,
    worldX: number,
    worldZ: number,
    id: BlockId,
    face: FaceDescription,
    isWaterSurface: boolean,
    isAoOccluding: VoxelOcclusionQuery
  ): void {
    const definition = getBlockDefinition(id);
    const tile = definition.atlas[face.face];
    const tileColumn = tile % BLOCK_ATLAS_LAYOUT.columns;
    const tileRow = Math.floor(tile / BLOCK_ATLAS_LAYOUT.columns);
    const atlasWidth = BLOCK_ATLAS_LAYOUT.columns * BLOCK_ATLAS_LAYOUT.tileSize;
    const atlasHeight = BLOCK_ATLAS_LAYOUT.rows * BLOCK_ATLAS_LAYOUT.tileSize;
    const inset = 0.02;
    const u0 = (tileColumn * BLOCK_ATLAS_LAYOUT.tileSize + inset) / atlasWidth;
    const u1 = ((tileColumn + 1) * BLOCK_ATLAS_LAYOUT.tileSize - inset) / atlasWidth;
    const v1 = 1 - (tileRow * BLOCK_ATLAS_LAYOUT.tileSize + inset) / atlasHeight;
    const v0 = 1 - ((tileRow + 1) * BLOCK_ATLAS_LAYOUT.tileSize - inset) / atlasHeight;
    const vertexStart = buffers.positions.length / 3;
    const variation = 0.94 + (hash3(worldX, y, worldZ, this.seed + 6101) % 9) / 100;
    const brightness = face.shade * variation;
    const lightX = worldX + face.normal[0];
    const lightY = y + face.normal[1];
    const lightZ = worldZ + face.normal[2];
    const skyLight = this.lighting.getSkyLight(lightX, lightY, lightZ) / MAX_LIGHT_LEVEL;
    const blockLight = this.lighting.getBlockLight(lightX, lightY, lightZ) / MAX_LIGHT_LEVEL;
    const aoLevels: [number, number, number, number] = [3, 3, 3, 3];

    for (let cornerIndex = 0; cornerIndex < face.corners.length; cornerIndex += 1) {
      const corner = face.corners[cornerIndex]!;
      const cornerUv = FACE_UVS[cornerIndex]!;
      const waterOffset = isWaterSurface && corner[1] === 1 ? WATER_SURFACE_HEIGHT : corner[1];
      const ao = sampleVoxelVertexAo(
        worldX,
        y,
        worldZ,
        { x: face.normal[0], y: face.normal[1], z: face.normal[2] },
        { x: corner[0], y: corner[1], z: corner[2] },
        isAoOccluding
      );
      aoLevels[cornerIndex] = ao.level;
      buffers.positions.push(x + corner[0], y + waterOffset, z + corner[2]);
      buffers.normals.push(face.normal[0], face.normal[1], face.normal[2]);
      buffers.uvs.push(lerp(u0, u1, cornerUv[0]), lerp(v0, v1, cornerUv[1]));
      buffers.lights.push(
        Math.round(clamp(brightness * ao.factor, 0, 1) * 255),
        Math.round(clamp(skyLight, 0, 1) * 255),
        Math.round(clamp(blockLight, 0, 1) * 255)
      );
    }
    if (shouldFlipVoxelAoDiagonal(aoLevels)) {
      buffers.indices.push(
        vertexStart,
        vertexStart + 1,
        vertexStart + 3,
        vertexStart + 1,
        vertexStart + 2,
        vertexStart + 3
      );
    } else {
      buffers.indices.push(
        vertexStart,
        vertexStart + 1,
        vertexStart + 2,
        vertexStart,
        vertexStart + 2,
        vertexStart + 3
      );
    }
  }

  private createChunkMesh(
    chunk: ChunkColumn,
    buffers: GeometryBuffers,
    material: THREE.Material,
    transparent: boolean
  ): THREE.Mesh<THREE.BufferGeometry, THREE.Material> | null {
    if (buffers.indices.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffers.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
    geometry.setAttribute('voxelLight', new THREE.Uint8BufferAttribute(buffers.lights, 3, true));
    geometry.setIndex(buffers.indices);
    geometry.computeBoundingSphere();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${transparent ? 'Transparent' : 'Opaque'} chunk ${chunk.x},${chunk.z}`;
    mesh.position.set(chunk.x * CHUNK_SIZE, 0, chunk.z * CHUNK_SIZE);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.renderOrder = transparent ? 1 : 0;
    mesh.visible = this.isChunkVisible(chunk.x, chunk.z);
    this.add(mesh);
    return mesh;
  }

  private isChunkVisible(chunkX: number, chunkZ: number): boolean {
    return this.visibleChunkKeys.has(chunkKey(chunkX, chunkZ));
  }

  private removeChunkMeshes(chunk: ChunkColumn): void {
    if (chunk.opaqueMesh) {
      this.remove(chunk.opaqueMesh);
      chunk.opaqueMesh.geometry.dispose();
      chunk.opaqueMesh = null;
    }
    if (chunk.transparentMesh) {
      this.remove(chunk.transparentMesh);
      chunk.transparentMesh.geometry.dispose();
      chunk.transparentMesh = null;
    }
  }
}
