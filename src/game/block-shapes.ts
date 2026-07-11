import { BlockId } from './types';

export type AabbAxis = 'x' | 'y' | 'z';

export interface Aabb {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Horizontal offset from one chest half to its connected partner. */
export interface ChestConnectionOffset {
  readonly dx: number;
  readonly dz: number;
}

export interface AxisNormal extends Vec3Like {
  readonly x: -1 | 0 | 1;
  readonly y: -1 | 0 | 1;
  readonly z: -1 | 0 | 1;
}

export interface AabbRaycastHit {
  /** World-space distance from the ray origin, independent of direction length. */
  readonly distance: number;
  readonly normal: AxisNormal;
}

export interface BlockShape {
  readonly collisionBoxes: readonly Aabb[];
  readonly fullyOccludesNeighborFace: boolean;
  readonly blocksChestLid: boolean;
  readonly blocksSkyLight: boolean;
}

export const DEFAULT_PLAYER_COLLISION_RADIUS = 0.3;
export const DEFAULT_PLAYER_COLLISION_HEIGHT = 1.8;

export const FULL_BLOCK_COLLISION_BOX: Aabb = Object.freeze({
  minX: 0,
  minY: 0,
  minZ: 0,
  maxX: 1,
  maxY: 1,
  maxZ: 1
});

export const CHEST_COLLISION_BOX: Aabb = Object.freeze({
  minX: 1 / 16,
  minY: 0,
  minZ: 1 / 16,
  maxX: 15 / 16,
  maxY: 14 / 16,
  maxZ: 15 / 16
});

const CHEST_COLLISION_BOX_CONNECTED_WEST: Aabb = Object.freeze({
  ...CHEST_COLLISION_BOX,
  minX: 0
});
const CHEST_COLLISION_BOX_CONNECTED_EAST: Aabb = Object.freeze({
  ...CHEST_COLLISION_BOX,
  maxX: 1
});
const CHEST_COLLISION_BOX_CONNECTED_NORTH: Aabb = Object.freeze({
  ...CHEST_COLLISION_BOX,
  minZ: 0
});
const CHEST_COLLISION_BOX_CONNECTED_SOUTH: Aabb = Object.freeze({
  ...CHEST_COLLISION_BOX,
  maxZ: 1
});

const EMPTY_COLLISION_BOXES: readonly Aabb[] = Object.freeze([]);
const FULL_BLOCK_COLLISION_BOXES: readonly Aabb[] = Object.freeze([
  FULL_BLOCK_COLLISION_BOX
]);
const CHEST_COLLISION_BOXES: readonly Aabb[] = Object.freeze([
  CHEST_COLLISION_BOX
]);

const NON_COLLIDING_SHAPE: BlockShape = Object.freeze({
  collisionBoxes: EMPTY_COLLISION_BOXES,
  fullyOccludesNeighborFace: false,
  blocksChestLid: false,
  blocksSkyLight: false
});

const TRANSPARENT_FULL_BLOCK_SHAPE: BlockShape = Object.freeze({
  collisionBoxes: FULL_BLOCK_COLLISION_BOXES,
  fullyOccludesNeighborFace: false,
  blocksChestLid: false,
  blocksSkyLight: false
});

const OPAQUE_FULL_BLOCK_SHAPE: BlockShape = Object.freeze({
  collisionBoxes: FULL_BLOCK_COLLISION_BOXES,
  fullyOccludesNeighborFace: true,
  blocksChestLid: true,
  blocksSkyLight: true
});

const CHEST_SHAPE: BlockShape = Object.freeze({
  collisionBoxes: CHEST_COLLISION_BOXES,
  fullyOccludesNeighborFace: false,
  blocksChestLid: false,
  blocksSkyLight: false
});

/** Unknown future block ids conservatively use the ordinary opaque full-block shape. */
export function getBlockShape(id: BlockId): BlockShape {
  switch (id) {
    case BlockId.Air:
    case BlockId.Water:
    case BlockId.Torch:
      return NON_COLLIDING_SHAPE;
    case BlockId.Glass:
    case BlockId.Leaves:
      return TRANSPARENT_FULL_BLOCK_SHAPE;
    case BlockId.Chest:
      return CHEST_SHAPE;
    default:
      return OPAQUE_FULL_BLOCK_SHAPE;
  }
}

/**
 * Returns one chest half's local collision box. Connected halves extend only
 * toward their shared seam, preserving the 1/16 inset around the outer edge.
 */
export function getChestCollisionBox(
  connection: ChestConnectionOffset | null | undefined = null
): Aabb {
  if (connection?.dx === -1 && connection.dz === 0) {
    return CHEST_COLLISION_BOX_CONNECTED_WEST;
  }
  if (connection?.dx === 1 && connection.dz === 0) {
    return CHEST_COLLISION_BOX_CONNECTED_EAST;
  }
  if (connection?.dx === 0 && connection.dz === -1) {
    return CHEST_COLLISION_BOX_CONNECTED_NORTH;
  }
  if (connection?.dx === 0 && connection.dz === 1) {
    return CHEST_COLLISION_BOX_CONNECTED_SOUTH;
  }
  return CHEST_COLLISION_BOX;
}

export function getBlockCollisionBoxes(
  id: BlockId,
  chestConnection: ChestConnectionOffset | null = null
): readonly Aabb[] {
  if (id === BlockId.Chest && chestConnection) {
    return [getChestCollisionBox(chestConnection)];
  }
  return getBlockShape(id).collisionBoxes;
}

export function blockFullyOccludesNeighborFace(id: BlockId): boolean {
  return getBlockShape(id).fullyOccludesNeighborFace;
}

export function blockBlocksChestLid(id: BlockId): boolean {
  return getBlockShape(id).blocksChestLid;
}

/** True only when the block completely prevents direct sky light from passing. */
export function blockBlocksSkyLight(id: BlockId): boolean {
  return getBlockShape(id).blocksSkyLight;
}

export function offsetAabb(box: Aabb, x: number, y: number, z: number): Aabb {
  return {
    minX: box.minX + x,
    minY: box.minY + y,
    minZ: box.minZ + z,
    maxX: box.maxX + x,
    maxY: box.maxY + y,
    maxZ: box.maxZ + z
  };
}

export function getBlockWorldCollisionBoxes(
  id: BlockId,
  x: number,
  y: number,
  z: number,
  chestConnection: ChestConnectionOffset | null = null
): Aabb[] {
  return getBlockCollisionBoxes(id, chestConnection).map((box) => offsetAabb(box, x, y, z));
}

/** Builds the player's feet-anchored collision box from a position vector. */
export function createPlayerAabb(
  position: Vec3Like,
  radius = DEFAULT_PLAYER_COLLISION_RADIUS,
  height = DEFAULT_PLAYER_COLLISION_HEIGHT
): Aabb {
  return {
    minX: position.x - radius,
    minY: position.y,
    minZ: position.z - radius,
    maxX: position.x + radius,
    maxY: position.y + height,
    maxZ: position.z + radius
  };
}

/** Uses positive-volume overlap: boxes that only touch do not intersect. */
export function aabbsIntersect(left: Aabb, right: Aabb, epsilon = 0): boolean {
  const minimumOverlap = normalizeClearance(epsilon);
  return (
    overlapLength(left.minX, left.maxX, right.minX, right.maxX) > minimumOverlap &&
    overlapLength(left.minY, left.maxY, right.minY, right.maxY) > minimumOverlap &&
    overlapLength(left.minZ, left.maxZ, right.minZ, right.maxZ) > minimumOverlap
  );
}

export function aabbIntersectsBlock(
  box: Aabb,
  id: BlockId,
  x: number,
  y: number,
  z: number,
  epsilon = 0,
  chestConnection: ChestConnectionOffset | null = null
): boolean {
  return getBlockWorldCollisionBoxes(id, x, y, z, chestConnection).some((blockBox) =>
    aabbsIntersect(box, blockBox, epsilon)
  );
}

/**
 * Finds the nearest forward surface of an AABB. Rays starting inside the box
 * hit the nearest exit face; rays starting on a face may return distance zero.
 */
export function raycastAabb(
  origin: Vec3Like,
  direction: Vec3Like,
  box: Aabb,
  maxDistance = Number.POSITIVE_INFINITY
): AabbRaycastHit | null {
  if (!(maxDistance >= 0)) return null;
  const directionLength = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(directionLength) || directionLength === 0) return null;

