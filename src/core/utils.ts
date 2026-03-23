import type { ImageResource, Rect } from './types';

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export const fullImageRect = (image: ImageResource): Rect => ({
  x: 0,
  y: 0,
  width: image.width,
  height: image.height,
});

export const normalizeRect = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  maxWidth: number,
  maxHeight: number,
  minSize = 8,
): Rect => {
  const left = clamp(Math.min(x1, x2), 0, maxWidth);
  const top = clamp(Math.min(y1, y2), 0, maxHeight);
  const right = clamp(Math.max(x1, x2), 0, maxWidth);
  const bottom = clamp(Math.max(y1, y2), 0, maxHeight);
  const width = Math.max(minSize, right - left);
  const height = Math.max(minSize, bottom - top);

  return {
    x: clamp(left, 0, Math.max(0, maxWidth - width)),
    y: clamp(top, 0, Math.max(0, maxHeight - height)),
    width: Math.min(width, maxWidth),
    height: Math.min(height, maxHeight),
  };
};

export const pointInRect = (x: number, y: number, rect: Rect): boolean =>
  x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

export const approximatelyFullRect = (rect: Rect, image: ImageResource): boolean => {
  const threshold = 1;
  return (
    Math.abs(rect.x) <= threshold &&
    Math.abs(rect.y) <= threshold &&
    Math.abs(rect.width - image.width) <= threshold &&
    Math.abs(rect.height - image.height) <= threshold
  );
};

export const createCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
};

export const loadImageFromDataUrl = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.src = dataUrl;
  });

export const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
