import * as THREE from 'three';
import './style.css';
import { GameAudio } from './game/audio';
import {
  aabbsIntersect,
  blockBlocksChestLid,
  createPlayerAabb
} from './game/block-shapes';
import { getBlockDefinition } from './game/blocks';
import { calculateChargedAttack, getAttackStrength } from './game/combat';
import {
  ChestManager,
  chestKey,
  type ChestPlacementRejectionReason,
  type ChestPosition,
  type ResolvedChestContainer
} from './game/chest-manager';
import { ChestVisualManager } from './game/chest-visual-manager';
import {
  DEFAULT_CHEST_FACING,
  chestFacingFromYaw,
  type ChestFacing,
  type ChestSnapshot
} from './game/chest';
import { DoubleChestVisualManager } from './game/double-chest-visual-manager';
import {
  CRAFTING_TABLE_RECIPES_3X3,
  PLAYER_CRAFTING_RECIPES_2X2,
  CraftingGrid,
  type CraftingRecipeDefinition
} from './game/crafting';
import { BlockParticles, BlockTargetIndicator, HeldBlockView } from './game/effects';
import { ArmorEquipment, armorSlotToIndex } from './game/equipment';
import { getDaylight, WorldEnvironment } from './game/environment';
import { FurnaceManager, furnaceKey } from './game/furnace-manager';
import type { FurnaceSlot, FurnaceSnapshot } from './game/furnace';
import { InventoryActions } from './game/inventory-actions';
import {
  createSurvivalInventoryState,
  createUICraftingRecipes,
  isBlockItem,
  toInventoryItemStack
} from './game/inventory-ui';
import { MobManager, type MobDrop, type MobKind } from './game/mobs';
import { PlayerController } from './game/player';
import { createWorldSave, loadWorldSave, writeWorldSave } from './game/save';
import {
  MAX_HUNGER,
  TOOL_DEFINITIONS,
  SurvivalSystem,
  getArmorDefinition,
  getMeleeDamage,
  getItemStackLimit,
  isFoodItemId,
  isArmorItemId,
  isToolItemId,
  type ItemId,
  type ItemStack,
  type FoodItemId,
  type DamageSource,
  type SurvivalEvent
} from './game/survival';
import { BlockId, HOTBAR_BLOCKS, isBlockId, type BlockHit, type WorldSave } from './game/types';
import {
  GameUI,
  type ContainerContext,
  type CraftingContext,
  type GameUISettings,
  type InventoryMode,
  type MobileActionDetail
} from './game/ui';
import {
  CHUNK_SIZE,
  VoxelWorld,
  WATER_SURFACE_HEIGHT,
  WORLD_MAX_COORDINATE,
  WORLD_MIN_COORDINATE
} from './game/world';
import { WorldDropManager, type WorldDropPickupEvent } from './game/world-drops';

type GameMode = 'loading' | 'title' | 'playing' | 'paused' | 'inventory' | 'dead';

interface ChestContainerDebugInfo {
  isDouble: boolean;
  facing: ChestFacing;
  selectedKey: string;
  keys: string[];
  positions: ChestPosition[];
  size: 27 | 54;
}

interface ChestVisualDebugInfo {
  kind: 'single' | 'double';
  visualKey: string;
  openProgress: number;
  visible: boolean;
}

const SETTINGS_KEY = 'voxel-frontier:settings:v1';
const DAY_LENGTH_SECONDS = 540;
const AUTOSAVE_SECONDS = 12;
const CHEST_VISUAL_SYNC_SECONDS = 0.25;
const MAX_REACH = 5.5;
const FOOD_USE_DURATION_MS = 1610;

const TORCH_SUPPORT_OFFSETS = [
  [0, -1, 0],
  [-1, 0, 0],
  [1, 0, 0],
  [0, 0, -1],
  [0, 0, 1]
] as const;

const TORCH_DEPENDENT_OFFSETS = [
  [0, 1, 0],
  [-1, 0, 0],
  [1, 0, 0],
  [0, 0, -1],
  [0, 0, 1]
] as const;

const tmpDirection = new THREE.Vector3();
const tmpPlayerPosition = new THREE.Vector3();

function isPlayerHorizontalPositionWithinWorld(
  position: readonly [number, number, number]
): boolean {
  const [x, , z] = position;
  return (
    Number.isFinite(x) &&
    Number.isFinite(z) &&
    x - 0.3 >= WORLD_MIN_COORDINATE &&
    x + 0.3 <= WORLD_MAX_COORDINATE &&
    z - 0.3 >= WORLD_MIN_COORDINATE &&
    z + 0.3 <= WORLD_MAX_COORDINATE
  );
}

declare global {
  interface Window {
    __GAME_TEST__?: {
      getState: () => {
        mode: GameMode;
        inventoryMode: InventoryMode;
        containerContext: ContainerContext;
        craftingContext: CraftingContext;
        seed: number;
        selectedSlot: number;
        selectedBlock: BlockId;
        position: [number, number, number];
        timeOfDay: number;
        health: number;
        hunger: number;
        armor: number;
        attackCharge: number;
        air: number;
        dead: boolean;
        mobCount: number;
        dropCount: number;
        usingItem: FoodItemId | null;
        itemUseProgress: number;
        target: [number, number, number, BlockId] | null;
      };
      getBlock: (x: number, y: number, z: number) => BlockId;
      setBlock: (x: number, y: number, z: number, id: BlockId) => boolean;
      getLightLevel: (x: number, y: number, z: number) => { sky: number; block: number };
      getStreamingState: () => ReturnType<VoxelWorld['getStreamingState']>;
      getInventory: () => Array<ItemStack | null>;
      getEquipment: () => Array<ItemStack | null>;
      giveItem: (item: ItemId, count?: number) => number;
      setInventorySlot: (slot: number, stack: ItemStack | null) => void;
      setArmorSlot: (slot: number, stack: ItemStack | null) => boolean;
      selectSlot: (slot: number) => void;
      setHunger: (hunger: number) => void;
      setUsePressed: (pressed: boolean) => void;
      openCraftingTable: () => void;
      openFurnace: (x: number, y: number, z: number) => void;
      openChest: (x: number, y: number, z: number) => boolean;
      getFurnaceState: (x: number, y: number, z: number) => FurnaceSnapshot | null;
      setFurnaceSlot: (
        x: number,
        y: number,
        z: number,
        slot: FurnaceSlot,
        stack: ItemStack | null
      ) => void;
      getChest: (x: number, y: number, z: number) => ChestSnapshot | null;
      getChestFacing: (x: number, y: number, z: number) => ChestFacing | null;
      getChestContainerInfo: (x: number, y: number, z: number) => ChestContainerDebugInfo | null;
      getChestVisualInfo: (x: number, y: number, z: number) => ChestVisualDebugInfo | null;
      setChestSlot: (
        x: number,
        y: number,
        z: number,
        slot: number,
        stack: ItemStack | null
      ) => boolean;
      advanceFurnaces: (seconds: number) => void;
      clearMobs: () => void;
      clearDrops: () => void;
      getMobCount: (kind?: MobKind) => number;
      spawnMobAhead: (kind: MobKind, distance?: number) => string;
      attackMob: () => boolean;
      setAttackCharge: (elapsedSeconds: number) => void;
      setTimeOfDay: (time: number) => void;
      teleport: (x: number, y: number, z: number) => void;
      pauseTime: (paused: boolean) => void;
    };
  }
}

