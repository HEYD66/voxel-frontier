import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Mesh, Vector3 } from 'three';
import { BlockId } from '../types';
import {
  CHUNK_SIZE,
  VoxelWorld,
  WORLD_HEIGHT,
  WORLD_MAX_COORDINATE,
  WORLD_MIN_COORDINATE,
  shouldRenderVoxelFace
} from '../world';

beforeAll(() => {
  const context = {
    imageSmoothingEnabled: false,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    clearRect: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined
  };
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => context
    })
  });
});

let world: VoxelWorld | null = null;

function countVoxelVertices(target: VoxelWorld): number {
  return target.children.reduce((total, child) => (
    child instanceof Mesh
      ? total + child.geometry.getAttribute('position').count
      : total
  ), 0);
}

function getTopFaceBrightness(
  target: VoxelWorld,
  chunkX: number,
  chunkZ: number,
  localX: number,
  y: number,
  localZ: number
): Map<string, number> {
  const mesh = target.children.find((child): child is Mesh => (
    child instanceof Mesh && child.name === `Opaque chunk ${chunkX},${chunkZ}`
  ));
  expect(mesh).toBeDefined();
  const positions = mesh!.geometry.getAttribute('position');
  const normals = mesh!.geometry.getAttribute('normal');
  const lights = mesh!.geometry.getAttribute('voxelLight');
  const result = new Map<string, number>();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const vertexY = positions.getY(index);
    const z = positions.getZ(index);
    if (
      normals.getY(index) !== 1 ||
      vertexY !== y + 1 ||
      (x !== localX && x !== localX + 1) ||
      (z !== localZ && z !== localZ + 1)
    ) continue;
    result.set(`${x},${z}`, lights.getX(index));
  }
  return result;
}

afterEach(() => {
  world?.dispose();
  world = null;
});

