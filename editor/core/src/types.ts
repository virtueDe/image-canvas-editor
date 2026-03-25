export type FilterPreset = 'original' | 'mono' | 'warm' | 'cool' | 'vintage' | 'fade';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditorAdjustments {
  contrast: number;
  exposure: number;
  highlights: number;
}

export interface EditorTransform {
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

export interface EditorViewport {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export interface ImageResource {
  element: HTMLImageElement;
  width: number;
  height: number;
  name: string;
  dataUrl: string;
}

export interface EditorState {
  image: ImageResource | null;
  cropRect: Rect | null;
  draftCropRect: Rect | null;
  cropMode: boolean;
  adjustments: EditorAdjustments;
  transform: EditorTransform;
  viewport: EditorViewport;
  activePreset: FilterPreset;
}

export interface SerializableEditorState {
  image: Omit<ImageResource, 'element'> | null;
  cropRect: Rect | null;
  adjustments: EditorAdjustments;
  transform: EditorTransform;
  activePreset: FilterPreset;
}

export interface CropViewMetrics {
  displayX: number;
  displayY: number;
  displayWidth: number;
  displayHeight: number;
  sourceWidth: number;
  sourceHeight: number;
}

export interface PreviewViewMetrics {
  canvasWidth: number;
  canvasHeight: number;
  baseDisplayWidth: number;
  baseDisplayHeight: number;
  displayX: number;
  displayY: number;
  displayWidth: number;
  displayHeight: number;
}
