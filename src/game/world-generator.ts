import { BlockId } from './types';

export const GENERATED_CHUNK_SIZE = 16;
export const GENERATED_WORLD_HEIGHT = 80;
export const GENERATED_SEA_LEVEL = 30;
export const GENERATED_DIAMOND_MAX_Y = 15;
export const GENERATED_CHUNK_VOLUME =
  GENERATED_CHUNK_SIZE * GENERATED_WORLD_HEIGHT * GENERATED_CHUNK_SIZE;

const TREE_CELL_SIZE = 7;
const TREE_HORIZONTAL_RADIUS = 2;

export interface GeneratedChunk {
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly blocks: Uint8Array;
}

interface TreeCandidate {
  readonly x: number;
  readonly z: number;
  readonly surfaceY: number;
  readonly trunkHeight: number;
}

interface TerrainColumn {
  readonly surfaceHeight: number;
  readonly snowy: boolean;
  readonly beach: boolean;
}

export function generatedChunkIndex(localX: number, y: number, localZ: number): number {
  return localX + GENERATED_CHUNK_SIZE * (localZ + GENERATED_CHUNK_SIZE * y);
}

export function generatedPositiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

export function generateChunk(seed: number, chunkX: number, chunkZ: number): GeneratedChunk {
  const safeSeed = normalizeSeed(seed);
  const safeChunkX = normalizeCoordinate(chunkX);
  const safeChunkZ = normalizeCoordinate(chunkZ);
  const originX = safeChunkX * GENERATED_CHUNK_SIZE;
  const originZ = safeChunkZ * GENERATED_CHUNK_SIZE;
  const blocks = new Uint8Array(GENERATED_CHUNK_VOLUME);

  for (let localZ = 0; localZ < GENERATED_CHUNK_SIZE; localZ += 1) {
    const worldZ = originZ + localZ;
    for (let localX = 0; localX < GENERATED_CHUNK_SIZE; localX += 1) {
      const worldX = originX + localX;
      const column = createTerrainColumn(safeSeed, worldX, worldZ);
      for (let y = 0; y < GENERATED_WORLD_HEIGHT; y += 1) {
        blocks[generatedChunkIndex(localX, y, localZ)] = generateTerrainColumnBlock(
          safeSeed,
          worldX,
          y,
          worldZ,
          column
        );
      }
    }
  }

  forEachTreeCandidateAffectingArea(
    safeSeed,
    originX,
    originX + GENERATED_CHUNK_SIZE - 1,
    originZ,
    originZ + GENERATED_CHUNK_SIZE - 1,
    (tree) => applyTreeToChunk(blocks, originX, originZ, tree, safeSeed)
  );

  return { chunkX: safeChunkX, chunkZ: safeChunkZ, blocks };
}

export function sampleGeneratedBlock(seed: number, x: number, y: number, z: number): BlockId {
  const blockX = Math.floor(x);
  const blockY = Math.floor(y);
  const blockZ = Math.floor(z);
  if (blockY < 0 || blockY >= GENERATED_WORLD_HEIGHT) return BlockId.Air;

  const safeSeed = normalizeSeed(seed);
  let block = generateTerrainBlock(safeSeed, blockX, blockY, blockZ);
  forEachTreeCandidateAffectingArea(
    safeSeed,
    blockX,
    blockX,
    blockZ,
    blockZ,
    (tree) => {
      block = applyTreeToBlock(block, blockX, blockY, blockZ, tree, safeSeed);
    }
  );
  return block;
}

function generateTerrainBlock(seed: number, x: number, y: number, z: number): BlockId {
  return generateTerrainColumnBlock(seed, x, y, z, createTerrainColumn(seed, x, z));
}

function createTerrainColumn(seed: number, x: number, z: number): TerrainColumn {
  const surfaceHeight = terrainHeight(seed, x, z);
  const temperature = valueNoise2(x * 0.008, z * 0.008, seed + 421);
  return {
    surfaceHeight,
    snowy: surfaceHeight >= 47 || (temperature < -0.52 && surfaceHeight >= 38),
    beach: surfaceHeight <= GENERATED_SEA_LEVEL + 1
  };
}

function generateTerrainColumnBlock(
  seed: number,
  x: number,
  y: number,
  z: number,
  column: TerrainColumn
): BlockId {
  const { surfaceHeight, snowy, beach } = column;

  if (y === 0 || (y === 1 && hash3(x, y, z, seed + 17) % 4 === 0)) {
    return BlockId.Bedrock;
  }
  if (y <= surfaceHeight) {
    const depth = surfaceHeight - y;
    if (depth === 0) return snowy ? BlockId.Snow : beach ? BlockId.Sand : BlockId.Grass;
    if (depth <= (beach ? 4 : 3)) return beach ? BlockId.Sand : BlockId.Dirt;
    return generatedStone(seed, x, y, z, surfaceHeight);
  }
  if (y <= GENERATED_SEA_LEVEL) return BlockId.Water;
  return BlockId.Air;
}

