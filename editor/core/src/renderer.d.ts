import type { CropViewMetrics, EditorState } from './types';
export declare class CanvasRenderer {
    private readonly canvas;
    private cropViewMetrics;
    constructor(canvas: HTMLCanvasElement);
    getCropViewMetrics(): CropViewMetrics | null;
    render(state: EditorState): void;
    private prepareCanvas;
    private drawBackground;
    private drawEmptyState;
    private renderCropMode;
    private drawHandles;
    private drawInfo;
    private fitRect;
    private toScreenRect;
}