  const unitX = direction.x / directionLength;
  const unitY = direction.y / directionLength;
  const unitZ = direction.z / directionLength;
  const slabs = [
    raycastSlab(origin.x, unitX, box.minX, box.maxX, 'x'),
    raycastSlab(origin.y, unitY, box.minY, box.maxY, 'y'),
    raycastSlab(origin.z, unitZ, box.minZ, box.maxZ, 'z')
  ] as const;
  if (slabs.some((slab) => slab === null)) return null;

  let entryDistance = Number.NEGATIVE_INFINITY;
  let exitDistance = Number.POSITIVE_INFINITY;
  let entryNormal: AxisNormal | null = null;
  let exitNormal: AxisNormal | null = null;

  for (const slab of slabs) {
    if (!slab) continue;
    if (slab.nearDistance > entryDistance) {
      entryDistance = slab.nearDistance;
      entryNormal = slab.nearNormal;
    }
    if (slab.farDistance < exitDistance) {
      exitDistance = slab.farDistance;
      exitNormal = slab.farNormal;
    }
  }

  if (entryDistance > exitDistance || exitDistance < 0) return null;
  const startsInside = entryDistance < 0;
  const distance = Math.max(0, startsInside ? exitDistance : entryDistance);
  const normal = startsInside ? exitNormal : entryNormal;
  if (!normal || distance > maxDistance) return null;
  return { distance, normal };
}

