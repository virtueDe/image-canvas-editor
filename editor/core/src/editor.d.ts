import { type DraftStore } from './persistence';
import type { EditorState, FilterPreset } from './types';
export interface ImageCanvasEditorOptions {
    draftStore?: DraftStore;
}
export declare const createInitialEditorState: () => EditorState;
export declare class ImageCanvasEditor {
    private canvas;
    private renderer;
    private readonly draftStore;
    private readonly store;
    private cropInteraction;
    private resizeObserver;
    private readonly onWindowResize;
    private readonly onCanvasPointerDown;
    private readonly onCanvasPointerMove;
    private readonly stopCropInteraction;
    constructor(options?: ImageCanvasEditorOptions);
    mount(canvas: HTMLCanvasElement): void;
    unmount(): void;
    destroy(): void;
    subscribe(listener: (state: EditorState) => void): () => void;
    getState(): EditorState;
    loadFile(file: File): Promise<void>;
    resetEdits(): void;
    enterCropMode(): void;
    applyCrop(): void;
    cancelCrop(): void;
    resetCrop(): void;
    updateRotation(rotation: number): void;
    rotateBy(delta: number): void;
    toggleFlip(axis: 'flipX' | 'flipY'): void;
    updateAdjustment(key: 'contrast' | 'exposure' | 'highlights', value: number): void;
    applyPreset(preset: FilterPreset): void;
    zoomIn(): void;
    zoomOut(): void;
    resetViewport(): void;
    saveDraft(): boolean;
    restoreDraft(): Promise<void>;
    exportAsDataUrl(type?: string, quality?: number): string | null;
    getRenderFps(): number | null;
    getSuggestedFileName(extension?: string): string;
    private setState;
    private render;
}
