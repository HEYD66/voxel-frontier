export interface VoxelAoVector {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface VoxelAoSample {
  readonly level: 0 | 1 | 2 | 3;
  readonly factor: number;
}

export type VoxelOcclusionQuery = (x: number, y: number, z: number) => boolean;

export const VOXEL_AO_FACTORS = Object.freeze([0.55, 0.7, 0.85, 1] as const);

export function calculateVoxelAoLevel(
  sideA: boolean,
  sideB: boolean,
  corner: boolean
): 0 | 1 | 2 | 3 {
  if (sideA && sideB) return 0;
  return (3 - Number(sideA) - Number(sideB) - Number(corner)) as 0 | 1 | 2 | 3;
}

export function getVoxelAoFactor(level: 0 | 1 | 2 | 3): number {
  return VOXEL_AO_FACTORS[level];
}

export function shouldFlipVoxelAoDiagonal(
  levels: readonly [number, number, number, number]
): boolean {
  return levels[0] + levels[2] > levels[1] + levels[3];
}

export function sampleVoxelVertexAo(
  blockX: number,
  blockY: number,
  blockZ: number,
  faceNormal: VoxelAoVector,
  corner: VoxelAoVector,
  isOccluding: VoxelOcclusionQuery
): VoxelAoSample {
  const tangentAxes = (['x', 'y', 'z'] as const).filter((axis) => faceNormal[axis] === 0);
  if (tangentAxes.length !== 2) return { level: 3, factor: getVoxelAoFactor(3) };

  const firstAxis = tangentAxes[0]!;
  const secondAxis = tangentAxes[1]!;
  const firstSign = corner[firstAxis] === 0 ? -1 : 1;
  const secondSign = corner[secondAxis] === 0 ? -1 : 1;
  const firstOffset = { x: 0, y: 0, z: 0 };
  const secondOffset = { x: 0, y: 0, z: 0 };
  firstOffset[firstAxis] = firstSign;
  secondOffset[secondAxis] = secondSign;
  const baseX = blockX + faceNormal.x;
  const baseY = blockY + faceNormal.y;
  const baseZ = blockZ + faceNormal.z;

  const sideA = isOccluding(
    baseX + firstOffset.x,
    baseY + firstOffset.y,
    baseZ + firstOffset.z
  );
  const sideB = isOccluding(
    baseX + secondOffset.x,
    baseY + secondOffset.y,
    baseZ + secondOffset.z
  );
  const diagonal = isOccluding(
    baseX + firstOffset.x + secondOffset.x,
    baseY + firstOffset.y + secondOffset.y,
    baseZ + firstOffset.z + secondOffset.z
  );
  const level = calculateVoxelAoLevel(sideA, sideB, diagonal);
  return { level, factor: getVoxelAoFactor(level) };
}
