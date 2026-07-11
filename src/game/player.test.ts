import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  getBlockWorldCollisionBoxes,
  type ChestConnectionOffset
} from './block-shapes';
import { BlockId } from './types';
import type { VoxelWorld } from './world';
import { PlayerController } from './player';

function createDomElement(): HTMLElement {
  return {
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  } as unknown as HTMLElement;
}

function createWorld(
  extraSolid?: (x: number, y: number, z: number) => boolean,
  liquid?: (x: number, y: number, z: number) => boolean,
  blockAt?: (x: number, y: number, z: number) => BlockId | undefined,
  chestConnectionAt?: (
    x: number,
    y: number,
    z: number
  ) => ChestConnectionOffset | null | undefined
): VoxelWorld {
  const getBlock = (x: number, y: number, z: number): BlockId => {
    if (y === 0) return BlockId.Stone;
    const customBlock = blockAt?.(x, y, z);
    if (customBlock !== undefined) return customBlock;
    if (extraSolid?.(x, y, z)) return BlockId.Stone;
    if (liquid?.(x, y, z)) return BlockId.Water;
    return BlockId.Air;
  };

  return {
    getSpawnPoint: () => new Vector3(0.5, 3, 0.5),
    getBlock,
    isSolid: (xOrId: number, y?: number, z?: number) => {
      const id = y === undefined || z === undefined
        ? xOrId as BlockId
        : getBlock(xOrId, y, z);
      return id !== BlockId.Air && id !== BlockId.Water && id !== BlockId.Torch;
    },
    isLiquid: (xOrId: number, y?: number, z?: number) => {
      const id = y === undefined || z === undefined
        ? xOrId as BlockId
        : getBlock(xOrId, y, z);
      return id === BlockId.Water;
    },
    getBlockCollisionBoxes: (x: number, y: number, z: number, id?: BlockId) => {
      const blockId = id ?? getBlock(x, y, z);
      const connection = blockId === BlockId.Chest ? chestConnectionAt?.(x, y, z) : null;
      const validConnection = connection && (
        (Math.abs(connection.dx) === 1 && connection.dz === 0) ||
        (connection.dx === 0 && Math.abs(connection.dz) === 1)
      ) && getBlock(x + connection.dx, y, z + connection.dz) === BlockId.Chest
        ? connection
        : null;
      return getBlockWorldCollisionBoxes(blockId, x, y, z, validConnection);
    }
  } as unknown as VoxelWorld;
}

