import * as THREE from 'three';
import { DEFAULT_CHEST_FACING, type ChestFacing } from './chest';
import {
  CHEST_BASE_HEIGHT,
  CHEST_BODY_DEPTH,
  CHEST_LATCH_DEPTH,
  CHEST_LATCH_HEIGHT,
  CHEST_LATCH_WIDTH,
  CHEST_LID_HEIGHT,
  CHEST_OPEN_ANGLE,
  CHEST_OPEN_DURATION,
  CHEST_TOTAL_HEIGHT
} from './chest-visual';

export const DOUBLE_CHEST_BODY_WIDTH = 30 / 16;
export const DOUBLE_CHEST_BODY_DEPTH = CHEST_BODY_DEPTH;
export const DOUBLE_CHEST_TOTAL_HEIGHT = CHEST_TOTAL_HEIGHT;
export const DOUBLE_CHEST_BASE_HEIGHT = CHEST_BASE_HEIGHT;
export const DOUBLE_CHEST_LID_HEIGHT = CHEST_LID_HEIGHT;
export const DOUBLE_CHEST_LATCH_WIDTH = CHEST_LATCH_WIDTH;
export const DOUBLE_CHEST_LATCH_HEIGHT = CHEST_LATCH_HEIGHT;
export const DOUBLE_CHEST_LATCH_DEPTH = CHEST_LATCH_DEPTH;
export const DOUBLE_CHEST_OPEN_DURATION = CHEST_OPEN_DURATION;
export const DOUBLE_CHEST_OPEN_ANGLE = CHEST_OPEN_ANGLE;

export interface DoubleChestVisualOptions {
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

type DoubleChestTexturePart = 'base' | 'lid' | 'latch';

/**
 * One continuous animated double-chest model. Local +Z is the front, local -X
 * is the player-facing left half, and the origin is centered between both
 * containing blocks at floor height.
 */
export class DoubleChestVisual extends THREE.Group {
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

