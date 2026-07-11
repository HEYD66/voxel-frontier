import * as THREE from 'three';
import {
  BlockId,
  isBlockId,
  type BlockCreativeCategory,
  type BlockDefinition
} from './types';

const TILE_SIZE = 16;
const ATLAS_COLUMNS = 8;
const ATLAS_ROWS = 5;

const Tile = {
  GrassTop: 0,
  GrassSide: 1,
  Dirt: 2,
  Stone: 3,
  Sand: 4,
  WoodSide: 5,
  WoodTop: 6,
  Leaves: 7,
  Planks: 8,
  Bricks: 9,
  Glass: 10,
  Water: 11,
  CoalOre: 12,
  IronOre: 13,
  SnowTop: 14,
  SnowSide: 15,
  Cobblestone: 16,
  Bedrock: 17,
  CraftingTop: 18,
  CraftingSide: 19,
  CraftingBottom: 20,
  FurnaceTop: 21,
  FurnaceSide: 22,
  FurnaceFront: 23,
  FurnaceBottom: 24,
  TorchSide: 25,
  TorchTop: 26,
  TorchBottom: 27,
  ChestTop: 28,
  ChestSide: 29,
  ChestFront: 30,
  ChestBottom: 31,
  DiamondOre: 32
} as const;

const BUILDING_BLOCK_IDS = new Set<BlockId>([
  BlockId.Cobblestone,
  BlockId.Planks,
  BlockId.Bricks,
  BlockId.Glass,
  BlockId.CraftingTable,
  BlockId.Furnace,
  BlockId.Torch,
  BlockId.Chest
]);

const ORE_BLOCK_IDS = new Set<BlockId>([
  BlockId.CoalOre,
  BlockId.IronOre,
  BlockId.DiamondOre,
  BlockId.Bedrock
]);

function getCreativeCategory(id: BlockId): BlockCreativeCategory {
  if (BUILDING_BLOCK_IDS.has(id)) return 'building';
  if (ORE_BLOCK_IDS.has(id)) return 'ore';
  return 'nature';
}

function definition(
  id: BlockId,
  name: string,
  label: string,
  solid: boolean,
  transparent: boolean,
  top: number,
  side = top,
  bottom = side,
  mapColor: string,
  liquid = false,
  front = side
): BlockDefinition {
  return {
    id,
    name,
    label,
    solid,
    transparent,
    liquid,
    atlas: { top, bottom, side, front },
    mapColor,
    creativeCategory: getCreativeCategory(id)
  };
}