class VoxelFrontierGame {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.05, 180);
  private readonly ui: GameUI;
  private readonly audio = new GameAudio();
  private readonly environment: WorldEnvironment;
  private readonly targetIndicator = new BlockTargetIndicator();
  private readonly particles = new BlockParticles();
  private readonly heldBlock: HeldBlockView;
  private readonly mouseButtons = new Set<number>();
  private readonly cleanupCallbacks: Array<() => void> = [];
  private readonly coarsePointer = window.matchMedia('(pointer: coarse)');
  private readonly furnaces = new FurnaceManager();
  private readonly chests = new ChestManager();
  private readonly chestVisuals = new ChestVisualManager();
  private readonly doubleChestVisuals = new DoubleChestVisualManager();
  private readonly chestPositions = new Map<string, readonly [number, number, number]>();

  private world!: VoxelWorld;
  private player!: PlayerController;
  private survival!: SurvivalSystem;
  private playerCrafting!: CraftingGrid;
  private tableCrafting!: CraftingGrid;
  private crafting!: CraftingGrid;
  private inventoryActions!: InventoryActions;
  private equipment!: ArmorEquipment;
  private mobs!: MobManager;
  private worldDrops!: WorldDropManager;
  private unsubscribeSurvival: (() => void) | null = null;
  private mode: GameMode = 'loading';
  private inventoryMode: InventoryMode = 'survival';
  private containerContext: ContainerContext = 'player';
  private craftingContext: CraftingContext = 'player';
  private activeFurnaceKey: string | null = null;
  private activeChestKey: string | null = null;
  private timeOfDay = 0.31;
  private miningProgress = 0;
  private miningKey = '';
  private currentHit: BlockHit | null = null;
  private autosaveElapsed = 0;
  private statsElapsed = 0;
  private statsFrames = 0;
  private chestVisualSyncElapsed = 0;
  private previousUnderwater = false;
  private timePausedForTests = false;
  private lastFrameTime = performance.now();
  private renderDistanceChunks = 6;
  private attackChargeElapsed = 10;
  private activeFoodUse: { slot: number; item: FoodItemId; startedAt: number } | null = null;
  private creativeHotbar: BlockId[] = [...HOTBAR_BLOCKS];
  private previousOnGround = false;
  private readonly previousSurvivalPosition = new THREE.Vector3();
  private damageFlashTimer: number | undefined;
  private disposed = false;

  constructor(private readonly root: HTMLElement) {
    this.ui = new GameUI(root);
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.domElement.tabIndex = 0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.root.prepend(this.renderer.domElement);

    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.environment = new WorldEnvironment(this.scene);
    this.scene.add(
      this.environment,
      this.targetIndicator,
      this.particles,
      this.chestVisuals,
      this.doubleChestVisuals
    );
    this.heldBlock = new HeldBlockView(this.camera);
    this.heldBlock.mesh.visible = false;

    this.bindUI();
    this.bindInput();
    this.handleResize();
    this.applySettings(this.readSettings());
  }

  async init(): Promise<void> {
    this.ui.setLoadingProgress(0.05, '正在准备方块世界');
    this.ui.setHudVisible(false);
    await nextFrame();

    const save = loadWorldSave();
    await this.createWorld(save?.seed ?? randomSeed(), save);
    this.mode = 'title';
    this.ui.showTitle(true, save !== null);
    this.ui.setLoadingProgress(1, '世界准备完成');
    this.installTestAPI();
    this.renderer.setAnimationLoop(this.animate);
  }

  private async createWorld(seed: number, save: WorldSave | null = null): Promise<void> {
    const returnMode = this.mode;
    this.mode = 'loading';
    this.ui.setLoadingProgress(0.14, '正在生成地形');
    await nextFrame();

    const initialFocus = save?.player && isPlayerHorizontalPositionWithinWorld(save.player.position)
      ? new THREE.Vector3(...save.player.position)
      : new THREE.Vector3();
    const nextWorld = new VoxelWorld(seed, this.renderDistanceChunks, initialFocus);
    this.ui.setLoadingProgress(0.72, '正在构建区块');
    await nextFrame();

    if (save?.edits) nextWorld.loadEdits(save.edits);
    const previousPlayer = this.player as PlayerController | undefined;
    const previousWorld = this.world as VoxelWorld | undefined;
    const previousMobs = this.mobs as MobManager | undefined;
    const previousWorldDrops = this.worldDrops as WorldDropManager | undefined;
    const previousSurvival = this.survival as SurvivalSystem | undefined;
    this.unsubscribeSurvival?.();
    this.unsubscribeSurvival = null;
    previousMobs?.dispose();
    previousWorldDrops?.dispose();
    previousSurvival?.dispose();
    previousPlayer?.dispose();
    this.activeFurnaceKey = null;
    this.activeChestKey = null;
    this.chestVisuals.clear();
    this.doubleChestVisuals.clear();
    this.chestPositions.clear();
    this.chestVisualSyncElapsed = 0;
    if (previousWorld) {
      this.scene.remove(previousWorld);
      previousWorld.dispose();
    }

    this.world = nextWorld;
    this.scene.add(nextWorld);
    this.furnaces.load(
      save?.furnaces,
      (x, y, z) => this.world.getBlock(x, y, z) === BlockId.Furnace
    );
    this.chests.load(
      save?.chests,
      (x, y, z) => this.world.getBlock(x, y, z) === BlockId.Chest
    );
    const initialDaylight = getDaylight(save?.timeOfDay ?? 0.31);
    for (const [x, y, z, id] of nextWorld.serializeEdits()) {
      if (id !== BlockId.Chest) continue;
      const facing = this.chests.getFacing(x, y, z) ?? DEFAULT_CHEST_FACING;
      this.chests.getOrCreate(x, y, z, facing);
    }
    this.world.setChestConnectionResolver((x, y, z) =>
      this.chests.getConnectionOffset(x, y, z)
    );
    this.rebuildChestVisuals(initialDaylight);
    this.containerContext = 'player';
    this.player = new PlayerController(this.camera, this.world, this.renderer.domElement);
    this.survival = new SurvivalSystem({ snapshot: save?.survival });
    this.equipment = new ArmorEquipment(save?.equipment);
    this.playerCrafting = new CraftingGrid(2);
    this.tableCrafting = new CraftingGrid(3);
    this.craftingContext = 'player';
    this.crafting = this.playerCrafting;
    this.inventoryActions = new InventoryActions(
      this.survival.inventory,
      this.crafting,
      this.equipment
    );
    this.inventoryActions.setFurnace(null);
    this.inventoryActions.setChest(null);
    save?.crafting?.slots.slice(0, 4).forEach((stack, index) => {
      this.playerCrafting.setSlot(index, stack);
    });
    this.inventoryActions.setCursor(save?.cursor ?? null);
    this.inventoryMode = save === null ? 'survival' : save.mode ?? 'creative';
    this.creativeHotbar = normalizeCreativeHotbar(save?.hotbar);
    this.ui.setInventoryMode(this.inventoryMode);
    this.ui.setContainerContext('player');
    this.ui.setCraftingContext('player');
    this.ui.setRecipes(createUICraftingRecipes(PLAYER_CRAFTING_RECIPES_2X2));
    this.unsubscribeSurvival = this.survival.onEvent((event) => this.handleSurvivalEvent(event));
    this.worldDrops = new WorldDropManager({
      isSolid: (x, y, z) => this.world.isSolid(x, y, z),
      onPickup: (event) => this.handleWorldDropPickup(event)
    });
    this.worldDrops.loadSavedDrops(save?.drops);
    this.scene.add(this.worldDrops);
    this.mobs = new MobManager(this.world, seed, {
      onPlayerDamage: (amount) => {
        if (this.inventoryMode !== 'survival') return;
        const mitigation = this.equipment.mitigateDamage(amount);
        const durability = this.equipment.damageFromHit(amount);
        if (durability.broken.length > 0) this.ui.showToast('护甲损坏了', 'warning');
        if (durability.changed) this.syncSurvivalUI();
        this.survival.takeDamage(mitigation.appliedDamage, 'generic');
      },
      onDrop: (drop, position) => this.collectMobDrop(drop, position),
      onMobHurt: (kind, position, killed) => {
        this.audio.playMobHurt(kind, killed);
        this.particles.spawn(position.clone().floor(), getMobParticleColor(kind));
      }
    });
    this.scene.add(this.mobs);
    const settings = this.ui.getSettings();
    this.player.setFov(settings.fov);
    this.player.setSensitivity(settings.sensitivity);
    this.world.setVisualQuality(settings.quality);

    if (save?.player && this.isSnapshotPositionUsable(save.player.position)) {
      this.player.applySnapshot(save.player);
      this.ui.setSelectedSlot(save.player.selectedSlot);
    } else {
      this.teleportPlayer(this.world.getSpawnPoint());
      this.ui.setSelectedSlot(0);
    }
    if (this.inventoryMode === 'creative') this.ui.setHotbarBlocks(this.creativeHotbar);
    this.world.setRenderDistance(this.renderDistanceChunks, this.player.getPosition(tmpPlayerPosition));
    this.previousSurvivalPosition.copy(this.player.getPosition(tmpPlayerPosition));
    this.previousOnGround = this.player.onGround;

    this.timeOfDay = save?.timeOfDay ?? 0.31;
    this.syncChestVisuals(
      getDaylight(this.timeOfDay),
      this.player.getPosition(tmpPlayerPosition)
    );
    this.syncSurvivalUI();
    this.updateHeldBlock();
    this.resetMining();
    this.autosaveElapsed = 0;
    this.attackChargeElapsed = 10;
    this.mode = returnMode === 'loading' ? 'title' : returnMode;
    this.ui.setLoadingProgress(0.94, '正在放置玩家');
    await nextFrame();
  }

  private bindUI(): void {
    this.cleanupCallbacks.push(
      this.ui.on('start', () => this.startPlaying()),
      this.ui.on('resume', () => this.startPlaying()),
      this.ui.on('newworld', ({ seed }) => {
        void this.startNewWorld(seed);
      }),
      this.ui.on('save', () => this.saveWorld(true)),
      this.ui.on('title', () => {
        this.saveWorld(false);
        this.enterTitle();
      }),
      this.ui.on('inventorychange', ({ open }) => this.setInventory(open)),
      this.ui.on('slotselect', ({ slot }) => {
        this.cancelFoodUse();
        this.ui.setSelectedSlot(slot);
        this.updateHeldBlock();
        this.syncSelectedToolDurability();
        this.audio.playClick();
      }),
      this.ui.on('inventorymodechange', ({ mode }) => this.setInventoryMode(mode)),
      this.ui.on('inventoryslotaction', ({ area, index, button, shiftKey, doubleClick }) => {
        if (this.inventoryMode !== 'survival' && this.containerContext === 'player') return;
        const result = doubleClick
          ? this.inventoryActions.doubleClick(area, index)
          : this.inventoryActions.click(area, index, button, shiftKey);
        if (area === 'craft-output' && result.changed) this.audio.playCraft();
        if (area === 'furnace-output' && result.changed) this.audio.playPickup();
        this.syncSurvivalUI();
      }),
      this.ui.on('craftrequest', ({ source, recipeId, amount }) => {
        if (this.containerContext === 'furnace' || this.containerContext === 'chest') return;
        if (this.inventoryMode !== 'survival' && this.containerContext !== 'table') return;
        this.handleCraftRequest(source, recipeId, amount);
      }),
      this.ui.on('respawn', () => this.respawnPlayer()),
      this.ui.on('deathtitle', () => {
        this.saveWorld(false);
        this.enterTitle();
      }),
      this.ui.on('settingschange', ({ settings }) => {
        this.applySettings(settings);
        this.writeSettings(settings);
      }),
      this.ui.on('mobileaction', (detail) => this.handleMobileAction(detail))
    );
  }

  private bindInput(): void {
    const canvas = this.renderer.domElement;

    const onMouseDown = (event: MouseEvent): void => {
      if (!this.canInteract()) return;
      event.preventDefault();
      if (event.button === 0) {
        if (this.activeFoodUse) {
          this.mouseButtons.add(0);
          return;
        }
        if (this.tryAttackMob()) return;
        if (!this.currentHit) this.attackChargeElapsed = 0;
        this.mouseButtons.add(0);
        this.heldBlock.triggerSwing();
      } else if (event.button === 2) {
        this.mouseButtons.add(2);
        this.placeSelectedBlock();
      } else if (event.button === 1) {
        this.pickTargetedBlock();
      }
    };
    const onMouseUp = (event: MouseEvent): void => {
      this.mouseButtons.delete(event.button);
      if (event.button === 0) this.resetMiningProgress();
      if (event.button === 2) this.cancelFoodUse();
    };
    const onContextMenu = (event: MouseEvent): void => event.preventDefault();
    const onWheel = (event: WheelEvent): void => {
      if (this.mode !== 'playing') return;
      event.preventDefault();
      const direction = event.deltaY > 0 ? 1 : -1;
      this.selectSlot((this.ui.getSelectedSlot() + direction + 9) % 9);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code.startsWith('Digit')) {
        const slot = Number(event.code.slice(5)) - 1;
        if (slot >= 0 && slot < 9 && (this.mode === 'playing' || this.mode === 'inventory')) {
          event.preventDefault();
          this.selectSlot(slot);
        }
        return;
      }

      if (event.code === 'KeyE' && (this.mode === 'playing' || this.mode === 'inventory')) {
        event.preventDefault();
        this.ui.toggleInventory();
        return;
      }

      if (event.code === 'Escape') {
        if (this.mode === 'inventory') {
          event.preventDefault();
          this.ui.toggleInventory();
        } else if (this.mode === 'paused') {
          event.preventDefault();
          this.startPlaying();
        } else if (this.mode === 'playing') {
          event.preventDefault();
          this.pauseGame();
        }
      }
    };
    const onPointerLockChange = (): void => {
      if (
        this.mode === 'playing' &&
        !this.coarsePointer.matches &&
        document.pointerLockElement !== canvas
      ) {
        this.pauseGame();
      }
    };
    const onBlur = (): void => {
      this.mouseButtons.clear();
      this.cancelFoodUse();
      if (this.mode === 'playing' && !this.coarsePointer.matches) this.pauseGame();
    };
    const onVisibility = (): void => {
      if (!document.hidden) return;
      this.cancelFoodUse();
      if (this.mode === 'playing') this.pauseGame();
    };
    const onBeforeUnload = (): void => {
      if (this.world && this.player) this.saveWorld(false);
      this.dispose();
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);

    this.cleanupCallbacks.push(
      () => canvas.removeEventListener('mousedown', onMouseDown),
      () => window.removeEventListener('mouseup', onMouseUp),
      () => canvas.removeEventListener('contextmenu', onContextMenu),
      () => canvas.removeEventListener('wheel', onWheel),
      () => document.removeEventListener('keydown', onKeyDown),
      () => document.removeEventListener('pointerlockchange', onPointerLockChange),
      () => window.removeEventListener('blur', onBlur),
      () => window.removeEventListener('resize', this.handleResize),
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => window.removeEventListener('beforeunload', onBeforeUnload)
    );
  }

  private startPlaying(): void {
    if (!this.player || this.mode === 'loading') return;
    if (this.inventoryMode === 'survival' && this.survival.dead) {
      this.enterDeathState(this.survival.deathCause, false);
      return;
    }
    this.mode = 'playing';
    this.ui.hideDeath();
    this.ui.showTitle(false);
    this.ui.showPause(false);
    this.ui.setInventoryOpen(false);
    this.ui.setHudVisible(true);
    this.updateHeldBlock();
    void this.audio.unlock();
    this.player.setEnabled(true);
  }

  private pauseGame(): void {
    if (this.mode !== 'playing') return;
    this.cancelFoodUse();
    this.mode = 'paused';
    this.player.setEnabled(false);
    this.mouseButtons.clear();
    this.resetMining();
    this.heldBlock.mesh.visible = false;
    this.ui.showPause(true);
  }

  private enterTitle(): void {
    this.cancelFoodUse();
    this.mode = 'title';
    this.player.setEnabled(false);
    this.mouseButtons.clear();
    this.resetMining();
    this.heldBlock.mesh.visible = false;
    this.ui.hideDeath();
    this.ui.showTitle(true, true);
  }

  private setInventory(open: boolean): void {
    if (open && this.mode === 'playing') {
      this.ui.setInventoryMode(this.inventoryMode);
      this.setContainerContext('player');
      this.setCraftingContext('player');
      this.enterInventoryMode();
      this.syncSurvivalUI();
      return;
    }
    if (!open && this.mode === 'inventory') {
      this.closeActiveContainer();
      this.mode = 'playing';
      this.updateHeldBlock();
      this.player.setEnabled(true);
    }
  }

  private enterInventoryMode(): void {
    this.cancelFoodUse();
    this.mode = 'inventory';
    this.player.setEnabled(false);
    this.mouseButtons.clear();
    this.resetMining();
    this.heldBlock.mesh.visible = false;
  }

  private openCraftingTable(): void {
    if (this.mode !== 'playing') return;
    this.captureCreativeHotbar();
    this.ui.setInventoryMode('survival');
    this.setContainerContext('table');
    this.setCraftingContext('table');
    this.ui.setRecipeBookOpen(false);
    this.ui.setInventoryOpen(true);
    this.enterInventoryMode();
    this.syncSurvivalUI();
    this.audio.playClick();
  }

  private openFurnace(position: THREE.Vector3): void {
    if (this.mode !== 'playing') return;
    const x = Math.floor(position.x);
    const y = Math.floor(position.y);
    const z = Math.floor(position.z);
    if (this.world.getBlock(x, y, z) !== BlockId.Furnace) return;

    this.captureCreativeHotbar();
    this.setCraftingContext('player');
    const furnace = this.furnaces.getOrCreate(x, y, z);
    this.activeFurnaceKey = furnaceKey(x, y, z);
    this.inventoryActions.setFurnace(furnace);
    this.setContainerContext('furnace');
    this.ui.setInventoryMode('survival');
    this.ui.setRecipeBookOpen(false);
    this.ui.setInventoryOpen(true);
    this.enterInventoryMode();
    this.syncSurvivalUI();
    this.audio.playClick();
  }

  private openChest(position: THREE.Vector3): boolean {
    if (this.mode !== 'playing') return false;
    const x = Math.floor(position.x);
    const y = Math.floor(position.y);
    const z = Math.floor(position.z);
    if (this.world.getBlock(x, y, z) !== BlockId.Chest) return false;

    let container = this.chests.resolveContainer(x, y, z);
    if (!container) {
      const facing = this.chests.getFacing(x, y, z) ?? DEFAULT_CHEST_FACING;
      this.chests.getOrCreate(x, y, z, facing);
      this.rebuildChestVisuals(
        getDaylight(this.timeOfDay),
        this.player.getPosition(tmpPlayerPosition)
      );
      container = this.chests.resolveContainer(x, y, z);
    }
    if (!container) return false;
    if (
      container.positions.some(([chestX, chestY, chestZ]) =>
        blockBlocksChestLid(this.world.getBlock(chestX, chestY + 1, chestZ))
      )
    ) {
      this.ui.showToast('箱子上方被方块挡住了', 'warning');
      return false;
    }

    this.captureCreativeHotbar();
    this.setCraftingContext('player');
    const key = chestKey(x, y, z);
    if (this.activeChestKey) this.setChestVisualOpen(this.activeChestKey, false);
    this.activeChestKey = key;
    this.inventoryActions.setChest(container.inventory);
    this.setContainerContext('chest');
    this.setChestVisualOpen(key, true);
    this.ui.setInventoryMode('survival');
    this.ui.setRecipeBookOpen(false);
    this.ui.setInventoryOpen(true);
    this.enterInventoryMode();
    this.syncSurvivalUI();
    this.audio.playClick();
    return true;
  }

  private setContainerContext(context: ContainerContext): void {
    this.containerContext = context;
    if (context !== 'furnace') {
      this.activeFurnaceKey = null;
      this.inventoryActions.setFurnace(null);
    }
    if (context !== 'chest') {
      if (this.activeChestKey) this.setChestVisualOpen(this.activeChestKey, false);
      this.activeChestKey = null;
      this.inventoryActions.setChest(null);
    }
    this.ui.setContainerContext(context);
  }

  private rebuildChestVisuals(
    daylight = getDaylight(this.timeOfDay),
    playerPosition?: THREE.Vector3
  ): void {
    this.chestVisuals.clear();
    this.doubleChestVisuals.clear();
    this.chestPositions.clear();

    const entries = this.chests.serialize();
    for (const entry of entries) {
      this.chestPositions.set(chestKey(...entry.position), entry.position);
    }

    const rendered = new Set<string>();
    for (const entry of entries) {
      const key = chestKey(...entry.position);
      if (rendered.has(key)) continue;
      const container = this.chests.resolveContainerByKey(key);
      if (!container) continue;

      if (container.isDouble) {
        container.keys.forEach((halfKey) => rendered.add(halfKey));
        const visual = this.doubleChestVisuals.upsert(
          {
            facing: container.facing,
            left: container.left,
            right: container.right
          },
          this.getChestContainerLighting(container.positions, daylight)
        );
        visual.visible = !playerPosition || this.isChestContainerWithinRenderDistance(
          container.positions,
          playerPosition
        );
        continue;
      }

      rendered.add(key);
      const light = this.world.getLightLevel(...entry.position);
      const visual = this.chestVisuals.upsert(...entry.position, container.facing, {
        blockLight: light.block,
        skyLight: light.sky,
        daylight
      });
      visual.visible = !playerPosition || this.isChestWithinRenderDistance(
        entry.position,
        playerPosition
      );
    }

    if (this.activeChestKey) this.setChestVisualOpen(this.activeChestKey, true);
  }

  private syncChestVisuals(daylight: number, playerPosition: THREE.Vector3): void {
    const syncedDoubleChests = new Set<string>();
    for (const [key, position] of this.chestPositions) {
      const container = this.chests.resolveContainerByKey(key);
      if (container?.isDouble) {
        const pairKey = this.doubleChestVisuals.getPairKey(...position);
        if (!pairKey || syncedDoubleChests.has(pairKey)) continue;
        syncedDoubleChests.add(pairKey);
        const visual = this.doubleChestVisuals.getByKey(pairKey);
        if (!visual) continue;
        const lighting = this.getChestContainerLighting(container.positions, daylight);
        visual.setLighting(lighting.blockLight, lighting.skyLight, lighting.daylight);
        visual.visible = this.isChestContainerWithinRenderDistance(
          container.positions,
          playerPosition
        );
        continue;
      }

      const visual = this.chestVisuals.getByKey(key);
      if (!visual) continue;
      const light = this.world.getLightLevel(...position);
      visual.setLighting(light.block, light.sky, daylight);
      visual.visible = this.isChestWithinRenderDistance(position, playerPosition);
    }
  }

  private getChestContainerLighting(
    positions: readonly ChestPosition[],
    daylight: number
  ): { blockLight: number; skyLight: number; daylight: number } {
    let blockLight = 0;
    let skyLight = 0;
    for (const position of positions) {
      const light = this.world.getLightLevel(...position);
      blockLight = Math.max(blockLight, light.block);
      skyLight = Math.max(skyLight, light.sky);
    }
    return { blockLight, skyLight, daylight };
  }

  private setChestVisualOpen(key: string, open: boolean): void {
    const container = this.chests.resolveContainerByKey(key);
    if (container?.isDouble) {
      this.doubleChestVisuals.getByKey(key)?.setOpen(open);
      return;
    }
    this.chestVisuals.getByKey(key)?.setOpen(open);
  }

  private isChestContainerWithinRenderDistance(
    positions: readonly ChestPosition[],
    playerPosition: THREE.Vector3
  ): boolean {
    return positions.some((position) =>
      this.isChestWithinRenderDistance(position, playerPosition)
    );
  }

  private isChestWithinRenderDistance(
    position: readonly [number, number, number],
    playerPosition: THREE.Vector3
  ): boolean {
    const chestChunkX = Math.floor(position[0] / CHUNK_SIZE);
    const chestChunkZ = Math.floor(position[2] / CHUNK_SIZE);
    const playerChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
    const playerChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);
    return (
      Math.abs(chestChunkX - playerChunkX) <= this.renderDistanceChunks &&
      Math.abs(chestChunkZ - playerChunkZ) <= this.renderDistanceChunks
    );
  }

  private setCraftingContext(context: CraftingContext): void {
    this.craftingContext = context;
    this.crafting = context === 'table' ? this.tableCrafting : this.playerCrafting;
    this.inventoryActions.setCraftingGrid(this.crafting);
    this.ui.setCraftingContext(context);
  }

  private settleActiveCrafting(): void {
    const overflow = this.inventoryActions.returnCursorAndCrafting();
    this.spawnDroppedStacksAtPlayer(overflow);
    this.setContainerContext('player');
    this.setCraftingContext('player');
    this.ui.setInventoryMode(this.inventoryMode);
    this.syncSurvivalUI();
  }

  private closeActiveContainer(): void {
    if (this.containerContext === 'furnace' || this.containerContext === 'chest') {
      const overflow = this.inventoryActions.returnCursor();
      this.spawnDroppedStacksAtPlayer(overflow);
      this.setContainerContext('player');
      this.setCraftingContext('player');
      this.ui.setInventoryMode(this.inventoryMode);
      this.syncSurvivalUI();
      return;
    }
    this.settleActiveCrafting();
  }

  private async startNewWorld(seed?: number): Promise<void> {
    this.cancelFoodUse();
    this.player?.setEnabled(false);
    this.mouseButtons.clear();
    const nextSeed = seed ?? randomSeed();
    await this.createWorld(nextSeed, null);
    this.ui.setLoadingProgress(1, '新世界准备完成');
    this.mode = 'playing';
    this.ui.setHudVisible(true);
    this.updateHeldBlock();
    this.player.setEnabled(true);
    this.saveWorld(false);
    this.ui.showToast(this.coarsePointer.matches ? '开始探索' : '点击世界以锁定鼠标', 'success');
  }

  private selectSlot(slot: number): void {
    this.cancelFoodUse();
    this.ui.setSelectedSlot(slot);
    this.updateHeldBlock();
    this.syncSelectedToolDurability();
    this.audio.playClick();
  }

  private pickTargetedBlock(): void {
    if (!this.currentHit) return;
    const blocks = this.ui.getHotbarBlocks();
    const slot = blocks.indexOf(this.currentHit.id);
    if (slot >= 0) this.selectSlot(slot);
  }

  private placeSelectedBlock(): void {
    if (this.mode !== 'playing') return;
    const selectedSlot = this.ui.getSelectedSlot();
    const selectedStack = this.inventoryMode === 'survival'
      ? this.survival.inventory.getSlot(selectedSlot)
      : null;

    if (this.currentHit && !this.player.isCrouching()) {
      if (this.currentHit.id === BlockId.CraftingTable) {
        this.openCraftingTable();
        return;
      }
      if (this.currentHit.id === BlockId.Furnace) {
        this.openFurnace(this.currentHit.block);
        return;
      }
      if (this.currentHit.id === BlockId.Chest) {
        this.openChest(this.currentHit.block);
        return;
      }
    }

    if (selectedStack && isFoodItemId(selectedStack.item)) {
      this.beginFoodUse(selectedSlot, selectedStack.item);
      return;
    }

    if (selectedStack && isArmorItemId(selectedStack.item)) {
      const definition = getArmorDefinition(selectedStack.item);
      const armorSlot = definition ? armorSlotToIndex(definition.slot) : -1;
      if (armorSlot >= 0 && !this.equipment.getSlot(armorSlot)) {
        const removed = this.survival.inventory.remove(selectedSlot, 1);
        if (removed && this.equipment.setSlot(armorSlot, removed)) {
          this.audio.playClick();
          this.heldBlock.triggerSwing();
          this.syncSurvivalUI();
        } else if (removed) {
          this.survival.inventory.addStack(removed);
        }
      }
      return;
    }

    if (!this.currentHit) return;
    const { x, y, z } = this.currentHit.adjacent;
    const existing = this.world.getBlock(x, y, z);
    if (existing !== BlockId.Air && existing !== BlockId.Water) return;
    const block = this.inventoryMode === 'survival'
      ? isBlockItem(selectedStack)
        ? selectedStack.item
        : BlockId.Air
      : this.ui.getSelectedBlock();
    if (block === BlockId.Air) return;
    if (this.world.isSolid(block) && this.player.intersectsBlock(x, y, z, block)) {
      this.ui.showToast('这里被你挡住了', 'warning');
      return;
    }
    if (block === BlockId.Torch && !this.hasTorchSupport(x, y, z)) {
      this.ui.showToast('火把需要依附方块', 'warning');
      return;
    }
    if (block === BlockId.Chest) {
      const validation = this.chests.validatePlacement(
        x,
        y,
        z,
        chestFacingFromYaw(this.player.yaw)
      );
      if (!validation.allowed) {
        this.showChestPlacementWarning(validation.reason);
        return;
      }
    }
    if (!this.replaceWorldBlock(x, y, z, block)) {
      this.ui.showToast('已经到达世界边界', 'warning');
      return;
    }
    if (this.inventoryMode === 'survival') {
      this.survival.inventory.remove(selectedSlot, 1);
    }
    this.audio.playPlace(block);
    this.heldBlock.triggerSwing();
  }

  private beginFoodUse(slot: number, item: FoodItemId): void {
    if (
      this.inventoryMode !== 'survival' ||
      this.survival.dead ||
      this.survival.hunger >= MAX_HUNGER
    ) {
      return;
    }
    const stack = this.survival.inventory.getSlot(slot);
    if (!stack || stack.item !== item || stack.count <= 0) return;
    if (this.activeFoodUse?.slot === slot && this.activeFoodUse.item === item) return;

    this.resetMiningProgress();
    this.activeFoodUse = { slot, item, startedAt: performance.now() };
    this.player.setUsingItem(true);
    this.heldBlock.setUseProgress(0);
  }

  private updateFoodUse(now: number): void {
    const use = this.activeFoodUse;
    if (!use) {
      if (
        this.mode !== 'playing' ||
        this.inventoryMode !== 'survival' ||
        this.survival.dead ||
        !this.mouseButtons.has(2) ||
        this.survival.hunger >= MAX_HUNGER
      ) {
        return;
      }
      const selectedSlot = this.ui.getSelectedSlot();
      const selectedStack = this.survival.inventory.getSlot(selectedSlot);
      if (selectedStack && isFoodItemId(selectedStack.item)) {
        this.beginFoodUse(selectedSlot, selectedStack.item);
      }
      return;
    }
    const stack = this.survival.inventory.getSlot(use.slot);
    if (
      this.mode !== 'playing' ||
      this.inventoryMode !== 'survival' ||
      this.survival.dead ||
      !this.mouseButtons.has(2) ||
      this.ui.getSelectedSlot() !== use.slot ||
      !stack ||
      stack.item !== use.item ||
      this.survival.hunger >= MAX_HUNGER
    ) {
      this.cancelFoodUse();
      return;
    }

    const elapsed = Math.max(0, now - use.startedAt);
    this.heldBlock.setUseProgress(elapsed / FOOD_USE_DURATION_MS);
    if (elapsed < FOOD_USE_DURATION_MS) return;

    this.activeFoodUse = null;
    this.heldBlock.clearUseProgress();
    if (!this.survival.consumeFood(use.item, use.slot)) {
      this.player.setUsingItem(false);
      return;
    }
    this.audio.playEat();

    const nextStack = this.survival.inventory.getSlot(use.slot);
    if (
      this.mouseButtons.has(2) &&
      this.survival.hunger < MAX_HUNGER &&
      nextStack?.item === use.item
    ) {
      this.activeFoodUse = { slot: use.slot, item: use.item, startedAt: now };
      this.heldBlock.setUseProgress(0);
      return;
    }
    this.cancelFoodUse();
  }

  private cancelFoodUse(): void {
    this.activeFoodUse = null;
    this.player?.setUsingItem(false);
    this.heldBlock.clearUseProgress();
  }

  private replaceWorldBlock(x: number, y: number, z: number, block: BlockId): boolean {
    const blockX = Math.floor(x);
    const blockY = Math.floor(y);
    const blockZ = Math.floor(z);
    if (block === BlockId.Torch && !this.hasTorchSupport(blockX, blockY, blockZ)) return false;

    const previous = this.world.getBlock(blockX, blockY, blockZ);
    const chestFacing = chestFacingFromYaw(this.player?.yaw ?? Number.NaN);
    if (
      block === BlockId.Chest &&
      previous !== BlockId.Chest &&
      !this.chests.validatePlacement(blockX, blockY, blockZ, chestFacing).allowed
    ) {
      return false;
    }
    if (!this.world.setBlock(blockX, blockY, blockZ, block)) return false;
    const current = this.world.getBlock(blockX, blockY, blockZ);

    if (previous === BlockId.Furnace && current !== BlockId.Furnace) {
      const key = furnaceKey(blockX, blockY, blockZ);
      const contents = this.furnaces.remove(blockX, blockY, blockZ);
      if (contents.length > 0) {
        this.spawnDroppedStacks(
          contents,
          new THREE.Vector3(blockX + 0.5, blockY + 0.5, blockZ + 0.5),
          0.5
        );
      }
      if (this.activeFurnaceKey === key) {
        const overflow = this.inventoryActions.returnCursor();
        this.spawnDroppedStacksAtPlayer(overflow);
        this.setContainerContext('player');
        this.setCraftingContext('player');
        this.ui.setInventoryMode(this.inventoryMode);
        this.ui.setInventoryOpen(false);
        if (this.mode === 'inventory') {
          this.mode = 'playing';
          this.player.setEnabled(true);
        }
      }
    }

    if (previous === BlockId.Chest && current !== BlockId.Chest) {
      const removedContainer = this.chests.resolveContainer(blockX, blockY, blockZ);
      const activeChestWasRemoved = Boolean(
        this.activeChestKey && removedContainer?.keys.includes(this.activeChestKey)
      );
      const contents = this.chests.remove(blockX, blockY, blockZ);
      if (contents.length > 0) {
        this.spawnDroppedStacks(
          contents,
          new THREE.Vector3(blockX + 0.5, blockY + 0.5, blockZ + 0.5),
          0.5
        );
      }
      if (activeChestWasRemoved) {
        const overflow = this.inventoryActions.returnCursor();
        this.spawnDroppedStacksAtPlayer(overflow);
        this.setContainerContext('player');
        this.setCraftingContext('player');
        this.ui.setInventoryMode(this.inventoryMode);
        this.ui.setInventoryOpen(false);
        if (this.mode === 'inventory') {
          this.mode = 'playing';
          this.player.setEnabled(true);
        }
      }
      this.rebuildChestVisuals(
        getDaylight(this.timeOfDay),
        this.player.getPosition(tmpPlayerPosition)
      );
      this.refreshActiveChestBinding();
    }

    if (previous !== BlockId.Chest && current === BlockId.Chest) {
      this.chests.getOrCreate(blockX, blockY, blockZ, chestFacing);
      this.rebuildChestVisuals(
        getDaylight(this.timeOfDay),
        this.player.getPosition(tmpPlayerPosition)
      );
      this.refreshActiveChestBinding();
    }

    if (this.world.isSolid(previous) && !this.world.isSolid(current)) {
      this.removeUnsupportedTorchesAround(blockX, blockY, blockZ);
    }
    return true;
  }

  private showChestPlacementWarning(reason: ChestPlacementRejectionReason): void {
    const message: Record<ChestPlacementRejectionReason, string> = {
      occupied: '这里已经有箱子了',
      'would-bridge-chests': '不能把两个箱子连接成三连箱',
      'adjacent-to-double-chest': '大箱子旁不能再连接箱子',
      'would-form-triple-chest': '箱子不能连接成三连箱'
    };
    this.ui.showToast(message[reason], 'warning');
  }

  private refreshActiveChestBinding(): void {
    if (this.containerContext !== 'chest' || !this.activeChestKey) return;
    const container = this.chests.resolveContainerByKey(this.activeChestKey);
    if (!container) return;
    this.inventoryActions.setChest(container.inventory);
    this.setChestVisualOpen(this.activeChestKey, true);
    this.syncSurvivalUI();
  }

  private createChestContainerDebugInfo(
    container: ResolvedChestContainer
  ): ChestContainerDebugInfo {
    return {
      isDouble: container.isDouble,
      facing: container.facing,
      selectedKey: container.selected.key,
      keys: [...container.keys],
      positions: container.positions.map((position) => [...position] as ChestPosition),
      size: container.isDouble ? 54 : 27
    };
  }

  private hasTorchSupport(x: number, y: number, z: number): boolean {
    for (const [offsetX, offsetY, offsetZ] of TORCH_SUPPORT_OFFSETS) {
      if (this.world.isSolid(x + offsetX, y + offsetY, z + offsetZ)) return true;
    }
    return false;
  }

  private removeUnsupportedTorchesAround(x: number, y: number, z: number): void {
    for (const [offsetX, offsetY, offsetZ] of TORCH_DEPENDENT_OFFSETS) {
      const torchX = x + offsetX;
      const torchY = y + offsetY;
      const torchZ = z + offsetZ;
      if (
        this.world.getBlock(torchX, torchY, torchZ) !== BlockId.Torch ||
        this.hasTorchSupport(torchX, torchY, torchZ) ||
        !this.world.setBlock(torchX, torchY, torchZ, BlockId.Air)
      ) {
        continue;
      }
      if (this.inventoryMode === 'survival') {
        this.worldDrops.spawn(
          { item: BlockId.Torch, count: 1 },
          new THREE.Vector3(torchX + 0.5, torchY + 0.5, torchZ + 0.5)
        );
      }
    }
  }

  private updateTargetAndMining(dt: number): void {
    if (this.mode !== 'playing') {
      this.resetMining();
      return;
    }

    this.camera.getWorldDirection(tmpDirection);
    const hit = this.world.raycast(this.camera.position, tmpDirection, MAX_REACH);
    this.currentHit = hit;
    if (!hit) {
      this.resetMining();
      return;
    }

    this.targetIndicator.setTarget(hit.block.x, hit.block.y, hit.block.z);
    if (this.activeFoodUse || !this.mouseButtons.has(0)) {
      this.resetMiningProgress();
      return;
    }

    const key = `${hit.block.x},${hit.block.y},${hit.block.z}`;
    if (this.miningKey !== key) {
      this.miningKey = key;
      this.miningProgress = 0;
      this.heldBlock.triggerSwing();
    }

    const selectedSlot = this.ui.getSelectedSlot();
    const miningProfile = this.inventoryMode === 'survival'
      ? this.survival.getBlockMiningProfile(hit.id, selectedSlot)
      : null;
    const duration = miningProfile?.duration ?? getBreakDuration(hit.id);
    if (!Number.isFinite(duration)) {
      this.targetIndicator.setBreakProgress(0);
      return;
    }
    this.miningProgress += dt / duration;
    this.targetIndicator.setBreakProgress(this.miningProgress);
    if (this.miningProgress < 1) return;

    if (this.replaceWorldBlock(hit.block.x, hit.block.y, hit.block.z, BlockId.Air)) {
      const definition = getBlockDefinition(hit.id);
      this.particles.spawn(hit.block, definition.mapColor);
      this.audio.playBreak(hit.id);
      this.heldBlock.triggerSwing();
      if (this.inventoryMode === 'survival') {
        const result = this.survival.breakBlock(hit.id, selectedSlot);
        if (result.overflow) {
          this.worldDrops.spawn(
            result.overflow,
            hit.block.clone().add(new THREE.Vector3(0.5, 0.5, 0.5))
          );
        }
        this.syncSelectedToolDurability();
      }
    }
    this.resetMiningProgress();
  }

  private resetMiningProgress(): void {
    this.miningKey = '';
    this.miningProgress = 0;
    this.targetIndicator.setBreakProgress(0);
  }

  private resetMining(): void {
    this.currentHit = null;
    this.resetMiningProgress();
    this.targetIndicator.hide();
  }

  private handleMobileAction(detail: MobileActionDetail): void {
    if (!this.player) return;
    if (detail.action === 'move') {
      const sprint = detail.y > 0.92 && Math.abs(detail.x) < 0.45;
      this.player.setMoveInput(detail.y, detail.x, sprint);
    } else if (detail.action === 'look' && detail.active) {
      this.player.addLookDelta(detail.dx, detail.dy);
    } else if (detail.action === 'jump') {
      this.player.setJumpPressed(detail.pressed);
      if (detail.pressed) this.player.jump();
    } else if (detail.action === 'crouch') {
      this.player.setCrouchPressed(detail.pressed);
    } else if (detail.action === 'break') {
      if (detail.pressed) {
        if (this.activeFoodUse) {
          this.mouseButtons.add(0);
          return;
        }
        if (this.tryAttackMob()) {
          this.mouseButtons.delete(0);
        } else {
          if (!this.currentHit) this.attackChargeElapsed = 0;
          this.mouseButtons.add(0);
        }
      } else {
        this.mouseButtons.delete(0);
      }
    } else if (detail.action === 'place') {
      if (detail.pressed) {
        this.mouseButtons.add(2);
        this.placeSelectedBlock();
      } else {
        this.mouseButtons.delete(2);
        this.cancelFoodUse();
      }
    } else if (detail.action === 'pause' && detail.pressed) {
      this.pauseGame();
    }
  }

  private handleSurvivalEvent(event: SurvivalEvent): void {
    if (event.type === 'inventory') {
      this.syncSurvivalUI();
      return;
    }

    if (event.type === 'vitals' || event.type === 'heal' || event.type === 'respawn') {
      this.syncSurvivalStatus();
      return;
    }

    if (event.type === 'damage') {
      this.audio.playPlayerHurt();
      this.flashDamage();
      this.syncSurvivalStatus();
      return;
    }

    if (event.type === 'tool-broken') {
      this.ui.showToast('工具损坏了', 'warning');
      return;
    }

    if (event.type === 'block-break') {
      const { drop, collectedCount } = event.result;
      if (drop && collectedCount > 0) {
        const stack = toInventoryItemStack({ item: drop.item, count: collectedCount });
        if (stack) this.ui.showPickup(stack, collectedCount);
        this.audio.playPickup();
      }
      if (!event.result.toolDamaged && event.result.collectedCount === 0) {
        this.syncSurvivalUI();
      }
      return;
    }

    if (event.type === 'death') {
      const externalDrops = [
        ...this.playerCrafting.getSlots(),
        ...this.tableCrafting.getSlots(),
        ...this.equipment.takeAll()
      ].filter((stack): stack is ItemStack => stack !== null);
      const cursor = this.inventoryActions.cursor;
      if (cursor) externalDrops.push(cursor);
      this.inventoryActions.setCursor(null);
      this.inventoryActions.setFurnace(null);
      this.inventoryActions.setChest(null);
      if (this.activeChestKey) this.setChestVisualOpen(this.activeChestKey, false);
      this.activeFurnaceKey = null;
      this.activeChestKey = null;
      this.containerContext = 'player';
      this.ui.setContainerContext('player');
      this.playerCrafting.clear();
      this.tableCrafting.clear();
      this.setCraftingContext('player');
      this.spawnDroppedStacks(
        [...event.droppedInventory, ...externalDrops],
        this.player.getPosition(new THREE.Vector3()),
        1.25
      );
      this.syncSurvivalUI();
      this.enterDeathState(event.source, true);
    }
  }

  private enterDeathState(source: DamageSource | null, playSound: boolean): void {
    this.cancelFoodUse();
    this.mode = 'dead';
    this.player.setEnabled(false);
    this.mouseButtons.clear();
    this.resetMining();
    this.heldBlock.mesh.visible = false;
    if (playSound) this.audio.playDeath();
    this.ui.showDeath({ message: getDeathMessage(source) });
  }

  private collectMobDrop(drop: MobDrop, position: THREE.Vector3): void {
    this.worldDrops.spawn(
      { item: drop.item, count: drop.count },
      position.clone().addScalar(0.15)
    );
    this.particles.spawn(position.clone().floor(), getMobParticleColorForDrop(drop));
  }

  private handleWorldDropPickup(event: WorldDropPickupEvent): void {
    const stack = toInventoryItemStack(event.picked);
    if (stack) this.ui.showPickup(stack, event.picked.count);
    this.audio.playPickup();
  }

  private spawnDroppedStacksAtPlayer(stacks: readonly ItemStack[]): void {
    if (stacks.length === 0) return;
    this.spawnDroppedStacks(stacks, this.player.getPosition(new THREE.Vector3()), 0.5);
  }

  private spawnDroppedStacks(
    stacks: readonly ItemStack[],
    position: THREE.Vector3,
    pickupDelay: number
  ): void {
    for (let index = 0; index < stacks.length; index += 1) {
      const stack = stacks[index];
      if (!stack) continue;
      const angle = index * 2.399963229728653;
      this.worldDrops.spawn(stack, position.clone().add(new THREE.Vector3(0, 0.7, 0)), {
        pickupDelay,
        velocity: new THREE.Vector3(Math.cos(angle) * 1.1, 2.4, Math.sin(angle) * 1.1)
      });
    }
  }

  private flashDamage(): void {
    if (this.damageFlashTimer !== undefined) window.clearTimeout(this.damageFlashTimer);
    this.root.classList.remove('is-hurt');
    void this.root.offsetWidth;
    this.root.classList.add('is-hurt');
    this.damageFlashTimer = window.setTimeout(() => {
      this.root.classList.remove('is-hurt');
      this.damageFlashTimer = undefined;
    }, 240);
  }

  private syncSurvivalUI(): void {
    if (!this.survival || !this.crafting || !this.inventoryActions) return;
    const inventory = this.survival.inventory.getSnapshot().slots;
    const craftingSlots = this.crafting.getSlots();
    const recipes = this.getActiveCraftingRecipes();
    this.ui.setCraftingContext(this.craftingContext);
    this.ui.setContainerContext(this.containerContext);
    this.ui.setSurvivalInventory(
      createSurvivalInventoryState(
        inventory,
        craftingSlots,
        this.crafting.getOutput(recipes),
        this.inventoryActions.cursor,
        this.equipment.getSlots()
      )
    );
    const furnace = this.activeFurnaceKey
      ? this.furnaces.getByKey(this.activeFurnaceKey)
      : null;
    this.ui.setFurnaceInventory({
      input: toInventoryItemStack(furnace?.getSlot('input') ?? null),
      fuel: toInventoryItemStack(furnace?.getSlot('fuel') ?? null),
      output: toInventoryItemStack(furnace?.getSlot('output') ?? null),
      burnProgress: furnace?.burnProgress ?? 0,
      cookProgress: furnace?.cookProgress ?? 0,
      burning: furnace?.burning ?? false
    });
    const chestContainer = this.activeChestKey
      ? this.chests.resolveContainerByKey(this.activeChestKey)
      : null;
    this.ui.setChestInventory({
      slots: chestContainer?.inventory.getSlots().map((stack) => toInventoryItemStack(stack)) ?? [],
      size: chestContainer?.isDouble ? 54 : 27,
      title: chestContainer?.isDouble ? '大箱子' : '箱子'
    });
    const uiRecipes = createUICraftingRecipes(recipes).map((recipe, index) => ({
      ...recipe,
      craftable: this.canCraftRecipe(recipes[index]!)
    }));
    this.ui.setRecipes(uiRecipes);
    this.syncSurvivalStatus();
    this.syncSelectedToolDurability();
    this.updateHeldBlock();
  }

  private getActiveCraftingRecipes(): readonly CraftingRecipeDefinition[] {
    return this.craftingContext === 'table'
      ? CRAFTING_TABLE_RECIPES_3X3
      : PLAYER_CRAFTING_RECIPES_2X2;
  }

  private syncSurvivalStatus(): void {
    if (!this.survival) return;
    const vitals = this.survival.getVitals();
    this.ui.setSurvivalStatus({
      health: vitals.health,
      hunger: vitals.hunger,
      armor: this.equipment.getDefensePoints(),
      experience: 0,
      level: 0,
      air: vitals.air,
      maxAir: vitals.maxAir
    });
  }

  private syncSelectedToolDurability(): void {
    if (
      !this.survival ||
      (this.inventoryMode !== 'survival' && this.containerContext === 'player')
    ) {
      this.ui.setSelectedToolDurability(Number.NaN, 0);
      return;
    }
    const stack = this.survival.inventory.getSlot(this.ui.getSelectedSlot());
    if (!stack || !isToolItemId(stack.item)) {
      this.ui.setSelectedToolDurability(Number.NaN, 0);
      return;
    }
    const definition = TOOL_DEFINITIONS[stack.item];
    this.ui.setSelectedToolDurability(
      stack.durability ?? definition.maxDurability,
      definition.maxDurability,
      getToolLabel(stack.item)
    );
  }

  private setInventoryMode(mode: InventoryMode): void {
    if (this.containerContext !== 'player') return;
    this.cancelFoodUse();
    if (mode === this.inventoryMode) {
      this.ui.setInventoryMode(mode);
      this.syncSurvivalUI();
      return;
    }

    if (this.inventoryMode === 'creative') {
      this.captureCreativeHotbar();
    } else {
      const overflow = this.inventoryActions.returnCursorAndCrafting();
      this.spawnDroppedStacksAtPlayer(overflow);
    }
    this.setCraftingContext('player');
    this.inventoryMode = mode;
    this.ui.setInventoryMode(mode);
    if (mode === 'creative') this.ui.setHotbarBlocks(this.creativeHotbar);
    this.syncSurvivalUI();
    this.updateHeldBlock();
    if (mode === 'survival' && this.survival.dead) {
      this.enterDeathState(this.survival.deathCause, false);
    }
    this.saveWorld(false);
  }

  private handleCraftRequest(
    source: 'output' | 'recipe-book',
    recipeId: string | undefined,
    amount: 1 | 'max'
  ): void {
    const maximumCrafts = amount === 'max' ? 4096 : 1;
    const recipes = this.getActiveCraftingRecipes();
    let crafted: ItemStack | null = null;

    if (source === 'recipe-book') {
      const recipe = recipes.find((candidate) => candidate.id === recipeId);
      let filled = 0;
      if (recipe) {
        const maximumBatches = amount === 'max' ? 64 : 1;
        for (let index = 0; index < maximumBatches; index += 1) {
          if (!this.crafting.fillRecipeFromInventory(this.survival.inventory, recipe, 1)) break;
          filled += 1;
        }
      }
      if (filled <= 0) {
        this.ui.showToast('材料不足或无法清空当前合成格', 'warning');
      } else {
        this.audio.playClick();
      }
      return;
    }

    if (source === 'output') {
      for (let index = 0; index < maximumCrafts; index += 1) {
        const result = this.crafting.craftInto(this.survival.inventory, recipes);
        if (!result.crafted || !result.output) break;
        if (!crafted) crafted = { ...result.output };
        else if (crafted.item === result.output.item) crafted.count += result.output.count;
      }
    }

    if (!crafted) {
      this.ui.showToast('材料不足或背包没有空间', 'warning');
      this.syncSurvivalUI();
      return;
    }

    const stack = toInventoryItemStack(crafted);
    if (stack) this.ui.showPickup(stack, crafted.count);
    this.audio.playCraft();
    this.syncSurvivalUI();
  }

  private canCraftRecipe(recipe: CraftingRecipeDefinition): boolean {
    return simulateRecipeCrafts(this.survival.inventory.getSnapshot().slots, recipe, 1) > 0;
  }

  private respawnPlayer(): void {
    if (this.inventoryMode !== 'survival' || !this.survival.dead) return;
    this.cancelFoodUse();
    this.survival.respawn();
    this.mobs.clearMobs();
    this.teleportPlayer(this.world.getSpawnPoint());
    this.previousSurvivalPosition.copy(this.player.getPosition(tmpPlayerPosition));
    this.previousOnGround = this.player.onGround;
    this.attackChargeElapsed = 10;
    this.mode = 'playing';
    this.ui.hideDeath();
    this.ui.showTitle(false);
    this.ui.showPause(false);
    this.ui.setInventoryOpen(false);
    this.ui.setHudVisible(true);
    this.player.setEnabled(true);
    this.setContainerContext('player');
    this.setCraftingContext('player');
    this.syncSurvivalUI();
    this.updateHeldBlock();
    this.saveWorld(false);
  }

  private tryAttackMob(): boolean {
    if (this.mode !== 'playing' || !this.mobs) return false;
    this.camera.getWorldDirection(tmpDirection);
    const blockingHit = this.world.raycast(this.camera.position, tmpDirection, MAX_REACH);
    const attackReach = blockingHit ? Math.max(0, blockingHit.distance - 0.02) : MAX_REACH;
    if (!this.mobs.raycastMob(this.camera.position, tmpDirection, attackReach)) return false;

    const selectedSlot = this.ui.getSelectedSlot();
    const heldStack = this.inventoryMode === 'survival'
      ? this.survival.inventory.getSlot(selectedSlot)
      : null;
    const chargedAttack = calculateChargedAttack(
      this.inventoryMode === 'creative' ? 6 : getMeleeDamage(heldStack),
      this.attackChargeElapsed,
      heldStack
    );
    const result = this.mobs.attackRay(
      this.camera.position,
      tmpDirection,
      chargedAttack.damage,
      attackReach
    );
    if (!result) return false;

    this.attackChargeElapsed = 0;
    this.mouseButtons.delete(0);
    this.resetMiningProgress();
    this.heldBlock.triggerSwing();
    if (!result.blocked && heldStack && isToolItemId(heldStack.item)) {
      const durabilityCost = TOOL_DEFINITIONS[heldStack.item].kind === 'sword' ? 1 : 2;
      const damage = this.survival.inventory.damageTool(selectedSlot, durabilityCost);
      if (damage.broken) this.ui.showToast('工具损坏了', 'warning');
    }
    return true;
  }

  private applySettings(settings: GameUISettings): void {
    this.ui.setSettings(settings);
    this.audio.setVolume(settings.volume / 100);
    this.player?.setFov(settings.fov);
    this.player?.setSensitivity(settings.sensitivity);
    this.renderDistanceChunks = settings.renderDistance;
    this.world?.setVisualQuality(settings.quality);
    if (this.world && this.player) {
      const playerPosition = this.player.getPosition(tmpPlayerPosition);
      this.world.setRenderDistance(settings.renderDistance, playerPosition);
      this.syncChestVisuals(getDaylight(this.timeOfDay), playerPosition);
    }
    this.environment.setFogDistance(settings.renderDistance * 16);
    this.environment.setQuality(settings.quality);
    this.root.dataset.quality = settings.quality;
    const maximumPixelRatio = settings.quality === 'fast' ? 1 : settings.quality === 'fancy' ? 2 : 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maximumPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  private readSettings(): GameUISettings {
    const defaults = this.ui.getSettings();
    try {
      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<GameUISettings>;
      return {
        renderDistance: validNumber(stored.renderDistance, defaults.renderDistance, 2, 12),
        fov: validNumber(stored.fov, defaults.fov, 55, 105),
        sensitivity: validNumber(stored.sensitivity, defaults.sensitivity, 0.2, 2),
        volume: validNumber(stored.volume, defaults.volume, 0, 100),
        quality:
          stored.quality === 'fast' || stored.quality === 'balanced' || stored.quality === 'fancy'
            ? stored.quality
            : defaults.quality,
        touchLayout:
          stored.touchLayout === 'classic' || stored.touchLayout === 'compact'
            ? stored.touchLayout
            : defaults.touchLayout,
        showDebug: typeof stored.showDebug === 'boolean' ? stored.showDebug : defaults.showDebug
      };
    } catch {
      return defaults;
    }
  }

  private writeSettings(settings: GameUISettings): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Settings remain active for the current session if storage is unavailable.
    }
  }

  private saveWorld(showFeedback: boolean): void {
    if (!this.world || !this.player) return;
    if (this.craftingContext === 'table') this.settleActiveCrafting();
    this.captureCreativeHotbar();
    if (showFeedback) this.ui.setSaveIndicator('saving');
    const save = createWorldSave(
      this.world.seed,
      this.world.serializeEdits(),
      this.player.getSnapshot(this.ui.getSelectedSlot()),
      this.timeOfDay,
      this.creativeHotbar,
      this.survival?.getSnapshot(),
      this.inventoryMode,
      { slots: this.playerCrafting.getSlots() },
      this.inventoryActions.cursor,
      this.worldDrops.serialize(),
      this.furnaces.serialize(),
      this.equipment.getSnapshot(),
      this.chests.serialize()
    );
    const success = writeWorldSave(save);
    this.autosaveElapsed = 0;
    if (showFeedback) this.ui.setSaveIndicator(success ? 'saved' : 'error');
  }

  private captureCreativeHotbar(): void {
    if (this.inventoryMode !== 'creative' || this.ui.getInventoryMode() !== 'creative') return;
    this.creativeHotbar = normalizeCreativeHotbar(this.ui.getHotbarBlocks());
  }

  private updateHeldBlock(): void {
    if (!this.ui) return;
    const item: ItemId | null = this.inventoryMode === 'survival'
      ? this.survival.inventory.getSlot(this.ui.getSelectedSlot())?.item ?? null
      : this.ui.getSelectedBlock();
    const showHeldItem = item !== null && item !== BlockId.Air;
    this.heldBlock.mesh.visible = this.mode === 'playing' && showHeldItem;
    if (!showHeldItem) {
      this.heldBlock.clear();
      return;
    }
    this.heldBlock.setItem(item);
  }

  private isSnapshotPositionUsable(position: readonly [number, number, number]): boolean {
    const [x, y, z] = position;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
    if (
      !isPlayerHorizontalPositionWithinWorld(position) ||
      y <= 1 ||
      y + 1.8 >= 79
    ) return false;

    const collisionEpsilon = 1e-4;
    const playerBox = createPlayerAabb({ x, y, z });
    const minBlockX = Math.floor(playerBox.minX - collisionEpsilon);
    const maxBlockX = Math.floor(playerBox.maxX + collisionEpsilon);
    const minBlockY = Math.floor(playerBox.minY - collisionEpsilon);
    const maxBlockY = Math.floor(playerBox.maxY + collisionEpsilon);
    const minBlockZ = Math.floor(playerBox.minZ - collisionEpsilon);
    const maxBlockZ = Math.floor(playerBox.maxZ + collisionEpsilon);

    for (let blockY = minBlockY; blockY <= maxBlockY; blockY += 1) {
      for (let blockZ = minBlockZ; blockZ <= maxBlockZ; blockZ += 1) {
        for (let blockX = minBlockX; blockX <= maxBlockX; blockX += 1) {
          if (
            this.world.getBlockCollisionBoxes(blockX, blockY, blockZ).some((blockBox) =>
              aabbsIntersect(playerBox, blockBox, collisionEpsilon)
            )
          ) {
            return false;
          }
        }
      }
    }
    return true;
  }

  private teleportPlayer(position: THREE.Vector3): void {
    if (![position.x, position.y, position.z].every(Number.isFinite)) return;
    if (!isPlayerHorizontalPositionWithinWorld([position.x, position.y, position.z])) return;
    this.world.setRenderDistance(this.renderDistanceChunks, position);
    this.player.teleport(position);
    this.previousSurvivalPosition.copy(position);
    this.previousOnGround = this.player.onGround;
  }

  private canInteract(): boolean {
    return (
      this.mode === 'playing' &&
      (this.coarsePointer.matches || document.pointerLockElement === this.renderer.domElement)
    );
  }

  private readonly animate = (): void => {
    if (this.disposed || !this.world || !this.player) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;
    this.world.updateVisuals(dt);
    this.chestVisuals.update(dt);
    this.doubleChestVisuals.update(dt);

    if (this.mode === 'playing' || this.mode === 'inventory') {
      const furnaceUpdates = this.furnaces.update(dt);
      if (this.activeFurnaceKey) {
        const activeUpdate = furnaceUpdates.find((update) => update.key === this.activeFurnaceKey);
        if (activeUpdate?.result.slotsChanged) {
          this.syncSurvivalUI();
        } else if (activeUpdate?.result.progressChanged) {
          this.ui.setFurnaceProgress(
            activeUpdate.furnace.burnProgress,
            activeUpdate.furnace.cookProgress,
            activeUpdate.furnace.burning
          );
        }
      }
      const wasOnGround = this.previousOnGround;
      this.player.update(dt);
      const movementPosition = this.player.getPosition(tmpPlayerPosition);
      const movedX = movementPosition.x - this.previousSurvivalPosition.x;
      const movedZ = movementPosition.z - this.previousSurvivalPosition.z;
      const horizontalDistance = Math.hypot(movedX, movedZ);
      const jumped = wasOnGround && !this.player.onGround && this.player.velocity.y > 0;
      const swimming = this.world.isLiquid(
        Math.floor(movementPosition.x),
        Math.floor(movementPosition.y),
        Math.floor(movementPosition.z)
      );
      const landingDistance = this.player.consumeLandingDistance();
      this.attackChargeElapsed = Math.min(10, this.attackChargeElapsed + dt);
      const attackStack = this.inventoryMode === 'survival'
        ? this.survival.inventory.getSlot(this.ui.getSelectedSlot())
        : null;
      this.ui.setAttackCharge(getAttackStrength(this.attackChargeElapsed, attackStack));

      if (this.inventoryMode === 'survival') {
        if (landingDistance > 0) this.survival.applyFallDamage(landingDistance);
        if (this.mode === 'playing' || this.mode === 'inventory') {
          this.survival.update(dt, {
            headUnderwater: this.player.isHeadUnderwater(),
            distanceMoved: horizontalDistance,
            sprinting: this.player.isSprinting(),
            swimming,
            jumped
          });
        }
      }

      this.previousSurvivalPosition.copy(movementPosition);
      this.previousOnGround = this.player.onGround;

      if (this.mode === 'playing') {
        this.updateFoodUse(now);
        this.updateTargetAndMining(dt);
        if (movementPosition.y < -8) {
          if (this.inventoryMode === 'survival') {
            this.survival.takeDamage(100, 'generic');
          } else {
            this.teleportPlayer(this.world.getSpawnPoint());
            this.previousSurvivalPosition.copy(this.player.getPosition(tmpPlayerPosition));
            this.ui.showToast('你已返回出生点', 'warning');
          }
        }
      }
    } else {
      this.player.consumeLandingDistance();
      this.previousSurvivalPosition.copy(this.player.getPosition(tmpPlayerPosition));
      this.previousOnGround = this.player.onGround;
      this.resetMining();
    }

    if (
      this.mode === 'playing' ||
      (
        this.mode === 'inventory' &&
        (this.containerContext === 'furnace' || this.containerContext === 'chest')
      )
    ) {
      this.autosaveElapsed += dt;
      if (this.autosaveElapsed >= AUTOSAVE_SECONDS) this.saveWorld(false);
    }

    const ambientActive = this.mode === 'playing' || this.mode === 'inventory' || this.mode === 'title';
    if (!this.timePausedForTests && ambientActive) {
      this.timeOfDay = (this.timeOfDay + dt / DAY_LENGTH_SECONDS) % 1;
    }
    const playerPosition = this.player.getPosition(tmpPlayerPosition);
    const daylight = getDaylight(this.timeOfDay);
    if (this.mode === 'playing' || this.mode === 'inventory') {
      this.mobs.update(dt, playerPosition, daylight);
    }
    if (this.mode === 'playing' || this.mode === 'inventory') {
      this.worldDrops.update(dt, playerPosition, (stack) => {
        if (this.inventoryMode !== 'survival' || this.survival.dead) return stack.count;
        return this.survival.inventory.addStack({ ...stack });
      });
    }
    this.world.setRenderDistance(this.renderDistanceChunks, playerPosition);
    this.world.setDaylight(daylight);
    this.chestVisualSyncElapsed += dt;
    if (this.chestVisualSyncElapsed >= CHEST_VISUAL_SYNC_SECONDS) {
      this.chestVisualSyncElapsed %= CHEST_VISUAL_SYNC_SECONDS;
      this.syncChestVisuals(daylight, playerPosition);
    }
    this.environment.update(this.timeOfDay, ambientActive ? dt : 0, playerPosition);
    this.particles.update(this.mode === 'playing' ? dt : 0);
    if (this.mode === 'playing') {
      this.heldBlock.update(dt, this.player.horizontalSpeed, this.player.onGround);
    }
    this.updateWaterState();
    this.updateStats(dt, playerPosition);
    this.renderer.render(this.scene, this.camera);
  };

  private updateWaterState(): void {
    const localWaterY = this.camera.position.y - Math.floor(this.camera.position.y);
    const underwater = this.world.isLiquid(
      Math.floor(this.camera.position.x),
      Math.floor(this.camera.position.y),
      Math.floor(this.camera.position.z)
    ) && localWaterY < WATER_SURFACE_HEIGHT;
    this.root.classList.toggle('is-underwater', underwater);
    if (underwater && !this.previousUnderwater) this.audio.playSplash();
    this.previousUnderwater = underwater;
  }

  private updateStats(dt: number, position: THREE.Vector3): void {
    this.statsElapsed += dt;
    this.statsFrames += 1;
    if (this.statsElapsed < 0.5) return;
    const fps = this.statsFrames / this.statsElapsed;
    this.ui.setStats(fps, [position.x, position.y, position.z], true);
    this.statsElapsed = 0;
    this.statsFrames = 0;
  }

  private readonly handleResize = (): void => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private installTestAPI(): void {
    window.__GAME_TEST__ = {
      getState: () => {
        const position = this.player.getPosition();
        return {
          mode: this.mode,
          inventoryMode: this.inventoryMode,
          containerContext: this.containerContext,
          craftingContext: this.craftingContext,
          seed: this.world.seed,
          selectedSlot: this.ui.getSelectedSlot(),
          selectedBlock: this.ui.getSelectedBlock(),
          position: [position.x, position.y, position.z],
          timeOfDay: this.timeOfDay,
          health: this.survival.health,
          hunger: this.survival.hunger,
          armor: this.equipment.getDefensePoints(),
          attackCharge: getAttackStrength(
            this.attackChargeElapsed,
            this.inventoryMode === 'survival'
              ? this.survival.inventory.getSlot(this.ui.getSelectedSlot())
              : null
          ),
          air: this.survival.air,
          dead: this.survival.dead,
          mobCount: this.mobs.getCount(),
          dropCount: this.worldDrops.size,
          usingItem: this.activeFoodUse?.item ?? null,
          itemUseProgress: this.activeFoodUse
            ? Math.min(1, Math.max(0, performance.now() - this.activeFoodUse.startedAt) / FOOD_USE_DURATION_MS)
            : 0,
          target: this.currentHit
            ? [
                this.currentHit.block.x,
                this.currentHit.block.y,
                this.currentHit.block.z,
                this.currentHit.id
              ]
            : null
        };
      },
      getBlock: (x, y, z) => this.world.getBlock(x, y, z),
      setBlock: (x, y, z, id) => this.replaceWorldBlock(x, y, z, id),
      getLightLevel: (x, y, z) => this.world.getLightLevel(x, y, z),
      getStreamingState: () => this.world.getStreamingState(),
      getInventory: () => this.survival.inventory.getSnapshot().slots,
      getEquipment: () => this.equipment.getSlots(),
      giveItem: (item, count = 1) => this.survival.inventory.add(item, count),
      setInventorySlot: (slot, stack) => {
        this.cancelFoodUse();
        this.survival.inventory.setSlot(slot, stack);
      },
      setArmorSlot: (slot, stack) => {
        const changed = this.equipment.setSlot(slot, stack);
        if (changed) this.syncSurvivalUI();
        return changed;
      },
      selectSlot: (slot) => this.selectSlot(slot),
      setHunger: (hunger) => {
        if (!Number.isFinite(hunger)) return;
        const snapshot = this.survival.getSnapshot();
        const nextHunger = Math.min(MAX_HUNGER, Math.max(0, hunger));
        this.survival.applySnapshot({
          ...snapshot,
          hunger: nextHunger,
          saturation: Math.min(snapshot.saturation, nextHunger)
        });
        if (nextHunger >= MAX_HUNGER) this.cancelFoodUse();
      },
      setUsePressed: (pressed) => {
        if (pressed) {
          this.mouseButtons.add(2);
          this.placeSelectedBlock();
        } else {
          this.mouseButtons.delete(2);
          this.cancelFoodUse();
        }
      },
      openCraftingTable: () => this.openCraftingTable(),
      openFurnace: (x, y, z) => this.openFurnace(new THREE.Vector3(x, y, z)),
      openChest: (x, y, z) => this.openChest(new THREE.Vector3(x, y, z)),
      getFurnaceState: (x, y, z) => this.furnaces.get(x, y, z)?.getSnapshot() ?? null,
      setFurnaceSlot: (x, y, z, slot, stack) => {
        this.furnaces.getOrCreate(x, y, z).setSlot(slot, stack);
        if (this.activeFurnaceKey === furnaceKey(x, y, z)) this.syncSurvivalUI();
      },
      getChest: (x, y, z) => this.chests.get(x, y, z)?.getSnapshot() ?? null,
      getChestFacing: (x, y, z) => this.chests.getFacing(x, y, z),
      getChestContainerInfo: (x, y, z) => {
        const container = this.chests.resolveContainer(x, y, z);
        return container ? this.createChestContainerDebugInfo(container) : null;
      },
      getChestVisualInfo: (x, y, z) => {
        const blockX = Math.floor(x);
        const blockY = Math.floor(y);
        const blockZ = Math.floor(z);
        const pairKey = this.doubleChestVisuals.getPairKey(blockX, blockY, blockZ);
        const doubleVisual = pairKey ? this.doubleChestVisuals.getByKey(pairKey) : null;
        if (pairKey && doubleVisual) {
          return {
            kind: 'double',
            visualKey: pairKey,
            openProgress: doubleVisual.openProgress,
            visible: doubleVisual.visible
          };
        }
        const key = chestKey(blockX, blockY, blockZ);
        const singleVisual = this.chestVisuals.getByKey(key);
        return singleVisual
          ? {
              kind: 'single',
              visualKey: key,
              openProgress: singleVisual.openProgress,
              visible: singleVisual.visible
            }
          : null;
      },
      setChestSlot: (x, y, z, slot, stack) => {
        if (this.world.getBlock(x, y, z) !== BlockId.Chest) return false;
        const changed = this.chests.getOrCreate(x, y, z).setSlot(slot, stack);
        const activeContainer = this.activeChestKey
          ? this.chests.resolveContainerByKey(this.activeChestKey)
          : null;
        if (changed && activeContainer?.keys.includes(chestKey(x, y, z))) {
          this.syncSurvivalUI();
        }
        return changed;
      },
      advanceFurnaces: (seconds) => {
        const updates = this.furnaces.update(seconds);
        if (updates.some((update) => update.key === this.activeFurnaceKey)) {
          this.syncSurvivalUI();
        }
      },
      clearMobs: () => this.mobs.clearMobs(),
      clearDrops: () => this.worldDrops.clearDrops(),
      getMobCount: (kind) => this.mobs.getCount(kind),
      spawnMobAhead: (kind, distance = 3) => {
        const safeDistance = Math.max(0.75, Math.min(4, Number.isFinite(distance) ? distance : 3));
        const direction = this.camera.getWorldDirection(new THREE.Vector3());
        const position = this.camera.position.clone().addScaledVector(direction, safeDistance);
        const halfHeight = kind === 'zombie'
          ? 0.91
          : kind === 'cow'
            ? 0.7
            : kind === 'sheep'
              ? 0.625
              : 0.55;
        position.y -= halfHeight;
        return this.mobs.spawnMob(kind, position);
      },
      attackMob: () => this.tryAttackMob(),
      setAttackCharge: (elapsedSeconds) => {
        if (!Number.isFinite(elapsedSeconds)) return;
        this.attackChargeElapsed = Math.max(0, Math.min(10, elapsedSeconds));
      },
      setTimeOfDay: (time) => {
        if (Number.isFinite(time)) this.timeOfDay = ((time % 1) + 1) % 1;
      },
      teleport: (x, y, z) => this.teleportPlayer(new THREE.Vector3(x, y, z)),
      pauseTime: (paused) => {
        this.timePausedForTests = paused;
      }
    };
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelFoodUse();
    this.renderer.setAnimationLoop(null);
    this.cleanupCallbacks.splice(0).forEach((cleanup) => cleanup());
    if (this.damageFlashTimer !== undefined) window.clearTimeout(this.damageFlashTimer);
    this.root.classList.remove('is-hurt');
    this.unsubscribeSurvival?.();
    this.unsubscribeSurvival = null;
    this.mobs?.dispose();
    this.worldDrops?.dispose();
    this.furnaces.clear();
    this.chests.clear();
    this.chestPositions.clear();
    this.chestVisuals.dispose();
    this.doubleChestVisuals.dispose();
    this.survival?.dispose();
    this.player?.dispose();
    this.world?.dispose();
    this.environment.dispose();
    this.targetIndicator.dispose();
    this.particles.dispose();
    this.heldBlock.dispose();
    this.audio.dispose();
    this.ui.destroy();
    this.renderer.dispose();
    delete window.__GAME_TEST__;
  }
}

