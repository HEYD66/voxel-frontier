import * as THREE from 'three';
import {
  CREEPER_CANCEL_DISTANCE,
  CREEPER_EXPLOSION_POWER,
  CREEPER_FUSE_SECONDS,
  CREEPER_IGNITE_DISTANCE
} from './explosion';
import { BlockId } from './types';
import {
  WORLD_HEIGHT,
  type VoxelWorld
} from './world';

export type MobKind = 'pig' | 'sheep' | 'cow' | 'zombie' | 'creeper';

export interface MobDrop {
  item:
    | 'raw_pork'
    | 'raw_mutton'
    | 'raw_beef'
    | 'leather'
    | 'wool'
    | 'rotten_flesh'
    | 'gunpowder';
  count: number;
}

export interface MobExplosionTarget {
  id: string;
  kind: MobKind;
  position: THREE.Vector3;
  center: THREE.Vector3;
  distance: number;
  radius: number;
  height: number;
}

export interface MobAttackResult {
  id: string;
  kind: MobKind;
  damage: number;
  remainingHealth: number;
  killed: boolean;
  blocked: boolean;
  drops: MobDrop[];
  position: THREE.Vector3;
}

export interface MobRaycastHit {
  id: string;
  kind: MobKind;
  distance: number;
  position: THREE.Vector3;
}

export interface MobManagerCallbacks {
  onPlayerDamage?: (amount: number, source: MobKind) => void;
  onDrop?: (drop: MobDrop, position: THREE.Vector3) => void;
  onMobHurt?: (kind: MobKind, position: THREE.Vector3, killed: boolean) => void;
  canTargetPlayer?: () => boolean;
  onCreeperPrime?: (position: THREE.Vector3) => void;
  onCreeperExplode?: (position: THREE.Vector3, power: number) => void;
}

interface MobDefinition {
  health: number;
  speed: number;
  radius: number;
  height: number;
  hostile: boolean;
}

interface MobEntity {
  id: string;
  kind: MobKind;
  group: THREE.Group;
  legs: THREE.Mesh[];
  health: number;
  velocity: THREE.Vector3;
  wanderAngle: number;
  wanderTimer: number;
  attackCooldown: number;
  hurtTimer: number;
  damageImmunityTimer: number;
  lastDamageTaken: number;
  burnAccumulator: number;
  walkPhase: number;
  onGround: boolean;
  fuseTimer: number;
  fusePrimed: boolean;
  flashParts: THREE.Mesh[];
}

interface MobRayIntersection {
  mob: MobEntity;
  distance: number;
  direction: THREE.Vector3;
}

const MOB_DEFINITIONS: Record<MobKind, MobDefinition> = {
  pig: { health: 10, speed: 1.25, radius: 0.42, height: 1.1, hostile: false },
  sheep: { health: 8, speed: 1.12, radius: 0.43, height: 1.25, hostile: false },
  cow: { health: 10, speed: 1.15, radius: 0.45, height: 1.4, hostile: false },
  zombie: { health: 20, speed: 1.55, radius: 0.31, height: 1.82, hostile: true },
  creeper: { health: 20, speed: 1.42, radius: 0.36, height: 1.82, hostile: true }
};

const GRAVITY = 22;
const MAX_FALL_SPEED = 28;
const MAX_PASSIVE_MOBS = 8;
const MAX_HOSTILE_MOBS = 5;
const PLAYER_ATTACK_REACH = 4.5;
const MOB_DAMAGE_IMMUNITY_SECONDS = 0.5;
const HOSTILE_SPAWN_LIGHT_LIMIT = 7;
const tmpMove = new THREE.Vector3();
const tmpDirection = new THREE.Vector3();
const tmpHitPoint = new THREE.Vector3();
const tmpBox = new THREE.Box3();
const tmpMin = new THREE.Vector3();
const tmpMax = new THREE.Vector3();
const tmpLineStart = new THREE.Vector3();
const tmpLineEnd = new THREE.Vector3();
const tmpLinePoint = new THREE.Vector3();

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function approach(current: number, target: number, maximumDelta: number): number {
  if (current < target) return Math.min(current + maximumDelta, target);
  if (current > target) return Math.max(current - maximumDelta, target);
  return target;
}

function rotateToward(current: number, target: number, amount: number): number {
  const delta = THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + delta * Math.min(1, amount);
}

export function selectPassiveMobKind(
  randomValue: number
): Exclude<MobKind, 'zombie' | 'creeper'> {
  const roll = THREE.MathUtils.clamp(Number.isFinite(randomValue) ? randomValue : 0, 0, 1);
  if (roll < 12 / 30) return 'sheep';
  if (roll < 22 / 30) return 'pig';
  return 'cow';
}

export function getMobLegSwingDirection(index: number, legCount: number): 1 | -1 {
  const normalizedIndex = Math.max(0, Math.trunc(Number.isFinite(index) ? index : 0));
  if (legCount === 4) return normalizedIndex === 0 || normalizedIndex === 3 ? 1 : -1;
  return normalizedIndex % 2 === 0 ? 1 : -1;
}

export class MobManager extends THREE.Group {
  private readonly mobs: MobEntity[] = [];
  private readonly random: () => number;
  private readonly cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly materials = this.createMaterials();
  private spawnTimer = 0;
  private nextId = 1;
  private initialized = false;

