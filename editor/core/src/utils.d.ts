import type { ImageResource, Rect } from './types';
export declare const clamp: (value: number, min: number, max: number) => number;
export declare const fullImageRect: (image: ImageResource) => Rect;
export declare const normalizeRect: (x1: number, y1: number, x2: number, y2: number, maxWidth: number, maxHeight: number, minSize?: number) => Rect;
export declare const pointInRect: (x: number, y: number, rect: Rect) => boolean;
export declare const approximatelyFullRect: (rect: Rect, image: ImageResource) => boolean;
export declare const createCanvas: (width: number, height: number) => HTMLCanvasElement;
export declare const loadImageFromDataUrl: (dataUrl: string) => Promise<HTMLImageElement>;
export declare const readFileAsDataUrl: (file: File) => Promise<string>;
