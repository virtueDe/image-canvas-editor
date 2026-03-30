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

export interface TextItem {
  id: string;
  content: string;
  xRatio: number;
  yRatio: number;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
}

export type TextToolState =
  | { mode: 'idle'; hoverTextId: string | null }
  | { mode: 'inserting' }
  | {
      mode: 'editing';
      textId: string;
      caretIndex: number;
      selectionStart: number;
      selectionEnd: number;
      composing: boolean;
    }
  | {
      mode: 'dragging';
      textId: string;
      startClientX: number;
      startClientY: number;
      originXRatio: number;
      originYRatio: number;
    };

export interface TextOverlay {
  text: string;
  xRatio: number;
  yRatio: number;
  fontSize: number;
  color: string;
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
  texts: TextItem[];
  activeTextId: string | null;
  textToolState: TextToolState;
  adjustments: EditorAdjustments;
  transform: EditorTransform;
  viewport: EditorViewport;
  activePreset: FilterPreset;
}

export interface SerializableEditorState {
  schemaVersion: number;
  image: Omit<ImageResource, 'element'> | null;
  cropRect: Rect | null;
  texts: TextItem[];
  activeTextId: string | null;
  textToolState: TextToolState;
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
  sourceWidth: number;
  sourceHeight: number;
  baseDisplayWidth: number;
  baseDisplayHeight: number;
  displayX: number;
  displayY: number;
  displayWidth: number;
  displayHeight: number;
}

export interface TextOverlayScreenRect extends Rect {
  widthRatio: number;
  heightRatio: number;
}