  constructor(
    private readonly world: VoxelWorld,
    seed: number,
    private readonly callbacks: MobManagerCallbacks = {}
  ) {
    super();
    this.name = 'Mob manager';
    this.random = seededRandom(seed ^ 0x6d2b79f5);
  }

  update(dt: number, playerPosition: THREE.Vector3, daylight: number): void {
    const safeDt = Math.max(0, Math.min(0.05, Number.isFinite(dt) ? dt : 0));
    if (!this.initialized) {
      this.initialized = true;
      for (let i = 0; i < 5; i += 1) this.trySpawnPassive(playerPosition);
      if (this.getCount('zombie') + this.getCount('creeper') < MAX_HOSTILE_MOBS) {
        this.trySpawnZombie(playerPosition, daylight);
      }
      if (this.getCount('zombie') + this.getCount('creeper') < MAX_HOSTILE_MOBS) {
        this.trySpawnCreeper(playerPosition, daylight);
      }
    }

    this.spawnTimer -= safeDt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2.5;
      const passiveCount = this.getCount('pig') + this.getCount('sheep') + this.getCount('cow');
      const hostileCount = this.getCount('zombie') + this.getCount('creeper');
      if (passiveCount < MAX_PASSIVE_MOBS && daylight > 0.22) this.trySpawnPassive(playerPosition);
      if (hostileCount < MAX_HOSTILE_MOBS) this.trySpawnHostile(playerPosition, daylight);
    }

    const canTargetPlayer = this.callbacks.canTargetPlayer?.() ?? true;

