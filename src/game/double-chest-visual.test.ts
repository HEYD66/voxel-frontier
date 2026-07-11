import {
  Box3,
  DataTexture,
  Mesh,
  MeshLambertMaterial,
  NearestFilter,
  Vector3
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHEST_FACING, type ChestFacing } from './chest';
import {
  DOUBLE_CHEST_BASE_HEIGHT,
  DOUBLE_CHEST_BODY_DEPTH,
  DOUBLE_CHEST_BODY_WIDTH,
  DOUBLE_CHEST_LATCH_DEPTH,
  DOUBLE_CHEST_LATCH_HEIGHT,
  DOUBLE_CHEST_LATCH_WIDTH,
  DOUBLE_CHEST_LID_HEIGHT,
  DOUBLE_CHEST_OPEN_ANGLE,
  DOUBLE_CHEST_TOTAL_HEIGHT,
  DoubleChestVisual
} from './double-chest-visual';

describe('DoubleChestVisual', () => {
  it('is one continuous 30/16-wide body and lid with one centered latch', () => {
    const chest = new DoubleChestVisual();
    expect(chest.facing).toBe(DEFAULT_CHEST_FACING);
    expect(chest.base).toBeInstanceOf(Mesh);
    expect(chest.lid).toBeInstanceOf(Mesh);
    expect(chest.latch).toBeInstanceOf(Mesh);

    expect(chest.base.geometry.parameters).toMatchObject({
      width: DOUBLE_CHEST_BODY_WIDTH,
      height: DOUBLE_CHEST_BASE_HEIGHT,
      depth: DOUBLE_CHEST_BODY_DEPTH
    });
    expect(chest.lid.geometry.parameters).toMatchObject({
      width: DOUBLE_CHEST_BODY_WIDTH,
      height: DOUBLE_CHEST_LID_HEIGHT,
      depth: DOUBLE_CHEST_BODY_DEPTH
    });
    expect(chest.latch.geometry.parameters).toMatchObject({
      width: DOUBLE_CHEST_LATCH_WIDTH,
      height: DOUBLE_CHEST_LATCH_HEIGHT,
      depth: DOUBLE_CHEST_LATCH_DEPTH
    });
    expect(chest.latch.position.x).toBe(0);
    expect(chest.lidPivot.children).toEqual([chest.lid, chest.latch]);

    chest.rotation.y = 0;
    chest.updateMatrixWorld(true);
    const bodyBounds = new Box3().setFromObject(chest.base)
      .union(new Box3().setFromObject(chest.lid));
    const bodySize = bodyBounds.getSize(new Vector3());
    expect(bodySize.x).toBeCloseTo(30 / 16, 6);
    expect(bodySize.y).toBeCloseTo(DOUBLE_CHEST_TOTAL_HEIGHT, 6);
    expect(bodySize.z).toBeCloseTo(14 / 16, 6);

    for (const material of [chest.base.material, chest.lid.material, chest.latch.material]) {
      expect(material).toBeInstanceOf(MeshLambertMaterial);
      expect(material.map).toBeInstanceOf(DataTexture);
      expect(material.map?.name).toContain('Original procedural double chest');
      expect(material.map?.magFilter).toBe(NearestFilter);
      expect(material.map?.minFilter).toBe(NearestFilter);
      expect(material.map?.generateMipmaps).toBe(false);
    }
    const baseImage = chest.base.material.map?.image as { width: number };
    const lidImage = chest.lid.material.map?.image as { width: number };
    const latchImage = chest.latch.material.map?.image as { width: number };
    expect(baseImage.width).toBe(32);
    expect(lidImage.width).toBe(32);
    expect(latchImage.width).toBe(16);
    chest.dispose();
  });

  it('rotates the continuous width axis correctly for all four facings', () => {
    const chest = new DoubleChestVisual();
    const expectedYaw: Record<ChestFacing, number> = {
      north: Math.PI,
      east: Math.PI / 2,
      south: 0,
      west: -Math.PI / 2
    };

    for (const facing of Object.keys(expectedYaw) as ChestFacing[]) {
      chest.setFacing(facing);
      expect(chest.facing).toBe(facing);
      expect(chest.rotation.y).toBeCloseTo(expectedYaw[facing], 8);
      chest.updateMatrixWorld(true);
      const size = new Box3().setFromObject(chest.base).getSize(new Vector3());
      if (facing === 'north' || facing === 'south') {
        expect(size.x).toBeCloseTo(30 / 16, 6);
        expect(size.z).toBeCloseTo(14 / 16, 6);
      } else {
        expect(size.x).toBeCloseTo(14 / 16, 6);
        expect(size.z).toBeCloseTo(30 / 16, 6);
      }
    }
    chest.dispose();
  });

  it('opens one lid around the shared rear edge in exactly 0.5 seconds', () => {
    const chest = new DoubleChestVisual({ facing: 'south' });
    expect(chest.lidPivot.position).toMatchObject({
      y: DOUBLE_CHEST_BASE_HEIGHT,
      z: -DOUBLE_CHEST_BODY_DEPTH / 2
    });

    chest.setOpen(true);
    chest.update(0.25);
    expect(chest.openProgress).toBeCloseTo(0.5, 8);
    expect(chest.lidPivot.rotation.x).toBeCloseTo(-DOUBLE_CHEST_OPEN_ANGLE * 0.875, 8);
    chest.update(0.25);
    expect(chest.openProgress).toBe(1);
    expect(chest.lidPivot.rotation.x).toBeCloseTo(-DOUBLE_CHEST_OPEN_ANGLE, 8);

    chest.setOpen(false);
    chest.update(0.5);
    expect(chest.openProgress).toBe(0);
    expect(chest.lidPivot.rotation.x).toBe(0);
    chest.dispose();
  });

  it('applies voxel lighting and disposes every owned resource once', () => {
    const chest = new DoubleChestVisual();
    chest.setLighting(0, 0, 0);
    expect(chest.base.material.color.r).toBeCloseTo(0.2, 8);
    chest.setLighting(0, 15, 0.5);
    expect(chest.base.material.color.r).toBeCloseTo(0.6, 8);
    chest.setLighting(15, 0, 0);
    expect(chest.base.material.color.r).toBeCloseTo(1, 8);

    const geometries = [chest.base.geometry, chest.lid.geometry, chest.latch.geometry];
    const materials = [chest.base.material, chest.lid.material, chest.latch.material];
    const textures = materials.map((material) => material.map);
    const disposals = [
      ...geometries.map((geometry) => vi.spyOn(geometry, 'dispose')),
      ...materials.map((material) => vi.spyOn(material, 'dispose')),
      ...textures.map((texture) => {
        if (!texture) throw new Error('Expected a procedural double chest texture.');
        return vi.spyOn(texture, 'dispose');
      })
    ];

    chest.dispose();
    chest.dispose();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
    expect(chest.children).toHaveLength(0);
    expect(chest.lidPivot.children).toHaveLength(0);
  });
});