  constructor(options: DoubleChestVisualOptions = {}) {
    super();
    this.name = 'Double chest visual';

    const baseMaterial = this.createOwnedMaterial(
      'Double chest base material',
      this.createOwnedTexture('base')
    );
    const lidMaterial = this.createOwnedMaterial(
      'Double chest lid material',
      this.createOwnedTexture('lid')
    );
    const latchMaterial = this.createOwnedMaterial(
      'Double chest latch material',
      this.createOwnedTexture('latch')
    );

    this.base = this.createPart(
      'Double chest base',
      [DOUBLE_CHEST_BODY_WIDTH, DOUBLE_CHEST_BASE_HEIGHT, DOUBLE_CHEST_BODY_DEPTH],
      baseMaterial
    );
    this.base.position.y = DOUBLE_CHEST_BASE_HEIGHT / 2;

    this.lidPivot.name = 'Double chest lid pivot';
    this.lidPivot.position.set(
      0,
      DOUBLE_CHEST_BASE_HEIGHT,
      -DOUBLE_CHEST_BODY_DEPTH / 2
    );

    this.lid = this.createPart(
      'Double chest lid',
      [DOUBLE_CHEST_BODY_WIDTH, DOUBLE_CHEST_LID_HEIGHT, DOUBLE_CHEST_BODY_DEPTH],
      lidMaterial
    );
    this.lid.position.set(
      0,
      DOUBLE_CHEST_LID_HEIGHT / 2,
      DOUBLE_CHEST_BODY_DEPTH / 2
    );

    this.latch = this.createPart(
      'Double chest latch',
      [DOUBLE_CHEST_LATCH_WIDTH, DOUBLE_CHEST_LATCH_HEIGHT, DOUBLE_CHEST_LATCH_DEPTH],
      latchMaterial
    );
    this.latch.position.set(
      0,
      0,
      DOUBLE_CHEST_BODY_DEPTH + DOUBLE_CHEST_LATCH_DEPTH / 2
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

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const target = this.targetOpen ? 1 : 0;
    const step = dt / DOUBLE_CHEST_OPEN_DURATION;
    if (this.currentOpenProgress < target) {
      this.currentOpenProgress = Math.min(target, this.currentOpenProgress + step);
    } else if (this.currentOpenProgress > target) {
      this.currentOpenProgress = Math.max(target, this.currentOpenProgress - step);
    }
    this.applyOpenPose();
  }

  setLighting(blockLight: number, skyLight: number, daylight = 1): void {
    const block = clampLight(blockLight);
    const sky = clampLight(skyLight) * THREE.MathUtils.clamp(finiteOr(daylight, 0), 0, 1);
    const brightness = 0.2 + Math.max(block, sky) / 15 * 0.8;
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
    this.lidPivot.rotation.x = eased === 0 ? 0 : -DOUBLE_CHEST_OPEN_ANGLE * eased;
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

  private createOwnedTexture(part: DoubleChestTexturePart): THREE.DataTexture {
    const texture = createDoubleChestPixelTexture(part);
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

function createDoubleChestPixelTexture(part: DoubleChestTexturePart): THREE.DataTexture {
  const width = part === 'latch' ? 16 : 32;
  const height = 16;
  const pixels = new Uint8Array(width * height * 4);
  const palette = part === 'latch'
    ? { base: [174, 146, 77], dark: [62, 53, 39], light: [239, 219, 146] }
    : part === 'lid'
      ? { base: [161, 104, 50], dark: [67, 38, 22], light: [211, 155, 75] }
      : { base: [140, 84, 41], dark: [55, 31, 19], light: [194, 131, 61] };
  const seed = part === 'base' ? 17 : part === 'lid' ? 37 : 59;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const noise = ((x * 11 + y * 23 + seed + x * y * 5) % 11) - 5;
      const color = palette.base.map((channel) =>
        THREE.MathUtils.clamp(channel + noise * 2, 0, 255)
      );
      writePixel(pixels, width, x, y, color);
    }
  }

  if (part === 'latch') {
    drawBorder(pixels, width, height, palette.dark, 2);
    fillRect(pixels, width, 5, 3, 6, 3, palette.light);
    fillRect(pixels, width, 6, 9, 4, 4, palette.dark);
    fillRect(pixels, width, 7, 9, 2, 2, palette.light);
  } else {
    drawBorder(pixels, width, height, palette.dark, 1);
    fillRect(pixels, width, 1, 5, width - 2, 1, palette.dark);
    fillRect(pixels, width, 1, 10, width - 2, 1, palette.dark);
    fillRect(pixels, width, 2, 2, width - 4, 1, palette.light);
    fillRect(pixels, width, 4, 7, 2, 2, palette.light);
    fillRect(pixels, width, width - 7, 12, 2, 2, palette.light);
    if (part === 'lid') {
      fillRect(pixels, width, 8, 1, 1, height - 2, palette.dark);
      fillRect(pixels, width, width - 9, 1, 1, height - 2, palette.dark);
    }
  }

  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.name = `Original procedural double chest ${part} pixels`;
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
  width: number,
  height: number,
  color: readonly number[],
  thickness: number
): void {
  fillRect(pixels, width, 0, 0, width, thickness, color);
  fillRect(pixels, width, 0, height - thickness, width, thickness, color);
  fillRect(pixels, width, 0, thickness, thickness, height - thickness * 2, color);
  fillRect(
    pixels,
    width,
    width - thickness,
    thickness,
    thickness,
    height - thickness * 2,
    color
  );
}

function fillRect(
  pixels: Uint8Array,
  textureWidth: number,
  startX: number,
  startY: number,
  width: number,
  height: number,
  color: readonly number[]
): void {
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) {
      writePixel(pixels, textureWidth, x, y, color);
    }
  }
}

function writePixel(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
  color: readonly number[]
): void {
  const offset = (y * width + x) * 4;
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
