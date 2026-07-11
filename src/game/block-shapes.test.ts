import { describe, expect, it } from 'vitest';
import { BlockId } from './types';
import {
  CHEST_COLLISION_BOX,
  DEFAULT_PLAYER_COLLISION_HEIGHT,
  DEFAULT_PLAYER_COLLISION_RADIUS,
  FULL_BLOCK_COLLISION_BOX,
  aabbIntersectsBlock,
  aabbsIntersect,
  blockBlocksChestLid,
  blockBlocksSkyLight,
  blockFullyOccludesNeighborFace,
  clipAabbMovementAgainstBlock,
  clipAabbMovementAgainstBoxes,
  createPlayerAabb,
  getBlockCollisionBoxes,
  getBlockWorldCollisionBoxes,
  getChestCollisionBox,
  moveAabbAlongAxis,
  offsetAabb,
  raycastAabb,
  raycastBlockShape,
  type Aabb,
  type ChestConnectionOffset
} from './block-shapes';

describe('block collision shapes', () => {
  it('uses full cubes by default and the original-style inset chest bounds', () => {
    expect(getBlockCollisionBoxes(BlockId.Stone)).toEqual([FULL_BLOCK_COLLISION_BOX]);
    expect(CHEST_COLLISION_BOX).toEqual({
      minX: 1 / 16,
      minY: 0,
      minZ: 1 / 16,
      maxX: 15 / 16,
      maxY: 14 / 16,
      maxZ: 15 / 16
    });
    expect(getBlockCollisionBoxes(BlockId.Chest)).toEqual([CHEST_COLLISION_BOX]);
  });

  it('does not collide with air, water, or torches', () => {
    expect(getBlockCollisionBoxes(BlockId.Air)).toEqual([]);
    expect(getBlockCollisionBoxes(BlockId.Water)).toEqual([]);
    expect(getBlockCollisionBoxes(BlockId.Torch)).toEqual([]);
  });

  it('converts local block shapes to world coordinates without losing fractions', () => {
    expect(getBlockWorldCollisionBoxes(BlockId.Chest, -2, 7, 3)).toEqual([{
      minX: -2 + 1 / 16,
      minY: 7,
      minZ: 3 + 1 / 16,
      maxX: -2 + 15 / 16,
      maxY: 7 + 14 / 16,
      maxZ: 3 + 15 / 16
    }]);
    expect(getBlockWorldCollisionBoxes(BlockId.Air, 4, 5, 6)).toEqual([]);
  });

  it.each([
    [{ dx: -1, dz: 0 }, { minX: 0 }],
    [{ dx: 1, dz: 0 }, { maxX: 1 }],
    [{ dx: 0, dz: -1 }, { minZ: 0 }],
    [{ dx: 0, dz: 1 }, { maxZ: 1 }]
  ] as const)('extends a connected chest only toward offset %j', (connection, extension) => {
    const box = getChestCollisionBox(connection);
    expect(box).toMatchObject(extension);
    expect(box.minY).toBe(0);
    expect(box.maxY).toBe(14 / 16);
    if (connection.dx !== -1) expect(box.minX).toBe(1 / 16);
    if (connection.dx !== 1) expect(box.maxX).toBe(15 / 16);
    if (connection.dz !== -1) expect(box.minZ).toBe(1 / 16);
    if (connection.dz !== 1) expect(box.maxZ).toBe(15 / 16);
  });

  it('forms a continuous 30/16 double-chest outline on both horizontal axes', () => {
    const west = offsetAabb(getChestCollisionBox({ dx: 1, dz: 0 }), 0, 0, 0);
    const east = offsetAabb(getChestCollisionBox({ dx: -1, dz: 0 }), 1, 0, 0);
    expect(west.maxX).toBe(east.minX);
    expect(east.maxX - west.minX).toBe(30 / 16);
    expect(west.minX).toBe(1 / 16);
    expect(east.maxX).toBe(2 - 1 / 16);

    const north = offsetAabb(getChestCollisionBox({ dx: 0, dz: 1 }), 0, 0, 0);
    const south = offsetAabb(getChestCollisionBox({ dx: 0, dz: -1 }), 0, 0, 1);
    expect(north.maxZ).toBe(south.minZ);
    expect(south.maxZ - north.minZ).toBe(30 / 16);
    expect(north.minZ).toBe(1 / 16);
    expect(south.maxZ).toBe(2 - 1 / 16);
  });

  it('keeps single-chest bounds for missing, diagonal, and non-unit connections', () => {
    const invalidConnections: Array<ChestConnectionOffset | null> = [
      null,
      { dx: 0, dz: 0 },
      { dx: 1, dz: 1 },
      { dx: 2, dz: 0 }
    ];
    for (const connection of invalidConnections) {
      expect(getChestCollisionBox(connection)).toBe(CHEST_COLLISION_BOX);
    }
  });
});

