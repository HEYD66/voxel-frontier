import * as THREE from 'three';
import { DEFAULT_CHEST_FACING, type ChestFacing } from './chest';

export type { ChestFacing } from './chest';

export const CHEST_BODY_WIDTH = 14 / 16;
export const CHEST_BODY_DEPTH = 14 / 16;
export const CHEST_TOTAL_HEIGHT = 14 / 16;
export const CHEST_BASE_HEIGHT = 10 / 16;
export const CHEST_LID_HEIGHT = CHEST_TOTAL_HEIGHT - CHEST_BASE_HEIGHT;
export const CHEST_LATCH_WIDTH = 2 / 16;
export const CHEST_LATCH_HEIGHT = 4 / 16;
export const CHEST_LATCH_DEPTH = 1 / 16;
export const CHEST_OPEN_DURATION = 0.5;
export const CHEST_OPEN_ANGLE = Math.PI / 2;

export interface ChestVisualOptions {
  facing?: ChestFacing;
  blockLight?: number;
  skyLight?: number;
  daylight?: number;
}

const FACING_YAW: Readonly<Record<ChestFacing, number>> = Object.freeze({
  north: Math.PI,
  east: Math.PI / 2,
  south: 0,
  west: -Math.PI / 2
});

type ChestTexturePart = 'base' | 'lid' | 'latch';

/**
 * Standalone animated single-chest model. Its local front points toward +Z and
 * the group's origin is centered on the bottom of the containing block.
 */
export class ChestVisual extends THREE.Group {
  readonly base: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;
  readonly lidPivot = new THREE.Group();
  readonly lid: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;
  readonly latch: THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;

  private readonly ownedGeometries: THREE.BoxGeometry[] = [];
  private readonly ownedMaterials: THREE.MeshLambertMaterial[] = [];
  private readonly ownedTextures: THREE.DataTexture[] = [];
  private targetOpen = false;
  private currentOpenProgress = 0;
  private currentFacing: ChestFacing;
  private disposed = false;

  constructor(options: ChestVisualOptions = {}) {
    super();
    this.name = 'Chest visual';

    const baseTexture = this.createOwnedTexture('base');
    const lidTexture = this.createOwnedTexture('lid');
    const latchTexture = this.createOwnedTexture('latch');
    const baseMaterial = this.createOwnedMaterial('Chest base material', baseTexture);
    const lidMaterial = this.createOwnedMaterial('Chest lid material', lidTexture);
    const latchMaterial = this.createOwnedMaterial('Chest latch material', latchTexture);

    this.base = this.createPart(
      'Chest base',
      [CHEST_BODY_WIDTH, CHEST_BASE_HEIGHT, CHEST_BODY_DEPTH],
      baseMaterial
    );
    this.base.position.y = CHEST_BASE_HEIGHT / 2;

    this.lidPivot.name = 'Chest lid pivot';
    this.lidPivot.position.set(0, CHEST_BASE_HEIGHT, -CHEST_BODY_DEPTH / 2);

    this.lid = this.createPart(
      'Chest lid',
      [CHEST_BODY_WIDTH, CHEST_LID_HEIGHT, CHEST_BODY_DEPTH],
      lidMaterial
    );
    this.lid.position.set(0, CHEST_LID_HEIGHT / 2, CHEST_BODY_DEPTH / 2);

    this.latch = this.createPart(
      'Chest latch',
      [CHEST_LATCH_WIDTH, CHEST_LATCH_HEIGHT, CHEST_LATCH_DEPTH],
      latchMaterial
    );
    this.latch.position.set(
      0,
      0,
      CHEST_BODY_DEPTH + CHEST_LATCH_DEPTH / 2
    );

    this.lidPivot.add(this.lid, this.latch);
    this.add(this.base, this.lidPivot);

    this.currentFacing = options.facing ?? DEFAULT_CHEST_FACING;
    this.setFacing(this.currentFacing);
    this.setLighting(
      options.blockLight ?? 15,
      options.skyLight ?? 15,
      options.daylight ?? 1
    );
    this.applyOpenPose();
  }

  get facing(): ChestFacing {
    return this.currentFacing;
  }

  get openProgress(): number {
    return this.currentOpenProgress;
  }

  setFacing(facing: ChestFacing): void {
    this.currentFacing = facing;
    this.rotation.y = FACING_YAW[facing];
  }

  setOpen(open: boolean): void {
    this.targetOpen = open;
  }

