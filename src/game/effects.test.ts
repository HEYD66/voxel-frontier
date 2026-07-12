import { Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { BlockParticles, HeldBlockView } from './effects';
import { ARMOR_ITEM_IDS, TOOL_ITEM_IDS } from './survival';
import { BlockId } from './types';

describe('BlockParticles', () => {
  it('spawns a complete explosion burst and removes it after its lifetime', () => {
    const particles = new BlockParticles();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    particles.spawnExplosion(new Vector3(2, 3, 4), 3);

    expect(particles.children).toHaveLength(54);
    expect(particles.children.every((child) => child instanceof Mesh)).toBe(true);
    expect(particles.children.some((child) => child.scale.x > 1)).toBe(true);
    particles.update(2);
    expect(particles.children).toHaveLength(0);

    random.mockRestore();
    particles.dispose();
  });
});

describe('HeldBlockView', () => {
  it('uses and releases a dedicated torch model instead of the block cube', () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.1, 100);
    const held = new HeldBlockView(camera);

    held.setItem(BlockId.Torch);
    const torch = held.mesh.getObjectByName('Held torch');
    expect(torch).toBeInstanceOf(Group);
    expect(held.mesh.material.visible).toBe(false);

    const parts: Mesh[] = [];
    torch?.traverse((object) => {
      if (object instanceof Mesh) parts.push(object);
    });
    expect(parts).toHaveLength(6);
    expect(parts.some((part) => (
      part.material instanceof MeshBasicMaterial && part.material.color.getHexString() === 'fff0a0'
    ))).toBe(true);

    held.setItem(BlockId.Torch);
    expect(held.mesh.getObjectByName('Held torch')).toBe(torch);

    const geometryDisposals = parts.map((part) => vi.spyOn(part.geometry, 'dispose'));
    const materialDisposals = parts.map((part) => {
      if (!(part.material instanceof MeshBasicMaterial)) throw new Error('Expected held torch material.');
      return vi.spyOn(part.material, 'dispose');
    });
    held.setItem(BlockId.Grass);

    expect(held.mesh.getObjectByName('Held torch')).toBeUndefined();
    expect(held.mesh.material.visible).toBe(true);
    for (const dispose of [...geometryDisposals, ...materialDisposals]) {
      expect(dispose).toHaveBeenCalledTimes(1);
    }
    held.dispose();
  });

  it('builds dedicated held models for diamond materials, tools, and armor', () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.1, 100);
    const held = new HeldBlockView(camera);
    const collectColors = (): Set<string> => {
      const colors = new Set<string>();
      held.mesh.traverse((object) => {
        if (object instanceof Mesh && object.material instanceof MeshBasicMaterial) {
          colors.add(object.material.color.getHexString());
        }
      });
      return colors;
    };

    held.setItem('diamond');
    expect(collectColors()).toContain('39c8c1');
    held.setItem(TOOL_ITEM_IDS.diamondPickaxe);
    expect(collectColors()).toContain('43cec6');
    held.setItem(ARMOR_ITEM_IDS.diamondHelmet);
    expect(collectColors()).toContain('42cfc6');
    expect(collectColors()).toContain('9af1e6');

    held.dispose();
  });

  it('uses dedicated beef, leather, and leather armor palettes', () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.1, 100);
    const held = new HeldBlockView(camera);
    const collectColors = (): Set<string> => {
      const colors = new Set<string>();
      held.mesh.traverse((object) => {
        if (object instanceof Mesh && object.material instanceof MeshBasicMaterial) {
          colors.add(object.material.color.getHexString());
        }
      });
      return colors;
    };

    held.setItem('raw_beef');
    expect(collectColors()).toContain('a84f4e');
    held.setItem('cooked_beef');
    expect(collectColors()).toContain('744027');
    held.setItem('leather');
    expect(collectColors()).toContain('8b572f');
    expect(collectColors()).toContain('bd7c4d');
    held.setItem(ARMOR_ITEM_IDS.leatherTunic);
    expect(collectColors()).toContain('8b572f');
    expect(collectColors()).toContain('c08452');

    held.dispose();
  });

  it('renders held gunpowder as a dedicated cluster of gray-black grains', () => {
    const camera = new PerspectiveCamera(75, 16 / 9, 0.1, 100);
    const held = new HeldBlockView(camera);

    held.setItem('gunpowder');
    const model = held.mesh.getObjectByName('Held gunpowder');
    expect(model).toBeInstanceOf(Group);
    const parts: Mesh[] = [];
    model?.traverse((object) => {
      if (object instanceof Mesh) parts.push(object);
    });
    expect(parts).toHaveLength(4);
    expect(new Set(parts.map((part) => (
      part.material instanceof MeshBasicMaterial ? part.material.color.getHexString() : ''
    )))).toEqual(new Set(['454640', '6b6a60', '292a27', '858277']));

    held.dispose();
  });
});