describe('block shape semantics', () => {
  it('separates collision from full neighbor-face occlusion', () => {
    for (const id of [BlockId.Chest, BlockId.Glass, BlockId.Leaves]) {
      expect(getBlockCollisionBoxes(id)).not.toHaveLength(0);
      expect(blockFullyOccludesNeighborFace(id)).toBe(false);
    }

    for (const id of [BlockId.Stone, BlockId.Planks, BlockId.Furnace]) {
      expect(blockFullyOccludesNeighborFace(id)).toBe(true);
    }
  });

  it('keeps lid and direct-skylight blocking as explicit independent queries', () => {
    for (const id of [
      BlockId.Air,
      BlockId.Water,
      BlockId.Torch,
      BlockId.Chest,
      BlockId.Glass,
      BlockId.Leaves
    ]) {
      expect(blockBlocksChestLid(id)).toBe(false);
      expect(blockBlocksSkyLight(id)).toBe(false);
    }

    expect(blockBlocksChestLid(BlockId.Cobblestone)).toBe(true);
    expect(blockBlocksSkyLight(BlockId.Cobblestone)).toBe(true);
  });
});

describe('AABB collision helpers', () => {
  it('builds a feet-anchored player box with the current player dimensions', () => {
    expect(createPlayerAabb({ x: 4.5, y: 9, z: -3.5 })).toEqual({
      minX: 4.5 - DEFAULT_PLAYER_COLLISION_RADIUS,
      minY: 9,
      minZ: -3.5 - DEFAULT_PLAYER_COLLISION_RADIUS,
      maxX: 4.5 + DEFAULT_PLAYER_COLLISION_RADIUS,
      maxY: 9 + DEFAULT_PLAYER_COLLISION_HEIGHT,
      maxZ: -3.5 + DEFAULT_PLAYER_COLLISION_RADIUS
    });
  });

  it('requires positive volume overlap and supports an overlap epsilon', () => {
    const unit = FULL_BLOCK_COLLISION_BOX;
    const touching = { ...unit, minX: 1, maxX: 2 };
    const tinyOverlap = { ...unit, minX: 0.99995, maxX: 2 };

    expect(aabbsIntersect(unit, touching)).toBe(false);
    expect(aabbsIntersect(unit, tinyOverlap)).toBe(true);
    expect(aabbsIntersect(unit, tinyOverlap, 0.0001)).toBe(false);
  });

  it('honors the chest inset and lowered top when intersecting a player', () => {
    const insideSide = createPlayerAabb({ x: 0.35, y: 0, z: 0.5 });
    const outsideSide = createPlayerAabb({ x: -0.2375, y: 0, z: 0.5 });
    const aboveTop = createPlayerAabb({ x: 0.5, y: 14 / 16, z: 0.5 });

    expect(aabbIntersectsBlock(insideSide, BlockId.Chest, 0, 0, 0)).toBe(true);
    expect(aabbIntersectsBlock(outsideSide, BlockId.Chest, 0, 0, 0)).toBe(false);
    expect(aabbIntersectsBlock(aboveTop, BlockId.Chest, 0, 0, 0)).toBe(false);
    expect(aabbIntersectsBlock(insideSide, BlockId.Torch, 0, 0, 0)).toBe(false);
  });

  it('clips positive and negative horizontal movement at an inset chest wall', () => {
    const fromWest = createPlayerAabb({ x: 0.5, y: 0, z: 1.5 });
    const eastward = clipAabbMovementAgainstBlock(
      fromWest,
      BlockId.Chest,
      1,
      0,
      1,
      'x',
      1,
      0.0001
    );
    expect(eastward).toBeCloseTo(1 + 1 / 16 - fromWest.maxX - 0.0001, 8);
    expect(aabbsIntersect(
      moveAabbAlongAxis(fromWest, 'x', eastward),
      getBlockWorldCollisionBoxes(BlockId.Chest, 1, 0, 1)[0]!
    )).toBe(false);

    const fromEast = createPlayerAabb({ x: 2.5, y: 0, z: 1.5 });
    const westward = clipAabbMovementAgainstBlock(
      fromEast,
      BlockId.Chest,
      1,
      0,
      1,
      'x',
      -1,
      0.0001
    );
    expect(westward).toBeCloseTo(1 + 15 / 16 - fromEast.minX + 0.0001, 8);
  });

  it('clips downward movement onto the chest top but ignores orthogonal misses', () => {
    const aboveChest = createPlayerAabb({ x: 0.5, y: 1.5, z: 0.5 });
    expect(clipAabbMovementAgainstBlock(
      aboveChest,
      BlockId.Chest,
      0,
      0,
      0,
      'y',
      -1
    )).toBeCloseTo(14 / 16 - 1.5, 8);

    const besideChest = createPlayerAabb({ x: 3.5, y: 1.5, z: 0.5 });
    expect(clipAabbMovementAgainstBlock(
      besideChest,
      BlockId.Chest,
      0,
      0,
      0,
      'y',
      -1
    )).toBe(-1);
  });

  it('chooses the nearest obstacle when clipping against multiple boxes', () => {
    const moving: Aabb = {
      minX: 0,
      minY: 0,
      minZ: 0,
      maxX: 0.6,
      maxY: 1.8,
      maxZ: 0.6
    };
    const obstacles: Aabb[] = [
      { minX: 3, minY: 0, minZ: 0, maxX: 4, maxY: 1, maxZ: 1 },
      { minX: 1.5, minY: 0, minZ: 0, maxX: 2.5, maxY: 1, maxZ: 1 }
    ];

    expect(clipAabbMovementAgainstBoxes(moving, obstacles, 'x', 5)).toBeCloseTo(0.9);
  });
});

