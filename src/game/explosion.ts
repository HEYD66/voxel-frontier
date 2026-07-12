import { BlockId, isBlockId } from './types';

export const CREEPER_IGNITE_DISTANCE = 3;
export const CREEPER_CANCEL_DISTANCE = 7;
export const CREEPER_FUSE_SECONDS = 1.5;
export const CREEPER_FUSE_TIME_SECONDS = CREEPER_FUSE_SECONDS;
export const CREEPER_EXPLOSION_POWER = 3;

export const EXPLOSION_RAY_GRID_SIZE = 16;
export const EXPLOSION_BOUNDARY_RAY_COUNT =
  EXPLOSION_RAY_GRID_SIZE ** 3 - (EXPLOSION_RAY_GRID_SIZE - 2) ** 3;
export const EXPLOSION_RAY_STEP = 0.3;
export const EXPLOSION_RAY_DECAY = 0.225;

export interface ExplosionPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ExplosionAabb {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

export interface ExplosionAffectedBlock extends ExplosionPoint {
  readonly id: BlockId;
}

export type ExplosionBlockQuery = (x: number, y: number, z: number) => BlockId;

export type ExplosionResistanceQuery = (
  id: BlockId,
  x: number,
  y: number,
  z: number
) => number;

export type ExplosionDestructionQuery = (
  id: BlockId,
  x: number,
  y: number,
  z: number,
  remainingStrength: number
) => boolean;

export interface TraceExplosionBlocksOptions {
  readonly center: ExplosionPoint;
  readonly power?: number;
  readonly seed?: number;
  readonly getBlock: ExplosionBlockQuery;
  readonly getResistance?: ExplosionResistanceQuery;
  readonly canDestroyBlock?: ExplosionDestructionQuery;
}

export type ExplosionLineOfSightQuery = (
  sample: ExplosionPoint,
  explosionCenter: ExplosionPoint
) => boolean;

export const BLOCK_EXPLOSION_RESISTANCE = Object.freeze({
  [BlockId.Air]: 0,
  [BlockId.Grass]: 0.6,
  [BlockId.Dirt]: 0.5,
  [BlockId.Stone]: 6,
  [BlockId.Sand]: 0.5,
  [BlockId.Wood]: 2,
  [BlockId.Leaves]: 0.2,
  [BlockId.Planks]: 3,
  [BlockId.Bricks]: 6,
  [BlockId.Glass]: 0.3,
  [BlockId.Water]: 100,
  [BlockId.CoalOre]: 3,
  [BlockId.IronOre]: 3,
  [BlockId.Snow]: 0.2,
  [BlockId.Cobblestone]: 6,
  [BlockId.Bedrock]: 3_600_000,
  [BlockId.CraftingTable]: 2.5,
  [BlockId.Furnace]: 3.5,
  [BlockId.Torch]: 0,
  [BlockId.Chest]: 2.5,
  [BlockId.DiamondOre]: 3
} satisfies Readonly<Record<BlockId, number>>);

const UINT32_RANGE = 0x1_0000_0000;
const RAY_GRID_MAX_INDEX = EXPLOSION_RAY_GRID_SIZE - 1;

function isFinitePoint(point: ExplosionPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function createSeededRandom(seed: number): () => number {
  let state = Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

function mixCoordinateHash(hash: number, value: number): number {
  let mixed = hash ^ Math.imul(Math.floor(value), 0x9e3779b1);
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x85ebca6b);
  return mixed ^ (mixed >>> 13);
}

function coordinateRandom(x: number, y: number, z: number, seed: number): number {
  let hash = Number.isFinite(seed) ? Math.trunc(seed) | 0 : 0;
  hash = mixCoordinateHash(hash ^ 0x27d4eb2d, x);
  hash = mixCoordinateHash(hash ^ 0x165667b1, y);
  hash = mixCoordinateHash(hash ^ 0x1b873593, z);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return ((hash ^ (hash >>> 16)) >>> 0) / UINT32_RANGE;
}

function blockKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function blockDistanceSquared(block: ExplosionPoint, center: ExplosionPoint): number {
  const dx = block.x + 0.5 - center.x;
  const dy = block.y + 0.5 - center.y;
  const dz = block.z + 0.5 - center.z;
  return dx * dx + dy * dy + dz * dz;
}

export function getBlockExplosionResistance(id: BlockId | number): number {
  return isBlockId(id) ? BLOCK_EXPLOSION_RESISTANCE[id] : 0;
}

export function isBlockDestructibleByExplosion(id: BlockId): boolean {
  return id !== BlockId.Air && id !== BlockId.Water && id !== BlockId.Bedrock;
}

/**
 * Traces the same 16-cubed boundary ray fan used by Java Edition explosions.
 * The returned order is stable and near-to-far so callers can mutate the world safely.
 */
export function traceExplosionBlocks(
  options: TraceExplosionBlocksOptions
): ExplosionAffectedBlock[] {
  const { center, getBlock } = options;
  const power = options.power ?? CREEPER_EXPLOSION_POWER;
  if (!isFinitePoint(center) || !Number.isFinite(power) || power <= 0) return [];

  const random = createSeededRandom(options.seed ?? 0);
  const getResistance = options.getResistance ?? getBlockExplosionResistance;
  const canDestroyBlock = options.canDestroyBlock ?? ((id: BlockId) => (
    isBlockDestructibleByExplosion(id)
  ));
  const affected = new Map<string, ExplosionAffectedBlock>();

  for (let gridX = 0; gridX < EXPLOSION_RAY_GRID_SIZE; gridX += 1) {
    for (let gridY = 0; gridY < EXPLOSION_RAY_GRID_SIZE; gridY += 1) {
      for (let gridZ = 0; gridZ < EXPLOSION_RAY_GRID_SIZE; gridZ += 1) {
        if (
          gridX !== 0 && gridX !== RAY_GRID_MAX_INDEX &&
          gridY !== 0 && gridY !== RAY_GRID_MAX_INDEX &&
          gridZ !== 0 && gridZ !== RAY_GRID_MAX_INDEX
        ) {
          continue;
        }

        let directionX = gridX / RAY_GRID_MAX_INDEX * 2 - 1;
        let directionY = gridY / RAY_GRID_MAX_INDEX * 2 - 1;
        let directionZ = gridZ / RAY_GRID_MAX_INDEX * 2 - 1;
        const inverseLength = 1 / Math.hypot(directionX, directionY, directionZ);
        directionX *= inverseLength;
        directionY *= inverseLength;
        directionZ *= inverseLength;

        let strength = power * (0.7 + random() * 0.6);
        let rayX = center.x;
        let rayY = center.y;
        let rayZ = center.z;

        while (strength > 0) {
          const blockX = Math.floor(rayX);
          const blockY = Math.floor(rayY);
          const blockZ = Math.floor(rayZ);
          const id = getBlock(blockX, blockY, blockZ);

          if (id !== BlockId.Air) {
            const queriedResistance = getResistance(id, blockX, blockY, blockZ);
            const resistance = Number.isNaN(queriedResistance)
              ? 0
              : Math.max(0, queriedResistance);
            strength -= (resistance + 0.3) * 0.3;
          }

          if (
            strength > 0 &&
            id !== BlockId.Air &&
            canDestroyBlock(id, blockX, blockY, blockZ, strength)
          ) {
            affected.set(blockKey(blockX, blockY, blockZ), {
              x: blockX,
              y: blockY,
              z: blockZ,
              id
            });
          }

          rayX += directionX * EXPLOSION_RAY_STEP;
          rayY += directionY * EXPLOSION_RAY_STEP;
          rayZ += directionZ * EXPLOSION_RAY_STEP;
          strength -= EXPLOSION_RAY_DECAY;
        }
      }
    }
  }

  return [...affected.values()].sort((left, right) => (
    blockDistanceSquared(left, center) - blockDistanceSquared(right, center) ||
    left.y - right.y ||
    left.x - right.x ||
    left.z - right.z
  ));
}

/** Samples Java-style points throughout an entity AABB and returns visible / total. */
export function sampleExplosionExposure(
  explosionCenter: ExplosionPoint,
  bounds: ExplosionAabb,
  isLineUnobstructed: ExplosionLineOfSightQuery
): number {
  if (
    !isFinitePoint(explosionCenter) ||
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.minZ) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxY) ||
    !Number.isFinite(bounds.maxZ) ||
    bounds.maxX < bounds.minX ||
    bounds.maxY < bounds.minY ||
    bounds.maxZ < bounds.minZ
  ) {
    return 0;
  }

