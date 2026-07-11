import {
  Box3,
  DataTexture,
  MeshLambertMaterial,
  NearestFilter,
  Vector3
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHEST_FACING, type ChestFacing } from './chest';
import {
  CHEST_BASE_HEIGHT,
  CHEST_BODY_DEPTH,
  CHEST_BODY_WIDTH,
  CHEST_LATCH_DEPTH,
  CHEST_LATCH_HEIGHT,
  CHEST_LATCH_WIDTH,
  CHEST_LID_HEIGHT,
  CHEST_OPEN_ANGLE,
  CHEST_TOTAL_HEIGHT,
  ChestVisual
} from './chest-visual';

describe('ChestVisual', () => {
  it('uses original procedural pixel materials and exact single-chest proportions', () => {
    const chest = new ChestVisual();
    expect(chest.facing).toBe(DEFAULT_CHEST_FACING);

    expect(chest.base.geometry.parameters).toMatchObject({
      width: CHEST_BODY_WIDTH,
      height: CHEST_BASE_HEIGHT,
      depth: CHEST_BODY_DEPTH
    });
    expect(chest.lid.geometry.parameters).toMatchObject({
      width: CHEST_BODY_WIDTH,
      height: CHEST_LID_HEIGHT,
      depth: CHEST_BODY_DEPTH
    });
    expect(chest.latch.geometry.parameters).toMatchObject({
      width: CHEST_LATCH_WIDTH,
      height: CHEST_LATCH_HEIGHT,
      depth: CHEST_LATCH_DEPTH
    });
    expect(chest.lidPivot.position).toMatchObject({
      y: CHEST_BASE_HEIGHT,
      z: -CHEST_BODY_DEPTH / 2
    });

    chest.updateMatrixWorld(true);
    const bodyBounds = new Box3().setFromObject(chest.base)
      .union(new Box3().setFromObject(chest.lid));
    const bodySize = bodyBounds.getSize(new Vector3());
    expect(bodySize.x).toBeCloseTo(14 / 16, 6);
    expect(bodySize.z).toBeCloseTo(14 / 16, 6);
    expect(bodySize.y).toBeCloseTo(CHEST_TOTAL_HEIGHT, 6);

    for (const material of [chest.base.material, chest.lid.material, chest.latch.material]) {
      expect(material).toBeInstanceOf(MeshLambertMaterial);
      expect(material.map).toBeInstanceOf(DataTexture);
      expect(material.map?.name).toContain('Original procedural chest');
      expect(material.map?.magFilter).toBe(NearestFilter);
      expect(material.map?.minFilter).toBe(NearestFilter);
      expect(material.map?.generateMipmaps).toBe(false);
    }
    chest.dispose();
  });

  it('rotates its +Z local front toward all four cardinal facings', () => {
    const chest = new ChestVisual();
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
    }
    chest.dispose();
  });

  it('opens smoothly around the rear edge and returns exactly to closed', () => {
    const chest = new ChestVisual();
    chest.setOpen(true);
    chest.update(0.25);

    expect(chest.openProgress).toBeCloseTo(0.5, 8);
    expect(chest.lidPivot.rotation.x).toBeCloseTo(-CHEST_OPEN_ANGLE * 0.875, 8);
    expect(chest.lid.position.z).toBeCloseTo(CHEST_BODY_DEPTH / 2, 8);

    chest.update(0.25);
    expect(chest.openProgress).toBe(1);
    expect(chest.lidPivot.rotation.x).toBeCloseTo(-CHEST_OPEN_ANGLE, 8);

    chest.setOpen(false);
    chest.update(0.5);
    expect(chest.openProgress).toBe(0);
    expect(chest.lidPivot.rotation.x).toBe(0);
    chest.dispose();
  });

  it('updates voxel/daylight tint and disposes every owned resource once', () => {
    const chest = new ChestVisual();
    chest.setLighting(0, 0, 0);
    expect(chest.base.material.color.r).toBeCloseTo(0.2, 8);
    chest.setLighting(15, 0, 0);
    expect(chest.base.material.color.r).toBeCloseTo(1, 8);

    const geometries = [chest.base.geometry, chest.lid.geometry, chest.latch.geometry];
    const materials = [chest.base.material, chest.lid.material, chest.latch.material];
    const textures = materials.map((material) => material.map);
    const geometryDisposals = geometries.map((geometry) => vi.spyOn(geometry, 'dispose'));
    const materialDisposals = materials.map((material) => vi.spyOn(material, 'dispose'));
    const textureDisposals = textures.map((texture) => {
      if (!texture) throw new Error('Expected a procedural chest texture.');
      return vi.spyOn(texture, 'dispose');
    });

    chest.dispose();
    chest.dispose();

    for (const dispose of [
      ...geometryDisposals,
      ...materialDisposals,
      ...textureDisposals
    ]) {
      expect(dispose).toHaveBeenCalledTimes(1);
    }
    expect(chest.children).toHaveLength(0);
    expect(chest.lidPivot.children).toHaveLength(0);
  });
});