function generatedStone(seed: number, x: number, y: number, z: number, surfaceHeight: number): BlockId {
  if (y > 4 && y < surfaceHeight - 4) {
    const cave = valueNoise3(x * 0.065, y * 0.075, z * 0.065, seed + 991);
    const tunnel = valueNoise3(x * 0.033 + 18, y * 0.045, z * 0.033 - 27, seed + 1597);
    if (cave > 0.58 && tunnel > -0.16) return BlockId.Air;
  }

  const veinX = Math.floor(x / 2);
  const veinY = Math.floor(y / 2);
  const veinZ = Math.floor(z / 2);
  const vein = hash3(veinX, veinY, veinZ, seed + 2311) % 1000;
  if (y <= GENERATED_DIAMOND_MAX_Y && vein >= 38) {
    const depthBonus = 1 + Math.floor((GENERATED_DIAMOND_MAX_Y - y) / 5);
    const diamondVein = hash3(veinX, veinY, veinZ, seed + 2879) % 1000;
    if (diamondVein < depthBonus) return BlockId.DiamondOre;
  }
  if (y < 25 && vein < 14) return BlockId.IronOre;
  if (y < 46 && vein >= 14 && vein < 38) return BlockId.CoalOre;
  return BlockId.Stone;
}

function terrainHeight(seed: number, x: number, z: number): number {
  const continental = fractalNoise2(x * 0.011, z * 0.011, seed + 101, 4);
  const detail = fractalNoise2(x * 0.036, z * 0.036, seed + 307, 3);
  const ridgeNoise = valueNoise2(x * 0.018, z * 0.018, seed + 701);
  let height = 31 + continental * 11 + detail * 4 + (1 - Math.abs(ridgeNoise)) * 3;
  const spawnBlend = clamp(1 - Math.hypot(x, z) / 11, 0, 1);
  height = lerp(height, 36, spawnBlend * spawnBlend);
  return Math.floor(clamp(height, 18, 54));
}

function forEachTreeCandidateAffectingArea(
  seed: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  callback: (tree: TreeCandidate) => void
): void {
  const firstCellX = Math.floor((minX - TREE_HORIZONTAL_RADIUS - (TREE_CELL_SIZE - 1)) / TREE_CELL_SIZE);
  const lastCellX = Math.floor((maxX + TREE_HORIZONTAL_RADIUS) / TREE_CELL_SIZE);
  const firstCellZ = Math.floor((minZ - TREE_HORIZONTAL_RADIUS - (TREE_CELL_SIZE - 1)) / TREE_CELL_SIZE);
  const lastCellZ = Math.floor((maxZ + TREE_HORIZONTAL_RADIUS) / TREE_CELL_SIZE);

  for (let cellZ = firstCellZ; cellZ <= lastCellZ; cellZ += 1) {
    for (let cellX = firstCellX; cellX <= lastCellX; cellX += 1) {
      const tree = createTreeCandidate(seed, cellX, cellZ);
      if (!tree) continue;
      if (
        tree.x + TREE_HORIZONTAL_RADIUS < minX ||
        tree.x - TREE_HORIZONTAL_RADIUS > maxX ||
        tree.z + TREE_HORIZONTAL_RADIUS < minZ ||
        tree.z - TREE_HORIZONTAL_RADIUS > maxZ
      ) continue;
      callback(tree);
    }
  }
}

function createTreeCandidate(seed: number, cellX: number, cellZ: number): TreeCandidate | null {
  const x = cellX * TREE_CELL_SIZE + hash3(cellX, 0, cellZ, seed + 3301) % TREE_CELL_SIZE;
  const z = cellZ * TREE_CELL_SIZE + hash3(cellX, 1, cellZ, seed + 3307) % TREE_CELL_SIZE;
  if (Math.hypot(x, z) < 9) return null;
  if (hash3(cellX, 2, cellZ, seed + 3313) % 100 > 68) return null;

  const surfaceY = terrainHeight(seed, x, z);
  if (generateTerrainBlock(seed, x, surfaceY, z) !== BlockId.Grass) return null;
  const trunkHeight = 4 + hash3(x, surfaceY, z, seed + 3323) % 3;
  if (surfaceY + trunkHeight + 3 >= GENERATED_WORLD_HEIGHT) return null;
  return { x, z, surfaceY, trunkHeight };
}

