import type { Vector3 } from 'three';
import type { WorldChestSave } from './chest-manager';
import type { ArmorEquipmentSnapshot } from './equipment';
import type { FurnaceSnapshot } from './furnace';
import type { InventorySnapshot, ItemStack, SurvivalSnapshot } from './survival';

export enum BlockId {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  Wood = 5,
  Leaves = 6,
  Planks = 7,
  Bricks = 8,
  Glass = 9,
  Water = 10,
  CoalOre = 11,
  IronOre = 12,
  Snow = 13,
  Cobblestone = 14,
  Bedrock = 15,
  CraftingTable = 16,
  Furnace = 17,
  Torch = 18,
  Chest = 19,
  DiamondOre = 20
}

export const MAX_BLOCK_ID = BlockId.DiamondOre;

export function isBlockId(value: unknown): value is BlockId {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= BlockId.Air &&
    value <= MAX_BLOCK_ID
  );
}

export type BlockFace = 'top' | 'bottom' | 'side' | 'front';
export type BlockCreativeCategory = 'nature' | 'building' | 'ore';

export interface BlockDefinition {
  id: BlockId;
  name: string;
  label: string;
  solid: boolean;
  transparent: boolean;
  liquid?: boolean;
  atlas: Record<BlockFace, number>;
  mapColor: string;
  creativeCategory: BlockCreativeCategory;
}

export interface BlockHit {
  block: Vector3;
  adjacent: Vector3;
  normal: Vector3;
  distance: number;
  id: BlockId;
}

export interface PlayerSnapshot {
  position: [number, number, number];
  yaw: number;
  pitch: number;
  selectedSlot: number;
}

export type WorldGameMode = 'survival' | 'creative';

export interface WorldDropSave {
  stack: ItemStack;
  position: [number, number, number];
  velocity: [number, number, number];
  age: number;
  pickupDelay: number;
}

export interface WorldFurnaceSave {
  position: [number, number, number];
  state: FurnaceSnapshot;
}

export interface WorldSave {
  version: 1;
  seed: number;
  edits: Array<[number, number, number, BlockId]>;
  player?: PlayerSnapshot;
  hotbar?: BlockId[];
  timeOfDay: number;
  survival?: SurvivalSnapshot;
  mode?: WorldGameMode;
  crafting?: InventorySnapshot;
  cursor?: ItemStack | null;
  equipment?: ArmorEquipmentSnapshot;
  drops?: WorldDropSave[];
  furnaces?: WorldFurnaceSave[];
  chests?: WorldChestSave[];
}

export const HOTBAR_BLOCKS: readonly BlockId[] = [
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Stone,
  BlockId.Cobblestone,
  BlockId.Planks,
  BlockId.Wood,
  BlockId.Bricks,
  BlockId.Glass,
  BlockId.Sand
];

export const WORLD_SAVE_KEY = 'voxel-frontier:world:v1';