describe('AABB shape raycasts', () => {
  it('returns world distance and the entry normal for non-normalized directions', () => {
    expect(raycastAabb(
      { x: -2, y: 0.5, z: 0.5 },
      { x: 4, y: 0, z: 0 },
      FULL_BLOCK_COLLISION_BOX,
      10
    )).toEqual({
      distance: 2,
      normal: { x: -1, y: 0, z: 0 }
    });
  });

  it('uses the nearest exit face when the origin is inside', () => {
    expect(raycastAabb(
      { x: 0.5, y: 0.25, z: 0.5 },
      { x: 0, y: -8, z: 0 },
      FULL_BLOCK_COLLISION_BOX,
      1
    )).toEqual({
      distance: 0.25,
      normal: { x: 0, y: -1, z: 0 }
    });
  });

  it('handles parallel components and rejects a zero direction', () => {
    expect(raycastAabb(
      { x: -1, y: 0.5, z: 0.5 },
      { x: 1, y: 0, z: 0 },
      FULL_BLOCK_COLLISION_BOX
    )?.distance).toBe(1);
    expect(raycastAabb(
      { x: -1, y: 1.01, z: 0.5 },
      { x: 1, y: 0, z: 0 },
      FULL_BLOCK_COLLISION_BOX
    )).toBeNull();
    expect(raycastAabb(
      { x: 0.5, y: 0.5, z: 0.5 },
      { x: 0, y: 0, z: 0 },
      FULL_BLOCK_COLLISION_BOX
    )).toBeNull();
  });

  it('counts an exact edge graze but rejects a ray just beyond the edge', () => {
    expect(raycastAabb(
      { x: -1, y: 1, z: 1 },
      { x: 1, y: 0, z: 0 },
      FULL_BLOCK_COLLISION_BOX
    )).toEqual({
      distance: 1,
      normal: { x: -1, y: 0, z: 0 }
    });
    expect(raycastAabb(
      { x: -1, y: 1 + Number.EPSILON, z: 1 },
      { x: 1, y: 0, z: 0 },
      FULL_BLOCK_COLLISION_BOX
    )).toBeNull();
  });

  it('includes a hit exactly at max distance and excludes farther hits', () => {
    const origin = { x: -1, y: 0.5, z: 0.5 };
    const direction = { x: 3, y: 0, z: 0 };
    expect(raycastAabb(origin, direction, FULL_BLOCK_COLLISION_BOX, 1)?.distance).toBe(1);
    expect(raycastAabb(origin, direction, FULL_BLOCK_COLLISION_BOX, 0.9999)).toBeNull();
    expect(raycastAabb(origin, direction, FULL_BLOCK_COLLISION_BOX, -1)).toBeNull();
  });

  it('raycasts the chest inset and misses its side and top gaps', () => {
    expect(raycastBlockShape(
      BlockId.Chest,
      0,
      0,
      0,
      { x: -1, y: 0.5, z: 0.5 },
      { x: 2, y: 0, z: 0 },
      4
    )).toEqual({
      distance: 1 + 1 / 16,
      normal: { x: -1, y: 0, z: 0 }
    });

    const throughSideGap = { x: -1, y: 0.5, z: 1 / 32 };
    expect(raycastBlockShape(
      BlockId.Chest,
      0,
      0,
      0,
      throughSideGap,
      { x: 1, y: 0, z: 0 },
      4
    )).toBeNull();
    expect(raycastBlockShape(
      BlockId.Stone,
      0,
      0,
      0,
      throughSideGap,
      { x: 1, y: 0, z: 0 },
      4
    )?.distance).toBe(1);

    const throughTopGap = { x: -1, y: 15 / 16, z: 0.5 };
    expect(raycastBlockShape(
      BlockId.Chest,
      0,
      0,
      0,
      throughTopGap,
      { x: 1, y: 0, z: 0 },
      4
    )).toBeNull();
  });

  it.each([
    [{ dx: -1, dz: 0 }, { x: 0, y: 0.5, z: -1 }, { x: 0, y: 0, z: 1 }],
    [{ dx: 1, dz: 0 }, { x: 1, y: 0.5, z: -1 }, { x: 0, y: 0, z: 1 }],
    [{ dx: 0, dz: -1 }, { x: -1, y: 0.5, z: 0 }, { x: 1, y: 0, z: 0 }],
    [{ dx: 0, dz: 1 }, { x: -1, y: 0.5, z: 1 }, { x: 1, y: 0, z: 0 }]
  ] as const)('raycasts the closed center seam for connection %j', (connection, origin, direction) => {
    expect(raycastBlockShape(
      BlockId.Chest,
      0,
      0,
      0,
      origin,
      direction,
      4,
      connection
    )).not.toBeNull();
    expect(raycastBlockShape(
      BlockId.Chest,
      0,
      0,
      0,
      origin,
      direction,
      4
    )).toBeNull();
  });

  it.each([
    [{ dx: 1, dz: 0 }, { x: 1 / 32, y: 0.5, z: -1 }, { x: 0, y: 0, z: 1 }],
    [{ dx: -1, dz: 0 }, { x: 31 / 32, y: 0.5, z: -1 }, { x: 0, y: 0, z: 1 }],
    [{ dx: 0, dz: 1 }, { x: -1, y: 0.5, z: 1 / 32 }, { x: 1, y: 0, z: 0 }],
    [{ dx: 0, dz: -1 }, { x: -1, y: 0.5, z: 31 / 32 }, { x: 1, y: 0, z: 0 }]
  ] as const)('keeps the outer edge gap for connection %j', (connection, origin, direction) => {
    expect(raycastBlockShape(
      BlockId.Chest,
      0,
      0,
      0,
      origin,
      direction,
      4,
      connection
    )).toBeNull();
  });

  it('misses non-colliding block shapes while ordinary blocks remain full cubes', () => {
    const origin = { x: -1, y: 0.5, z: 0.5 };
    const direction = { x: 1, y: 0, z: 0 };
    for (const id of [BlockId.Air, BlockId.Water, BlockId.Torch]) {
      expect(raycastBlockShape(id, 0, 0, 0, origin, direction, 4)).toBeNull();
    }
    expect(raycastBlockShape(BlockId.Planks, 0, 0, 0, origin, direction, 4)).toEqual({
      distance: 1,
      normal: { x: -1, y: 0, z: 0 }
    });
  });
});