  /** Advances the lid animation. A full open or close takes about ten game ticks. */
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const target = this.targetOpen ? 1 : 0;
    const step = dt / CHEST_OPEN_DURATION;
    if (this.currentOpenProgress < target) {
      this.currentOpenProgress = Math.min(target, this.currentOpenProgress + step);
    } else if (this.currentOpenProgress > target) {
      this.currentOpenProgress = Math.max(target, this.currentOpenProgress - step);
    }
    this.applyOpenPose();
  }

  /**
   * Applies voxel-style light to the texture tint. Levels are in the usual
   * 0..15 range and daylight is a normalized 0..1 sky-light multiplier.
   */
  setLighting(blockLight: number, skyLight: number, daylight = 1): void {
    const block = clampLight(blockLight);
    const sky = clampLight(skyLight) * THREE.MathUtils.clamp(finiteOr(daylight, 0), 0, 1);
    const effectiveLight = Math.max(block, sky) / 15;
    const brightness = 0.2 + effectiveLight * 0.8;
    for (const material of this.ownedMaterials) {
      material.color.setRGB(brightness, brightness, brightness);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.removeFromParent();
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    for (const texture of this.ownedTextures) texture.dispose();
    this.ownedGeometries.length = 0;
    this.ownedMaterials.length = 0;
    this.ownedTextures.length = 0;
    this.lidPivot.clear();
    this.clear();
  }

  private applyOpenPose(): void {
    const remaining = 1 - this.currentOpenProgress;
    const eased = 1 - remaining * remaining * remaining;
    this.lidPivot.rotation.x = eased === 0 ? 0 : -CHEST_OPEN_ANGLE * eased;
  }

  private createPart(
    name: string,
    size: readonly [number, number, number],
    material: THREE.MeshLambertMaterial
  ): THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial> {
    const geometry = new THREE.BoxGeometry(...size);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.ownedGeometries.push(geometry);
    return mesh;
  }

  private createOwnedTexture(part: ChestTexturePart): THREE.DataTexture {
    const texture = createChestPixelTexture(part);
    this.ownedTextures.push(texture);
    return texture;
  }

  private createOwnedMaterial(
    name: string,
    texture: THREE.DataTexture
  ): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({
      map: texture,
      color: '#ffffff',
      alphaTest: 0.01
    });
    material.name = name;
    this.ownedMaterials.push(material);
    return material;
  }
}

function createChestPixelTexture(part: ChestTexturePart): THREE.DataTexture {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  const palette = part === 'latch'
    ? { base: [171, 142, 72], dark: [67, 58, 43], light: [234, 213, 139] }
    : part === 'lid'
      ? { base: [158, 102, 48], dark: [68, 39, 23], light: [206, 151, 72] }
      : { base: [137, 82, 39], dark: [57, 32, 20], light: [188, 126, 58] };
  const seed = part === 'base' ? 11 : part === 'lid' ? 29 : 47;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const noise = ((x * 13 + y * 19 + seed + x * y * 3) % 9) - 4;
      const color = palette.base.map((channel) => THREE.MathUtils.clamp(channel + noise * 2, 0, 255));
      writePixel(pixels, size, x, y, color);
    }
  }

  if (part === 'latch') {
    drawBorder(pixels, size, palette.dark, 2);
    fillRect(pixels, size, 5, 3, 6, 3, palette.light);
    fillRect(pixels, size, 6, 9, 4, 4, palette.dark);
    fillRect(pixels, size, 7, 9, 2, 2, palette.light);
  } else {
    drawBorder(pixels, size, palette.dark, 1);
    fillRect(pixels, size, 1, 5, 14, 1, palette.dark);
    fillRect(pixels, size, 1, 10, 14, 1, palette.dark);
    fillRect(pixels, size, 2, 2, 12, 1, palette.light);
    fillRect(pixels, size, 3, 7, 2, 2, palette.light);
    fillRect(pixels, size, 11, 12, 2, 2, palette.light);
    if (part === 'lid') {
      fillRect(pixels, size, 7, 1, 2, 14, palette.dark);
    }
  }

  const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  texture.name = `Original procedural chest ${part} pixels`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function drawBorder(
  pixels: Uint8Array,
  size: number,
  color: readonly number[],
  thickness: number
): void {
  fillRect(pixels, size, 0, 0, size, thickness, color);
  fillRect(pixels, size, 0, size - thickness, size, thickness, color);
  fillRect(pixels, size, 0, thickness, thickness, size - thickness * 2, color);
  fillRect(pixels, size, size - thickness, thickness, thickness, size - thickness * 2, color);
}

function fillRect(
  pixels: Uint8Array,
  size: number,
  startX: number,
  startY: number,
  width: number,
  height: number,
  color: readonly number[]
): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      writePixel(pixels, size, x, y, color);
    }
  }
}

function writePixel(
  pixels: Uint8Array,
  size: number,
  x: number,
  y: number,
  color: readonly number[]
): void {
  const offset = (y * size + x) * 4;
  pixels[offset] = color[0] ?? 0;
  pixels[offset + 1] = color[1] ?? 0;
  pixels[offset + 2] = color[2] ?? 0;
  pixels[offset + 3] = 255;
}

function clampLight(value: number): number {
  return THREE.MathUtils.clamp(finiteOr(value, 0), 0, 15);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}