describe('VoxelWorld', () => {
  it('generates deterministic terrain across negative and positive chunks', () => {
    world = new VoxelWorld(0x12345678);
    const terrainMesh = world.children.find((child): child is Mesh => child instanceof Mesh);
    expect(terrainMesh).toBeDefined();
    expect(terrainMesh?.geometry.getAttribute('voxelLight').count).toBe(
      terrainMesh?.geometry.getAttribute('position').count
    );
    const firstSamples = [
      world.getBlock(-63, 0, -63),
      world.getBlock(-17, 22, 9),
      world.getBlock(0, 36, 0),
      world.getBlock(31, 29, -42),
      world.getBlock(63, 0, 63)
    ];
    expect(world.getBlock(WORLD_MIN_COORDINATE - 1, 20, 0)).toBe(BlockId.Air);
    expect(world.getBlock(0, WORLD_HEIGHT, 0)).toBe(BlockId.Air);
    world.dispose();

    world = new VoxelWorld(0x12345678);
    expect([
      world.getBlock(-63, 0, -63),
      world.getBlock(-17, 22, 9),
      world.getBlock(0, 36, 0),
      world.getBlock(31, 29, -42),
      world.getBlock(63, 0, 63)
    ]).toEqual(firstSamples);
    expect(world.getBlock(WORLD_MAX_COORDINATE + 1, 20, 0)).toBe(BlockId.Air);
  });

  it('round-trips sparse edits and restores the generated block', () => {
    world = new VoxelWorld(77);
    const x = -16;
    const y = WORLD_HEIGHT - 2;
    const z = 15;
    const generated = world.getBlock(x, y, z);

    expect(world.setBlock(x, y, z, BlockId.Furnace)).toBe(true);
    expect(world.getBlock(x, y, z)).toBe(BlockId.Furnace);
    const savedEdits = world.serializeEdits();
    expect(savedEdits).toEqual([[x, y, z, BlockId.Furnace]]);
    world.loadEdits([]);
    expect(world.getBlock(x, y, z)).toBe(generated);
    expect(world.serializeEdits()).toEqual([]);
    world.loadEdits(savedEdits);
    expect(world.getBlock(x, y, z)).toBe(BlockId.Furnace);
    expect(world.serializeEdits()).toEqual(savedEdits);
    world.setDaylight(0.25);
    expect(world.getDaylight()).toBe(0.25);
    world.setLocalLight(x, 60, z, 12);
    expect(world.getLightLevel(x, 60, z).block).toBe(12);
    world.removeLocalLight(x, 60, z);
    expect(world.getLightLevel(x, 60, z).block).toBe(0);
  });

  it('adds, removes, and batch-restores torch light without stale emitters', () => {
    world = new VoxelWorld(78);
    const x = -16;
    const y = WORLD_HEIGHT - 2;
    const z = 15;

    expect(world.setBlock(x, y - 1, z, BlockId.Cobblestone)).toBe(true);
    expect(world.setBlock(x, y, z, BlockId.Torch)).toBe(true);
    expect(world.getLightLevel(x, y, z).block).toBe(14);
    expect(world.getLightLevel(x + 1, y, z).block).toBe(13);
    const savedEdits = world.serializeEdits();

    world.loadEdits([]);
    expect(world.getLightLevel(x, y, z).block).toBe(0);
    expect(world.getLightLevel(x + 1, y, z).block).toBe(0);

    world.loadEdits(savedEdits);
    expect(world.getLightLevel(x, y, z).block).toBe(14);
    expect(world.getLightLevel(x + 1, y, z).block).toBe(13);

    world.loadEdits([]);
    expect(world.getLightLevel(x, y, z).block).toBe(0);
    expect(world.getLightLevel(x + 1, y, z).block).toBe(0);
  });

  it('keeps voxel faces beside non-occluding chest and torch shapes', () => {
    expect(shouldRenderVoxelFace(BlockId.Stone, BlockId.Chest)).toBe(true);
    expect(shouldRenderVoxelFace(BlockId.Glass, BlockId.Chest)).toBe(true);
    expect(shouldRenderVoxelFace(BlockId.Glass, BlockId.Torch)).toBe(true);
    expect(shouldRenderVoxelFace(BlockId.Water, BlockId.Torch)).toBe(true);
    expect(shouldRenderVoxelFace(BlockId.Leaves, BlockId.Torch)).toBe(true);
    expect(shouldRenderVoxelFace(BlockId.Glass, BlockId.Glass)).toBe(false);
    expect(shouldRenderVoxelFace(BlockId.Leaves, BlockId.Leaves)).toBe(false);
    expect(shouldRenderVoxelFace(BlockId.Stone, BlockId.Stone)).toBe(false);
  });

  it('leaves chest blocks out of the cubic chunk mesh', () => {
    world = new VoxelWorld(81);
    const before = countVoxelVertices(world);

    expect(world.setBlock(3, WORLD_HEIGHT - 2, -4, BlockId.Chest)).toBe(true);

    expect(countVoxelVertices(world)).toBe(before);
  });

  it('removes unsupported torch edits after applying the complete edit batch', () => {
    world = new VoxelWorld(79);
    const y = WORLD_HEIGHT - 2;
    const floorTorch: [number, number, number] = [-16, y, 15];
    const wallTorch: [number, number, number] = [-12, y, 15];
    const unsupportedTorch: [number, number, number] = [-8, y, 15];
    const overwrittenTorch: [number, number, number] = [-4, y, 15];

    world.loadEdits([
      [...floorTorch, BlockId.Torch],
      [floorTorch[0], y - 1, floorTorch[2], BlockId.Cobblestone],
      [...wallTorch, BlockId.Torch],
      [wallTorch[0] - 1, y, wallTorch[2], BlockId.Cobblestone],
      [...unsupportedTorch, BlockId.Torch],
      [...overwrittenTorch, BlockId.Torch],
      [overwrittenTorch[0], y - 1, overwrittenTorch[2], BlockId.Cobblestone],
      [...overwrittenTorch, BlockId.Air]
    ]);

    expect(world.getBlock(...floorTorch)).toBe(BlockId.Torch);
    expect(world.getBlock(...wallTorch)).toBe(BlockId.Torch);
    expect(world.getBlock(...unsupportedTorch)).toBe(BlockId.Air);
    expect(world.getBlock(...overwrittenTorch)).toBe(BlockId.Air);
    expect(world.serializeEdits()).not.toContainEqual([...unsupportedTorch, BlockId.Torch]);
    expect(world.serializeEdits()).not.toContainEqual([...overwrittenTorch, BlockId.Torch]);
    expect(world.getLightLevel(...unsupportedTorch).block).toBeLessThan(14);
  });

  it('restores the generated block beneath an unsupported loaded torch edit', () => {
    world = new VoxelWorld(80);
    const target: [number, number, number] = [8, 1, 8];
    const generated = world.getBlock(...target);
    expect(world.isSolid(generated)).toBe(true);

    world.loadEdits([
      [...target, BlockId.Torch],
      [target[0], target[1] - 1, target[2], BlockId.Air],
      [target[0] - 1, target[1], target[2], BlockId.Air],
      [target[0] + 1, target[1], target[2], BlockId.Air],
      [target[0], target[1], target[2] - 1, BlockId.Air],
      [target[0], target[1], target[2] + 1, BlockId.Air]
    ]);

    expect(world.getBlock(...target)).toBe(generated);
    expect(world.serializeEdits()).not.toContainEqual([...target, BlockId.Torch]);
  });

  it('uses grid DDA and returns the placement-adjacent cell', () => {
    world = new VoxelWorld(91);
    const target = new Vector3(3, WORLD_HEIGHT - 3, -4);
    world.setBlock(target.x, target.y, target.z, BlockId.Cobblestone);

    const hit = world.raycast(
      new Vector3(target.x + 0.5, target.y + 4, target.z + 0.5),
      new Vector3(0, -1, 0),
      6
    );
    expect(hit?.block.toArray()).toEqual(target.toArray());
    expect(hit?.normal.toArray()).toEqual([0, 1, 0]);
    expect(hit?.adjacent.toArray()).toEqual([target.x, target.y + 1, target.z]);
  });

  it('raycasts the inset chest shape with exact surface distance and normal', () => {
    world = new VoxelWorld(92);
    const target = new Vector3(3, WORLD_HEIGHT - 2, -4);
    expect(world.setBlock(target.x, target.y, target.z, BlockId.Chest)).toBe(true);

    const hit = world.raycast(
      new Vector3(target.x + 0.5, target.y + 0.5, target.z - 2),
      new Vector3(0, 0, 3),
      6
    );

    expect(hit?.id).toBe(BlockId.Chest);
    expect(hit?.block.toArray()).toEqual(target.toArray());
    expect(hit?.normal.toArray()).toEqual([0, 0, -1]);
    expect(hit?.adjacent.toArray()).toEqual([target.x, target.y, target.z - 1]);
    expect(hit?.distance).toBeCloseTo(2 + 1 / 16, 8);
  });

  it('provides continuous contextual collision boxes for connected chest halves', () => {
    world = new VoxelWorld(95);
    const y = WORLD_HEIGHT - 2;
    expect(world.setBlock(3, y, -4, BlockId.Chest)).toBe(true);
    expect(world.setBlock(4, y, -4, BlockId.Chest)).toBe(true);
    expect(world.setBlock(8, y, 2, BlockId.Chest)).toBe(true);
    expect(world.setBlock(8, y, 3, BlockId.Chest)).toBe(true);
    world.setChestConnectionResolver((x, blockY, z) => {
      if (blockY !== y) return null;
      if (x === 3 && z === -4) return { dx: 1, dz: 0 };
      if (x === 4 && z === -4) return { dx: -1, dz: 0 };
      if (x === 8 && z === 2) return { dx: 0, dz: 1 };
      if (x === 8 && z === 3) return { dx: 0, dz: -1 };
      return null;
    });

    const west = world.getBlockCollisionBoxes(3, y, -4)[0]!;
    const east = world.getBlockCollisionBoxes(4, y, -4)[0]!;
    expect(west.maxX).toBe(east.minX);
    expect(east.maxX - west.minX).toBe(30 / 16);

    const north = world.getBlockCollisionBoxes(8, y, 2)[0]!;
    const south = world.getBlockCollisionBoxes(8, y, 3)[0]!;
    expect(north.maxZ).toBe(south.minZ);
    expect(south.maxZ - north.minZ).toBe(30 / 16);
  });

  it('rejects invalid or stale chest partner offsets', () => {
    world = new VoxelWorld(96);
    const x = 3;
    const y = WORLD_HEIGHT - 2;
    const z = -4;
    expect(world.setBlock(x, y, z, BlockId.Chest)).toBe(true);
    world.setChestConnectionResolver(() => ({ dx: 1, dz: 0 }));
    expect(world.getBlockCollisionBoxes(x, y, z)[0]?.maxX).toBe(x + 15 / 16);

    expect(world.setBlock(x + 1, y, z, BlockId.Stone)).toBe(true);
    expect(world.getBlockCollisionBoxes(x, y, z)[0]?.maxX).toBe(x + 15 / 16);

    expect(world.setBlock(x + 1, y, z, BlockId.Chest)).toBe(true);
    expect(world.getBlockCollisionBoxes(x, y, z)[0]?.maxX).toBe(x + 1);

    world.setChestConnectionResolver(() => ({ dx: 1, dz: 1 }));
    expect(world.getBlockCollisionBoxes(x, y, z)[0]?.maxX).toBe(x + 15 / 16);
    world.setChestConnectionResolver(null);
    expect(world.getBlockCollisionBoxes(x, y, z)[0]?.maxX).toBe(x + 15 / 16);
  });

  it('raycasts both double-chest seam axes while preserving their outer gaps', () => {
    world = new VoxelWorld(97);
    const y = WORLD_HEIGHT - 2;
    const connections = new Map<string, { dx: number; dz: number }>([
      [`3,${y},-4`, { dx: 1, dz: 0 }],
      [`4,${y},-4`, { dx: -1, dz: 0 }],
      [`8,${y},2`, { dx: 0, dz: 1 }],
      [`8,${y},3`, { dx: 0, dz: -1 }]
    ]);
    for (const key of connections.keys()) {
      const [x, blockY, z] = key.split(',').map(Number) as [number, number, number];
      expect(world.setBlock(x, blockY, z, BlockId.Chest)).toBe(true);
    }
    world.setChestConnectionResolver((x, blockY, z) => connections.get(`${x},${blockY},${z}`));

    const xSeamHit = world.raycast(
      new Vector3(4, y + 0.5, -6),
      new Vector3(0, 0, 1),
      4
    );
    expect(xSeamHit?.id).toBe(BlockId.Chest);
    expect(xSeamHit?.block.toArray()).toEqual([4, y, -4]);
    expect(xSeamHit?.distance).toBeCloseTo(2 + 1 / 16, 8);

    const zSeamHit = world.raycast(
      new Vector3(6, y + 0.5, 3),
      new Vector3(1, 0, 0),
      4
    );
    expect(zSeamHit?.id).toBe(BlockId.Chest);
    expect(zSeamHit?.block.toArray()).toEqual([8, y, 3]);
    expect(zSeamHit?.distance).toBeCloseTo(2 + 1 / 16, 8);

    expect(world.raycast(
      new Vector3(3 + 1 / 32, y + 0.5, -6),
      new Vector3(0, 0, 1),
      4
    )).toBeNull();
    expect(world.raycast(
      new Vector3(6, y + 0.5, 2 + 1 / 32),
      new Vector3(1, 0, 0),
      4
    )).toBeNull();
  });

  it('continues DDA through the gap around a chest shape', () => {
    world = new VoxelWorld(93);
    const chest = new Vector3(3, WORLD_HEIGHT - 2, -4);
    const behind = chest.clone().add(new Vector3(0, 0, 1));
    expect(world.setBlock(chest.x, chest.y, chest.z, BlockId.Chest)).toBe(true);
    expect(world.setBlock(behind.x, behind.y, behind.z, BlockId.Cobblestone)).toBe(true);
    const origin = new Vector3(chest.x + 1 / 32, chest.y + 0.5, chest.z - 2);

    expect(world.raycast(origin, new Vector3(0, 0, 1), 2.5)).toBeNull();
    const hit = world.raycast(origin, new Vector3(0, 0, 1), 6);

    expect(hit?.id).toBe(BlockId.Cobblestone);
    expect(hit?.block.toArray()).toEqual(behind.toArray());
    expect(hit?.normal.toArray()).toEqual([0, 0, -1]);
    expect(hit?.distance).toBeCloseTo(3, 8);
  });

  it('keeps torch blocks selectable with the existing full-cell DDA hit', () => {
    world = new VoxelWorld(94);
    const target = new Vector3(3, WORLD_HEIGHT - 2, -4);
    expect(world.setBlock(target.x, target.y - 1, target.z, BlockId.Cobblestone)).toBe(true);
    expect(world.setBlock(target.x, target.y, target.z, BlockId.Torch)).toBe(true);

    const hit = world.raycast(
      new Vector3(target.x + 1 / 32, target.y + 0.9, target.z - 2),
      new Vector3(0, 0, 1),
      6
    );

    expect(hit?.id).toBe(BlockId.Torch);
    expect(hit?.block.toArray()).toEqual(target.toArray());
    expect(hit?.distance).toBeCloseTo(2, 8);
  });

  it('streams a bounded active window and crosses the former x=64 edge', () => {
    world = new VoxelWorld(101, 0, new Vector3(0.5, 40, 0.5));
    expect(world.getStreamingState()).toMatchObject({
      focus: { x: 0, z: 0 },
      anchor: { x: 0, z: 0 },
      visibleRadius: 0,
      loadedCount: 9,
      visibleCount: 1
    });
    expect(world.getBlock(64, 0, 0)).toBe(BlockId.Bedrock);

    world.setRenderDistance(0, new Vector3(64.5, 40, 0.5));
    const moved = world.getStreamingState();
    expect(moved.focus).toEqual({ x: 4, z: 0 });
    expect(moved.loadedCount).toBe(9);
    expect(moved.visibleKeys).toEqual(['4,0']);
    expect(moved.loadedKeys).toContain('4,0');
    expect(world.getBlock(64, 0, 0)).toBe(BlockId.Bedrock);

    world.setRenderDistance(0, new Vector3(-64.5, 40, 0.5));
    const movedNegative = world.getStreamingState();
    expect(movedNegative.focus).toEqual({ x: -5, z: 0 });
    expect(movedNegative.loadedCount).toBe(9);
    expect(movedNegative.visibleKeys).toEqual(['-5,0']);
    expect(world.getBlock(-65, 0, 0)).toBe(BlockId.Bedrock);
  });

  it('keeps arbitrary unloaded edits through unload and reload on both coordinate signs', () => {
    world = new VoxelWorld(102, 0);
    const edits = [
      [80, WORLD_HEIGHT - 2, 3],
      [-81, WORLD_HEIGHT - 2, -2]
    ] as const;

    for (const [x, y, z] of edits) {
      expect(world.getStreamingState().loadedKeys).not.toContain(`${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`);
      expect(world.setBlock(x, y, z, BlockId.Cobblestone)).toBe(true);
      expect(world.getBlock(x, y, z)).toBe(BlockId.Cobblestone);

      world.setRenderDistance(0, new Vector3(x + 0.5, y, z + 0.5));
      expect(world.getBlock(x, y, z)).toBe(BlockId.Cobblestone);
      expect(world.getStreamingState().loadedCount).toBe(9);

      world.setRenderDistance(0, new Vector3(0.5, y, 0.5));
      expect(world.getBlock(x, y, z)).toBe(BlockId.Cobblestone);
      expect(world.getStreamingState().loadedCount).toBe(9);
    }

    const saved = world.serializeEdits();
    world.loadEdits(saved);
    expect(world.getBlock(80, WORLD_HEIGHT - 2, 3)).toBe(BlockId.Cobblestone);
    expect(world.getBlock(-81, WORLD_HEIGHT - 2, -2)).toBe(BlockId.Cobblestone);
  });

  it('propagates torch light across a streamed chunk boundary and restores it after re-entry', () => {
    world = new VoxelWorld(103, 0, new Vector3(15.5, 40, 0.5));
    const y = WORLD_HEIGHT - 2;
    expect(world.setBlock(15, y - 1, 0, BlockId.Cobblestone)).toBe(true);
    expect(world.setBlock(15, y, 0, BlockId.Torch)).toBe(true);
    expect(world.getLightLevel(15, y, 0).block).toBe(14);
    expect(world.getLightLevel(16, y, 0).block).toBe(13);

    world.setRenderDistance(0, new Vector3(160.5, y, 0.5));
    expect(world.getLightLevel(15, y, 0).block).toBe(0);
    world.setRenderDistance(0, new Vector3(15.5, y, 0.5));
    expect(world.getLightLevel(15, y, 0).block).toBe(14);
    expect(world.getLightLevel(16, y, 0).block).toBe(13);
  });

  it('samples full-shape AO blockers across a chunk seam without treating glass as opaque', () => {
    world = new VoxelWorld(106, 1, new Vector3(15.5, 40, 0.5));
    const y = WORLD_HEIGHT - 4;
    expect(world.setBlock(15, y, 0, BlockId.Cobblestone)).toBe(true);
    const openFace = getTopFaceBrightness(world, 0, 0, 15, y, 0);
    expect(openFace.size).toBe(4);
    expect(new Set(openFace.values()).size).toBe(1);

    expect(world.setBlock(16, y + 1, 0, BlockId.Glass)).toBe(true);
    const besideGlass = getTopFaceBrightness(world, 0, 0, 15, y, 0);
    expect(new Set(besideGlass.values()).size).toBe(1);

    expect(world.setBlock(16, y + 1, 0, BlockId.Cobblestone)).toBe(true);
    const besideStone = getTopFaceBrightness(world, 0, 0, 15, y, 0);
    const openEdge = ((besideStone.get('15,0') ?? 0) + (besideStone.get('15,1') ?? 0)) / 2;
    const occludedEdge = ((besideStone.get('16,0') ?? 0) + (besideStone.get('16,1') ?? 0)) / 2;
    expect(occludedEdge).toBeLessThan(openEdge);
  });

  it('keeps loaded and visible counts stable over long-distance travel', () => {
    world = new VoxelWorld(104, 0);
    for (let chunkX = -4; chunkX <= 24; chunkX += 1) {
      world.setRenderDistance(0, new Vector3(chunkX * CHUNK_SIZE + 0.5, 40, -47.5));
      const state = world.getStreamingState();
      expect(state.loadedCount).toBe(9);
      expect(state.loadedKeys).toHaveLength(9);
      expect(state.visibleCount).toBe(1);
      expect(state.visibleKeys).toEqual([`${chunkX},-3`]);
    }
  });

  it('disposes every resident mesh and clears streaming state exactly once', () => {
    world = new VoxelWorld(105, 1);
    const meshes = world.children.filter((child): child is Mesh => child instanceof Mesh);
    expect(meshes.length).toBeGreaterThan(0);
    const disposeSpies = meshes.map((mesh) => vi.spyOn(mesh.geometry, 'dispose'));

    world.dispose();
    expect(world.children).toHaveLength(0);
    expect(world.getStreamingState()).toMatchObject({ loadedCount: 0, visibleCount: 0 });
    for (const spy of disposeSpies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
