import * as THREE from 'three';
import { getBlockDefinition } from './blocks';
import {
  ARMOR_DEFINITIONS,
  TOOL_DEFINITIONS,
  getItemStackLimit,
  isArmorItemId,
  isFoodItemId,
  isItemId,
  isToolItemId,
  type ArmorItemId,
  type ItemId,
  type ItemStack,
  type ToolTier
} from './survival';
import { BlockId, type WorldDropSave } from './types';

const DEFAULT_DESPAWN_SECONDS = 300;
const DEFAULT_PICKUP_RADIUS = 2.5;
const DEFAULT_MAX_DROPS = 2048;
const DEFAULT_PICKUP_DELAY = 0.2;
const PICKUP_RETRY_SECONDS = 0.25;
const DROP_MERGE_RADIUS_SQUARED = 1;
const DROP_HALF_HEIGHT = 0.13;
const GRAVITY = 18;
const TERMINAL_VELOCITY = 24;
const PHYSICS_STEP = 1 / 60;

export type WorldDropVisualKind = 'block' | 'material' | 'food' | 'tool' | 'armor';
export type WorldDropCollector = (stack: Readonly<ItemStack>) => number;
export type WorldDropSolidQuery = (x: number, y: number, z: number) => boolean;

export interface WorldDropPickupEvent {
  readonly id: number;
  readonly picked: ItemStack;
  readonly remaining: ItemStack | null;
  readonly position: THREE.Vector3;
}

export interface WorldDropManagerOptions {
  isSolid?: WorldDropSolidQuery;
  onPickup?: (event: WorldDropPickupEvent) => void;
  despawnSeconds?: number;
  pickupRadius?: number;
  maxDrops?: number;
}

export interface WorldDropSpawnOptions {
  velocity?: THREE.Vector3;
  pickupDelay?: number;
}

export interface WorldDropSnapshot {
  readonly id: number;
  readonly stack: ItemStack;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly age: number;
  readonly grounded: boolean;
  readonly visualKind: WorldDropVisualKind;
}

interface WorldDropEntity {
  id: number;
  stack: ItemStack;
  root: THREE.Group;
  visual: THREE.Object3D;
  velocity: THREE.Vector3;
  age: number;
  pickupAfter: number;
  nextPickupAttempt: number;
  phase: number;
  grounded: boolean;
  visualKind: WorldDropVisualKind;
}

const MATERIAL_COLORS: Readonly<Record<string, string>> = {
  coal: '#2f3439',
  raw_iron: '#b7744f',
  iron_ingot: '#cbd2d2',
  diamond: '#42cfc6',
  wool: '#eee9dd',
  leather: '#8b572f',
  stick: '#8b5d32'
};

const FOOD_COLORS: Readonly<Record<string, string>> = {
  raw_pork: '#d98583',
  cooked_pork: '#c47a3b',
  raw_mutton: '#b76161',
  cooked_mutton: '#a96532',
  raw_beef: '#a84f4e',
  cooked_beef: '#744027',
  rotten_flesh: '#74653a'
};

const TOOL_TIER_COLORS: Readonly<Record<ToolTier, string>> = {
  wood: '#9a6738',
  stone: '#777d7e',
  iron: '#c6d0d2',
  diamond: '#42cfc6'
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function cloneStack(stack: Readonly<ItemStack>): ItemStack {
  const clone: ItemStack = { item: stack.item, count: stack.count };
  if (stack.durability !== undefined) clone.durability = stack.durability;
  return clone;
}

function normalizeStack(stack: Readonly<ItemStack>): ItemStack | null {
  if (!isItemId(stack.item)) return null;
  const count = Math.trunc(Number.isFinite(stack.count) ? stack.count : 0);
  if (count <= 0) return null;
  if (!isToolItemId(stack.item) && !isArmorItemId(stack.item)) {
    return { item: stack.item, count };
  }
  const definition = isToolItemId(stack.item)
    ? TOOL_DEFINITIONS[stack.item]
    : ARMOR_DEFINITIONS[stack.item];
  const durability = Math.trunc(Number.isFinite(stack.durability) ? stack.durability! : definition.maxDurability);
  if (durability <= 0) return null;
  return {
    item: stack.item,
    count: 1,
    durability: clamp(durability, 1, definition.maxDurability)
  };
}

function getVisualKind(item: ItemId): WorldDropVisualKind {
  if (typeof item === 'number') return 'block';
  if (isToolItemId(item)) return 'tool';
  if (isArmorItemId(item)) return 'armor';
  if (isFoodItemId(item)) return 'food';
  return 'material';
}

function vectorFromTuple(value: unknown): THREE.Vector3 | null {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((component) => typeof component === 'number' && Number.isFinite(component))
  ) {
    return null;
  }
  return new THREE.Vector3(value[0], value[1], value[2]);
}

