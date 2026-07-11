import { describe, expect, it } from 'vitest';
import { blockFullyOccludesNeighborFace } from './block-shapes';
import { BlockId } from './types';
import {
  VOXEL_AO_FACTORS,
  calculateVoxelAoLevel,
  sampleVoxelVertexAo,
  shouldFlipVoxelAoDiagonal
} from './voxel-ao';

describe('voxel vertex ambient occlusion', () => {
  it('assigns Minecraft-style levels for open, side, corner, and closed corners', () => {
    expect(calculateVoxelAoLevel(false, false, false)).toBe(3);
    expect(calculateVoxelAoLevel(true, false, false)).toBe(2);
    expect(calculateVoxelAoLevel(false, false, true)).toBe(2);
    expect(calculateVoxelAoLevel(true, false, true)).toBe(1);
    expect(calculateVoxelAoLevel(true, true, false)).toBe(0);
    expect(calculateVoxelAoLevel(true, true, true)).toBe(0);
    expect([...VOXEL_AO_FACTORS]).toEqual([0.55, 0.7, 0.85, 1]);
  });

  it('samples tangent neighbors across a positive chunk seam', () => {
    const queried: string[] = [];
    const occupied = new Set(['16,41,0']);
    const sample = sampleVoxelVertexAo(
      15,
      40,
      0,
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      (x, y, z) => {
        const key = `${x},${y},${z}`;
        queried.push(key);
        return occupied.has(key);
      }
    );

    expect(queried).toEqual(['16,41,0', '15,41,-1', '16,41,-1']);
    expect(sample).toEqual({ level: 2, factor: 0.85 });
  });

  it('keeps a flat continuous ground surface fully open above the face', () => {
    const ground = new Set([
      '14,40,0',
      '16,40,0',
      '15,40,-1',
      '15,40,1',
      '14,40,-1',
      '14,40,1',
      '16,40,-1',
      '16,40,1'
    ]);
    expect(sampleVoxelVertexAo(
      15,
      40,
      0,
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      (x, y, z) => ground.has(`${x},${y},${z}`)
    ).level).toBe(3);
  });

  it('darkens a top vertex enclosed by two blocks in the layer above', () => {
    const upperCorner = new Set(['16,41,0', '15,41,-1']);
    expect(sampleVoxelVertexAo(
      15,
      40,
      0,
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      (x, y, z) => upperCorner.has(`${x},${y},${z}`)
    )).toEqual({ level: 0, factor: 0.55 });
  });

  it('keeps transparent and incomplete shapes from acting as full AO blockers', () => {
    for (const id of [BlockId.Air, BlockId.Glass, BlockId.Leaves, BlockId.Water, BlockId.Torch, BlockId.Chest]) {
      const sample = sampleVoxelVertexAo(
        -1,
        20,
        -16,
        { x: 0, y: 0, z: -1 },
        { x: 1, y: 1, z: 0 },
        (x, y, z) => x === 0 && y === 20 && z === -17
          ? blockFullyOccludesNeighborFace(id)
          : false
      );
      expect(sample.level).toBe(3);
    }

    expect(sampleVoxelVertexAo(
      -1,
      20,
      -16,
      { x: 0, y: 0, z: -1 },
      { x: 1, y: 1, z: 0 },
      (x, y, z) => x === 0 && y === 20 && z === -17
    ).level).toBe(2);
  });

  it('flips only the quad diagonal favored by the brighter opposite corners', () => {
    expect(shouldFlipVoxelAoDiagonal([3, 1, 3, 1])).toBe(true);
    expect(shouldFlipVoxelAoDiagonal([1, 3, 1, 3])).toBe(false);
    expect(shouldFlipVoxelAoDiagonal([3, 2, 2, 3])).toBe(false);
  });
});