    for (let index = this.mobs.length - 1; index >= 0; index -= 1) {
      const mob = this.mobs[index];
      if (!mob) continue;
      const distanceToPlayer = mob.group.position.distanceTo(playerPosition);
      if (distanceToPlayer > 52) {
        this.removeMob(mob);
        continue;
      }
      this.updateMob(mob, safeDt, playerPosition, daylight, distanceToPlayer, canTargetPlayer);
    }
  }

  spawnMob(kind: MobKind, position: THREE.Vector3): string {
    const definition = MOB_DEFINITIONS[kind];
    const group = new THREE.Group();
    const legs = this.createModel(kind, group);
    const flashParts = group.children.filter(
      (child): child is THREE.Mesh => child instanceof THREE.Mesh && child.name === 'Creeper flash overlay'
    );
    const id = `${kind}-${this.nextId++}`;
    group.name = id;
    group.position.copy(position);
    this.add(group);
    this.mobs.push({
      id,
      kind,
      group,
      legs,
      health: definition.health,
      velocity: new THREE.Vector3(),
      wanderAngle: this.random() * Math.PI * 2,
      wanderTimer: 0.5 + this.random() * 2.5,
      attackCooldown: 0,
      hurtTimer: 0,
      damageImmunityTimer: 0,
      lastDamageTaken: 0,
      burnAccumulator: 0,
      walkPhase: this.random() * Math.PI * 2,
      onGround: false,
      fuseTimer: 0,
      fusePrimed: false,
      flashParts
    });
    return id;
  }

  attackRay(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    damage = 1,
    maximumDistance = PLAYER_ATTACK_REACH
  ): MobAttackResult | null {
    const hit = this.findClosestRayIntersection(origin, direction, maximumDistance);
    if (!hit) return null;
    return this.damageMob(
      hit.mob,
      damage,
      hit.direction.x * 4.2,
      2.8,
      hit.direction.z * 4.2
    );
  }

  damageMobsInExplosion(
    center: THREE.Vector3,
    radius: number,
    getDamage: (target: MobExplosionTarget) => number,
    getImpact?: (target: MobExplosionTarget) => number
  ): MobAttackResult[] {
    const safeRadius = Math.max(0, Number.isFinite(radius) ? radius : 0);
    if (safeRadius <= 0) return [];

    const targets = this.mobs.map((mob) => {
      const definition = MOB_DEFINITIONS[mob.kind];
      const mobCenter = mob.group.position.clone();
      mobCenter.y += definition.height / 2;
      return {
        mob,
        target: {
          id: mob.id,
          kind: mob.kind,
          position: mob.group.position.clone(),
          center: mobCenter,
          distance: mob.group.position.distanceTo(center),
          radius: definition.radius,
          height: definition.height
        } satisfies MobExplosionTarget
      };
    }).filter(({ target }) => target.distance <= safeRadius)
      .sort((a, b) => a.target.distance - b.target.distance || a.target.id.localeCompare(b.target.id));

    const results: MobAttackResult[] = [];
    for (const { mob, target } of targets) {
      if (!this.mobs.includes(mob)) continue;
      const cloneTarget = (): MobExplosionTarget => ({
        ...target,
        position: target.position.clone(),
        center: target.center.clone()
      });
      const damage = getDamage(cloneTarget());
      const horizontalX = target.position.x - center.x;
      const horizontalZ = target.position.z - center.z;
      const horizontalLength = Math.hypot(horizontalX, horizontalZ);
      const distanceImpact = THREE.MathUtils.clamp(1 - target.distance / safeRadius, 0, 1);
      const requestedImpact = getImpact?.(cloneTarget()) ?? distanceImpact;
      const impact = THREE.MathUtils.clamp(
        Number.isFinite(requestedImpact) ? requestedImpact : 0,
        0,
        1
      );
      const knockback = impact * 7;
      results.push(this.damageMob(
        mob,
        damage,
        horizontalLength > Number.EPSILON ? horizontalX / horizontalLength * knockback : 0,
        impact * 5,
        horizontalLength > Number.EPSILON ? horizontalZ / horizontalLength * knockback : 0
      ));
    }
    return results;
  }

  raycastMob(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maximumDistance = PLAYER_ATTACK_REACH
  ): MobRaycastHit | null {
    const hit = this.findClosestRayIntersection(origin, direction, maximumDistance);
    if (!hit) return null;
    return {
      id: hit.mob.id,
      kind: hit.mob.kind,
      distance: hit.distance,
      position: hit.mob.group.position.clone()
    };
  }

  getCount(kind?: MobKind): number {
    return kind ? this.mobs.filter((mob) => mob.kind === kind).length : this.mobs.length;
  }

  clearMobs(): void {
    for (const mob of [...this.mobs]) this.removeMob(mob);
  }

  dispose(): void {
    this.clearMobs();
    this.cubeGeometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.removeFromParent();
  }

  private damageMob(
    mob: MobEntity,
    damage: number,
    knockbackX: number,
    knockbackY: number,
    knockbackZ: number
  ): MobAttackResult {
    const incomingDamage = Math.max(0, Number.isFinite(damage) ? damage : 0);
    const immunityActive = mob.damageImmunityTimer > 0;
    if (incomingDamage <= 0 || (immunityActive && incomingDamage <= mob.lastDamageTaken)) {
      return {
        id: mob.id,
        kind: mob.kind,
        damage: 0,
        remainingHealth: mob.health,
        killed: false,
        blocked: true,
        drops: [],
        position: mob.group.position.clone()
      };
    }

    const appliedDamage = immunityActive
      ? incomingDamage - mob.lastDamageTaken
      : incomingDamage;
    mob.lastDamageTaken = incomingDamage;
    if (!immunityActive) mob.damageImmunityTimer = MOB_DAMAGE_IMMUNITY_SECONDS;
    mob.health = Math.max(0, mob.health - appliedDamage);
    if (!immunityActive) {
      mob.hurtTimer = 0.26;
      mob.velocity.x += Number.isFinite(knockbackX) ? knockbackX : 0;
      mob.velocity.y = Math.max(mob.velocity.y, Number.isFinite(knockbackY) ? knockbackY : 0);
      mob.velocity.z += Number.isFinite(knockbackZ) ? knockbackZ : 0;
    }

    const killed = mob.health <= 0;
    const drops = killed ? this.rollDrops(mob.kind) : [];
    const result: MobAttackResult = {
      id: mob.id,
      kind: mob.kind,
      damage: appliedDamage,
      remainingHealth: mob.health,
      killed,
      blocked: false,
      drops,
      position: mob.group.position.clone()
    };
    if (!immunityActive || killed) {
      this.callbacks.onMobHurt?.(mob.kind, result.position.clone(), killed);
    }
    if (killed) {
      for (const drop of drops) this.callbacks.onDrop?.(drop, result.position.clone());
      this.removeMob(mob);
    }
    return result;
  }

  private findClosestRayIntersection(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maximumDistance: number
  ): MobRayIntersection | null {
    tmpDirection.copy(direction);
    if (tmpDirection.lengthSq() <= Number.EPSILON) return null;
    tmpDirection.normalize();
    const normalizedDirection = tmpDirection.clone();
    const ray = new THREE.Ray(origin, normalizedDirection);
    const reach = Math.max(0, Math.min(
      PLAYER_ATTACK_REACH,
      Number.isFinite(maximumDistance) ? maximumDistance : PLAYER_ATTACK_REACH
    ));
    let closest: MobEntity | null = null;
    let closestDistance = reach + 1;

    for (const mob of this.mobs) {
      const definition = MOB_DEFINITIONS[mob.kind];
      tmpMin.set(
        mob.group.position.x - definition.radius,
        mob.group.position.y,
        mob.group.position.z - definition.radius
      );
      tmpMax.set(
        mob.group.position.x + definition.radius,
        mob.group.position.y + definition.height,
        mob.group.position.z + definition.radius
      );
      tmpBox.set(tmpMin, tmpMax);
      const intersection = ray.intersectBox(tmpBox, tmpHitPoint);
      if (!intersection) continue;
      const distance = intersection.distanceTo(origin);
      if (distance <= reach && distance < closestDistance) {
        closest = mob;
        closestDistance = distance;
      }
    }

    return closest
      ? { mob: closest, distance: closestDistance, direction: normalizedDirection }
      : null;
  }

  private updateMob(
    mob: MobEntity,
    dt: number,
    playerPosition: THREE.Vector3,
    daylight: number,
    distanceToPlayer: number,
    canTargetPlayer: boolean
  ): void {
    const definition = MOB_DEFINITIONS[mob.kind];
    mob.attackCooldown = Math.max(0, mob.attackCooldown - dt);
    mob.hurtTimer = Math.max(0, mob.hurtTimer - dt);
    const previousDamageImmunity = mob.damageImmunityTimer;
    mob.damageImmunityTimer = Math.max(0, mob.damageImmunityTimer - dt);
    if (previousDamageImmunity > 0 && mob.damageImmunityTimer === 0) {
      mob.lastDamageTaken = 0;
    }
    mob.wanderTimer -= dt;

    if (mob.kind === 'zombie' && daylight > 0.72 && this.hasOpenSky(mob.group.position)) {
      mob.burnAccumulator += dt;
      if (mob.burnAccumulator >= 1) {
        mob.burnAccumulator -= 1;
        mob.health -= 1;
        mob.hurtTimer = 0.2;
        if (mob.health <= 0) {
          const deathPosition = mob.group.position.clone();
          const drops = this.rollDrops(mob.kind);
          this.callbacks.onMobHurt?.(mob.kind, deathPosition.clone(), true);
          for (const drop of drops) this.callbacks.onDrop?.(drop, deathPosition.clone());
          this.removeMob(mob);
          return;
        }
      }
    } else {
      mob.burnAccumulator = 0;
    }

    if (mob.kind === 'creeper') {
      const verticalDistance = Math.abs(playerPosition.y - mob.group.position.y);
      const canSeePlayer = canTargetPlayer &&
        verticalDistance < 2.5 &&
        distanceToPlayer <= CREEPER_CANCEL_DISTANCE &&
        this.hasLineOfSightToPlayer(mob, playerPosition);
      if (
        !mob.fusePrimed &&
        canSeePlayer &&
        distanceToPlayer <= CREEPER_IGNITE_DISTANCE
      ) {
        mob.fusePrimed = true;
        mob.velocity.x = 0;
        mob.velocity.z = 0;
        this.callbacks.onCreeperPrime?.(mob.group.position.clone());
      }
      if (mob.fusePrimed) {
        if (canSeePlayer) {
          mob.fuseTimer = Math.min(CREEPER_FUSE_SECONDS, mob.fuseTimer + dt);
        } else {
          mob.fuseTimer = Math.max(0, mob.fuseTimer - dt * 2);
          if (mob.fuseTimer <= 0) mob.fusePrimed = false;
        }
        if (mob.fuseTimer >= CREEPER_FUSE_SECONDS) {
          const explosionPosition = mob.group.position.clone();
          this.removeMob(mob);
          this.callbacks.onCreeperExplode?.(explosionPosition, CREEPER_EXPLOSION_POWER);
          return;
        }
      }
    }

    this.updateMobScaleAndFlash(mob);

    let desiredX = 0;
    let desiredZ = 0;
    let desiredSpeed = definition.speed;
    if (
      definition.hostile &&
      canTargetPlayer &&
      distanceToPlayer < 18 &&
      !(mob.kind === 'creeper' && mob.fusePrimed)
    ) {
      desiredX = playerPosition.x - mob.group.position.x;
      desiredZ = playerPosition.z - mob.group.position.z;
      const length = Math.hypot(desiredX, desiredZ) || 1;
      desiredX /= length;
      desiredZ /= length;
      if (
        mob.kind === 'zombie' &&
        distanceToPlayer < 1.25 &&
        Math.abs(playerPosition.y - mob.group.position.y) < 1.5 &&
        mob.attackCooldown <= 0
      ) {
        mob.attackCooldown = 1.15;
        this.callbacks.onPlayerDamage?.(2, mob.kind);
      }
    } else if (mob.kind === 'creeper' && mob.fusePrimed) {
      desiredSpeed = 0;
    } else {
      if (mob.wanderTimer <= 0) {
        mob.wanderTimer = 1.6 + this.random() * 3.8;
        mob.wanderAngle += (this.random() - 0.5) * Math.PI * 1.4;
      }
      const idle = mob.wanderTimer < 0.6;
      desiredSpeed *= idle ? 0 : 0.62;
      desiredX = Math.sin(mob.wanderAngle);
      desiredZ = Math.cos(mob.wanderAngle);
    }

    const acceleration = mob.onGround ? 7.5 : 2.2;
    mob.velocity.x = approach(mob.velocity.x, desiredX * desiredSpeed, acceleration * dt);
    mob.velocity.z = approach(mob.velocity.z, desiredZ * desiredSpeed, acceleration * dt);
    mob.velocity.y = Math.max(-MAX_FALL_SPEED, mob.velocity.y - GRAVITY * dt);

    this.moveHorizontal(mob, 'x', mob.velocity.x * dt);
    this.moveHorizontal(mob, 'z', mob.velocity.z * dt);
    mob.onGround = false;
    this.moveVertical(mob, mob.velocity.y * dt);

    const horizontalSpeed = Math.hypot(mob.velocity.x, mob.velocity.z);
    if (horizontalSpeed > 0.05) {
      const targetYaw = Math.atan2(-mob.velocity.x, -mob.velocity.z);
      mob.group.rotation.y = rotateToward(mob.group.rotation.y, targetYaw, dt * 7);
      mob.walkPhase += dt * horizontalSpeed * 5.5;
    }
    const legSwing = Math.sin(mob.walkPhase) * Math.min(0.62, horizontalSpeed * 0.34);
    mob.legs.forEach((leg, index) => {
      leg.rotation.x = legSwing * getMobLegSwingDirection(index, mob.legs.length);
    });
  }

  private updateMobScaleAndFlash(mob: MobEntity): void {
    const hurtScale = mob.hurtTimer > 0 ? 1.06 : 1;
    if (mob.kind !== 'creeper') {
      mob.group.scale.setScalar(hurtScale);
      return;
    }

    const progress = THREE.MathUtils.clamp(mob.fuseTimer / CREEPER_FUSE_SECONDS, 0, 1);
    const pulse = 1 + Math.sin(progress * progress * Math.PI * 18) * progress * 0.025;
    mob.group.scale.set(
      hurtScale * pulse * (1 + progress * 0.18),
      hurtScale / pulse * (1 + progress * 0.08),
      hurtScale * pulse * (1 + progress * 0.18)
    );
    const flashStep = Math.floor(mob.fuseTimer * 4 + progress * progress * 14);
    const showFlash = mob.fusePrimed && mob.fuseTimer > 0.12 && flashStep % 2 === 1;
    for (const part of mob.flashParts) part.visible = showFlash;
  }

  private hasLineOfSightToPlayer(mob: MobEntity, playerPosition: THREE.Vector3): boolean {
    tmpLineStart.copy(mob.group.position);
    tmpLineStart.y += MOB_DEFINITIONS[mob.kind].height * 0.82;
    tmpLineEnd.copy(playerPosition);
    tmpLineEnd.y += 1.62;
    const distance = tmpLineStart.distanceTo(tmpLineEnd);
    if (distance <= Number.EPSILON) return true;
    const steps = Math.max(1, Math.ceil(distance / 0.18));
    for (let step = 1; step < steps; step += 1) {
      tmpLinePoint.lerpVectors(tmpLineStart, tmpLineEnd, step / steps);
      if (this.world.isSolid(
        Math.floor(tmpLinePoint.x),
        Math.floor(tmpLinePoint.y),
        Math.floor(tmpLinePoint.z)
      )) {
        return false;
      }
    }
    return true;
  }

  private moveHorizontal(mob: MobEntity, axis: 'x' | 'z', amount: number): void {
    if (Math.abs(amount) <= Number.EPSILON) return;
    const original = mob.group.position[axis];
    mob.group.position[axis] += amount;
    if (!this.intersectsWorld(mob)) return;

    mob.group.position[axis] = original;
    if (mob.onGround && this.canOccupy(mob, mob.group.position.x, mob.group.position.y + 1.001, mob.group.position.z)) {
      mob.group.position.y += 1.001;
      mob.group.position[axis] += amount;
      if (!this.intersectsWorld(mob)) return;
      mob.group.position[axis] = original;
      mob.group.position.y -= 1.001;
    }
    mob.velocity[axis] = 0;
    mob.wanderAngle += Math.PI * (0.55 + this.random() * 0.9);
    mob.wanderTimer = 0;
  }

  private moveVertical(mob: MobEntity, amount: number): void {
    if (Math.abs(amount) <= Number.EPSILON) return;
    mob.group.position.y += amount;
    if (!this.intersectsWorld(mob)) return;
    const definition = MOB_DEFINITIONS[mob.kind];
    const minX = Math.floor(mob.group.position.x - definition.radius + 0.001);
    const maxX = Math.floor(mob.group.position.x + definition.radius - 0.001);
    const minY = Math.floor(mob.group.position.y + 0.001);
    const maxY = Math.floor(mob.group.position.y + definition.height - 0.001);
    const minZ = Math.floor(mob.group.position.z - definition.radius + 0.001);
    const maxZ = Math.floor(mob.group.position.z + definition.radius - 0.001);

    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          if (!this.world.isSolid(x, y, z)) continue;
          if (amount < 0) {
            mob.group.position.y = Math.max(mob.group.position.y, y + 1.001);
            mob.onGround = true;
          } else {
            mob.group.position.y = Math.min(mob.group.position.y, y - definition.height - 0.001);
          }
        }
      }
    }
    mob.velocity.y = 0;
  }

  private intersectsWorld(mob: MobEntity): boolean {
    return !this.canOccupy(mob, mob.group.position.x, mob.group.position.y, mob.group.position.z);
  }

  private canOccupy(mob: MobEntity, x: number, y: number, z: number): boolean {
    const definition = MOB_DEFINITIONS[mob.kind];
    const minX = Math.floor(x - definition.radius + 0.001);
    const maxX = Math.floor(x + definition.radius - 0.001);
    const minY = Math.floor(y + 0.001);
    const maxY = Math.floor(y + definition.height - 0.001);
    const minZ = Math.floor(z - definition.radius + 0.001);
    const maxZ = Math.floor(z + definition.radius - 0.001);
    for (let blockY = minY; blockY <= maxY; blockY += 1) {
      for (let blockZ = minZ; blockZ <= maxZ; blockZ += 1) {
        for (let blockX = minX; blockX <= maxX; blockX += 1) {
          if (this.world.isSolid(blockX, blockY, blockZ)) return false;
        }
      }
    }
    return true;
  }

  private trySpawnPassive(playerPosition: THREE.Vector3): void {
    this.trySpawn(selectPassiveMobKind(this.random()), playerPosition, 9, 30, 1);
  }

  private trySpawnZombie(playerPosition: THREE.Vector3, daylight: number): void {
    this.trySpawn('zombie', playerPosition, 12, 34, daylight);
  }

  private trySpawnCreeper(playerPosition: THREE.Vector3, daylight: number): void {
    this.trySpawn('creeper', playerPosition, 12, 34, daylight);
  }

  private trySpawnHostile(playerPosition: THREE.Vector3, daylight: number): void {
    if (this.random() < 0.68) this.trySpawnZombie(playerPosition, daylight);
    else this.trySpawnCreeper(playerPosition, daylight);
  }

  private trySpawn(
    kind: MobKind,
    playerPosition: THREE.Vector3,
    minimumRadius: number,
    maximumRadius: number,
    daylight: number
  ): void {
    for (let attempt = 0; attempt < 14; attempt += 1) {
      const angle = this.random() * Math.PI * 2;
      const radius = minimumRadius + this.random() * (maximumRadius - minimumRadius);
      const x = Math.floor(playerPosition.x + Math.cos(angle) * radius) + 0.5;
      const z = Math.floor(playerPosition.z + Math.sin(angle) * radius) + 0.5;
      const y = MOB_DEFINITIONS[kind].hostile
        ? this.findHostileSpawnHeight(x, z, daylight)
        : this.findSpawnHeight(x, z);
      if (y === null) continue;
      const position = new THREE.Vector3(x, y, z);
      if (this.mobs.some((mob) => mob.group.position.distanceToSquared(position) < 9)) continue;
      this.spawnMob(kind, position);
      return;
    }
  }

  private isDarkEnoughForHostileSpawn(position: THREE.Vector3, daylight: number): boolean {
    const light = this.world.getLightLevel(
      Math.floor(position.x),
      Math.floor(position.y),
      Math.floor(position.z)
    );
    const effectiveSkyLight = light.sky * THREE.MathUtils.clamp(
      Number.isFinite(daylight) ? daylight : 1,
      0,
      1
    );
    return Math.max(light.block, effectiveSkyLight) <= HOSTILE_SPAWN_LIGHT_LIMIT;
  }

  private findSpawnHeight(x: number, z: number): number | null {
    for (let y = WORLD_HEIGHT - 3; y >= 1; y -= 1) {
      if (!this.isSpawnSurface(x, y, z)) continue;
      return y + 1.001;
    }
    return null;
  }

  private findHostileSpawnHeight(x: number, z: number, daylight: number): number | null {
    const candidates: number[] = [];
    for (let y = WORLD_HEIGHT - 3; y >= 1; y -= 1) {
      if (!this.isSpawnSurface(x, y, z)) continue;
      const spawnY = y + 1.001;
      if (!this.isDarkEnoughForHostileSpawn(new THREE.Vector3(x, spawnY, z), daylight)) {
        continue;
      }
      candidates.push(spawnY);
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(this.random() * candidates.length)] ?? null;
  }

  private isSpawnSurface(x: number, y: number, z: number): boolean {
    const ground = this.world.getBlock(x, y, z);
    if (
      ground !== BlockId.Grass &&
      ground !== BlockId.Sand &&
      ground !== BlockId.Snow &&
      ground !== BlockId.Stone &&
      ground !== BlockId.Dirt
    ) {
      return false;
    }
    if (
      this.world.getBlock(x, y + 1, z) !== BlockId.Air ||
      this.world.getBlock(x, y + 2, z) !== BlockId.Air
    ) {
      return false;
    }
    if (this.world.isSolid(x, y + 1, z) || this.world.isSolid(x, y + 2, z)) return false;
    return !this.world.isLiquid(x, y + 1, z);
  }

  private hasOpenSky(position: THREE.Vector3): boolean {
    const x = Math.floor(position.x);
    const z = Math.floor(position.z);
    for (let y = Math.floor(position.y + 1.8); y < WORLD_HEIGHT; y += 1) {
      if (this.world.isSolid(x, y, z)) return false;
    }
    return true;
  }

  private rollDrops(kind: MobKind): MobDrop[] {
    if (kind === 'pig') return [{ item: 'raw_pork', count: 1 + Math.floor(this.random() * 3) }];
    if (kind === 'sheep') {
      return [
        { item: 'wool', count: 1 },
        { item: 'raw_mutton', count: 1 + Math.floor(this.random() * 2) }
      ];
    }
    if (kind === 'cow') {
      const drops: MobDrop[] = [
        { item: 'raw_beef', count: 1 + Math.floor(this.random() * 3) }
      ];
      const leatherCount = Math.floor(this.random() * 3);
      if (leatherCount > 0) drops.push({ item: 'leather', count: leatherCount });
      return drops;
    }
    if (kind === 'creeper') {
      const gunpowderCount = Math.floor(this.random() * 3);
      return gunpowderCount > 0
        ? [{ item: 'gunpowder', count: gunpowderCount }]
        : [];
    }
    return this.random() < 0.8
      ? [{ item: 'rotten_flesh', count: 1 + Math.floor(this.random() * 2) }]
      : [];
  }

  private removeMob(mob: MobEntity): void {
    const index = this.mobs.indexOf(mob);
    if (index >= 0) this.mobs.splice(index, 1);
    mob.group.removeFromParent();
  }

  private createMaterials(): Record<string, THREE.MeshLambertMaterial> {
    return {
      pig: new THREE.MeshLambertMaterial({ color: '#e79b95' }),
      pigSnout: new THREE.MeshLambertMaterial({ color: '#c97775' }),
      sheepWool: new THREE.MeshLambertMaterial({ color: '#e8e5dc' }),
      sheepSkin: new THREE.MeshLambertMaterial({ color: '#9c8a74' }),
      cowHide: new THREE.MeshLambertMaterial({ color: '#7a4b2e' }),
      cowDark: new THREE.MeshLambertMaterial({ color: '#3b281f' }),
      cowMuzzle: new THREE.MeshLambertMaterial({ color: '#c89f82' }),
      cowHorn: new THREE.MeshLambertMaterial({ color: '#ddd2ae' }),
      hoof: new THREE.MeshLambertMaterial({ color: '#3a3030' }),
      zombieSkin: new THREE.MeshLambertMaterial({ color: '#5c8a57' }),
      zombieShirt: new THREE.MeshLambertMaterial({ color: '#487f83' }),
      zombiePants: new THREE.MeshLambertMaterial({ color: '#444d74' }),
      creeperSkin: new THREE.MeshLambertMaterial({ color: '#58a84f' }),
      creeperLight: new THREE.MeshLambertMaterial({ color: '#75be61' }),
      creeperDark: new THREE.MeshLambertMaterial({ color: '#2f6838' }),
      creeperFace: new THREE.MeshLambertMaterial({ color: '#172f21' }),
      creeperFlash: new THREE.MeshLambertMaterial({
        color: '#e7f3dd',
        transparent: true,
        opacity: 0.78,
        depthWrite: false
      }),
      eye: new THREE.MeshLambertMaterial({ color: '#171717' })
    };
  }

  private createPart(
    parent: THREE.Object3D,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: THREE.Material
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(this.cubeGeometry, material);
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(position[0], position[1], position[2]);
    parent.add(mesh);
    return mesh;
  }

  private createModel(kind: MobKind, group: THREE.Group): THREE.Mesh[] {
    if (kind === 'pig') {
      this.createPart(group, [0.82, 0.52, 1.12], [0, 0.72, 0], this.materials.pig!);
      this.createPart(group, [0.58, 0.56, 0.52], [0, 0.82, -0.68], this.materials.pig!);
      this.createPart(group, [0.36, 0.2, 0.12], [0, 0.72, -0.99], this.materials.pigSnout!);
      this.createPart(group, [0.07, 0.07, 0.03], [-0.16, 0.91, -0.96], this.materials.eye!);
      this.createPart(group, [0.07, 0.07, 0.03], [0.16, 0.91, -0.96], this.materials.eye!);
      return this.createQuadrupedLegs(group, 0.25, 0.46, 0.36, 0.37, this.materials.pig!);
    }
    if (kind === 'sheep') {
      this.createPart(group, [0.9, 0.66, 1.18], [0, 0.83, 0], this.materials.sheepWool!);
      this.createPart(group, [0.48, 0.62, 0.46], [0, 0.82, -0.72], this.materials.sheepSkin!);
      this.createPart(group, [0.08, 0.08, 0.03], [-0.14, 0.94, -0.96], this.materials.eye!);
      this.createPart(group, [0.08, 0.08, 0.03], [0.14, 0.94, -0.96], this.materials.eye!);
      return this.createQuadrupedLegs(group, 0.22, 0.52, 0.36, 0.43, this.materials.sheepSkin!);
    }
    if (kind === 'cow') {
      this.createPart(group, [0.94, 0.68, 1.28], [0, 0.92, 0], this.materials.cowHide!);
      this.createPart(group, [0.955, 0.28, 0.34], [0, 1.02, 0.18], this.materials.cowDark!);
      this.createPart(group, [0.26, 0.22, 0.025], [-0.34, 1.06, -0.651], this.materials.cowDark!);
      const rearPatch = this.createPart(
        group,
        [0.42, 0.24, 0.025],
        [0.19, 1.03, 0.651],
        this.materials.cowDark!
      );
      rearPatch.name = 'Cow rear patch';
      const leftPatch = this.createPart(
        group,
        [0.025, 0.3, 0.42],
        [-0.481, 1.02, -0.08],
        this.materials.cowDark!
      );
      leftPatch.name = 'Cow left patch';
      const rightPatch = this.createPart(
        group,
        [0.025, 0.24, 0.34],
        [0.481, 0.84, 0.2],
        this.materials.cowDark!
      );
      rightPatch.name = 'Cow right patch';
      this.createPart(group, [0.58, 0.62, 0.54], [0, 1.08, -0.78], this.materials.cowHide!);
      this.createPart(group, [0.4, 0.25, 0.18], [0, 0.94, -1.11], this.materials.cowMuzzle!);
      this.createPart(group, [0.075, 0.075, 0.03], [-0.16, 1.17, -1.06], this.materials.eye!);
      this.createPart(group, [0.075, 0.075, 0.03], [0.16, 1.17, -1.06], this.materials.eye!);
      const leftHorn = this.createPart(
        group,
        [0.1, 0.12, 0.09],
        [-0.24, 1.34, -0.78],
        this.materials.cowHorn!
      );
      const rightHorn = this.createPart(
        group,
        [0.1, 0.12, 0.09],
        [0.24, 1.34, -0.78],
        this.materials.cowHorn!
      );
      leftHorn.rotation.z = -0.32;
      rightHorn.rotation.z = 0.32;
      const udder = this.createPart(
        group,
        [0.38, 0.16, 0.34],
        [0, 0.57, 0.08],
        this.materials.cowMuzzle!
      );
      udder.name = 'Cow udder';
      const tail = this.createPart(
        group,
        [0.1, 0.42, 0.1],
        [0, 1.01, 0.7],
        this.materials.cowHide!
      );
      tail.name = 'Cow tail';
      tail.rotation.x = -0.18;
      const tailTuft = this.createPart(
        group,
        [0.17, 0.18, 0.17],
        [0, 0.77, 0.745],
        this.materials.cowDark!
      );
      tailTuft.name = 'Cow tail tuft';
      const legs = this.createQuadrupedLegs(
        group,
        0.24,
        0.58,
        0.37,
        0.43,
        this.materials.cowDark!
      );
      legs.forEach((leg, index) => { leg.name = `Cow leg ${index + 1}`; });
      return legs;
    }

    if (kind === 'creeper') {
      const body = this.createPart(
        group,
        [0.58, 0.82, 0.42],
        [0, 0.92, 0],
        this.materials.creeperSkin!
      );
      body.name = 'Creeper body';
      const head = this.createPart(
        group,
        [0.7, 0.7, 0.7],
        [0, 1.5, 0],
        this.materials.creeperSkin!
      );
      head.name = 'Creeper head';
      const chestPatch = this.createPart(
        group,
        [0.22, 0.36, 0.025],
        [-0.13, 0.96, -0.222],
        this.materials.creeperLight!
      );
      chestPatch.name = 'Creeper chest patch';
      const sidePatch = this.createPart(
        group,
        [0.025, 0.24, 0.18],
        [0.292, 0.76, 0.08],
        this.materials.creeperDark!
      );
      sidePatch.name = 'Creeper side patch';
      const leftEye = this.createPart(
        group,
        [0.15, 0.14, 0.025],
        [-0.18, 1.62, -0.356],
        this.materials.creeperFace!
      );
      const rightEye = this.createPart(
        group,
        [0.15, 0.14, 0.025],
        [0.18, 1.62, -0.356],
        this.materials.creeperFace!
      );
      const mouth = this.createPart(
        group,
        [0.18, 0.21, 0.025],
        [0, 1.4, -0.356],
        this.materials.creeperFace!
      );
      const leftFrown = this.createPart(
        group,
        [0.11, 0.12, 0.025],
        [-0.12, 1.31, -0.356],
        this.materials.creeperFace!
      );
      const rightFrown = this.createPart(
        group,
        [0.11, 0.12, 0.025],
        [0.12, 1.31, -0.356],
        this.materials.creeperFace!
      );
      leftEye.name = 'Creeper face left eye';
      rightEye.name = 'Creeper face right eye';
      mouth.name = 'Creeper face mouth';
      leftFrown.name = 'Creeper face left frown';
      rightFrown.name = 'Creeper face right frown';

      const legs = [
        this.createPart(group, [0.25, 0.52, 0.25], [-0.18, 0.26, -0.2], this.materials.creeperDark!),
        this.createPart(group, [0.25, 0.52, 0.25], [0.18, 0.26, -0.2], this.materials.creeperSkin!),
        this.createPart(group, [0.25, 0.52, 0.25], [-0.18, 0.26, 0.2], this.materials.creeperSkin!),
        this.createPart(group, [0.25, 0.52, 0.25], [0.18, 0.26, 0.2], this.materials.creeperDark!)
      ];
      legs.forEach((leg, index) => { leg.name = `Creeper leg ${index + 1}`; });

      const flashShapes: Array<readonly [
        readonly [number, number, number],
        readonly [number, number, number]
      ]> = [
        [[0.73, 0.73, 0.73], [0, 1.5, 0]],
        [[0.61, 0.85, 0.45], [0, 0.92, 0]],
        [[0.27, 0.54, 0.27], [-0.18, 0.26, -0.2]],
        [[0.27, 0.54, 0.27], [0.18, 0.26, -0.2]],
        [[0.27, 0.54, 0.27], [-0.18, 0.26, 0.2]],
        [[0.27, 0.54, 0.27], [0.18, 0.26, 0.2]]
      ];
      for (const [size, position] of flashShapes) {
        const overlay = this.createPart(group, size, position, this.materials.creeperFlash!);
        overlay.name = 'Creeper flash overlay';
        overlay.visible = false;
      }
      return legs;
    }

    this.createPart(group, [0.5, 0.72, 0.28], [0, 1.08, 0], this.materials.zombieShirt!);
    this.createPart(group, [0.5, 0.5, 0.5], [0, 1.69, 0], this.materials.zombieSkin!);
    this.createPart(group, [0.08, 0.07, 0.03], [-0.13, 1.76, -0.26], this.materials.eye!);
    this.createPart(group, [0.08, 0.07, 0.03], [0.13, 1.76, -0.26], this.materials.eye!);
    this.createPart(group, [0.18, 0.72, 0.18], [-0.35, 1.1, -0.28], this.materials.zombieSkin!);
    this.createPart(group, [0.18, 0.72, 0.18], [0.35, 1.1, -0.28], this.materials.zombieSkin!);
    const leftLeg = this.createPart(group, [0.22, 0.78, 0.23], [-0.14, 0.39, 0], this.materials.zombiePants!);
    const rightLeg = this.createPart(group, [0.22, 0.78, 0.23], [0.14, 0.39, 0], this.materials.zombiePants!);
    return [leftLeg, rightLeg];
  }

  private createQuadrupedLegs(
    group: THREE.Group,
    width: number,
    height: number,
    x: number,
    z: number,
    material: THREE.Material
  ): THREE.Mesh[] {
    return [
      this.createPart(group, [width, height, width], [-x, height / 2, -z], material),
      this.createPart(group, [width, height, width], [x, height / 2, -z], material),
      this.createPart(group, [width, height, width], [-x, height / 2, z], material),
      this.createPart(group, [width, height, width], [x, height / 2, z], material)
    ];
  }
}