export class WorldDropManager extends THREE.Group {
  private readonly drops: WorldDropEntity[] = [];
  private readonly materials = new Map<string, THREE.MeshLambertMaterial>();
  private readonly blockGeometry = new THREE.BoxGeometry(0.26, 0.26, 0.26);
  private readonly materialGeometry = new THREE.OctahedronGeometry(0.14, 0);
  private readonly foodGeometry = new THREE.DodecahedronGeometry(0.14, 0);
  private readonly woolGeometry = new THREE.BoxGeometry(0.24, 0.22, 0.24);
  private readonly stickGeometry = new THREE.BoxGeometry(0.045, 0.045, 0.3);
  private readonly toolHandleGeometry = new THREE.BoxGeometry(0.045, 0.31, 0.045);
  private readonly pickaxeHeadGeometry = new THREE.BoxGeometry(0.32, 0.055, 0.06);
  private readonly axeHeadGeometry = new THREE.BoxGeometry(0.17, 0.18, 0.06);
  private readonly shovelHeadGeometry = new THREE.BoxGeometry(0.13, 0.17, 0.05);
  private readonly swordBladeGeometry = new THREE.BoxGeometry(0.075, 0.34, 0.045);
  private readonly torchCapGeometry = new THREE.BoxGeometry(0.075, 0.05, 0.075);
  private readonly torchFlameGeometry = new THREE.BoxGeometry(0.12, 0.13, 0.075);
  private readonly torchFlameCoreGeometry = new THREE.BoxGeometry(0.065, 0.085, 0.08);
  private readonly helmetCrownGeometry = new THREE.BoxGeometry(0.28, 0.065, 0.12);
  private readonly helmetSideGeometry = new THREE.BoxGeometry(0.06, 0.19, 0.12);
  private readonly chestplateBodyGeometry = new THREE.BoxGeometry(0.2, 0.22, 0.07);
  private readonly chestplateShoulderGeometry = new THREE.BoxGeometry(0.09, 0.075, 0.085);
  private readonly leggingsWaistGeometry = new THREE.BoxGeometry(0.26, 0.06, 0.075);
  private readonly leggingsLegGeometry = new THREE.BoxGeometry(0.075, 0.2, 0.07);
  private readonly bootsCuffGeometry = new THREE.BoxGeometry(0.08, 0.14, 0.08);
  private readonly bootsFootGeometry = new THREE.BoxGeometry(0.12, 0.065, 0.12);
  private readonly pickupRadiusSquared: number;
  private readonly despawnSeconds: number;
  private readonly maxDrops: number;
  private readonly onPickup?: (event: WorldDropPickupEvent) => void;
  private solidQuery: WorldDropSolidQuery;
  private nextId = 1;
  private disposed = false;

  constructor(options: WorldDropManagerOptions = {}) {
    super();
    this.name = 'World item drops';
    const pickupRadius = clamp(
      Number.isFinite(options.pickupRadius) ? options.pickupRadius! : DEFAULT_PICKUP_RADIUS,
      0.1,
      16
    );
    this.pickupRadiusSquared = pickupRadius * pickupRadius;
    this.despawnSeconds = clamp(
      Number.isFinite(options.despawnSeconds) ? options.despawnSeconds! : DEFAULT_DESPAWN_SECONDS,
      1,
      3600
    );
    this.maxDrops = Math.round(clamp(
      Number.isFinite(options.maxDrops) ? options.maxDrops! : DEFAULT_MAX_DROPS,
      1,
      2048
    ));
    this.solidQuery = options.isSolid ?? (() => false);
    this.onPickup = options.onPickup;
  }

  get size(): number {
    return this.drops.length;
  }