export const BLOCK_DEFINITIONS: readonly BlockDefinition[] = [
  definition(BlockId.Air, 'air', 'Air', false, true, Tile.Glass, Tile.Glass, Tile.Glass, '#9ed8f4'),
  definition(BlockId.Grass, 'grass', 'Grass', true, false, Tile.GrassTop, Tile.GrassSide, Tile.Dirt, '#65a844'),
  definition(BlockId.Dirt, 'dirt', 'Dirt', true, false, Tile.Dirt, Tile.Dirt, Tile.Dirt, '#795039'),
  definition(BlockId.Stone, 'stone', 'Stone', true, false, Tile.Stone, Tile.Stone, Tile.Stone, '#858b8d'),
  definition(BlockId.Sand, 'sand', 'Sand', true, false, Tile.Sand, Tile.Sand, Tile.Sand, '#d9c57e'),
  definition(BlockId.Wood, 'wood', 'Wood', true, false, Tile.WoodTop, Tile.WoodSide, Tile.WoodTop, '#825533'),
  definition(BlockId.Leaves, 'leaves', 'Leaves', true, true, Tile.Leaves, Tile.Leaves, Tile.Leaves, '#397d40'),
  definition(BlockId.Planks, 'planks', 'Planks', true, false, Tile.Planks, Tile.Planks, Tile.Planks, '#b7834d'),
  definition(BlockId.Bricks, 'bricks', 'Bricks', true, false, Tile.Bricks, Tile.Bricks, Tile.Bricks, '#9f5144'),
  definition(BlockId.Glass, 'glass', 'Glass', true, true, Tile.Glass, Tile.Glass, Tile.Glass, '#9fcbd2'),
  definition(BlockId.Water, 'water', 'Water', false, true, Tile.Water, Tile.Water, Tile.Water, '#347fae', true),
  definition(BlockId.CoalOre, 'coal_ore', 'Coal Ore', true, false, Tile.CoalOre, Tile.CoalOre, Tile.CoalOre, '#4a4d4e'),
  definition(BlockId.IronOre, 'iron_ore', 'Iron Ore', true, false, Tile.IronOre, Tile.IronOre, Tile.IronOre, '#a87859'),
  definition(BlockId.Snow, 'snow', 'Snow', true, false, Tile.SnowTop, Tile.SnowSide, Tile.Dirt, '#e8f2f2'),
  definition(BlockId.Cobblestone, 'cobblestone', 'Cobblestone', true, false, Tile.Cobblestone, Tile.Cobblestone, Tile.Cobblestone, '#6e7475'),
  definition(BlockId.Bedrock, 'bedrock', 'Bedrock', true, false, Tile.Bedrock, Tile.Bedrock, Tile.Bedrock, '#323638'),
  definition(
    BlockId.CraftingTable,
    'crafting_table',
    'Crafting Table',
    true,
    false,
    Tile.CraftingTop,
    Tile.CraftingSide,
    Tile.CraftingBottom,
    '#936238'
  ),
  definition(
    BlockId.Furnace,
    'furnace',
    'Furnace',
    true,
    false,
    Tile.FurnaceTop,
    Tile.FurnaceSide,
    Tile.FurnaceBottom,
    '#666b6c',
    false,
    Tile.FurnaceFront
  ),
  definition(
    BlockId.Torch,
    'torch',
    'Torch',
    false,
    true,
    Tile.TorchTop,
    Tile.TorchSide,
    Tile.TorchBottom,
    '#d99b3f'
  ),
  definition(
    BlockId.Chest,
    'chest',
    '箱子',
    true,
    false,
    Tile.ChestTop,
    Tile.ChestSide,
    Tile.ChestBottom,
    '#8f5c32',
    false,
    Tile.ChestFront
  ),
  definition(
    BlockId.DiamondOre,
    'diamond_ore',
    'Diamond Ore',
    true,
    false,
    Tile.DiamondOre,
    Tile.DiamondOre,
    Tile.DiamondOre,
    '#3eb8b8'
  )
] as const;

export function getBlockDefinition(id: BlockId | number): BlockDefinition {
  return isBlockId(id) ? BLOCK_DEFINITIONS[id]! : BLOCK_DEFINITIONS[BlockId.Air]!;
}