describe('PlayerController', () => {
  it('falls onto solid terrain without sinking through it', () => {
    const player = new PlayerController(new PerspectiveCamera(70), createWorld(), createDomElement());

    for (let frame = 0; frame < 240; frame += 1) player.update(1 / 120);

    expect(player.getPosition().y).toBeCloseTo(1, 3);
    expect(player.velocity.y).toBe(0);
    expect(player.onGround).toBe(true);
    player.dispose();
  });

  it('stops at a wall and can jump from the ground', () => {
    const wall = (x: number, y: number): boolean => x === 2 && y >= 1 && y <= 2;
    const player = new PlayerController(new PerspectiveCamera(70), createWorld(wall), createDomElement());
    player.setEnabled(true);

    for (let frame = 0; frame < 180; frame += 1) player.update(1 / 120);
    player.setMoveInput(0, 1, true);
    for (let frame = 0; frame < 240; frame += 1) player.update(1 / 120);

    expect(player.getPosition().x).toBeCloseTo(2 - 0.3 - 0.0001, 4);
    expect(player.onGround).toBe(true);

    const beforeJump = player.getPosition().y;
    player.jump();
    player.update(1 / 60);
    expect(player.getPosition().y).toBeGreaterThan(beforeJump);
    expect(player.velocity.y).toBeGreaterThan(0);
    player.dispose();
  });

  it('stands on the lowered chest top and records the landing normally', () => {
    const chest = (x: number, y: number, z: number): BlockId | undefined =>
      x === 0 && y === 1 && z === 0 ? BlockId.Chest : undefined;
    const player = new PlayerController(
      new PerspectiveCamera(70),
      createWorld(undefined, undefined, chest),
      createDomElement()
    );
    player.teleport(new Vector3(0.5, 5, 0.5));

    for (let frame = 0; frame < 360 && !player.onGround; frame += 1) player.update(1 / 120);

    expect(player.getPosition().y).toBeCloseTo(1 + 14 / 16, 3);
    expect(player.velocity.y).toBe(0);
    expect(player.onGround).toBe(true);
    expect(player.consumeLandingDistance()).toBeGreaterThan(3);
    player.dispose();
  });

  it.each([
    {
      first: [0, 1, 0] as const,
      second: [1, 1, 0] as const,
      landing: new Vector3(1, 5, 0.5)
    },
    {
      first: [0, 1, 0] as const,
      second: [0, 1, 1] as const,
      landing: new Vector3(0.5, 5, 1)
    }
  ])('stands on the continuous lowered top at a double-chest seam', ({ first, second, landing }) => {
    const blockAt = (x: number, y: number, z: number): BlockId | undefined => (
      (x === first[0] && y === first[1] && z === first[2]) ||
      (x === second[0] && y === second[1] && z === second[2])
        ? BlockId.Chest
        : undefined
    );
    const connectionAt = (x: number, y: number, z: number): ChestConnectionOffset | null => {
      if (x === first[0] && y === first[1] && z === first[2]) {
        return { dx: second[0] - first[0], dz: second[2] - first[2] };
      }
      if (x === second[0] && y === second[1] && z === second[2]) {
        return { dx: first[0] - second[0], dz: first[2] - second[2] };
      }
      return null;
    };
    const player = new PlayerController(
      new PerspectiveCamera(70),
      createWorld(undefined, undefined, blockAt, connectionAt),
      createDomElement()
    );
    player.teleport(landing);

    for (let frame = 0; frame < 360 && !player.onGround; frame += 1) player.update(1 / 120);

    expect(player.getPosition().y).toBeCloseTo(1 + 14 / 16, 3);
    expect(player.velocity.y).toBe(0);
    expect(player.onGround).toBe(true);
    player.dispose();
  });

  it('keeps the outer 1/16 side gap on a connected chest half', () => {
    const blockAt = (x: number, y: number, z: number): BlockId | undefined =>
      y === 1 && z === 0 && (x === 0 || x === 1) ? BlockId.Chest : undefined;
    const connectionAt = (x: number, y: number, z: number): ChestConnectionOffset | null => {
      if (y !== 1 || z !== 0) return null;
      if (x === 0) return { dx: 1, dz: 0 };
      if (x === 1) return { dx: -1, dz: 0 };
      return null;
    };
    const player = new PlayerController(
      new PerspectiveCamera(70),
      createWorld(undefined, undefined, blockAt, connectionAt),
      createDomElement()
    );
    player.teleport(new Vector3(-0.2376, 4, 0.5));

    expect(player.intersectsBlock(0, 1, 0, BlockId.Chest)).toBe(false);
    for (let frame = 0; frame < 360 && !player.onGround; frame += 1) player.update(1 / 120);

    expect(player.getPosition().y).toBeCloseTo(1, 3);
    player.dispose();
  });

  it('does not collide with the empty space beside an inset chest', () => {
    const chest = (x: number, y: number, z: number): BlockId | undefined =>
      x === 0 && y === 1 && z === 0 ? BlockId.Chest : undefined;
    const player = new PlayerController(
      new PerspectiveCamera(70),
      createWorld(undefined, undefined, chest),
      createDomElement()
    );
    player.teleport(new Vector3(-0.2376, 4, 0.5));

    expect(player.intersectsBlock(0, 1, 0, BlockId.Chest)).toBe(false);
    for (let frame = 0; frame < 360 && !player.onGround; frame += 1) player.update(1 / 120);

    expect(player.getPosition().y).toBeCloseTo(1, 3);
    player.dispose();
  });

  it('stops at the inset side of a chest', () => {
    const chest = (x: number, y: number, z: number): BlockId | undefined =>
      x === 2 && y === 1 && z === 0 ? BlockId.Chest : undefined;
    const player = new PlayerController(
      new PerspectiveCamera(70),
      createWorld(undefined, undefined, chest),
      createDomElement()
    );
    player.teleport(new Vector3(0.5, 1.0001, 0.5));
    player.setEnabled(true);
    player.setMoveInput(0, 1);

    for (let frame = 0; frame < 240; frame += 1) player.update(1 / 120);

    expect(player.getPosition().x).toBeCloseTo(2 + 1 / 16 - 0.3 - 0.0001, 4);
    expect(player.getPosition().y).toBeCloseTo(1, 3);
    player.dispose();
  });

  it('ignores air, water, and torches in explicit block intersection checks', () => {
    const player = new PlayerController(new PerspectiveCamera(70), createWorld(), createDomElement());
    player.teleport(new Vector3(0.5, 1, 0.5));

    expect(player.intersectsBlock(0, 1, 0, BlockId.Air)).toBe(false);
    expect(player.intersectsBlock(0, 1, 0, BlockId.Water)).toBe(false);
    expect(player.intersectsBlock(0, 1, 0, BlockId.Torch)).toBe(false);
    expect(player.intersectsBlock(0, 1, 0, BlockId.Stone)).toBe(true);
    player.dispose();
  });

  it('restores a valid spatial snapshot and preserves the selected slot on save', () => {
    const player = new PlayerController(new PerspectiveCamera(70), createWorld(), createDomElement());
    player.applySnapshot({
      position: [4.5, 9, -3.5],
      yaw: Math.PI * 3,
      pitch: Math.PI,
      selectedSlot: 6
    });

    const snapshot = player.getSnapshot(6);
    expect(snapshot.position).toEqual([4.5, 9, -3.5]);
    expect(snapshot.yaw).toBeCloseTo(-Math.PI);
    expect(snapshot.pitch).toBeLessThan(Math.PI / 2);
    expect(snapshot.selectedSlot).toBe(6);
    player.dispose();
  });

  it('slows in water and swims upward while jump is held', () => {
    const water = (_x: number, y: number): boolean => y >= 1 && y <= 3;
    const player = new PlayerController(new PerspectiveCamera(70), createWorld(undefined, water), createDomElement());
    player.teleport(new Vector3(0.5, 1.2, 0.5));
    player.setEnabled(true);
    player.setMoveInput(1, 0, true);
    player.setJumpPressed(true);

    for (let frame = 0; frame < 30; frame += 1) player.update(1 / 120);

    expect(player.horizontalSpeed).toBeLessThanOrEqual(2.35);
    expect(player.velocity.y).toBeGreaterThan(0);
    expect(player.isSprinting()).toBe(false);
    player.dispose();
  });

  it('applies crouch movement, FOV, and sensitivity settings without recreation', () => {
    const camera = new PerspectiveCamera(70);
    const player = new PlayerController(camera, createWorld(), createDomElement());
    player.setEnabled(true);
    for (let frame = 0; frame < 180; frame += 1) player.update(1 / 120);

    player.setFov(90);
    player.setSensitivity(2);
    player.setCrouchPressed(true);
    player.setMoveInput(1, 0, true);
    player.addLookDelta(100, 0);
    for (let frame = 0; frame < 120; frame += 1) player.update(1 / 120);

    expect(camera.fov).toBeCloseTo(90);
    expect(player.yaw).toBeCloseTo(-0.44);
    expect(player.horizontalSpeed).toBeLessThanOrEqual(1.35);
    expect(camera.position.y - player.getPosition().y).toBeLessThan(1.55);
    expect(player.isSprinting()).toBe(false);
    expect(player.isCrouching()).toBe(true);
    player.dispose();
  });

  it('slows movement and disables sprinting while an item is being used', () => {
    const player = new PlayerController(new PerspectiveCamera(70), createWorld(), createDomElement());
    player.setEnabled(true);
    for (let frame = 0; frame < 180; frame += 1) player.update(1 / 120);

    player.setMoveInput(1, 0, true);
    player.setUsingItem(true);
    for (let frame = 0; frame < 120; frame += 1) player.update(1 / 120);

    expect(player.horizontalSpeed).toBeLessThanOrEqual(0.86);
    expect(player.isSprinting()).toBe(false);

    player.setUsingItem(false);
    for (let frame = 0; frame < 120; frame += 1) player.update(1 / 120);

    expect(player.horizontalSpeed).toBeGreaterThan(5);
    expect(player.isSprinting()).toBe(true);
    player.dispose();
  });

  it('reports landing distance once and exposes head submersion', () => {
    const player = new PlayerController(new PerspectiveCamera(70), createWorld(), createDomElement());
    player.teleport(new Vector3(0.5, 8, 0.5));

    for (let frame = 0; frame < 360 && !player.onGround; frame += 1) player.update(1 / 120);

    expect(player.consumeLandingDistance()).toBeGreaterThan(6.5);
    expect(player.consumeLandingDistance()).toBe(0);
    player.dispose();

    const water = (_x: number, y: number): boolean => y === 2;
    const swimmer = new PlayerController(
      new PerspectiveCamera(70),
      createWorld(undefined, water),
      createDomElement()
    );
    swimmer.teleport(new Vector3(0.5, 0.5, 0.5));
    expect(swimmer.isHeadUnderwater()).toBe(true);
    swimmer.dispose();
  });
});
