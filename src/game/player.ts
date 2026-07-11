import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import {
  aabbsIntersect,
  clipAabbMovementAgainstBoxes,
  createPlayerAabb,
  moveAabbAlongAxis
} from './block-shapes';
import { type BlockId, type PlayerSnapshot } from './types';
import { WATER_SURFACE_HEIGHT, type VoxelWorld } from './world';

const PLAYER_RADIUS = 0.3;
const PLAYER_HEIGHT = 1.8;
const EYE_HEIGHT = 1.62;
const COLLISION_EPSILON = 1e-4;

const WALK_SPEED = 4.3;
const SPRINT_SPEED = 6.3;
const CROUCH_SPEED = 1.35;
const GROUND_ACCELERATION = 42;
const AIR_ACCELERATION = 13;
const GROUND_DECELERATION = 34;
const AIR_DECELERATION = 2;
const GRAVITY = 28;
const JUMP_SPEED = 8.2;
const TERMINAL_VELOCITY = 50;
const WATER_SPEED = 2.35;
const WATER_ACCELERATION = 10;
const WATER_VERTICAL_ACCELERATION = 11;
const WATER_SINK_SPEED = -1.15;
const WATER_SWIM_SPEED = 3.25;
const WATER_TERMINAL_VELOCITY = 8;
const ITEM_USE_SPEED_MULTIPLIER = 0.2;
const MAX_FRAME_TIME = 0.05;
const MAX_PHYSICS_STEP = 1 / 120;

const LOOK_SENSITIVITY = 0.0022;
const MAX_PITCH = Math.PI / 2 - 0.01;
const CROUCH_EYE_HEIGHT = 1.42;
const BOB_HEIGHT = 0.045;
const BOB_SWAY = 0.025;
const SPRINT_FOV_BONUS = 5;

const MOVEMENT_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'Space'
]);

type Axis = 'x' | 'y' | 'z';

interface MovementInput {
  forward: number;
  right: number;
  sprint: boolean;
  jump: boolean;
  crouch: boolean;
}

export class PlayerController {
  public enabled = false;
  public readonly velocity = new Vector3();
  public onGround = false;
  public yaw = 0;
  public pitch = 0;

  private readonly position = new Vector3();
  private readonly pressedKeys = new Set<string>();
  private baseFov: number;

  private virtualForward = 0;
  private virtualRight = 0;
  private virtualSprint = false;
  private virtualJump = false;
  private virtualCrouch = false;
  private jumpQueued = false;
  private sprinting = false;
  private crouching = false;
  private usingItem = false;
  private sensitivityMultiplier = 1;
  private currentEyeHeight = EYE_HEIGHT;
  private fallDistance = 0;
  private pendingLandingDistance = 0;
  private bobPhase = 0;
  private bobAmount = 0;
  private disposed = false;

