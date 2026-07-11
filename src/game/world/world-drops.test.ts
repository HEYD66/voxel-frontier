import { Group, Mesh, MeshLambertMaterial, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ARMOR_ITEM_IDS, TOOL_ITEM_IDS, type ItemStack } from '../survival';
import { BlockId } from '../types';
import { WorldDropManager, type WorldDropPickupEvent } from '../world-drops';

describe('WorldDropManager', () => {
  it('creates distinct procedural visuals for blocks, materials, food, and tools', () => {
    const drops = new WorldDropManager();
    drops.spawn({ item: BlockId.Grass, count: 1 }, new Vector3());
    drops.spawn({ item: 'coal', count: 2 }, new Vector3(1, 0, 0));
    drops.spawn({ item: 'raw_pork', count: 1 }, new Vector3(2, 0, 0));
    drops.spawn({ item: TOOL_ITEM_IDS.ironPickaxe, count: 1, durability: 20 }, new Vector3(3, 0, 0));

    expect(drops.getSnapshots().map((drop) => drop.visualKind)).toEqual([
      'block',
      'material',
      'food',
      'tool'
    ]);
    expect(drops.children).toHaveLength(4);
    drops.dispose();
  });

  it('renders diamond resources, tools, and armor with their dedicated procedural palette', () => {
    const drops = new WorldDropManager();
    drops.spawn({ item: 'diamond', count: 1 }, new Vector3());
    drops.spawn(
      { item: TOOL_ITEM_IDS.diamondPickaxe, count: 1, durability: 1561 },
      new Vector3(1, 0, 0)
    );
    drops.spawn(
      { item: ARMOR_ITEM_IDS.diamondHelmet, count: 1, durability: 363 },
      new Vector3(2, 0, 0)
    );

    expect(drops.getSnapshots().map((drop) => drop.visualKind)).toEqual([
      'material',
      'tool',
      'armor'
    ]);
    const colors = new Set<string>();
    drops.traverse((object) => {
      if (!(object instanceof Mesh) || !(object.material instanceof MeshLambertMaterial)) return;
      colors.add(object.material.color.getHexString());
    });
    expect(colors.has('42cfc6')).toBe(true);
    expect(colors.has('9af1e6')).toBe(true);
    expect(colors.has('218f94')).toBe(true);
    drops.dispose();
  });

  it('renders beef, leather, and leather armor with dedicated procedural palettes', () => {
    const drops = new WorldDropManager();
    drops.spawn({ item: 'raw_beef', count: 1 }, new Vector3());
    drops.spawn({ item: 'cooked_beef', count: 1 }, new Vector3(1, 0, 0));
    drops.spawn({ item: 'leather', count: 1 }, new Vector3(2, 0, 0));
    drops.spawn(
      { item: ARMOR_ITEM_IDS.leatherTunic, count: 1, durability: 80 },
      new Vector3(3, 0, 0)
    );

    expect(drops.getSnapshots().map((drop) => drop.visualKind)).toEqual([
      'food',
      'food',
      'material',
      'armor'
    ]);
    const colors = new Set<string>();
    drops.traverse((object) => {
      if (!(object instanceof Mesh) || !(object.material instanceof MeshLambertMaterial)) return;
      colors.add(object.material.color.getHexString());
    });
    expect(colors).toEqual(expect.objectContaining(new Set([
      'a84f4e',
      '744027',
      '8b572f',
      'c08452',
      '5b351f'
    ])));
    drops.dispose();
  });

  it('uses shared torch parts with emissive flames instead of a block cube', () => {
    const drops = new WorldDropManager();
    drops.spawn({ item: BlockId.Torch, count: 1 }, new Vector3());

    const visual = drops.children[0]?.children[0];
    expect(visual).toBeInstanceOf(Group);
    const meshes: Mesh[] = [];
    visual?.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object);
    });
    expect(meshes).toHaveLength(4);

    const flame = visual?.getObjectByName('Dropped torch flame');
    expect(flame).toBeInstanceOf(Mesh);
    const flameMaterial = (flame as Mesh).material;
    expect(flameMaterial).toBeInstanceOf(MeshLambertMaterial);
    expect((flameMaterial as MeshLambertMaterial).emissive.getHex()).not.toBe(0);

    const geometryDisposals = [...new Set(meshes.map((mesh) => mesh.geometry))]
      .map((geometry) => vi.spyOn(geometry, 'dispose'));
    const materialDisposals = [...new Set(meshes.map((mesh) => mesh.material))]
      .map((material) => {
        if (!(material instanceof MeshLambertMaterial)) throw new Error('Expected torch drop material.');
        return vi.spyOn(material, 'dispose');
      });
    drops.dispose();
    for (const dispose of [...geometryDisposals, ...materialDisposals]) {
      expect(dispose).toHaveBeenCalledTimes(1);
    }
  });

  it('falls under gravity and stays on top of a solid block', () => {
    const drops = new WorldDropManager({
      isSolid: (_x, y) => y === 0
    });
    drops.spawn(
      { item: BlockId.Cobblestone, count: 1 },
      new Vector3(0.5, 3, 0.5),
      { velocity: new Vector3(), pickupDelay: 10 }
    );

    for (let frame = 0; frame < 180; frame += 1) {
      drops.update(1 / 60, new Vector3(100, 100, 100), (stack) => stack.count);
    }
    const snapshot = drops.getSnapshots()[0];
    expect(snapshot?.grounded).toBe(true);
    expect(snapshot?.position.y).toBeCloseTo(1.13, 2);
    expect(snapshot?.velocity.y).toBe(0);
    drops.dispose();
  });

  it('keeps the uncollected remainder and reports only the picked amount', () => {
    const events: WorldDropPickupEvent[] = [];
    const drops = new WorldDropManager({ onPickup: (event) => events.push(event) });
    drops.spawn(
      { item: BlockId.Dirt, count: 10 },
      new Vector3(0, 1, 0),
      { velocity: new Vector3(), pickupDelay: 0 }
    );

    drops.update(0.01, new Vector3(0, 1, 0), () => 4);
    expect(drops.getSnapshots()[0]?.stack).toEqual({ item: BlockId.Dirt, count: 4 });
    expect(events[0]?.picked).toEqual({ item: BlockId.Dirt, count: 6 });
    expect(events[0]?.remaining).toEqual({ item: BlockId.Dirt, count: 4 });

    drops.update(0.3, new Vector3(0, 1, 0), () => 0);
    expect(drops.size).toBe(0);
    expect(events[1]?.picked).toEqual({ item: BlockId.Dirt, count: 4 });
    drops.dispose();
  });

  it('retains a drop when the collector is full and despawns it after five minutes', () => {
    const drops = new WorldDropManager();
    const stack: ItemStack = { item: 'wool', count: 3 };
    drops.spawn(stack, new Vector3(), { velocity: new Vector3(), pickupDelay: 0 });
    drops.update(0.1, new Vector3(), (requested) => requested.count);
    expect(drops.getSnapshots()[0]?.stack).toEqual(stack);

    drops.update(300, new Vector3(100, 100, 100), () => 0);
    expect(drops.size).toBe(0);
    drops.dispose();
  });

  it('round-trips saved state with the remaining pickup delay and lifetime', () => {
    const isSolid = (_x: number, y: number): boolean => y === 0;
    const source = new WorldDropManager({ isSolid });
    source.spawn(
      { item: 'wool', count: 3 },
      new Vector3(2.5, 1.13, -1.5),
      { velocity: new Vector3(), pickupDelay: 3 }
    );
    source.update(1, new Vector3(100, 100, 100), () => 0);

    const saved = source.serialize();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.age).toBe(1);
    expect(saved[0]?.pickupDelay).toBe(2);

    const restored = new WorldDropManager({ isSolid });
    restored.loadSavedDrops(saved);
    expect(restored.serialize()).toEqual(saved);

    let pickupAttempts = 0;
    const pickupPosition = new Vector3(...saved[0]!.position);
    restored.update(1.9, pickupPosition, () => {
      pickupAttempts += 1;
      return 0;
    });
    expect(pickupAttempts).toBe(0);
    restored.update(0.11, pickupPosition, () => {
      pickupAttempts += 1;
      return 0;
    });
    expect(pickupAttempts).toBe(1);
    expect(restored.size).toBe(0);

    const lifetime = new WorldDropManager({ isSolid });
    lifetime.loadSavedDrops(saved);
    lifetime.update(298.9, new Vector3(100, 100, 100), () => 0);
    expect(lifetime.size).toBe(1);
    lifetime.update(0.2, new Vector3(100, 100, 100), () => 0);
    expect(lifetime.size).toBe(0);

    source.dispose();
    restored.dispose();
    lifetime.dispose();
  });

  it('merges nearby stackable items without exceeding their stack limit', () => {
    const drops = new WorldDropManager();
    const firstId = drops.spawn(
      { item: BlockId.Dirt, count: 40 },
      new Vector3(),
      { velocity: new Vector3(), pickupDelay: 0 }
    );
    const mergedId = drops.spawn(
      { item: BlockId.Dirt, count: 20 },
      new Vector3(0.5, 0, 0),
      { velocity: new Vector3(), pickupDelay: 0 }
    );

    expect(mergedId).toBe(firstId);
    expect(drops.size).toBe(1);
    expect(drops.getSnapshots()[0]?.stack).toEqual({ item: BlockId.Dirt, count: 60 });

    drops.spawn(
      { item: BlockId.Dirt, count: 10 },
      new Vector3(0.25, 0, 0),
      { velocity: new Vector3(), pickupDelay: 0 }
    );
    expect(drops.getSnapshots().map((drop) => drop.stack.count)).toEqual([64, 6]);

    drops.spawn(
      { item: BlockId.Dirt, count: 5 },
      new Vector3(2, 0, 0),
      { velocity: new Vector3(), pickupDelay: 0 }
    );
    expect(drops.size).toBe(3);
    drops.dispose();
  });
});