function normalizeCreativeHotbar(blocks: readonly BlockId[] | undefined): BlockId[] {
  return Array.from({ length: 9 }, (_, index) => {
    const block = blocks?.[index];
    return isBlockId(block) && block > BlockId.Air
      ? block
      : HOTBAR_BLOCKS[index] ?? BlockId.Grass;
  });
}

function getRecipeIngredientCounts(recipe: CraftingRecipeDefinition): Map<ItemId, number> {
  const counts = new Map<ItemId, number>();
  for (const item of recipe.pattern) {
    if (item === null) continue;
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return counts;
}

function simulateRecipeCrafts(
  slots: readonly (ItemStack | null)[],
  recipe: CraftingRecipeDefinition,
  maximumCrafts: number
): number {
  let simulated = slots.map((stack) => (stack ? { ...stack } : null));
  const ingredientCounts = getRecipeIngredientCounts(recipe);
  const limit = Math.max(0, Math.trunc(maximumCrafts));
  let crafted = 0;

  while (crafted < limit) {
    const before = simulated.map((stack) => (stack ? { ...stack } : null));
    if (!consumeSimulatedIngredients(simulated, ingredientCounts)) break;
    if (!addSimulatedStack(simulated, recipe.output)) {
      simulated = before;
      break;
    }
    crafted += 1;
  }
  return crafted;
}

function consumeSimulatedIngredients(
  slots: Array<ItemStack | null>,
  ingredients: ReadonlyMap<ItemId, number>
): boolean {
  for (const [item, count] of ingredients) {
    const available = slots.reduce(
      (total, stack) => total + (stack?.item === item ? stack.count : 0),
      0
    );
    if (available < count) return false;
  }

  for (const [item, count] of ingredients) {
    let remaining = count;
    for (let index = 0; index < slots.length && remaining > 0; index += 1) {
      const stack = slots[index];
      if (!stack || stack.item !== item) continue;
      const removed = Math.min(stack.count, remaining);
      stack.count -= removed;
      remaining -= removed;
      if (stack.count <= 0) slots[index] = null;
    }
  }
  return true;
}

function addSimulatedStack(slots: Array<ItemStack | null>, stack: ItemStack): boolean {
  let remaining = stack.count;
  const stackLimit = getItemStackLimit(stack.item);
  if (stackLimit > 1 && stack.durability === undefined) {
    for (const existing of slots) {
      if (!existing || existing.item !== stack.item || existing.durability !== undefined) continue;
      const transferred = Math.min(stackLimit - existing.count, remaining);
      existing.count += transferred;
      remaining -= transferred;
      if (remaining === 0) return true;
    }
  }

  for (let index = 0; index < slots.length && remaining > 0; index += 1) {
    if (slots[index]) continue;
    const transferred = Math.min(stackLimit, remaining);
    slots[index] = { ...stack, count: transferred };
    remaining -= transferred;
  }
  return remaining === 0;
}

function getToolLabel(item: ItemStack['item']): string {
  if (!isToolItemId(item)) return '当前工具';
  const tool = TOOL_DEFINITIONS[item];
  if (tool.tier === 'diamond') {
    const diamondKind = tool.kind === 'pickaxe'
      ? '镐'
      : tool.kind === 'axe'
        ? '斧'
        : tool.kind === 'sword'
          ? '剑'
          : '铲';
    return '钻石' + diamondKind;
  }
  const tier = tool.tier === 'wood' ? '木' : tool.tier === 'stone' ? '石' : '铁';
  const kind = tool.kind === 'pickaxe'
    ? '镐'
    : tool.kind === 'axe'
      ? '斧'
      : tool.kind === 'sword'
        ? '剑'
        : '锹';
  return tier + kind;
}

function getMobParticleColor(kind: MobKind): string {
  if (kind === 'pig') return '#d9959f';
  if (kind === 'sheep') return '#e7e2d4';
  if (kind === 'cow') return '#70452d';
  return '#5f8f4e';
}

function getMobParticleColorForDrop(drop: MobDrop): string {
  if (drop.item === 'wool') return '#eee9dd';
  if (drop.item === 'leather') return '#8b572f';
  if (drop.item === 'raw_beef') return '#a94f4b';
  if (drop.item === 'rotten_flesh') return '#81643d';
  return '#b96d73';
}

function getDeathMessage(source: DamageSource | null): string {
  if (source === 'fall') return '你从高处摔了下来';
  if (source === 'drowning') return '你没能及时浮出水面';
  if (source === 'starvation') return '你饿死了';
  return '你的生命耗尽了';
}

function getBreakDuration(block: BlockId): number {
  switch (block) {
    case BlockId.Grass:
    case BlockId.Dirt:
    case BlockId.Sand:
    case BlockId.Leaves:
    case BlockId.Snow:
      return 0.24;
    case BlockId.Glass:
      return 0.18;
    case BlockId.Wood:
    case BlockId.Planks:
      return 0.5;
    case BlockId.Stone:
    case BlockId.Cobblestone:
    case BlockId.Bricks:
    case BlockId.CoalOre:
    case BlockId.IronOre:
    case BlockId.DiamondOre:
      return 0.78;
    case BlockId.Bedrock:
      return Number.POSITIVE_INFINITY;
    default:
      return 0.32;
  }
}

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? Math.floor(Math.random() * 0xffffffff);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function validNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, value))
    : fallback;
}

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app root element.');

const game = new VoxelFrontierGame(root);
void game.init().catch((error: unknown) => {
  console.error(error);
  root.classList.add('fatal-error');
  root.insertAdjacentHTML(
    'beforeend',
    '<section class="fatal-message" role="alert"><h1>世界启动失败</h1><p>请刷新页面或检查浏览器是否支持 WebGL。</p></section>'
  );
});