  public constructor(
    private readonly camera: PerspectiveCamera,
    private readonly world: VoxelWorld,
    private readonly domElement: HTMLElement
  ) {
    this.baseFov = camera.fov;
    this.position.copy(world.getSpawnPoint());
    this.syncCamera(0, false);

    domElement.addEventListener('click', this.handleClick);
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', this.handleKeyDown);
      document.addEventListener('keyup', this.handleKeyUp);
      document.addEventListener('mousemove', this.handleMouseMove);
      document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', this.handleBlur);
    }
  }

  public update(deltaTime: number): void {
    if (this.disposed) return;

    const dt = MathUtils.clamp(Number.isFinite(deltaTime) ? deltaTime : 0, 0, MAX_FRAME_TIME);
    const input = this.readMovementInput();
    const moving = Math.abs(input.forward) > 1e-3 || Math.abs(input.right) > 1e-3;
    const inLiquid = this.isInLiquid();
    const sprinting =
      this.enabled && input.sprint && moving && !input.crouch && !inLiquid && !this.usingItem;
    this.sprinting = sprinting;
    this.crouching = this.enabled && input.crouch;

    if (this.enabled && this.jumpQueued) {
      if (inLiquid) {
        this.velocity.y = Math.max(this.velocity.y, WATER_SWIM_SPEED);
      } else if (this.onGround) {
        this.velocity.y = JUMP_SPEED;
        this.onGround = false;
      }
    }
    this.jumpQueued = false;

    const stepCount = Math.max(1, Math.ceil(dt / MAX_PHYSICS_STEP));
    const stepTime = stepCount > 0 ? dt / stepCount : 0;
    for (let step = 0; step < stepCount; step += 1) {
      this.simulateStep(stepTime, input, sprinting);
    }

    this.updateViewEffects(dt, moving, sprinting);
    this.syncCamera(dt, sprinting);
  }

  public setEnabled(enabled: boolean): void {
    if (this.disposed || this.enabled === enabled) return;

    this.enabled = enabled;
    if (enabled) {
      this.requestPointerLock();
      return;
    }

    this.sprinting = false;
    this.crouching = false;
    this.clearInput();
    if (typeof document !== 'undefined' && document.pointerLockElement === this.domElement) {
      document.exitPointerLock();
    }
  }

  public requestPointerLock(): void {
    if (!this.enabled || this.disposed || typeof document === 'undefined') return;
    if (document.pointerLockElement === this.domElement || !this.domElement.requestPointerLock) return;

    try {
      const request = this.domElement.requestPointerLock();
      void request?.catch(() => undefined);
    } catch {
      // Browsers reject pointer lock when this is not called from a trusted gesture.
    }
  }

  public teleport(position: Vector3): void {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
      return;
    }

    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.onGround = false;
    this.fallDistance = 0;
    this.pendingLandingDistance = 0;
    this.bobAmount = 0;
    this.syncCamera(0, false);
  }

  public getPosition(target = new Vector3()): Vector3 {
    return target.copy(this.position);
  }

  public get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  public isSprinting(): boolean {
    return this.sprinting;
  }

  public isCrouching(): boolean {
    return this.crouching;
  }

  public isHeadUnderwater(): boolean {
    const x = Math.floor(this.position.x);
    const z = Math.floor(this.position.z);
    return this.isPointInLiquid(x, this.position.y + this.currentEyeHeight, z);
  }

  public consumeLandingDistance(): number {
    const distance = this.pendingLandingDistance;
    this.pendingLandingDistance = 0;
    return distance;
  }

  public getSnapshot(selectedSlot: number): PlayerSnapshot {
    return {
      position: [this.position.x, this.position.y, this.position.z],
      yaw: this.yaw,
      pitch: this.pitch,
      selectedSlot: Math.max(0, Math.floor(Number.isFinite(selectedSlot) ? selectedSlot : 0))
    };
  }

  public applySnapshot(snapshot: PlayerSnapshot): void {
    const [x, y, z] = snapshot.position;
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
      this.position.set(x, y, z);
    }
    this.yaw = Number.isFinite(snapshot.yaw) ? this.wrapAngle(snapshot.yaw) : 0;
    this.pitch = Number.isFinite(snapshot.pitch) ? MathUtils.clamp(snapshot.pitch, -MAX_PITCH, MAX_PITCH) : 0;
    this.velocity.set(0, 0, 0);
    this.onGround = false;
    this.fallDistance = 0;
    this.pendingLandingDistance = 0;
    this.bobAmount = 0;
    this.syncCamera(0, false);
  }

  public intersectsBlock(
    x: number,
    y: number,
    z: number,
    id: BlockId = this.world.getBlock(x, y, z)
  ): boolean {
    const playerBox = createPlayerAabb(this.position, PLAYER_RADIUS, PLAYER_HEIGHT);
    return this.world.getBlockCollisionBoxes(x, y, z, id).some((blockBox) =>
      aabbsIntersect(playerBox, blockBox, COLLISION_EPSILON)
    );
  }

  public setMoveInput(forward: number, right: number, sprint = false): void {
    this.virtualForward = MathUtils.clamp(Number.isFinite(forward) ? forward : 0, -1, 1);
    this.virtualRight = MathUtils.clamp(Number.isFinite(right) ? right : 0, -1, 1);
    this.virtualSprint = sprint;
  }

  public addLookDelta(deltaX: number, deltaY: number): void {
    if (!this.enabled || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
    this.applyLook(deltaX, deltaY);
  }

  public jump(): void {
    if (this.enabled) this.jumpQueued = true;
  }

  public setJumpPressed(pressed: boolean): void {
    this.virtualJump = pressed;
    if (pressed && this.enabled) this.jumpQueued = true;
  }

  public setCrouchPressed(pressed: boolean): void {
    this.virtualCrouch = pressed;
  }

  public setUsingItem(using: boolean): void {
    this.usingItem = using;
    if (using) this.sprinting = false;
  }

  public setFov(value: number): void {
    if (!Number.isFinite(value)) return;
    this.baseFov = MathUtils.clamp(value, 40, 110);
    this.syncCamera(0, this.sprinting);
  }

  public setSensitivity(multiplier: number): void {
    if (!Number.isFinite(multiplier)) return;
    this.sensitivityMultiplier = MathUtils.clamp(multiplier, 0.1, 4);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    this.sprinting = false;
    this.crouching = false;
    this.usingItem = false;
    this.clearInput();

    this.domElement.removeEventListener('click', this.handleClick);
    if (typeof document !== 'undefined') {
      document.removeEventListener('keydown', this.handleKeyDown);
      document.removeEventListener('keyup', this.handleKeyUp);
      document.removeEventListener('mousemove', this.handleMouseMove);
      document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
      if (document.pointerLockElement === this.domElement) document.exitPointerLock();
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('blur', this.handleBlur);
    }

    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  private simulateStep(dt: number, input: MovementInput, sprinting: boolean): void {
    if (dt <= 0) return;

    const inputLength = Math.hypot(input.forward, input.right);
    const normalizedForward = inputLength > 1 ? input.forward / inputLength : input.forward;
    const normalizedRight = inputLength > 1 ? input.right / inputLength : input.right;
    const inLiquid = this.isInLiquid();
    const baseTargetSpeed = this.enabled
      ? input.crouch
        ? CROUCH_SPEED
        : inLiquid
          ? WATER_SPEED
          : sprinting
            ? SPRINT_SPEED
            : WALK_SPEED
      : 0;
    const targetSpeed = baseTargetSpeed * (this.usingItem ? ITEM_USE_SPEED_MULTIPLIER : 1);
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const targetVelocityX = (normalizedRight * cosYaw - normalizedForward * sinYaw) * targetSpeed;
    const targetVelocityZ = (-normalizedRight * sinYaw - normalizedForward * cosYaw) * targetSpeed;
    const hasMovementInput = inputLength > 1e-3 && this.enabled;
    const acceleration = inLiquid
      ? WATER_ACCELERATION
      : hasMovementInput
        ? this.onGround
          ? GROUND_ACCELERATION
          : AIR_ACCELERATION
        : this.onGround
          ? GROUND_DECELERATION
          : AIR_DECELERATION;

    this.velocity.x = this.approach(this.velocity.x, targetVelocityX, acceleration * dt);
    this.velocity.z = this.approach(this.velocity.z, targetVelocityZ, acceleration * dt);
    if (inLiquid) {
      const targetVerticalSpeed = input.jump && this.enabled ? WATER_SWIM_SPEED : WATER_SINK_SPEED;
      this.velocity.y = Math.max(this.velocity.y, -WATER_TERMINAL_VELOCITY);
      this.velocity.y = this.approach(
        this.velocity.y,
        targetVerticalSpeed,
        WATER_VERTICAL_ACCELERATION * dt
      );
    } else {
      this.velocity.y = Math.max(this.velocity.y - GRAVITY * dt, -TERMINAL_VELOCITY);
    }

    this.moveAlongAxis('x', this.velocity.x * dt);
    this.moveAlongAxis('z', this.velocity.z * dt);
    const wasOnGround = this.onGround;
    const verticalMovement = this.velocity.y * dt;
    if (inLiquid || verticalMovement > 0) {
      this.fallDistance = 0;
    } else if (!wasOnGround && verticalMovement < 0) {
      this.fallDistance += -verticalMovement;
    }
    this.onGround = false;
    this.moveAlongAxis('y', verticalMovement);
    if (this.onGround && !wasOnGround && verticalMovement < 0) {
      this.pendingLandingDistance = Math.max(this.pendingLandingDistance, this.fallDistance);
      this.fallDistance = 0;
    }
  }

  private moveAlongAxis(axis: Axis, amount: number): void {
    if (Math.abs(amount) <= Number.EPSILON) return;

    const playerBox = createPlayerAabb(this.position, PLAYER_RADIUS, PLAYER_HEIGHT);
    const destinationBox = moveAabbAlongAxis(playerBox, axis, amount);
    const minX = Math.floor(Math.min(playerBox.minX, destinationBox.minX) - COLLISION_EPSILON);
    const maxX = Math.floor(Math.max(playerBox.maxX, destinationBox.maxX) + COLLISION_EPSILON);
    const minY = Math.floor(Math.min(playerBox.minY, destinationBox.minY) - COLLISION_EPSILON);
    const maxY = Math.floor(Math.max(playerBox.maxY, destinationBox.maxY) + COLLISION_EPSILON);
    const minZ = Math.floor(Math.min(playerBox.minZ, destinationBox.minZ) - COLLISION_EPSILON);
    const maxZ = Math.floor(Math.max(playerBox.maxZ, destinationBox.maxZ) + COLLISION_EPSILON);
    let clippedAmount = amount;

    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          clippedAmount = clipAabbMovementAgainstBoxes(
            playerBox,
            this.world.getBlockCollisionBoxes(x, y, z),
            axis,
            clippedAmount,
            COLLISION_EPSILON
          );
        }
      }
    }

    this.position[axis] += clippedAmount;
    if (Math.abs(clippedAmount - amount) <= Number.EPSILON) return;

    this.velocity[axis] = 0;
    if (axis === 'y' && amount < 0) this.onGround = true;
  }

  private readMovementInput(): MovementInput {
    const keyboardActive = this.enabled && this.hasPointerLock();
    const keyForward = keyboardActive
      ? Number(this.pressedKeys.has('KeyW') || this.pressedKeys.has('ArrowUp')) -
        Number(this.pressedKeys.has('KeyS') || this.pressedKeys.has('ArrowDown'))
      : 0;
    const keyRight = keyboardActive
      ? Number(this.pressedKeys.has('KeyD') || this.pressedKeys.has('ArrowRight')) -
        Number(this.pressedKeys.has('KeyA') || this.pressedKeys.has('ArrowLeft'))
      : 0;

    return {
      forward: MathUtils.clamp(keyForward + this.virtualForward, -1, 1),
      right: MathUtils.clamp(keyRight + this.virtualRight, -1, 1),
      sprint:
        this.virtualSprint ||
        (keyboardActive && (this.pressedKeys.has('ControlLeft') || this.pressedKeys.has('ControlRight'))),
      jump: this.virtualJump || (keyboardActive && this.pressedKeys.has('Space')),
      crouch:
        this.virtualCrouch ||
        (keyboardActive && (this.pressedKeys.has('ShiftLeft') || this.pressedKeys.has('ShiftRight')))
    };
  }

  private isInLiquid(): boolean {
    const x = Math.floor(this.position.x);
    const z = Math.floor(this.position.z);
    const feetY = this.position.y + 0.1;
    const torsoY = this.position.y + PLAYER_HEIGHT * 0.65;
    return this.isPointInLiquid(x, feetY, z) || this.isPointInLiquid(x, torsoY, z);
  }

  private isPointInLiquid(x: number, y: number, z: number): boolean {
    const blockY = Math.floor(y);
    return y - blockY < WATER_SURFACE_HEIGHT && this.world.isLiquid(x, blockY, z);
  }

  private updateViewEffects(dt: number, moving: boolean, sprinting: boolean): void {
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const shouldBob = this.enabled && this.onGround && moving && horizontalSpeed > 0.2;
    const bobTarget = shouldBob ? 1 : 0;
    this.bobAmount = MathUtils.lerp(this.bobAmount, bobTarget, 1 - Math.exp(-dt * 12));
    if (shouldBob) this.bobPhase += dt * horizontalSpeed * (sprinting ? 2.25 : 2);
    const targetEyeHeight = this.enabled && this.virtualCrouch ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    this.currentEyeHeight = MathUtils.lerp(
      this.currentEyeHeight,
      targetEyeHeight,
      1 - Math.exp(-dt * 14)
    );
  }

  private syncCamera(dt: number, sprinting: boolean): void {
    const bobY = Math.abs(Math.sin(this.bobPhase)) * BOB_HEIGHT * this.bobAmount;
    const sway = Math.sin(this.bobPhase * 0.5) * BOB_SWAY * this.bobAmount;
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    this.camera.position.set(
      this.position.x + rightX * sway,
      this.position.y + this.currentEyeHeight + bobY,
      this.position.z + rightZ * sway
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

    const targetFov = this.baseFov + (sprinting && this.onGround ? SPRINT_FOV_BONUS : 0);
    const nextFov = dt > 0 ? MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-dt * 8)) : targetFov;
    if (Math.abs(nextFov - this.camera.fov) > 1e-3) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
  }

  private applyLook(deltaX: number, deltaY: number): void {
    const sensitivity = LOOK_SENSITIVITY * this.sensitivityMultiplier;
    this.yaw = this.wrapAngle(this.yaw - deltaX * sensitivity);
    this.pitch = MathUtils.clamp(this.pitch - deltaY * sensitivity, -MAX_PITCH, MAX_PITCH);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private hasPointerLock(): boolean {
    return typeof document !== 'undefined' && document.pointerLockElement === this.domElement;
  }

  private clearInput(): void {
    this.pressedKeys.clear();
    this.virtualForward = 0;
    this.virtualRight = 0;
    this.virtualSprint = false;
    this.virtualJump = false;
    this.virtualCrouch = false;
    this.jumpQueued = false;
  }

  private approach(current: number, target: number, maxDelta: number): number {
    if (current < target) return Math.min(current + maxDelta, target);
    if (current > target) return Math.max(current - maxDelta, target);
    return target;
  }

  private wrapAngle(angle: number): number {
    return MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
  }

  private readonly handleClick = (): void => {
    if (this.enabled && !this.hasPointerLock()) this.requestPointerLock();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled || !this.hasPointerLock() || !MOVEMENT_KEYS.has(event.code)) return;
    event.preventDefault();
    this.pressedKeys.add(event.code);
    if (event.code === 'Space' && !event.repeat) this.jumpQueued = true;
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (!MOVEMENT_KEYS.has(event.code)) return;
    this.pressedKeys.delete(event.code);
    if (this.enabled && this.hasPointerLock()) event.preventDefault();
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.enabled || !this.hasPointerLock()) return;
    this.applyLook(event.movementX, event.movementY);
  };

  private readonly handlePointerLockChange = (): void => {
    if (!this.hasPointerLock()) this.pressedKeys.clear();
  };

  private readonly handleBlur = (): void => {
    this.pressedKeys.clear();
    this.jumpQueued = false;
  };
}