  const sizeX = bounds.maxX - bounds.minX;
  const sizeY = bounds.maxY - bounds.minY;
  const sizeZ = bounds.maxZ - bounds.minZ;
  const stepX = 1 / (sizeX * 2 + 1);
  const stepY = 1 / (sizeY * 2 + 1);
  const stepZ = 1 / (sizeZ * 2 + 1);
  const sampleCountX = Math.floor(1 / stepX) + 1;
  const sampleCountY = Math.floor(1 / stepY) + 1;
  const sampleCountZ = Math.floor(1 / stepZ) + 1;
  const offsetX = (1 - (sampleCountX - 1) * stepX) / 2;
  const offsetZ = (1 - (sampleCountZ - 1) * stepZ) / 2;
  let visible = 0;
  let total = 0;

  for (let sampleX = 0; sampleX < sampleCountX; sampleX += 1) {
    const x = bounds.minX + sizeX * sampleX * stepX + offsetX;
    for (let sampleY = 0; sampleY < sampleCountY; sampleY += 1) {
      const y = bounds.minY + sizeY * sampleY * stepY;
      for (let sampleZ = 0; sampleZ < sampleCountZ; sampleZ += 1) {
        const z = bounds.minZ + sizeZ * sampleZ * stepZ + offsetZ;
        total += 1;
        if (isLineUnobstructed({ x, y, z }, explosionCenter)) visible += 1;
      }
    }
  }