function pixelHash(x: number, y: number, salt: number): number {
  let value = Math.imul(x + 37, 0x45d9f3b) ^ Math.imul(y + 91, 0x119de1f3) ^ Math.imul(salt + 17, 0x3449f5);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((value >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((value >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (value & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function tileOrigin(index: number): [number, number] {
  return [(index % ATLAS_COLUMNS) * TILE_SIZE, Math.floor(index / ATLAS_COLUMNS) * TILE_SIZE];
}

function noisyTile(
  context: CanvasRenderingContext2D,
  index: number,
  base: string,
  variance: number,
  salt = index
): void {
  const [originX, originY] = tileOrigin(index);
  for (let y = 0; y < TILE_SIZE; y += 1) {
    for (let x = 0; x < TILE_SIZE; x += 1) {
      const noise = (pixelHash(x, y, salt) % (variance * 2 + 1)) - variance;
      context.fillStyle = shade(base, noise);
      context.fillRect(originX + x, originY + y, 1, 1);
    }
  }
}

function drawAtlas(context: CanvasRenderingContext2D): void {
  noisyTile(context, Tile.GrassTop, '#5c9f45', 18);

  noisyTile(context, Tile.GrassSide, '#76513a', 12);
  {
    const [x, y] = tileOrigin(Tile.GrassSide);
    for (let px = 0; px < TILE_SIZE; px += 1) {
      const fringe = 3 + (pixelHash(px, 0, 83) % 3);
      for (let py = 0; py < fringe; py += 1) {
        context.fillStyle = shade('#5b9a42', (pixelHash(px, py, 84) % 23) - 11);
        context.fillRect(x + px, y + py, 1, 1);
      }
    }
  }

  noisyTile(context, Tile.Dirt, '#775039', 14);
  noisyTile(context, Tile.Stone, '#7e8587', 11);
  noisyTile(context, Tile.Sand, '#d5c27d', 8);

  noisyTile(context, Tile.WoodSide, '#815332', 9);
  {
    const [x, y] = tileOrigin(Tile.WoodSide);
    for (let px = 1; px < TILE_SIZE; px += 4) {
      context.fillStyle = 'rgba(61, 34, 21, 0.38)';
      context.fillRect(x + px, y, 1, TILE_SIZE);
    }
  }

  noisyTile(context, Tile.WoodTop, '#9a6840', 8);
  {
    const [x, y] = tileOrigin(Tile.WoodTop);
    context.strokeStyle = '#694126';
    context.lineWidth = 1;
    context.strokeRect(x + 2.5, y + 2.5, 10, 10);
    context.strokeRect(x + 5.5, y + 5.5, 4, 4);
  }

  {
    const [x, y] = tileOrigin(Tile.Leaves);
    context.clearRect(x, y, TILE_SIZE, TILE_SIZE);
    for (let py = 0; py < TILE_SIZE; py += 1) {
      for (let px = 0; px < TILE_SIZE; px += 1) {
        const hash = pixelHash(px, py, 107);
        if (hash % 13 === 0) continue;
        context.fillStyle = shade('#397d40', (hash % 35) - 17);
        context.fillRect(x + px, y + py, 1, 1);
      }
    }
  }

  noisyTile(context, Tile.Planks, '#b27d49', 8);
  {
    const [x, y] = tileOrigin(Tile.Planks);
    context.fillStyle = '#70452b';
    for (let py = 3; py < TILE_SIZE; py += 4) context.fillRect(x, y + py, TILE_SIZE, 1);
    context.fillRect(x + 5, y, 1, 4);
    context.fillRect(x + 11, y + 4, 1, 4);
    context.fillRect(x + 7, y + 8, 1, 4);
    context.fillRect(x + 13, y + 12, 1, 4);
  }

  noisyTile(context, Tile.Bricks, '#9d5144', 7);
  {
    const [x, y] = tileOrigin(Tile.Bricks);
    context.fillStyle = '#c59d83';
    for (let py = 3; py < TILE_SIZE; py += 4) context.fillRect(x, y + py, TILE_SIZE, 1);
    for (let row = 0; row < 4; row += 1) {
      const offset = row % 2 === 0 ? 4 : 0;
      for (let px = offset; px < TILE_SIZE; px += 8) context.fillRect(x + px, y + row * 4, 1, 4);
    }
  }

  {
    const [x, y] = tileOrigin(Tile.Glass);
    context.clearRect(x, y, TILE_SIZE, TILE_SIZE);
    context.fillStyle = 'rgba(142, 207, 218, 0.18)';
    context.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    context.fillStyle = 'rgba(218, 248, 250, 0.82)';
    context.fillRect(x, y, TILE_SIZE, 1);
    context.fillRect(x, y, 1, TILE_SIZE);
    context.fillRect(x + 14, y + 2, 1, 6);
    context.fillRect(x + 10, y + 2, 4, 1);
  }

  {
    const [x, y] = tileOrigin(Tile.Water);
    context.clearRect(x, y, TILE_SIZE, TILE_SIZE);
    context.fillStyle = 'rgba(42, 123, 174, 0.66)';
    context.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    context.fillStyle = 'rgba(144, 218, 234, 0.30)';
    for (let py = 2; py < TILE_SIZE; py += 5) {
      const offset = (py * 3) % 5;
      context.fillRect(x + offset, y + py, 7, 1);
      context.fillRect(x + offset + 10, y + py, 4, 1);
    }
  }

  noisyTile(context, Tile.CoalOre, '#7e8587', 9);
  noisyTile(context, Tile.IronOre, '#7e8587', 9);
  noisyTile(context, Tile.DiamondOre, '#737b7d', 9);
  for (const [index, color, salt] of [
    [Tile.CoalOre, '#303638', 131],
    [Tile.IronOre, '#b87852', 139],
    [Tile.DiamondOre, '#31c4c2', 149]
  ] as const) {
    const [x, y] = tileOrigin(index);
    for (let py = 1; py < TILE_SIZE - 1; py += 1) {
      for (let px = 1; px < TILE_SIZE - 1; px += 1) {
        if (pixelHash(px, py, salt) % 19 < 2) {
          context.fillStyle = color;
          context.fillRect(x + px, y + py, 2, 2);
        }
      }
    }
  }
  {
    const [x, y] = tileOrigin(Tile.DiamondOre);
    context.fillStyle = '#92eee3';
    for (let py = 2; py < TILE_SIZE - 2; py += 3) {
      const px = 2 + (pixelHash(py, py + 5, 157) % 11);
      context.fillRect(x + px, y + py, 1, 2);
    }
  }

  noisyTile(context, Tile.SnowTop, '#e8f1f0', 5);
  noisyTile(context, Tile.SnowSide, '#75513b', 10);
  {
    const [x, y] = tileOrigin(Tile.SnowSide);
    for (let py = 0; py < 4; py += 1) {
      for (let px = 0; px < TILE_SIZE; px += 1) {
        context.fillStyle = shade('#e8f1f0', (pixelHash(px, py, 151) % 9) - 4);
        context.fillRect(x + px, y + py, 1, 1);
      }
    }
  }

  noisyTile(context, Tile.Cobblestone, '#6f7576', 12);
  {
    const [x, y] = tileOrigin(Tile.Cobblestone);
    context.strokeStyle = '#454b4d';
    context.lineWidth = 1;
    context.strokeRect(x + 1.5, y + 1.5, 6, 5);
    context.strokeRect(x + 8.5, y + 0.5, 6, 7);
    context.strokeRect(x + 0.5, y + 7.5, 5, 7);
    context.strokeRect(x + 5.5, y + 7.5, 8, 5);
    context.strokeRect(x + 11.5, y + 12.5, 4, 3);
  }

  noisyTile(context, Tile.Bedrock, '#35393b', 20);

  noisyTile(context, Tile.CraftingTop, '#a06d3f', 8, 211);
  {
    const [x, y] = tileOrigin(Tile.CraftingTop);
    context.fillStyle = '#4a2d1c';
    context.fillRect(x, y, TILE_SIZE, 2);
    context.fillRect(x, y + TILE_SIZE - 2, TILE_SIZE, 2);
    context.fillRect(x, y, 2, TILE_SIZE);
    context.fillRect(x + TILE_SIZE - 2, y, 2, TILE_SIZE);
    context.fillStyle = '#684328';
    for (let offset = 5; offset < TILE_SIZE - 1; offset += 5) {
      context.fillRect(x + offset, y + 2, 1, TILE_SIZE - 4);
      context.fillRect(x + 2, y + offset, TILE_SIZE - 4, 1);
    }
    context.fillStyle = '#d5a460';
    for (const [px, py] of [[3, 3], [8, 3], [3, 8], [8, 8], [12, 12]] as const) {
      context.fillRect(x + px, y + py, 2, 1);
    }
  }

  noisyTile(context, Tile.CraftingSide, '#83502e', 9, 223);
  {
    const [x, y] = tileOrigin(Tile.CraftingSide);
    context.fillStyle = '#4a2b1b';
    context.fillRect(x, y, TILE_SIZE, 3);
    context.fillRect(x, y + 14, TILE_SIZE, 2);
    context.fillRect(x, y + 3, 1, 11);
    context.fillRect(x + 15, y + 3, 1, 11);
    context.fillStyle = '#bd8a50';
    context.fillRect(x + 1, y + 4, 14, 1);
    context.fillStyle = '#59656a';
    context.fillRect(x + 2, y + 6, 6, 2);
    context.fillRect(x + 3, y + 5, 3, 1);
    context.fillStyle = '#d0a064';
    context.fillRect(x + 4, y + 8, 2, 6);
    context.fillStyle = '#6f7a7d';
    for (let step = 0; step < 5; step += 1) {
      context.fillRect(x + 9 + step, y + 7 + step, 2, 1);
      if (step % 2 === 0) context.fillRect(x + 10 + step, y + 8 + step, 1, 1);
    }
    context.fillStyle = '#d2a35f';
    context.fillRect(x + 9, y + 12, 5, 2);
  }

  noisyTile(context, Tile.CraftingBottom, '#704327', 7, 227);
  {
    const [x, y] = tileOrigin(Tile.CraftingBottom);
    context.fillStyle = '#4b2c1b';
    for (let offset = 4; offset < TILE_SIZE; offset += 4) {
      context.fillRect(x + offset, y, 1, TILE_SIZE);
    }
    for (let step = 1; step < TILE_SIZE - 1; step += 1) {
      if (step % 2 === 0) {
        context.fillRect(x + step, y + step, 1, 1);
        context.fillRect(x + TILE_SIZE - 1 - step, y + step, 1, 1);
      }
    }
    context.strokeStyle = '#3d2417';
    context.strokeRect(x + 1.5, y + 1.5, 12, 12);
  }

  noisyTile(context, Tile.FurnaceTop, '#777d7e', 12, 239);
  {
    const [x, y] = tileOrigin(Tile.FurnaceTop);
    context.strokeStyle = '#4d5355';
    context.strokeRect(x + 1.5, y + 1.5, 12, 12);
    context.strokeStyle = '#909697';
    context.strokeRect(x + 4.5, y + 4.5, 6, 6);
    context.fillStyle = '#3c4143';
    context.fillRect(x + 6, y + 6, 4, 4);
    context.fillStyle = '#a3a9a8';
    context.fillRect(x + 7, y + 5, 2, 1);
  }

  noisyTile(context, Tile.FurnaceSide, '#696f70', 13, 241);
  {
    const [x, y] = tileOrigin(Tile.FurnaceSide);
    context.fillStyle = '#454a4c';
    for (let py = 4; py < TILE_SIZE; py += 5) context.fillRect(x, y + py, TILE_SIZE, 1);
    for (let row = 0; row < 3; row += 1) {
      const offset = row % 2 === 0 ? 5 : 1;
      for (let px = offset; px < TILE_SIZE; px += 7) {
        context.fillRect(x + px, y + row * 5, 1, 5);
      }
    }
    context.fillStyle = 'rgba(183, 190, 190, 0.34)';
    context.fillRect(x + 1, y + 1, 14, 1);
  }

  noisyTile(context, Tile.FurnaceFront, '#656b6d', 12, 251);
  {
    const [x, y] = tileOrigin(Tile.FurnaceFront);
    context.fillStyle = '#3e4446';
    context.fillRect(x + 1, y + 1, 14, 1);
    context.fillRect(x + 1, y + 1, 1, 14);
    context.fillStyle = '#969d9e';
    context.fillRect(x + 4, y + 3, 8, 1);
    context.fillRect(x + 3, y + 4, 1, 7);
    context.fillRect(x + 12, y + 4, 1, 7);
    context.fillRect(x + 4, y + 11, 8, 1);
    context.fillStyle = '#202426';
    context.fillRect(x + 4, y + 5, 8, 5);
    context.fillStyle = '#343a3c';
    context.fillRect(x + 5, y + 6, 6, 1);
    context.fillStyle = '#b4bbba';
    context.fillRect(x + 3, y + 13, 7, 1);
    context.fillStyle = '#313638';
    context.fillRect(x + 11, y + 13, 2, 2);
  }

  noisyTile(context, Tile.FurnaceBottom, '#555b5d', 10, 257);
  {
    const [x, y] = tileOrigin(Tile.FurnaceBottom);
    context.strokeStyle = '#383d3f';
    context.strokeRect(x + 1.5, y + 1.5, 12, 12);
    context.fillStyle = '#73797a';
    context.fillRect(x + 3, y + 3, 2, 2);
    context.fillRect(x + 11, y + 3, 2, 2);
    context.fillRect(x + 3, y + 11, 2, 2);
    context.fillRect(x + 11, y + 11, 2, 2);
  }

  {
    const [x, y] = tileOrigin(Tile.TorchSide);
    context.clearRect(x, y, TILE_SIZE, TILE_SIZE);
    context.fillStyle = '#6f351f';
    context.fillRect(x + 6, y + 7, 4, 9);
    context.fillStyle = '#a65d2b';
    context.fillRect(x + 7, y + 7, 2, 9);
    context.fillStyle = '#d28a42';
    context.fillRect(x + 7, y + 8, 1, 7);
    context.fillStyle = '#4b2a1c';
    context.fillRect(x + 6, y + 6, 4, 2);
    context.fillStyle = '#b9431f';
    context.fillRect(x + 6, y + 2, 4, 5);
    context.fillRect(x + 5, y + 3, 1, 2);
    context.fillRect(x + 10, y + 3, 1, 2);
    context.fillStyle = '#f38d24';
    context.fillRect(x + 7, y + 1, 2, 5);
    context.fillRect(x + 6, y + 3, 4, 2);
    context.fillStyle = '#ffd85a';
    context.fillRect(x + 7, y + 3, 2, 2);
    context.fillStyle = '#fff1a0';
    context.fillRect(x + 8, y + 3, 1, 1);
  }

  {
    const [x, y] = tileOrigin(Tile.TorchTop);
    context.clearRect(x, y, TILE_SIZE, TILE_SIZE);
    context.fillStyle = '#9e351c';
    context.fillRect(x + 5, y + 5, 6, 6);
    context.fillStyle = '#f07921';
    context.fillRect(x + 6, y + 4, 4, 8);
    context.fillRect(x + 4, y + 6, 8, 4);
    context.fillStyle = '#ffd451';
    context.fillRect(x + 6, y + 6, 4, 4);
    context.fillStyle = '#fff0a1';
    context.fillRect(x + 7, y + 7, 2, 2);
  }

  {
    const [x, y] = tileOrigin(Tile.TorchBottom);
    context.clearRect(x, y, TILE_SIZE, TILE_SIZE);
    context.fillStyle = '#5d321e';
    context.fillRect(x + 6, y + 6, 4, 4);
    context.fillStyle = '#a45c2b';
    context.fillRect(x + 7, y + 7, 2, 2);
  }

  noisyTile(context, Tile.ChestTop, '#9c6838', 7, 271);
  {
    const [x, y] = tileOrigin(Tile.ChestTop);
    context.fillStyle = '#4a2b1c';
    context.fillRect(x, y, TILE_SIZE, 2);
    context.fillRect(x, y + 14, TILE_SIZE, 2);
    context.fillRect(x, y + 2, 2, 12);
    context.fillRect(x + 14, y + 2, 2, 12);
    context.fillStyle = '#704323';
    context.fillRect(x + 7, y + 2, 2, 12);
    context.fillRect(x + 2, y + 7, 12, 2);
    context.fillStyle = '#c29758';
    for (const [px, py] of [[3, 3], [11, 3], [3, 11], [11, 11]] as const) {
      context.fillRect(x + px, y + py, 2, 2);
    }
    context.fillStyle = '#e0bd73';
    context.fillRect(x + 4, y + 3, 1, 1);
    context.fillRect(x + 12, y + 11, 1, 1);
  }

  noisyTile(context, Tile.ChestSide, '#8f5b31', 8, 277);
  {
    const [x, y] = tileOrigin(Tile.ChestSide);
    context.fillStyle = '#432719';
    context.fillRect(x, y, TILE_SIZE, 2);
    context.fillRect(x, y + 14, TILE_SIZE, 2);
    context.fillRect(x, y + 2, 2, 12);
    context.fillRect(x + 14, y + 2, 2, 12);
    context.fillStyle = '#643b21';
    context.fillRect(x + 2, y + 6, 12, 2);
    context.fillRect(x + 5, y + 2, 1, 12);
    context.fillRect(x + 10, y + 2, 1, 12);
    context.fillStyle = '#b17d43';
    context.fillRect(x + 2, y + 3, 12, 1);
    context.fillStyle = '#c3a05d';
    context.fillRect(x + 2, y + 12, 2, 2);
    context.fillRect(x + 12, y + 12, 2, 2);
  }

  noisyTile(context, Tile.ChestFront, '#965f32', 7, 281);
  {
    const [x, y] = tileOrigin(Tile.ChestFront);
    context.fillStyle = '#422619';
    context.fillRect(x, y, TILE_SIZE, 2);
    context.fillRect(x, y + 14, TILE_SIZE, 2);
    context.fillRect(x, y + 2, 2, 12);
    context.fillRect(x + 14, y + 2, 2, 12);
    context.fillStyle = '#5e371f';
    context.fillRect(x + 2, y + 6, 12, 2);
    context.fillStyle = '#b17b40';
    context.fillRect(x + 2, y + 3, 12, 1);
    context.fillStyle = '#564a38';
    context.fillRect(x + 6, y + 5, 4, 7);
    context.fillStyle = '#d1ad60';
    context.fillRect(x + 7, y + 5, 3, 5);
    context.fillStyle = '#f0d890';
    context.fillRect(x + 8, y + 6, 1, 2);
    context.fillStyle = '#2d251e';
    context.fillRect(x + 8, y + 9, 1, 2);
    context.fillStyle = '#c39c55';
    context.fillRect(x + 2, y + 12, 2, 2);
    context.fillRect(x + 12, y + 12, 2, 2);
  }

  noisyTile(context, Tile.ChestBottom, '#684124', 6, 283);
  {
    const [x, y] = tileOrigin(Tile.ChestBottom);
    context.fillStyle = '#3d2518';
    context.fillRect(x + 1, y + 1, 14, 2);
    context.fillRect(x + 1, y + 13, 14, 2);
    context.fillRect(x + 1, y + 3, 2, 10);
    context.fillRect(x + 13, y + 3, 2, 10);
    context.fillRect(x + 5, y + 3, 2, 10);
    context.fillRect(x + 9, y + 3, 2, 10);
    context.fillStyle = '#8d6035';
    context.fillRect(x + 3, y + 4, 2, 8);
    context.fillRect(x + 11, y + 4, 2, 8);
  }
}

export function createBlockTextureAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLUMNS * TILE_SIZE;
  canvas.height = ATLAS_ROWS * TILE_SIZE;

  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('Unable to create the block texture atlas.');
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawAtlas(context);

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = 'Procedural block atlas';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export const BLOCK_ATLAS_LAYOUT = Object.freeze({
  columns: ATLAS_COLUMNS,
  rows: ATLAS_ROWS,
  tileSize: TILE_SIZE
});

export const BLOCK_ATLAS_WATER_TILE = Tile.Water;
