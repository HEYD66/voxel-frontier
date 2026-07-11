import { describe, expect, it } from 'vitest';
import type { CanvasTexture } from 'three';
import {
  ProceduralWaterAnimator,
  WATER_ANIMATION_FRAME_COUNT,
  WATER_ANIMATION_TILE_SIZE,
  generateWaterAnimationFrame,
  getWaterAnimationFps,
  writeWaterFrameToAtlas
} from './water-animation';

const LAYOUT = Object.freeze({ columns: 8, rows: 5, tileSize: 16 });
const WATER_TILE = 11;

describe('procedural water animation frames', () => {
  it('is deterministic and wraps the frame sequence exactly', () => {
    expect(generateWaterAnimationFrame(7)).toEqual(generateWaterAnimationFrame(7));
    expect(generateWaterAnimationFrame(7 + WATER_ANIMATION_FRAME_COUNT)).toEqual(
      generateWaterAnimationFrame(7)
    );
    expect(generateWaterAnimationFrame(-1)).toEqual(
      generateWaterAnimationFrame(WATER_ANIMATION_FRAME_COUNT - 1)
    );
  });

  it('changes visibly between frames without a discontinuous loop seam', () => {
    const frames = Array.from(
      { length: WATER_ANIMATION_FRAME_COUNT },
      (_, frame) => generateWaterAnimationFrame(frame)
    );
    const differences = frames.map((frame, index) => meanPixelDifference(
      frame,
      frames[(index + 1) % WATER_ANIMATION_FRAME_COUNT]!
    ));
    const ordinaryAverage = differences.slice(0, -1).reduce((sum, value) => sum + value, 0)
      / (differences.length - 1);
    const changedPixels = countChangedPixels(frames[0]!, frames[1]!);

    expect(changedPixels).toBeGreaterThan(WATER_ANIMATION_TILE_SIZE * 8);
    expect(differences.at(-1)).toBeLessThanOrEqual(ordinaryAverage * 1.35);
  });

  it('keeps every pixel inside the intended translucent blue palette', () => {
    for (const frameIndex of [0, 5, 13, 23, 31]) {
      const frame = generateWaterAnimationFrame(frameIndex);
      expect(frame).toHaveLength(WATER_ANIMATION_TILE_SIZE * WATER_ANIMATION_TILE_SIZE * 4);
      for (let index = 0; index < frame.length; index += 4) {
        expect(frame[index]).toBeGreaterThanOrEqual(18);
        expect(frame[index]).toBeLessThanOrEqual(75);
        expect(frame[index + 1]).toBeGreaterThanOrEqual(85);
        expect(frame[index + 1]).toBeLessThanOrEqual(185);
        expect(frame[index + 2]).toBeGreaterThanOrEqual(135);
        expect(frame[index + 2]).toBeLessThanOrEqual(250);
        expect(frame[index + 3]).toBeGreaterThanOrEqual(160);
        expect(frame[index + 3]).toBeLessThanOrEqual(210);
      }
    }
  });

  it('writes only the water tile and leaves every other atlas byte unchanged', () => {
    const width = LAYOUT.columns * LAYOUT.tileSize;
    const height = LAYOUT.rows * LAYOUT.tileSize;
    const atlas = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < atlas.length; index += 1) atlas[index] = index % 251;
    const before = atlas.slice();
    const frame = generateWaterAnimationFrame(9);
    writeWaterFrameToAtlas(atlas, width, height, WATER_TILE, LAYOUT, frame);

    const originX = (WATER_TILE % LAYOUT.columns) * LAYOUT.tileSize;
    const originY = Math.floor(WATER_TILE / LAYOUT.columns) * LAYOUT.tileSize;
    let changedInside = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const inside = x >= originX && x < originX + LAYOUT.tileSize
          && y >= originY && y < originY + LAYOUT.tileSize;
        const atlasIndex = (x + y * width) * 4;
        const frameIndex = ((x - originX) + (y - originY) * LAYOUT.tileSize) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          if (inside) {
            expect(atlas[atlasIndex + channel]).toBe(frame[frameIndex + channel]);
            if (atlas[atlasIndex + channel] !== before[atlasIndex + channel]) changedInside += 1;
          } else {
            expect(atlas[atlasIndex + channel]).toBe(before[atlasIndex + channel]);
          }
        }
      }
    }
    expect(changedInside).toBeGreaterThan(500);
  });

  it('uses progressively lower update rates for balanced and fast quality', () => {
    expect(getWaterAnimationFps('fancy')).toBe(12);
    expect(getWaterAnimationFps('balanced')).toBe(8);
    expect(getWaterAnimationFps('fast')).toBe(4);
  });

  it('throttles canvas uploads and targets the water tile origin only', () => {
    const uploads: Array<{ x: number; y: number; pixels: Uint8ClampedArray }> = [];
    const context = {
      imageSmoothingEnabled: true,
      createImageData: (width: number, height: number) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4)
      }) as ImageData,
      putImageData: (imageData: ImageData, x: number, y: number) => {
        uploads.push({ x, y, pixels: imageData.data.slice() });
      }
    };
    const texture = {
      image: { getContext: () => context },
      needsUpdate: false
    } as unknown as CanvasTexture;
    const animator = new ProceduralWaterAnimator(texture, WATER_TILE, LAYOUT);

    expect(animator.update(0.124)).toBe(false);
    expect(uploads).toHaveLength(0);
    expect(animator.update(0.001)).toBe(true);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({ x: 48, y: 16 });
    expect(uploads[0]?.pixels).toEqual(generateWaterAnimationFrame(1));
  });
});

function countChangedPixels(first: Uint8ClampedArray, second: Uint8ClampedArray): number {
  let changed = 0;
  for (let index = 0; index < first.length; index += 4) {
    if (
      first[index] !== second[index] ||
      first[index + 1] !== second[index + 1] ||
      first[index + 2] !== second[index + 2] ||
      first[index + 3] !== second[index + 3]
    ) changed += 1;
  }
  return changed;
}

function meanPixelDifference(first: Uint8ClampedArray, second: Uint8ClampedArray): number {
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference += Math.abs((first[index] ?? 0) - (second[index] ?? 0));
  }
  return difference / first.length;
}