function applyTreeToChunk(
  blocks: Uint8Array,
  originX: number,
  originZ: number,
  tree: TreeCandidate,
  seed: number
): void {
  for (let y = 1; y <= tree.trunkHeight; y += 1) {
    setChunkBlock(blocks, originX, originZ, tree.x, tree.surfaceY + y, tree.z, BlockId.Wood, true);
  }

  const canopyY = tree.surfaceY + tree.trunkHeight;
  for (let dy = -2; dy <= 2; dy += 1) {
    const radius = Math.abs(dy) === 2 ? 1 : 2;
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (
          Math.abs(dx) === radius &&
          Math.abs(dz) === radius &&
          hash3(tree.x + dx, canopyY + dy, tree.z + dz, seed + 3331) % 3 === 0
        ) continue;
        setChunkBlock(
          blocks,
          originX,
          originZ,
          tree.x + dx,
          canopyY + dy,
          tree.z + dz,
          BlockId.Leaves,
          false
        );
      }
    }
  }
  setChunkBlock(blocks, originX, originZ, tree.x, canopyY + 2, tree.z, BlockId.Leaves, false);
}

function applyTreeToBlock(
  current: BlockId,
  x: number,
  y: number,
  z: number,
  tree: TreeCandidate,
  seed: number
): BlockId {
  if (x === tree.x && z === tree.z && y > tree.surfaceY && y <= tree.surfaceY + tree.trunkHeight) {
    current = BlockId.Wood;
  }

  const canopyY = tree.surfaceY + tree.trunkHeight;
  const dy = y - canopyY;
  if (dy >= -2 && dy <= 2) {
    const radius = Math.abs(dy) === 2 ? 1 : 2;
    const dx = x - tree.x;
    const dz = z - tree.z;
    const inside = Math.abs(dx) <= radius && Math.abs(dz) <= radius;
    const skippedCorner =
      Math.abs(dx) === radius &&
      Math.abs(dz) === radius &&
      hash3(x, canopyY + dy, z, seed + 3331) % 3 === 0;
    if (inside && !skippedCorner && current === BlockId.Air) current = BlockId.Leaves;
  }
  if (x === tree.x && z === tree.z && y === canopyY + 2 && current === BlockId.Air) {
    current = BlockId.Leaves;
  }
  return current;
}

function setChunkBlock(
  blocks: Uint8Array,
  originX: number,
  originZ: number,
  x: number,
  y: number,
  z: number,
  id: BlockId,
  replace: boolean
): void {
  if (y < 0 || y >= GENERATED_WORLD_HEIGHT) return;
  const localX = x - originX;
  const localZ = z - originZ;
  if (
    localX < 0 || localX >= GENERATED_CHUNK_SIZE ||
    localZ < 0 || localZ >= GENERATED_CHUNK_SIZE
  ) return;
  const index = generatedChunkIndex(localX, y, localZ);
  if (!replace && blocks[index] !== BlockId.Air) return;
  blocks[index] = id;
}

function normalizeSeed(seed: number): number {
  return Number.isFinite(seed) ? seed | 0 : 0;
}

function normalizeCoordinate(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function fade(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
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

function signedHash(x: number, y: number, z: number, seed: number): number {
  return (hash3(x, y, z, seed) / 0xffffffff) * 2 - 1;
}

function valueNoise2(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const tz = fade(z - z0);
  const a = signedHash(x0, 0, z0, seed);
  const b = signedHash(x0 + 1, 0, z0, seed);
  const c = signedHash(x0, 0, z0 + 1, seed);
  const d = signedHash(x0 + 1, 0, z0 + 1, seed);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const tz = fade(z - z0);
  const n000 = signedHash(x0, y0, z0, seed);
  const n100 = signedHash(x0 + 1, y0, z0, seed);
  const n010 = signedHash(x0, y0 + 1, z0, seed);
  const n110 = signedHash(x0 + 1, y0 + 1, z0, seed);
  const n001 = signedHash(x0, y0, z0 + 1, seed);
  const n101 = signedHash(x0 + 1, y0, z0 + 1, seed);
  const n011 = signedHash(x0, y0 + 1, z0 + 1, seed);
  const n111 = signedHash(x0 + 1, y0 + 1, z0 + 1, seed);
  const x00 = lerp(n000, n100, tx);
  const x10 = lerp(n010, n110, tx);
  const x01 = lerp(n001, n101, tx);
  const x11 = lerp(n011, n111, tx);
  return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz);
}

function fractalNoise2(x: number, z: number, seed: number, octaves: number): number {
  let result = 0;
  let amplitude = 1;
  let frequency = 1;
  let amplitudeSum = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    result += valueNoise2(x * frequency, z * frequency, seed + octave * 977) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return result / amplitudeSum;
}
