import type * as THREE from 'three';

export const WATER_ANIMATION_TILE_SIZE = 16;
export const WATER_ANIMATION_FRAME_COUNT = 32;

export type WaterAnimationQuality = 'fast' | 'balanced' | 'fancy';

export interface WaterAtlasLayout {
  readonly columns: number;
  readonly rows: number;
  readonly tileSize: number;
}

interface CanvasImageDataContext {
  createImageData(width: number, height: number): ImageData;
  putImageData(imageData: ImageData, dx: number, dy: number): void;
}

interface CanvasImageSourceLike {
  getContext(
    contextId: '2d',
    options?: CanvasRenderingContext2DSettings
  ): (CanvasRenderingContext2D & CanvasImageDataContext) | null;
}

const WATER_ANIMATION_FPS: Readonly<Record<WaterAnimationQuality, number>> = Object.freeze({
  fast: 4,
  balanced: 8,
  fancy: 12
});

export function getWaterAnimationFps(quality: WaterAnimationQuality): number {
  return WATER_ANIMATION_FPS[quality];
}

export function generateWaterAnimationFrame(frameIndex: number): Uint8ClampedArray {
  const frame = positiveModulo(Math.floor(Number.isFinite(frameIndex) ? frameIndex : 0), WATER_ANIMATION_FRAME_COUNT);
  const phase = frame / WATER_ANIMATION_FRAME_COUNT * Math.PI * 2;
  const pixels = new Uint8ClampedArray(
    WATER_ANIMATION_TILE_SIZE * WATER_ANIMATION_TILE_SIZE * 4
  );

  for (let y = 0; y < WATER_ANIMATION_TILE_SIZE; y += 1) {
    for (let x = 0; x < WATER_ANIMATION_TILE_SIZE; x += 1) {
      const scrollA = positiveModulo(y + frame, WATER_ANIMATION_TILE_SIZE);
      const scrollB = positiveModulo(x - Math.floor(frame / 2), WATER_ANIMATION_TILE_SIZE);
      const coarse = (pixelHash(x, scrollA, 701) % 17) - 8;
      const fine = (pixelHash(scrollB, y, 719) % 9) - 4;
      const waveA = Math.sin(x * 0.74 + y * 0.39 + phase * 3);
      const waveB = Math.sin(x * 0.28 - y * 0.67 - phase * 2);
      const shimmerX = positiveModulo(x + frame, WATER_ANIMATION_TILE_SIZE);
      const shimmerY = positiveModulo(y - frame, WATER_ANIMATION_TILE_SIZE);
      const crest = waveA + waveB > 1.08 && pixelHash(shimmerX, shimmerY, 743) % 5 !== 0;
      const deep = waveA + waveB < -1.05;
      const shimmer = crest ? 1 : pixelHash(shimmerX, shimmerY, 761) % 29 === 0 ? 0.45 : 0;
      const index = (x + y * WATER_ANIMATION_TILE_SIZE) * 4;

      pixels[index] = clampByte(36 + coarse + fine + shimmer * 19 - (deep ? 5 : 0));
      pixels[index + 1] = clampByte(119 + coarse * 2 + fine + shimmer * 38 - (deep ? 9 : 0));
      pixels[index + 2] = clampByte(174 + coarse * 2 + fine * 2 + shimmer * 48 - (deep ? 7 : 0));
      pixels[index + 3] = clampByte(166 + (pixelHash(scrollB, scrollA, 787) % 19) + shimmer * 20);
    }
  }
  return pixels;
}

export function writeWaterFrameToAtlas(
  atlasPixels: Uint8ClampedArray,
  atlasWidth: number,
  atlasHeight: number,
  tileIndex: number,
  layout: WaterAtlasLayout,
  framePixels: Uint8ClampedArray
): void {
  const width = Math.floor(atlasWidth);
  const height = Math.floor(atlasHeight);
  const tileSize = Math.floor(layout.tileSize);
  const columns = Math.floor(layout.columns);
  if (
    width <= 0 || height <= 0 || tileSize <= 0 || columns <= 0 ||
    atlasPixels.length < width * height * 4 ||
    framePixels.length !== tileSize * tileSize * 4
  ) {
    throw new RangeError('Invalid atlas or water-frame dimensions.');
  }
  const safeTile = Math.max(0, Math.floor(tileIndex));
  const originX = (safeTile % columns) * tileSize;
  const originY = Math.floor(safeTile / columns) * tileSize;
  if (originX + tileSize > width || originY + tileSize > height) {
    throw new RangeError('Water tile lies outside the atlas.');
  }

  for (let y = 0; y < tileSize; y += 1) {
    const sourceStart = y * tileSize * 4;
    const targetStart = ((originY + y) * width + originX) * 4;
    atlasPixels.set(framePixels.subarray(sourceStart, sourceStart + tileSize * 4), targetStart);
  }
}

export class ProceduralWaterAnimator {
  private elapsed = 0;
  private frame = 0;
  private quality: WaterAnimationQuality = 'balanced';
  private context: (CanvasRenderingContext2D & CanvasImageDataContext) | null = null;
  private imageData: ImageData | null = null;

  constructor(
    private readonly texture: THREE.CanvasTexture,
    private readonly tileIndex: number,
    private readonly layout: WaterAtlasLayout
  ) {}

  setQuality(quality: WaterAnimationQuality): void {
    this.quality = quality;
    const frameDuration = 1 / getWaterAnimationFps(quality);
    this.elapsed = Math.min(this.elapsed, frameDuration);
  }

  update(deltaTime: number): boolean {
    const dt = Math.max(0, Math.min(0.25, Number.isFinite(deltaTime) ? deltaTime : 0));
    this.elapsed += dt;
    const frameDuration = 1 / getWaterAnimationFps(this.quality);
    if (this.elapsed < frameDuration) return false;
    const elapsedFrames = Math.max(1, Math.floor(this.elapsed / frameDuration));
    this.elapsed -= elapsedFrames * frameDuration;
    this.frame = (this.frame + elapsedFrames) % WATER_ANIMATION_FRAME_COUNT;
    return this.renderFrame(this.frame);
  }

  private renderFrame(frame: number): boolean {
    const context = this.getContext();
    if (!context) return false;
    if (!this.imageData) {
      this.imageData = context.createImageData(this.layout.tileSize, this.layout.tileSize);
    }
    this.imageData.data.set(generateWaterAnimationFrame(frame));
    const originX = (this.tileIndex % this.layout.columns) * this.layout.tileSize;
    const originY = Math.floor(this.tileIndex / this.layout.columns) * this.layout.tileSize;
    context.putImageData(this.imageData, originX, originY);
    this.texture.needsUpdate = true;
    return true;
  }

  private getContext(): (CanvasRenderingContext2D & CanvasImageDataContext) | null {
    if (this.context) return this.context;
    const image = this.texture.image as CanvasImageSourceLike | undefined;
    const context = image?.getContext?.('2d', { alpha: true }) ?? null;
    if (!context || typeof context.createImageData !== 'function' || typeof context.putImageData !== 'function') {
      return null;
    }
    context.imageSmoothingEnabled = false;
    this.context = context;
    return context;
  }
}

function pixelHash(x: number, y: number, salt: number): number {
  let value = Math.imul(x + 53, 0x45d9f3b) ^ Math.imul(y + 97, 0x119de1f3) ^ Math.imul(salt + 29, 0x3449f5);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
