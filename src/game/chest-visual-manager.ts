import * as THREE from 'three';
import {
  DEFAULT_CHEST_FACING,
  sanitizeChestFacing,
  type ChestFacing
} from './chest';
import { chestKey } from './chest-manager';
import { ChestVisual } from './chest-visual';

export interface ChestVisualLighting {
  blockLight: number;
  skyLight: number;
  daylight?: number;
}

/** Owns the animated chest models currently present in the rendered world. */
export class ChestVisualManager extends THREE.Group {
  private readonly visuals = new Map<string, ChestVisual>();
  private disposed = false;

  constructor() {
    super();
    this.name = 'Chest visuals';
  }

  get size(): number {
    return this.visuals.size;
  }

  upsert(
    x: number,
    y: number,
    z: number,
    facing: ChestFacing = DEFAULT_CHEST_FACING,
    lighting?: ChestVisualLighting
  ): ChestVisual {
    if (this.disposed) throw new Error('Cannot add a chest to a disposed visual manager.');
    const position = normalizePosition(x, y, z);
    const key = chestKey(...position);
    let visual = this.visuals.get(key);
    if (!visual) {
      visual = new ChestVisual({
        facing: sanitizeChestFacing(facing),
        ...lighting
      });
      this.visuals.set(key, visual);
      this.add(visual);
    } else {
      visual.setFacing(sanitizeChestFacing(facing));
      if (lighting) applyLighting(visual, lighting);
    }
    visual.position.set(position[0] + 0.5, position[1], position[2] + 0.5);
    return visual;
  }

  get(x: number, y: number, z: number): ChestVisual | null {
    return this.visuals.get(chestKey(...normalizePosition(x, y, z))) ?? null;
  }

  getByKey(key: string): ChestVisual | null {
    return this.visuals.get(key) ?? null;
  }

  setOpen(x: number, y: number, z: number, open: boolean): boolean {
    const visual = this.get(x, y, z);
    if (!visual) return false;
    visual.setOpen(open);
    return true;
  }

  setLighting(
    x: number,
    y: number,
    z: number,
    lighting: ChestVisualLighting
  ): boolean {
    const visual = this.get(x, y, z);
    if (!visual) return false;
    applyLighting(visual, lighting);
    return true;
  }

  removeChest(x: number, y: number, z: number): boolean {
    const key = chestKey(...normalizePosition(x, y, z));
    const visual = this.visuals.get(key);
    if (!visual) return false;
    this.visuals.delete(key);
    visual.dispose();
    return true;
  }

  update(dt: number): void {
    for (const visual of this.visuals.values()) visual.update(dt);
  }

  override clear(): this {
    for (const visual of this.visuals.values()) visual.dispose();
    this.visuals.clear();
    super.clear();
    return this;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeFromParent();
    this.clear();
  }
}

function applyLighting(visual: ChestVisual, lighting: ChestVisualLighting): void {
  visual.setLighting(lighting.blockLight, lighting.skyLight, lighting.daylight ?? 1);
}

function normalizePosition(x: number, y: number, z: number): [number, number, number] {
  return [Math.trunc(x), Math.trunc(y), Math.trunc(z)];
}