export function raycastBlockShape(
  id: BlockId,
  x: number,
  y: number,
  z: number,
  origin: Vec3Like,
  direction: Vec3Like,
  maxDistance = Number.POSITIVE_INFINITY,
  chestConnection: ChestConnectionOffset | null = null
): AabbRaycastHit | null {
  let closestHit: AabbRaycastHit | null = null;
  for (const box of getBlockWorldCollisionBoxes(id, x, y, z, chestConnection)) {
    const hit = raycastAabb(origin, direction, box, maxDistance);
    if (hit && (!closestHit || hit.distance < closestHit.distance)) closestHit = hit;
  }
  return closestHit;
}

export function moveAabbAlongAxis(box: Aabb, axis: AabbAxis, amount: number): Aabb {
  const x = axis === 'x' ? amount : 0;
  const y = axis === 'y' ? amount : 0;
  const z = axis === 'z' ? amount : 0;
  return offsetAabb(box, x, y, z);
}

/**
 * Clips a requested one-axis movement so the moving box stops before an
 * obstacle. The boxes are expected not to overlap before movement.
 */
export function clipAabbMovementAlongAxis(
  moving: Aabb,
  obstacle: Aabb,
  axis: AabbAxis,
  requestedMovement: number,
  clearance = 0
): number {
  if (!Number.isFinite(requestedMovement) || requestedMovement === 0) return 0;
  const separation = normalizeClearance(clearance);
  if (!overlapsOnOtherAxes(moving, obstacle, axis)) return requestedMovement;

  const movingMin = minOnAxis(moving, axis);
  const movingMax = maxOnAxis(moving, axis);
  const obstacleMin = minOnAxis(obstacle, axis);
  const obstacleMax = maxOnAxis(obstacle, axis);

  if (requestedMovement > 0 && movingMax <= obstacleMin) {
    const allowedMovement = Math.max(0, obstacleMin - movingMax - separation);
    return Math.min(requestedMovement, allowedMovement);
  }
  if (requestedMovement < 0 && movingMin >= obstacleMax) {
    const allowedMovement = Math.min(0, obstacleMax - movingMin + separation);
    return Math.max(requestedMovement, allowedMovement);
  }
  return requestedMovement;
}

