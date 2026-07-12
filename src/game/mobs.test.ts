import { Mesh, MeshLambertMaterial, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  MobManager,
  getMobLegSwingDirection,
  selectPassiveMobKind
} from './mobs';
import { BlockId } from './types';
import type { VoxelWorld } from './world';

function createFlatWorld(
  light: { sky: number; block: number } = { sky: 15, block: 0 },
  groundY = 0
): VoxelWorld {
  return {
    getBlock: (_x: number, y: number) => (y <= groundY ? BlockId.Grass : BlockId.Air),
    isSolid: (_x: number, y?: number) => y !== undefined && y <= groundY,
    isLiquid: () => false,
    getLightLevel: () => ({ ...light })
  } as unknown as VoxelWorld;
}

function createLayeredCaveWorld(): VoxelWorld {
  const getBlock = (_x: number, y: number): BlockId => {
    if (y <= 3 || y === 6) return BlockId.Stone;
    if (y === 10) return BlockId.Grass;
    return BlockId.Air;
  };
  return {
    getBlock,
    isSolid: (x: number, y?: number) => y !== undefined && getBlock(x, y) !== BlockId.Air,
    isLiquid: () => false,
    getLightLevel: (_x: number, y: number) => (
      y >= 11 ? { sky: 15, block: 0 } : { sky: 0, block: 0 }
    )
  } as unknown as VoxelWorld;
}

function createTorchOccupiedSpawnWorld(): VoxelWorld {
  return {
    getBlock: (_x: number, y: number) => {
      if (y <= 4) return BlockId.Grass;
      if (y === 5) return BlockId.Torch;
      return BlockId.Air;
    },
    isSolid: (_x: number, y?: number) => y !== undefined && y <= 4,
    isLiquid: () => false,
    getLightLevel: () => ({ sky: 15, block: 14 })
  } as unknown as VoxelWorld;
}

function createWallWorld(): VoxelWorld {
  const getBlock = (_x: number, y: number, z: number): BlockId => (
    y <= 0 || (z === -1 && y >= 1 && y <= 3) ? BlockId.Stone : BlockId.Air
  );
  return {
    getBlock,
    isSolid: (x: number, y?: number, z?: number) => (
      y !== undefined && z !== undefined && getBlock(x, y, z) !== BlockId.Air
    ),
    isLiquid: () => false,
    getLightLevel: () => ({ sky: 0, block: 0 })
  } as unknown as VoxelWorld;
}

