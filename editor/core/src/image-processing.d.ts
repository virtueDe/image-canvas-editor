import type { EditorState, Rect } from './types';
interface RenderOptions {
    maxDimension?: number;
}
export declare const createProcessedCanvas: (state: EditorState, options?: RenderOptions) => {
    canvas: HTMLCanvasElement;
    cropRect: Rect;
} | null;
export {};