export function clipAabbMovementAgainstBoxes(
  moving: Aabb,
  obstacles: readonly Aabb[],
  axis: AabbAxis,
  requestedMovement: number,
  clearance = 0
): number {
  let clippedMovement = requestedMovement;
  for (const obstacle of obstacles) {
    clippedMovement = clipAabbMovementAlongAxis(
      moving,
      obstacle,
      axis,
      clippedMovement,
      clearance
    );
  }
  return clippedMovement;
}

export function clipAabbMovementAgainstBlock(
  moving: Aabb,
  id: BlockId,
  x: number,
  y: number,
  z: number,
  axis: AabbAxis,
  requestedMovement: number,
  clearance = 0,
  chestConnection: ChestConnectionOffset | null = null
): number {
  return clipAabbMovementAgainstBoxes(
    moving,
    getBlockWorldCollisionBoxes(id, x, y, z, chestConnection),
    axis,
    requestedMovement,
    clearance
  );
}

function overlapLength(
  leftMin: number,
  leftMax: number,
  rightMin: number,
  rightMax: number
): number {
  return Math.min(leftMax, rightMax) - Math.max(leftMin, rightMin);
}

interface RaySlabHit {
  readonly nearDistance: number;
  readonly farDistance: number;
  readonly nearNormal: AxisNormal;
  readonly farNormal: AxisNormal;
}

function raycastSlab(
  origin: number,
  direction: number,
  minimum: number,
  maximum: number,
  axis: AabbAxis
): RaySlabHit | null | undefined {
  if (direction === 0) {
    return origin >= minimum && origin <= maximum ? undefined : null;
  }

  const minimumDistance = (minimum - origin) / direction;
  const maximumDistance = (maximum - origin) / direction;
  if (minimumDistance <= maximumDistance) {
    return {
      nearDistance: minimumDistance,
      farDistance: maximumDistance,
      nearNormal: createAxisNormal(axis, -1),
      farNormal: createAxisNormal(axis, 1)
    };
  }
  return {
    nearDistance: maximumDistance,
    farDistance: minimumDistance,
    nearNormal: createAxisNormal(axis, 1),
    farNormal: createAxisNormal(axis, -1)
  };
}

function createAxisNormal(axis: AabbAxis, sign: -1 | 1): AxisNormal {
  return {
    x: axis === 'x' ? sign : 0,
    y: axis === 'y' ? sign : 0,
    z: axis === 'z' ? sign : 0
  };
}

function overlapsOnOtherAxes(left: Aabb, right: Aabb, movementAxis: AabbAxis): boolean {
  if (
    movementAxis !== 'x' &&
    overlapLength(left.minX, left.maxX, right.minX, right.maxX) <= 0
  ) {
    return false;
  }
  if (
    movementAxis !== 'y' &&
    overlapLength(left.minY, left.maxY, right.minY, right.maxY) <= 0
  ) {
    return false;
  }
  return (
    movementAxis === 'z' ||
    overlapLength(left.minZ, left.maxZ, right.minZ, right.maxZ) > 0
  );
}

function minOnAxis(box: Aabb, axis: AabbAxis): number {
  if (axis === 'x') return box.minX;
  if (axis === 'y') return box.minY;
  return box.minZ;
}

function maxOnAxis(box: Aabb, axis: AabbAxis): number {
  if (axis === 'x') return box.maxX;
  if (axis === 'y') return box.maxY;
  return box.maxZ;
}

function normalizeClearance(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