  return total === 0 ? 0 : visible / total;
}

export function calculateExplosionImpact(
  distance: number,
  exposure: number,
  power = CREEPER_EXPLOSION_POWER
): number {
  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(exposure) ||
    !Number.isFinite(power) ||
    power <= 0 ||
    distance < 0
  ) {
    return 0;
  }

  const normalizedDistance = distance / (power * 2);
  if (normalizedDistance > 1) return 0;
  return (1 - normalizedDistance) * clamp01(exposure);
}

export function calculateExplosionDamage(
  distance: number,
  exposure: number,
  power = CREEPER_EXPLOSION_POWER
): number {
  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(exposure) ||
    !Number.isFinite(power) ||
    power <= 0 ||
    distance < 0 ||
    distance > power * 2
  ) {
    return 0;
  }

  const impact = calculateExplosionImpact(distance, exposure, power);
  return Math.floor((impact * impact + impact) / 2 * 7 * (power * 2) + 1);
}

export function getExplosionDropSurvivalChance(power: number): number {
  if (Number.isNaN(power)) return 0;
  if (power <= 1) return 1;
  if (!Number.isFinite(power)) return 0;
  return 1 / power;
}

/** Coordinate hashing keeps drop results stable even if affected blocks are reordered. */
export function shouldExplosionDropSurvive(
  x: number,
  y: number,
  z: number,
  power: number,
  seed = 0
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
  const chance = getExplosionDropSurvivalChance(power);
  return chance >= 1 || (chance > 0 && coordinateRandom(x, y, z, seed) < chance);
}