  setSolidQuery(query: WorldDropSolidQuery): void {
    this.solidQuery = query;
  }

  spawn(
    stack: Readonly<ItemStack>,
    position: THREE.Vector3,
    options: WorldDropSpawnOptions = {}
  ): number | null {
    if (this.disposed) return null;
    const normalized = normalizeStack(stack);
    if (!normalized) return null;
    const pickupDelay = clamp(
      Number.isFinite(options.pickupDelay) ? options.pickupDelay! : DEFAULT_PICKUP_DELAY,
      0,
      10
    );
    const mergedId = this.mergeNearby(normalized, position, pickupDelay);
    if (normalized.count <= 0) return mergedId;
    return this.createDrop(normalized, position, options.velocity, 0, pickupDelay);
  }

  update(deltaTime: number, playerPosition: THREE.Vector3, collector: WorldDropCollector): void {
    if (this.disposed) return;
    const elapsed = Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0);
    const physicsTime = Math.min(elapsed, 0.25);

    for (let index = this.drops.length - 1; index >= 0; index -= 1) {
      const drop = this.drops[index];
      if (!drop) continue;
      drop.age += elapsed;
      if (drop.age >= this.despawnSeconds) {
        this.removeAt(index);
        continue;
      }

      this.updatePhysics(drop, physicsTime);
      drop.visual.position.y = Math.sin(drop.age * 2.7 + drop.phase) * 0.045;
      drop.visual.rotation.y += physicsTime * 1.9;
      drop.visual.rotation.z = Math.sin(drop.age * 1.35 + drop.phase) * 0.12;

      if (drop.age < drop.pickupAfter || drop.age < drop.nextPickupAttempt) continue;
      if (drop.root.position.distanceToSquared(playerPosition) > this.pickupRadiusSquared) continue;
      const requested = cloneStack(drop.stack);
      const rawRemaining = collector(requested);
      const remaining = clamp(
        Math.trunc(Number.isFinite(rawRemaining) ? rawRemaining : drop.stack.count),
        0,
        drop.stack.count
      );
      const pickedCount = drop.stack.count - remaining;
      if (pickedCount <= 0) {
        drop.nextPickupAttempt = drop.age + PICKUP_RETRY_SECONDS;
        continue;
      }

      const picked = cloneStack(drop.stack);
      picked.count = pickedCount;
      drop.stack.count = remaining;
      const remainingStack = remaining > 0 ? cloneStack(drop.stack) : null;
      this.onPickup?.({
        id: drop.id,
        picked,
        remaining: remainingStack,
        position: drop.root.position.clone()
      });
      if (remaining === 0) this.removeAt(index);
      else drop.nextPickupAttempt = drop.age + PICKUP_RETRY_SECONDS;
    }
  }

  getSnapshots(): WorldDropSnapshot[] {
    return this.drops.map((drop) => ({
      id: drop.id,
      stack: cloneStack(drop.stack),
      position: drop.root.position.clone(),
      velocity: drop.velocity.clone(),
      age: drop.age,
      grounded: drop.grounded,
      visualKind: drop.visualKind
    }));
  }

  serialize(): WorldDropSave[] {
    return this.drops.map((drop) => ({
      stack: cloneStack(drop.stack),
      position: [drop.root.position.x, drop.root.position.y, drop.root.position.z],
      velocity: [drop.velocity.x, drop.velocity.y, drop.velocity.z],
      age: drop.age,
      pickupDelay: Math.max(0, Math.max(drop.pickupAfter, drop.nextPickupAttempt) - drop.age)
    }));
  }

  loadSavedDrops(saved: readonly WorldDropSave[] | undefined): void {
    if (this.disposed) return;
    this.clearDrops();
    if (!Array.isArray(saved)) return;

    for (const value of saved) {
      if (!value || typeof value !== 'object' || !value.stack || typeof value.stack !== 'object') continue;
      const stack = normalizeStack(value.stack);
      const position = vectorFromTuple(value.position);
      const velocity = vectorFromTuple(value.velocity);
      const age = value.age;
      const pickupDelay = value.pickupDelay;
      if (
        !stack ||
        !position ||
        !velocity ||
        !Number.isFinite(age) ||
        age < 0 ||
        age >= this.despawnSeconds ||
        !Number.isFinite(pickupDelay)
      ) {
        continue;
      }
      this.createDrop(stack, position, velocity, age, clamp(pickupDelay, 0, 10));
    }
  }

  clearDrops(): void {
    for (let index = this.drops.length - 1; index >= 0; index -= 1) this.removeAt(index);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeFromParent();
    this.clearDrops();
    this.blockGeometry.dispose();
    this.materialGeometry.dispose();
    this.foodGeometry.dispose();
    this.woolGeometry.dispose();
    this.stickGeometry.dispose();
    this.toolHandleGeometry.dispose();
    this.pickaxeHeadGeometry.dispose();
    this.axeHeadGeometry.dispose();
    this.shovelHeadGeometry.dispose();
    this.swordBladeGeometry.dispose();
    this.torchCapGeometry.dispose();
    this.torchFlameGeometry.dispose();
    this.torchFlameCoreGeometry.dispose();
    this.helmetCrownGeometry.dispose();
    this.helmetSideGeometry.dispose();
    this.chestplateBodyGeometry.dispose();
    this.chestplateShoulderGeometry.dispose();
    this.leggingsWaistGeometry.dispose();
    this.leggingsLegGeometry.dispose();
    this.bootsCuffGeometry.dispose();
    this.bootsFootGeometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.clear();
  }

  private mergeNearby(stack: ItemStack, position: THREE.Vector3, pickupDelay: number): number | null {
    const stackLimit = getItemStackLimit(stack.item);
    if (stackLimit <= 1) return null;

    const candidates = this.drops
      .filter((drop) => (
        drop.stack.item === stack.item &&
        drop.stack.count < stackLimit &&
        drop.root.position.distanceToSquared(position) <= DROP_MERGE_RADIUS_SQUARED
      ))
      .sort((left, right) => (
        left.root.position.distanceToSquared(position) - right.root.position.distanceToSquared(position)
      ));
    let mergedId: number | null = null;
    for (const drop of candidates) {
      const moved = Math.min(stack.count, stackLimit - drop.stack.count);
      if (moved <= 0) continue;
      const remainingPickupDelay = Math.max(
        0,
        Math.max(drop.pickupAfter, drop.nextPickupAttempt) - drop.age
      );
      drop.stack.count += moved;
      stack.count -= moved;
      drop.age = 0;
      drop.pickupAfter = Math.max(remainingPickupDelay, pickupDelay);
      drop.nextPickupAttempt = drop.pickupAfter;
      mergedId ??= drop.id;
      if (stack.count <= 0) break;
    }
    return mergedId;
  }

  private createDrop(
    stack: Readonly<ItemStack>,
    position: THREE.Vector3,
    requestedVelocity: THREE.Vector3 | undefined,
    age: number,
    pickupDelay: number
  ): number {
    while (this.drops.length >= this.maxDrops) this.removeAt(0);
    const id = this.nextId;
    this.nextId += 1;
    const phase = ((Math.imul(id, 2654435761) >>> 0) / 0xffffffff) * Math.PI * 2;
    const visualKind = getVisualKind(stack.item);
    const root = new THREE.Group();
    const visual = this.createVisual(stack.item, visualKind);
    root.name = `Dropped ${String(stack.item)} #${id}`;
    root.position.copy(position);
    root.add(visual);
    this.add(root);

    const velocity = requestedVelocity?.clone() ?? new THREE.Vector3(
      Math.cos(phase) * 0.65,
      1.9 + (id % 4) * 0.12,
      Math.sin(phase) * 0.65
    );
    const pickupAfter = age + pickupDelay;
    this.drops.push({
      id,
      stack: cloneStack(stack),
      root,
      visual,
      velocity,
      age,
      pickupAfter,
      nextPickupAttempt: pickupAfter,
      phase,
      grounded: false,
      visualKind
    });
    return id;
  }

  private updatePhysics(drop: WorldDropEntity, elapsed: number): void {
    if (elapsed <= 0) return;
    const steps = Math.max(1, Math.ceil(elapsed / PHYSICS_STEP));
    const step = elapsed / steps;
    for (let iteration = 0; iteration < steps; iteration += 1) {
      if (!drop.grounded) drop.velocity.y = Math.max(-TERMINAL_VELOCITY, drop.velocity.y - GRAVITY * step);
      const currentBottom = drop.root.position.y - DROP_HALF_HEIGHT;
      const nextX = drop.root.position.x + drop.velocity.x * step;
      const nextY = drop.root.position.y + drop.velocity.y * step;
      const nextZ = drop.root.position.z + drop.velocity.z * step;
      let landedY: number | null = null;
      if (drop.velocity.y <= 0) {
        const startBlockY = Math.floor(currentBottom - 1e-4);
        const endBlockY = Math.floor(nextY - DROP_HALF_HEIGHT - 1e-4);
        const blockX = Math.floor(nextX);
        const blockZ = Math.floor(nextZ);
        for (let blockY = startBlockY; blockY >= endBlockY; blockY -= 1) {
          if (!this.solidQuery(blockX, blockY, blockZ)) continue;
          const top = blockY + 1;
          if (currentBottom + 1e-4 < top) continue;
          landedY = top + DROP_HALF_HEIGHT;
          break;
        }
      }

      drop.root.position.x = nextX;
      drop.root.position.z = nextZ;
      if (landedY !== null) {
        drop.root.position.y = landedY;
        drop.velocity.y = 0;
        drop.grounded = true;
      } else {
        drop.root.position.y = nextY;
        drop.grounded = false;
      }

      const damping = Math.exp(-(drop.grounded ? 8 : 0.55) * step);
      drop.velocity.x *= damping;
      drop.velocity.z *= damping;
    }
  }

  private createVisual(item: ItemId, kind: WorldDropVisualKind): THREE.Object3D {
    if (kind === 'block' && typeof item === 'number') {
      if (item === BlockId.Torch) return this.createTorchVisual();
      const definition = getBlockDefinition(item);
      const transparent = definition.transparent;
      return new THREE.Mesh(
        this.blockGeometry,
        this.getMaterial(`block:${item}`, definition.mapColor, transparent ? 0.72 : 1)
      );
    }
    if (kind === 'food' && typeof item === 'string') {
      const mesh = new THREE.Mesh(
        this.foodGeometry,
        this.getMaterial(`food:${item}`, FOOD_COLORS[item] ?? '#b26f62')
      );
      mesh.scale.set(1.15, 0.72, 0.82);
      return mesh;
    }
    if (kind === 'tool' && isToolItemId(item)) return this.createToolVisual(item);
    if (kind === 'armor' && isArmorItemId(item)) return this.createArmorVisual(item);
    if (item === 'stick') {
      const mesh = new THREE.Mesh(this.stickGeometry, this.getMaterial('material:stick', MATERIAL_COLORS.stick!));
      mesh.rotation.z = Math.PI * 0.32;
      return mesh;
    }
    if (item === 'wool') return new THREE.Mesh(
      this.woolGeometry,
      this.getMaterial('material:wool', MATERIAL_COLORS.wool!)
    );
    return new THREE.Mesh(
      this.materialGeometry,
      this.getMaterial(`material:${String(item)}`, MATERIAL_COLORS[String(item)] ?? '#8d765b')
    );
  }

  private createTorchVisual(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'Dropped torch';

    const handle = new THREE.Mesh(
      this.toolHandleGeometry,
      this.getMaterial('torch:handle', '#80502a')
    );
    handle.name = 'Dropped torch handle';
    handle.position.y = -0.055;

    const cap = new THREE.Mesh(
      this.torchCapGeometry,
      this.getMaterial('torch:cap', '#4d2b1b')
    );
    cap.name = 'Dropped torch cap';
    cap.position.y = 0.105;

    const flame = new THREE.Mesh(
      this.torchFlameGeometry,
      this.getMaterial('torch:flame', '#ff7a24', 1, '#ff4f12', 1.35)
    );
    flame.name = 'Dropped torch flame';
    flame.position.y = 0.195;
    flame.rotation.z = Math.PI / 4;

    const core = new THREE.Mesh(
      this.torchFlameCoreGeometry,
      this.getMaterial('torch:flame-core', '#ffe27a', 1, '#ffb52f', 1.8)
    );
    core.name = 'Dropped torch flame core';
    core.position.y = 0.195;
    core.rotation.z = -Math.PI / 4;

    group.add(handle, cap, flame, core);
    group.rotation.z = -0.48;
    group.scale.setScalar(0.92);
    return group;
  }

  private createToolVisual(item: keyof typeof TOOL_DEFINITIONS): THREE.Group {
    const definition = TOOL_DEFINITIONS[item];
    const group = new THREE.Group();
    const handle = new THREE.Mesh(
      this.toolHandleGeometry,
      this.getMaterial('tool:handle', '#80532d')
    );
    handle.position.y = -0.055;
    group.add(handle);

    const headGeometry = definition.kind === 'pickaxe'
      ? this.pickaxeHeadGeometry
      : definition.kind === 'axe'
        ? this.axeHeadGeometry
        : definition.kind === 'sword'
          ? this.swordBladeGeometry
          : this.shovelHeadGeometry;
    const head = new THREE.Mesh(
      headGeometry,
      this.getMaterial(`tool:${definition.tier}`, TOOL_TIER_COLORS[definition.tier])
    );
    head.position.y = 0.13;
    if (definition.kind === 'axe') head.position.x = 0.045;
    if (definition.kind === 'shovel') head.position.y = 0.155;
    if (definition.kind === 'sword') head.position.y = 0.25;
    group.add(head);
    group.rotation.z = -0.62;
    group.scale.setScalar(0.92);
    return group;
  }

  private createArmorVisual(item: ArmorItemId): THREE.Group {
    const group = new THREE.Group();
    const leather = item.startsWith('leather_');
    const diamond = item.startsWith('diamond_');
    const materialKey = leather ? 'leather' : diamond ? 'diamond' : 'iron';
    const base = this.getMaterial(
      `armor:${materialKey}`,
      leather ? '#8b572f' : diamond ? '#42cfc6' : '#bdc8ca'
    );
    const light = this.getMaterial(
      `armor:${materialKey}:light`,
      leather ? '#c08452' : diamond ? '#9af1e6' : '#eef3f2'
    );
    const dark = this.getMaterial(
      `armor:${materialKey}:dark`,
      leather ? '#5b351f' : diamond ? '#218f94' : '#758184'
    );
    const slot = ARMOR_DEFINITIONS[item].slot;
    const add = (
      geometry: THREE.BufferGeometry,
      material: THREE.MeshLambertMaterial,
      x: number,
      y: number,
      z = 0
    ): void => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      group.add(mesh);
    };

    if (slot === 'head') {
      add(this.helmetCrownGeometry, light, 0, 0.1);
      add(this.helmetSideGeometry, base, -0.105, 0);
      add(this.helmetSideGeometry, dark, 0.105, 0);
    } else if (slot === 'chest') {
      add(this.chestplateBodyGeometry, base, 0, -0.015);
      add(this.chestplateShoulderGeometry, light, -0.14, 0.07);
      add(this.chestplateShoulderGeometry, dark, 0.14, 0.07);
    } else if (slot === 'legs') {
      add(this.leggingsWaistGeometry, light, 0, 0.11);
      add(this.leggingsLegGeometry, base, -0.06, -0.06);
      add(this.leggingsLegGeometry, dark, 0.06, -0.06);
    } else {
      add(this.bootsCuffGeometry, base, -0.065, 0.035);
      add(this.bootsCuffGeometry, dark, 0.065, 0.035);
      add(this.bootsFootGeometry, light, -0.065, -0.075, 0.025);
      add(this.bootsFootGeometry, base, 0.065, -0.075, 0.025);
    }

    group.rotation.set(0.16, -0.28, -0.18);
    group.scale.setScalar(0.95);
    return group;
  }

  private getMaterial(
    key: string,
    color: string,
    opacity = 1,
    emissive = '#000000',
    emissiveIntensity = 1
  ): THREE.MeshLambertMaterial {
    const existing = this.materials.get(key);
    if (existing) return existing;
    const material = new THREE.MeshLambertMaterial({
      color,
      emissive,
      emissiveIntensity,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1
    });
    material.name = `Drop ${key}`;
    this.materials.set(key, material);
    return material;
  }

  private removeAt(index: number): void {
    const [drop] = this.drops.splice(index, 1);
    if (drop) this.remove(drop.root);
  }
}
