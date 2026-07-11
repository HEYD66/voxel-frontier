import {
  FurnaceStateMachine,
  sanitizeFurnaceSnapshot,
  type FurnaceUpdateResult
} from './furnace';
import type { ItemStack } from './survival';
import type { WorldFurnaceSave } from './types';

export interface FurnaceManagerUpdate {
  key: string;
  furnace: FurnaceStateMachine;
  result: FurnaceUpdateResult;
}

export class FurnaceManager {
  private readonly furnaces = new Map<string, FurnaceStateMachine>();

  get size(): number {
    return this.furnaces.size;
  }

  getOrCreate(x: number, y: number, z: number): FurnaceStateMachine {
    const position = normalizePosition(x, y, z);
    const key = furnaceKey(...position);
    let furnace = this.furnaces.get(key);
    if (!furnace) {
      furnace = new FurnaceStateMachine();
      this.furnaces.set(key, furnace);
    }
    return furnace;
  }

  get(x: number, y: number, z: number): FurnaceStateMachine | null {
    return this.furnaces.get(furnaceKey(...normalizePosition(x, y, z))) ?? null;
  }

  getByKey(key: string): FurnaceStateMachine | null {
    return this.furnaces.get(key) ?? null;
  }

  remove(x: number, y: number, z: number): ItemStack[] {
    const key = furnaceKey(...normalizePosition(x, y, z));
    const furnace = this.furnaces.get(key);
    if (!furnace) return [];
    this.furnaces.delete(key);
    return furnace.takeAllContents();
  }

  update(deltaTime: number): FurnaceManagerUpdate[] {
    const updates: FurnaceManagerUpdate[] = [];
    for (const [key, furnace] of this.furnaces) {
      const result = furnace.update(deltaTime);
      if (result.changed) updates.push({ key, furnace, result });
    }
    return updates;
  }

  serialize(): WorldFurnaceSave[] {
    const saved: WorldFurnaceSave[] = [];
    for (const [key, furnace] of this.furnaces) {
      const position = parseFurnaceKey(key);
      if (!position) continue;
      saved.push({ position, state: furnace.getSnapshot() });
    }
    return saved;
  }

  load(
    saved: readonly WorldFurnaceSave[] | undefined,
    isFurnaceBlock: (x: number, y: number, z: number) => boolean
  ): void {
    this.furnaces.clear();
    if (!Array.isArray(saved)) return;

    for (const value of saved) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as Partial<WorldFurnaceSave>;
      const position = normalizeSavedPosition(entry.position);
      const state = sanitizeFurnaceSnapshot(entry.state);
      if (!position || !state) continue;
      if (!isFurnaceBlock(...position)) continue;
      const key = furnaceKey(...position);
      if (this.furnaces.has(key)) continue;
      this.furnaces.set(key, new FurnaceStateMachine(state));
    }
  }

  clear(): void {
    this.furnaces.clear();
  }
}

export function furnaceKey(x: number, y: number, z: number): string {
  return `${Math.trunc(x)},${Math.trunc(y)},${Math.trunc(z)}`;
}

function parseFurnaceKey(key: string): [number, number, number] | null {
  const parts = key.split(',').map(Number);
  if (parts.length !== 3 || !parts.every(Number.isInteger)) return null;
  return [parts[0]!, parts[1]!, parts[2]!];
}

function normalizePosition(x: number, y: number, z: number): [number, number, number] {
  return [Math.trunc(x), Math.trunc(y), Math.trunc(z)];
}

function normalizeSavedPosition(value: unknown): [number, number, number] | null {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
  ) {
    return null;
  }
  return normalizePosition(value[0], value[1], value[2]);
}