describe('MobManager', () => {
  it('uses the standard sheep, pig, and cow passive spawn weights', () => {
    expect(selectPassiveMobKind(0)).toBe('sheep');
    expect(selectPassiveMobKind(12 / 30 - Number.EPSILON)).toBe('sheep');
    expect(selectPassiveMobKind(12 / 30)).toBe('pig');
    expect(selectPassiveMobKind(22 / 30 - Number.EPSILON)).toBe('pig');
    expect(selectPassiveMobKind(22 / 30)).toBe('cow');
    expect(selectPassiveMobKind(1)).toBe('cow');
  });

  it('swings quadruped legs in diagonal pairs instead of pacing', () => {
    expect([0, 1, 2, 3].map((index) => getMobLegSwingDirection(index, 4))).toEqual([
      1,
      -1,
      -1,
      1
    ]);
    expect([0, 1].map((index) => getMobLegSwingDirection(index, 2))).toEqual([1, -1]);
  });

  it('ray attacks the nearest mob and returns deterministic drops on death', () => {
    const onMobHurt = vi.fn();
    const onDrop = vi.fn();
    const manager = new MobManager(createFlatWorld(), 123, { onMobHurt, onDrop });
    manager.spawnMob('pig', new Vector3(0, 1, -3));

    const hurt = manager.attackRay(new Vector3(0, 1.4, 0), new Vector3(0, 0, -1), 4);
    expect(hurt?.kind).toBe('pig');
    expect(hurt?.killed).toBe(false);
    expect(hurt?.damage).toBe(4);
    expect(hurt?.remainingHealth).toBe(6);

    const blocked = manager.attackRay(new Vector3(0, 1.4, 0), new Vector3(0, 0, -1), 4);
    expect(blocked?.blocked).toBe(true);
    expect(blocked?.damage).toBe(0);
    expect(blocked?.remainingHealth).toBe(6);
    expect(onMobHurt).toHaveBeenCalledTimes(1);
    expect(onDrop).not.toHaveBeenCalled();

    const killed = manager.attackRay(new Vector3(0, 1.4, 0), new Vector3(0, 0, -1), 10);
    expect(killed?.killed).toBe(true);
    expect(killed?.blocked).toBe(false);
    expect(killed?.damage).toBe(6);
    expect(killed?.remainingHealth).toBe(0);
    expect(killed?.drops[0]?.item).toBe('raw_pork');
    expect(onMobHurt).toHaveBeenCalledTimes(2);
    expect(onMobHurt).toHaveBeenLastCalledWith('pig', expect.any(Vector3), true);
    expect(onDrop).toHaveBeenCalledTimes(killed?.drops.length ?? 0);
    expect(manager.getCount()).toBe(0);
    manager.dispose();
  });

  it('gives cows ten health, the standard damage immunity window, and bounded drops', () => {
    const onDrop = vi.fn();
    const manager = new MobManager(createFlatWorld(), 912, { onDrop });
    manager.spawnMob('cow', new Vector3(0, 1, -3));
    const origin = new Vector3(0, 1.5, 0);
    const direction = new Vector3(0, 0, -1);

    expect(manager.attackRay(origin, direction, 4)).toMatchObject({
      kind: 'cow',
      damage: 4,
      remainingHealth: 6,
      killed: false,
      blocked: false
    });
    expect(manager.attackRay(origin, direction, 4)).toMatchObject({
      damage: 0,
      remainingHealth: 6,
      blocked: true
    });
    const killed = manager.attackRay(origin, direction, 10);
    expect(killed).toMatchObject({
      kind: 'cow',
      damage: 6,
      remainingHealth: 0,
      killed: true,
      blocked: false
    });
    const beef = killed?.drops.find((drop) => drop.item === 'raw_beef');
    const leather = killed?.drops.find((drop) => drop.item === 'leather');
    expect(beef?.count).toBeGreaterThanOrEqual(1);
    expect(beef?.count).toBeLessThanOrEqual(3);
    if (leather) {
      expect(leather.count).toBeGreaterThanOrEqual(1);
      expect(leather.count).toBeLessThanOrEqual(2);
    }
    expect(killed?.drops.every((drop) => drop.item === 'raw_beef' || drop.item === 'leather')).toBe(true);
    expect(onDrop).toHaveBeenCalledTimes(killed?.drops.length ?? 0);
    expect(manager.getCount('cow')).toBe(0);
    manager.dispose();
  });

  it('builds cows from dedicated materials with four animated legs', () => {
    const manager = new MobManager(createFlatWorld(), 1);
    manager.spawnMob('cow', new Vector3(0, 1, 0));
    const cow = manager.children[0]!;
    const legs = cow.children.filter((child) => child.name.startsWith('Cow leg')) as Mesh[];
    const colors = new Set<string>();
    cow.traverse((object) => {
      if (object instanceof Mesh && object.material instanceof MeshLambertMaterial) {
        colors.add(object.material.color.getHexString());
      }
    });

    expect(legs).toHaveLength(4);
    expect(cow.children.map((child) => child.name)).toEqual(expect.arrayContaining([
      'Cow rear patch',
      'Cow left patch',
      'Cow right patch',
      'Cow udder',
      'Cow tail',
      'Cow tail tuft'
    ]));
    expect(colors).toEqual(expect.objectContaining(new Set([
      '7a4b2e',
      '3b281f',
      'c89f82',
      'ddd2ae'
    ])));
    for (let tick = 0; tick < 8; tick += 1) {
      manager.update(0.05, new Vector3(8, 1, 0), 1);
    }
    expect(legs.some((leg) => Math.abs(leg.rotation.x) > 0.001)).toBe(true);
    expect(legs[0]?.rotation.x).toBeCloseTo(-(legs[1]?.rotation.x ?? 0), 8);
    expect(legs[0]?.rotation.x).toBeCloseTo(legs[3]?.rotation.x ?? 0, 8);
    expect(legs[1]?.rotation.x).toBeCloseTo(legs[2]?.rotation.x ?? 0, 8);
    manager.dispose();
  });

  it('uses the cow radius and height for ray hit bounds', () => {
    const manager = new MobManager(createFlatWorld(), 731);
    manager.spawnMob('cow', new Vector3(0, 1, -3));
    const forward = new Vector3(0, 0, -1);

    expect(manager.raycastMob(new Vector3(0.449, 2.399, 0), forward, 4.5)?.kind).toBe('cow');
    expect(manager.raycastMob(new Vector3(0.451, 1.7, 0), forward, 4.5)).toBeNull();
    expect(manager.raycastMob(new Vector3(0, 2.401, 0), forward, 4.5)).toBeNull();
    manager.dispose();
  });

  it('builds a procedural creeper with a face, body, and four animated legs', () => {
    const manager = new MobManager(createFlatWorld(), 707, { canTargetPlayer: () => false });
    manager.spawnMob('creeper', new Vector3(0, 1, 0));
    const creeper = manager.children[0]!;
    const names = creeper.children.map((child) => child.name);
    const legs = creeper.children.filter((child) => child.name.startsWith('Creeper leg')) as Mesh[];
    const colors = new Set<string>();
    creeper.traverse((object) => {
      if (object instanceof Mesh && object.material instanceof MeshLambertMaterial) {
        colors.add(object.material.color.getHexString());
      }
    });

    expect(names).toEqual(expect.arrayContaining([
      'Creeper head',
      'Creeper body',
      'Creeper face left eye',
      'Creeper face right eye',
      'Creeper face mouth',
      'Creeper face left frown',
      'Creeper face right frown'
    ]));
    expect(legs).toHaveLength(4);
    expect(colors).toEqual(expect.objectContaining(new Set([
      '58a84f',
      '75be61',
      '2f6838',
      '172f21'
    ])));
    for (let tick = 0; tick < 8; tick += 1) {
      manager.update(0.05, new Vector3(8, 1, 0), 0.1);
    }
    expect(legs.some((leg) => Math.abs(leg.rotation.x) > 0.001)).toBe(true);
    expect(legs[0]?.rotation.x).toBeCloseTo(legs[3]?.rotation.x ?? 0, 8);
    expect(legs[1]?.rotation.x).toBeCloseTo(legs[2]?.rotation.x ?? 0, 8);
    manager.dispose();
  });

  it('gives creepers twenty health and zero to two gunpowder on ordinary death', () => {
    const onDrop = vi.fn();
    const manager = new MobManager(createFlatWorld(), 1919, {
      canTargetPlayer: () => false,
      onDrop
    });
    manager.spawnMob('creeper', new Vector3(0, 1, -3));
    const killed = manager.attackRay(
      new Vector3(0, 1.6, 0),
      new Vector3(0, 0, -1),
      20
    );

    expect(killed).toMatchObject({
      kind: 'creeper',
      damage: 20,
      remainingHealth: 0,
      killed: true,
      blocked: false
    });
    expect(killed?.drops).toHaveLength(killed?.drops[0] ? 1 : 0);
    if (killed?.drops[0]) {
      expect(killed.drops[0].item).toBe('gunpowder');
      expect(killed.drops[0].count).toBeGreaterThanOrEqual(1);
      expect(killed.drops[0].count).toBeLessThanOrEqual(2);
    }
    expect(onDrop).toHaveBeenCalledTimes(killed?.drops.length ?? 0);
    expect(manager.getCount('creeper')).toBe(0);
    manager.dispose();
  });

  it('applies only stronger-hit differences without restarting the immunity window', () => {
    const onMobHurt = vi.fn();
    const manager = new MobManager(createFlatWorld(), 456, { onMobHurt });
    const control = new MobManager(createFlatWorld(), 456);
    manager.spawnMob('zombie', new Vector3(0, 1, -3));
    control.spawnMob('zombie', new Vector3(0, 1, -3));
    const stationaryPlayer = new Vector3(0, 1, -3);
    const attackCurrentPosition = (target: MobManager, damage: number) => {
      const position = target.children[0]!.position;
      return target.attackRay(
        new Vector3(position.x, position.y + 0.4, position.z + 3),
        new Vector3(0, 0, -1),
        damage
      );
    };

    const first = attackCurrentPosition(manager, 4);
    attackCurrentPosition(control, 4);
    expect(first).toMatchObject({ damage: 4, remainingHealth: 16, blocked: false });
    for (let tick = 0; tick < 5; tick += 1) {
      manager.update(0.05, stationaryPlayer, 0.5);
      control.update(0.05, stationaryPlayer, 0.5);
    }

    const stronger = attackCurrentPosition(manager, 8);
    expect(stronger).toMatchObject({ damage: 4, remainingHealth: 12, blocked: false });
    expect(onMobHurt).toHaveBeenCalledTimes(1);
    expect(manager.children[0]!.position).toEqual(control.children[0]!.position);
    expect(manager.children[0]!.scale).toEqual(control.children[0]!.scale);

    manager.update(0.05, stationaryPlayer, 0.5);
    control.update(0.05, stationaryPlayer, 0.5);
    expect(manager.children[0]!.position).toEqual(control.children[0]!.position);
    expect(manager.children[0]!.scale).toEqual(new Vector3(1, 1, 1));
    expect(manager.children[0]!.scale).toEqual(control.children[0]!.scale);

    for (let tick = 0; tick < 5; tick += 1) {
      manager.update(0.05, stationaryPlayer, 0.5);
      control.update(0.05, stationaryPlayer, 0.5);
    }
    const afterOriginalWindow = attackCurrentPosition(manager, 2);
    expect(afterOriginalWindow).toMatchObject({
      damage: 2,
      remainingHealth: 10,
      blocked: false
    });
    expect(onMobHurt).toHaveBeenCalledTimes(2);
    manager.dispose();
    control.dispose();
  });

  it('respects an explicit maximum ray distance without changing the default reach', () => {
    const onMobHurt = vi.fn();
    const manager = new MobManager(createFlatWorld(), 321, { onMobHurt });
    manager.spawnMob('pig', new Vector3(0, 1, -3));
    const origin = new Vector3(0, 1.4, 0);
    const direction = new Vector3(0, 0, -1);

    const outOfRange = manager.attackRay(origin, direction, 4, 2);

    expect(outOfRange).toBeNull();
    expect(onMobHurt).not.toHaveBeenCalled();

    const defaultReach = manager.attackRay(origin, direction, 4);
    expect(defaultReach?.kind).toBe('pig');
    expect(defaultReach?.remainingHealth).toBe(6);
    expect(onMobHurt).toHaveBeenCalledTimes(1);
    manager.dispose();
  });

  it('queries ray targets without damaging, moving, or notifying about the mob', () => {
    const onMobHurt = vi.fn();
    const onDrop = vi.fn();
    const manager = new MobManager(createFlatWorld(), 654, { onMobHurt, onDrop });
    const id = manager.spawnMob('pig', new Vector3(0, 1, -3));
    const origin = new Vector3(0, 1.4, 0);
    const forward = new Vector3(0, 0, -1);

    const hit = manager.raycastMob(origin, forward, 4.5);

    expect(hit?.id).toBe(id);
    expect(hit?.kind).toBe('pig');
    expect(hit?.distance).toBeCloseTo(2.58, 5);
    expect(manager.raycastMob(origin, forward, 2)).toBeNull();
    expect(manager.raycastMob(origin, new Vector3(0, 0, 1), 4.5)).toBeNull();
    expect(onMobHurt).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();

    const attacked = manager.attackRay(origin, forward, 4, 4.5);
    expect(attacked?.remainingHealth).toBe(6);
    expect(onMobHurt).toHaveBeenCalledTimes(1);
    manager.dispose();
  });

  it('lets nearby zombies damage the player on a cooldown', () => {
    const onPlayerDamage = vi.fn();
    const manager = new MobManager(createFlatWorld(), 77, { onPlayerDamage });
    manager.spawnMob('zombie', new Vector3(0, 1, -0.8));
    const player = new Vector3(0, 1, 0);

    manager.update(1 / 30, player, 0.1);
    manager.update(1 / 30, player, 0.1);
    expect(onPlayerDamage).toHaveBeenCalledTimes(1);
    expect(onPlayerDamage).toHaveBeenCalledWith(2, 'zombie');
    manager.dispose();
  });

  it('primes a visible nearby creeper, stops it, then explodes after 1.5 seconds', () => {
    const onCreeperPrime = vi.fn();
    const onDrop = vi.fn();
    let manager: MobManager;
    const onCreeperExplode = vi.fn((position: Vector3, power: number) => {
      expect(manager.getCount('creeper')).toBe(0);
      expect(position.y).toBeCloseTo(1, 2);
      expect(power).toBe(3);
    });
    manager = new MobManager(createFlatWorld(), 313, {
      onCreeperPrime,
      onCreeperExplode,
      onDrop
    });
    const creeperId = manager.spawnMob('creeper', new Vector3(0, 1, -2.25));
    const creeper = manager.children.find((child) => child.name === creeperId)!;
    const player = new Vector3(0, 1, 0);
    const horizontalStart = new Vector3(creeper.position.x, 0, creeper.position.z);
    let sawFlash = false;
    let sawSwelling = false;

    for (let tick = 0; tick < 31; tick += 1) {
      manager.update(0.05, player, 1);
      sawFlash ||= creeper.children.some(
        (child) => child.name === 'Creeper flash overlay' && child.visible
      );
      sawSwelling ||= creeper.scale.x > 1.02;
      if (tick === 0) {
        expect(new Vector3(creeper.position.x, 0, creeper.position.z)).toEqual(horizontalStart);
      }
    }

    expect(onCreeperPrime).toHaveBeenCalledTimes(1);
    expect(onCreeperPrime).toHaveBeenCalledWith(expect.any(Vector3));
    expect(onCreeperExplode).toHaveBeenCalledTimes(1);
    expect(onDrop).not.toHaveBeenCalled();
    expect(sawFlash).toBe(true);
    expect(sawSwelling).toBe(true);
    expect(manager.getCount('creeper')).toBe(0);
    manager.dispose();
  });

  it('cancels a creeper fuse outside seven blocks and can prime again', () => {
    const onCreeperPrime = vi.fn();
    const onCreeperExplode = vi.fn();
    const manager = new MobManager(createFlatWorld(), 314, {
      onCreeperPrime,
      onCreeperExplode
    });
    manager.spawnMob('creeper', new Vector3(0, 1, -2.25));

    manager.update(0.05, new Vector3(0, 1, 0), 1);
    for (let tick = 0; tick < 20; tick += 1) {
      manager.update(0.05, new Vector3(0, 1, 8), 1);
    }
    expect(onCreeperPrime).toHaveBeenCalledTimes(1);
    expect(onCreeperExplode).not.toHaveBeenCalled();

    manager.update(0.05, new Vector3(0, 1, 0), 1);
    expect(onCreeperPrime).toHaveBeenCalledTimes(2);
    expect(onCreeperExplode).not.toHaveBeenCalled();
    manager.dispose();
  });

  it('requires a clear line of sight before a creeper starts its fuse', () => {
    const onCreeperPrime = vi.fn();
    const onCreeperExplode = vi.fn();
    const manager = new MobManager(createWallWorld(), 315, {
      onCreeperPrime,
      onCreeperExplode
    });
    manager.spawnMob('creeper', new Vector3(0, 1, -2.25));

    for (let tick = 0; tick < 50; tick += 1) {
      manager.update(0.05, new Vector3(0, 1, 0), 0.1);
    }

    expect(onCreeperPrime).not.toHaveBeenCalled();
    expect(onCreeperExplode).not.toHaveBeenCalled();
    expect(manager.getCount('creeper')).toBe(1);
    manager.dispose();
  });

  it('does not let zombies or creepers target a creative or dead player', () => {
    const onPlayerDamage = vi.fn();
    const onCreeperPrime = vi.fn();
    const onCreeperExplode = vi.fn();
    const manager = new MobManager(createFlatWorld(), 316, {
      canTargetPlayer: () => false,
      onPlayerDamage,
      onCreeperPrime,
      onCreeperExplode
    });
    manager.spawnMob('zombie', new Vector3(0, 1, -0.8));
    manager.spawnMob('creeper', new Vector3(0, 1, -2.25));

    for (let tick = 0; tick < 40; tick += 1) {
      manager.update(0.05, new Vector3(0, 1, 0), 0.1);
    }

    expect(onPlayerDamage).not.toHaveBeenCalled();
    expect(onCreeperPrime).not.toHaveBeenCalled();
    expect(onCreeperExplode).not.toHaveBeenCalled();
    expect(manager.getCount('creeper')).toBe(1);
    manager.dispose();
  });

  it('damages and knocks back nearby mobs through the explosion integration API', () => {
    const onMobHurt = vi.fn();
    const onDrop = vi.fn();
    const manager = new MobManager(createFlatWorld(), 317, {
      canTargetPlayer: () => false,
      onMobHurt,
      onDrop
    });
    manager.spawnMob('pig', new Vector3(1, 1, 0));
    const zombieId = manager.spawnMob('zombie', new Vector3(3, 1, 0));
    const sampledTargets: Array<{
      kind: string;
      radius: number;
      height: number;
      distance: number;
      center: Vector3;
    }> = [];

    const results = manager.damageMobsInExplosion(
      new Vector3(0, 1.5, 0),
      5,
      (target) => {
        sampledTargets.push(target);
        return target.kind === 'pig' ? 10 : 4;
      }
    );

    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'pig', killed: true, damage: 10 }),
      expect.objectContaining({ kind: 'zombie', killed: false, damage: 4, remainingHealth: 16 })
    ]));
    expect(sampledTargets).toHaveLength(2);
    expect(sampledTargets.every((target) => (
      target.radius > 0 && target.height > 0 && target.distance > 0 && target.center instanceof Vector3
    ))).toBe(true);
    expect(onMobHurt).toHaveBeenCalledTimes(2);
    expect(onDrop).toHaveBeenCalled();
    const zombie = manager.children.find((child) => child.name === zombieId)!;
    const before = zombie.position.clone();
    manager.update(0.05, new Vector3(20, 1, 0), 0.1);
    expect(zombie.position.x).toBeGreaterThan(before.x);
    expect(zombie.position.y).toBeGreaterThan(before.y);
    manager.dispose();
  });

  it('uses an explicit explosion impact callback to suppress blocked knockback', () => {
    const manager = new MobManager(createFlatWorld(), 318, { canTargetPlayer: () => false });
    const control = new MobManager(createFlatWorld(), 318, { canTargetPlayer: () => false });
    manager.spawnMob('zombie', new Vector3(2, 1, 0));
    control.spawnMob('zombie', new Vector3(2, 1, 0));
    const getImpact = vi.fn(() => 0);

    manager.damageMobsInExplosion(
      new Vector3(0, 1, 0),
      5,
      () => 4,
      getImpact
    );
    manager.update(0.05, new Vector3(20, 1, 0), 0.1);
    control.update(0.05, new Vector3(20, 1, 0), 0.1);

    expect(getImpact).toHaveBeenCalledTimes(1);
    expect(manager.children.find((child) => child.name.startsWith('zombie-'))?.position).toEqual(
      control.children.find((child) => child.name.startsWith('zombie-'))?.position
    );
    manager.dispose();
    control.dispose();
  });

  it('allows cave spawns in daytime but suppresses zombies near block light', () => {
    const player = new Vector3(0, 11, 0);
    const darkCave = new MobManager(createLayeredCaveWorld(), 991);
    darkCave.update(0.05, player, 1);
    expect(darkCave.getCount('zombie')).toBeGreaterThan(0);
    const zombieHeights = darkCave.children
      .filter((child) => child.name.startsWith('zombie-'))
      .map((child) => child.position.y);
    expect(zombieHeights.every((height) => height < 10)).toBe(true);
    darkCave.dispose();

    const torchLit = new MobManager(createFlatWorld({ sky: 0, block: 14 }, 4), 991);
    torchLit.update(0.05, player, 0.05);
    expect(torchLit.getCount('zombie')).toBe(0);
    torchLit.dispose();
  });

  it('allows hostile spawning at block light 7 but rejects block light 8', () => {
    const seed = 1437;
    const player = new Vector3(0, 5, 0);
    const nightDaylight = 0.05;
    const allowed = new MobManager(createFlatWorld({ sky: 0, block: 7 }, 4), seed);
    const rejected = new MobManager(createFlatWorld({ sky: 0, block: 8 }, 4), seed);

    allowed.update(0.05, player, nightDaylight);
    rejected.update(0.05, player, nightDaylight);

    expect(allowed.getCount('zombie')).toBeGreaterThan(0);
    expect(rejected.getCount('zombie')).toBe(0);
    allowed.dispose();
    rejected.dispose();
  });

  it('does not use non-solid torch cells as empty spawn space', () => {
    const manager = new MobManager(createTorchOccupiedSpawnWorld(), 812);
    manager.update(0.05, new Vector3(0, 5, 0), 1);

    expect(manager.getCount('pig')).toBe(0);
    expect(manager.getCount('sheep')).toBe(0);
    expect(manager.getCount('cow')).toBe(0);
    expect(manager.getCount('zombie')).toBe(0);
    manager.dispose();
  });

  it('spawns naturally around a player millions of blocks from the origin', () => {
    const manager = new MobManager(createFlatWorld({ sky: 15, block: 0 }, 4), 2026);
    const player = new Vector3(5_000_000.5, 5, -4_000_000.5);

    manager.update(0.05, player, 1);

    expect(manager.getCount('pig') + manager.getCount('sheep') + manager.getCount('cow')).toBeGreaterThan(0);
    for (const mob of manager.children) {
      expect(mob.position.distanceTo(player)).toBeLessThanOrEqual(31);
      expect(mob.position.x).toBeGreaterThan(4_999_960);
      expect(mob.position.z).toBeLessThan(-3_999_960);
    }
    manager.dispose();
  });

  it('includes cows in deterministic natural passive spawning', () => {
    const manager = new MobManager(createFlatWorld({ sky: 15, block: 0 }, 4), 1);
    manager.update(0.05, new Vector3(0, 5, 0), 1);

    expect(manager.getCount('cow')).toBeGreaterThan(0);
    manager.dispose();
  });

  it('shares one eight-mob cap across sheep, pigs, and cows', () => {
    const manager = new MobManager(createFlatWorld({ sky: 15, block: 0 }, 4), 44);
    const player = new Vector3(0, 5, 0);
    for (let tick = 0; tick < 500; tick += 1) manager.update(0.05, player, 1);

    const passiveCount = manager.getCount('sheep') + manager.getCount('pig') + manager.getCount('cow');
    expect(passiveCount).toBe(8);
    manager.dispose();
  });

  it('shares one five-mob hostile cap across zombies and creepers', () => {
    const manager = new MobManager(createFlatWorld({ sky: 0, block: 0 }, 4), 818, {
      canTargetPlayer: () => false
    });
    const player = new Vector3(0, 5, 0);
    for (let tick = 0; tick < 240; tick += 1) manager.update(0.05, player, 0.05);

    const hostileCount = manager.getCount('zombie') + manager.getCount('creeper');
    expect(hostileCount).toBe(5);
    expect(manager.getCount('zombie')).toBeGreaterThan(0);
    expect(manager.getCount('creeper')).toBeGreaterThan(0);
    manager.dispose();
  });
});
