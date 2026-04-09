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

export type EditorCanvasTool = 'navigate' | 'text' | 'brush';

export type BrushType = 'pencil' | 'brush' | 'pen' | 'eraser';

export interface BrushStrokePoint {
  xRatio: number;
  yRatio: number;
}

export interface BrushCursor {
  xRatio: number;
  yRatio: number;
}

export interface BrushStroke {
  id: string;
  type: BrushType;
  color: string;
  size: number;
  hardness: number;
  points: BrushStrokePoint[];
}

export interface BrushSettings {
  type: BrushType;
  color: string;
  size: number;
  hardness: number;
}

export type BrushToolState =
  | { mode: 'idle' }
  | {
      mode: 'drawing';
      strokeId: string;
    };

export interface TextItem {
  id: string;
  content: string;
  xRatio: number;
  yRatio: number;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  rotation: number;
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
    }
  | {
      mode: 'rotating';
      textId: string;
      startClientX: number;
      startClientY: number;
      originRotation: number;
      anchorX: number;
      anchorY: number;
    };

export interface TextOverlay {
  text: string;
  xRatio: number;
  yRatio: number;
  fontSize: number;
  color: string;
  rotation: number;
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
  activeTool?: EditorCanvasTool;
  textOverlay: TextOverlay | null;
  texts?: TextItem[];
  activeTextId?: string | null;
  textToolState?: TextToolState;
  brush?: BrushSettings;
  brushStrokes?: BrushStroke[];
  brushToolState?: BrushToolState;
  brushCursor?: BrushCursor | null;
  adjustments: EditorAdjustments;
  transform: EditorTransform;
  viewport: EditorViewport;
  activePreset: FilterPreset;
}

export interface SerializableEditorState {
  schemaVersion: number;
  image: Omit<ImageResource, 'element'> | null;
  cropRect: Rect | null;
  activeTool: EditorCanvasTool;
  textOverlay?: TextOverlay | null;
  texts: TextItem[];
  activeTextId: string | null;
  textToolState: TextToolState;
  brush: BrushSettings;
  brushStrokes: BrushStroke[];
  brushToolState: BrushToolState;
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

type LegacyTextOverlay = Omit<TextOverlay, 'rotation'> & {
  rotation?: number;
};

type TextStateCarrier = {
  textOverlay?: LegacyTextOverlay | null;
  texts?: TextItem[];
  activeTextId?: string | null;
  textToolState?: TextToolState;
};

export interface NormalizedTextState {
  textOverlay: TextOverlay | null;
  texts: TextItem[];
  activeTextId: string | null;
  textToolState: TextToolState;
}

const clampNumber = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const BRUSH_SIZE_MIN = 1;
export const BRUSH_SIZE_MAX = 160;
export const BRUSH_HARDNESS_MIN = 0;
export const BRUSH_HARDNESS_MAX = 1;

export const createDefaultBrushSettings = (): BrushSettings => ({
  type: 'brush',
  color: '#E9C083',
  size: 24,
  hardness: 0.68,
});

export const createIdleBrushToolState = (): BrushToolState => ({
  mode: 'idle',
});

export const cloneBrushToolState = (brushToolState: BrushToolState): BrushToolState => ({
  ...brushToolState,
});

export const normalizeBrushSettings = (brush: BrushSettings | null | undefined): BrushSettings => {
  const defaults = createDefaultBrushSettings();

  if (!brush) {
    return defaults;
  }

  return {
    type: brush.type,
    color: brush.color,
    size: Math.round(clampNumber(brush.size, BRUSH_SIZE_MIN, BRUSH_SIZE_MAX)),
    hardness: Math.round(clampNumber(brush.hardness, BRUSH_HARDNESS_MIN, BRUSH_HARDNESS_MAX) * 100) / 100,
  };
};

const normalizeBrushStrokePoint = (point: BrushStrokePoint): BrushStrokePoint => ({
  xRatio: clampNumber(point.xRatio, 0, 1),
  yRatio: clampNumber(point.yRatio, 0, 1),
});

const normalizeBrushStroke = (stroke: BrushStroke): BrushStroke => {
  const brushSettings = normalizeBrushSettings(stroke);

  return {
    id: stroke.id,
    type: brushSettings.type,
    color: brushSettings.color,
    size: brushSettings.size,
    hardness: brushSettings.hardness,
    points: stroke.points.map((point) => normalizeBrushStrokePoint(point)),
  };
};

export const cloneBrushStrokes = (brushStrokes: BrushStroke[]): BrushStroke[] =>
  brushStrokes.map((stroke) => ({
    ...normalizeBrushStroke(stroke),
    points: stroke.points.map((point) => normalizeBrushStrokePoint(point)),
  }));

export const normalizeBrushToolState = (
  brushToolState: BrushToolState | null | undefined,
  brushStrokes: BrushStroke[],
): BrushToolState => {
  if (!brushToolState) {
    return createIdleBrushToolState();
  }

  if (brushToolState.mode !== 'drawing') {
    return createIdleBrushToolState();
  }

  return brushStrokes.some((stroke) => stroke.id === brushToolState.strokeId)
    ? cloneBrushToolState(brushToolState)
    : createIdleBrushToolState();
};

const DEFAULT_LEGACY_TEXT_ID = 'legacy-text-1';

export const createIdleTextToolState = (): TextToolState => ({
  mode: 'idle',
  hoverTextId: null,
});

export const textOverlayToTextItem = (
  textOverlay: LegacyTextOverlay,
  id = DEFAULT_LEGACY_TEXT_ID,
): TextItem => ({
  id,
  content: textOverlay.text,
  xRatio: textOverlay.xRatio,
  yRatio: textOverlay.yRatio,
  fontSize: textOverlay.fontSize,
  color: textOverlay.color,
  align: 'center',
  lineHeight: 1.25,
  rotation: textOverlay.rotation ?? 0,
});

const mergeTextOverlayIntoTextItem = (
  text: TextItem,
  textOverlay: LegacyTextOverlay,
): TextItem => {
  const nextText: TextItem = {
    ...text,
    content: textOverlay.text,
    xRatio: textOverlay.xRatio,
    yRatio: textOverlay.yRatio,
    fontSize: textOverlay.fontSize,
    color: textOverlay.color,
  };

  if (Object.prototype.hasOwnProperty.call(textOverlay, 'rotation')) {
    nextText.rotation = textOverlay.rotation ?? 0;
  }

  return nextText;
};

export const textItemToTextOverlay = (text: TextItem | null): TextOverlay | null => {
  if (!text) {
    return null;
  }

  return {
    text: text.content,
    xRatio: text.xRatio,
    yRatio: text.yRatio,
    fontSize: text.fontSize,
    color: text.color,
    rotation: text.rotation ?? 0,
  };
};

export const cloneTextToolState = (textToolState: TextToolState): TextToolState => ({
  ...textToolState,
});

export const textToolStatesEqual = (
  left: TextToolState,
  right: TextToolState,
): boolean =>
  left.mode === right.mode &&
  ('hoverTextId' in left ? left.hoverTextId : undefined) ===
    ('hoverTextId' in right ? right.hoverTextId : undefined) &&
  ('textId' in left ? left.textId : undefined) ===
    ('textId' in right ? right.textId : undefined) &&
  ('caretIndex' in left ? left.caretIndex : undefined) ===
    ('caretIndex' in right ? right.caretIndex : undefined) &&
  ('selectionStart' in left ? left.selectionStart : undefined) ===
    ('selectionStart' in right ? right.selectionStart : undefined) &&
  ('selectionEnd' in left ? left.selectionEnd : undefined) ===
    ('selectionEnd' in right ? right.selectionEnd : undefined) &&
  ('composing' in left ? left.composing : undefined) ===
    ('composing' in right ? right.composing : undefined) &&
  ('startClientX' in left ? left.startClientX : undefined) ===
    ('startClientX' in right ? right.startClientX : undefined) &&
  ('startClientY' in left ? left.startClientY : undefined) ===
    ('startClientY' in right ? right.startClientY : undefined) &&
  ('originXRatio' in left ? left.originXRatio : undefined) ===
    ('originXRatio' in right ? right.originXRatio : undefined) &&
  ('originYRatio' in left ? left.originYRatio : undefined) ===
    ('originYRatio' in right ? right.originYRatio : undefined) &&
  ('originRotation' in left ? left.originRotation : undefined) ===
    ('originRotation' in right ? right.originRotation : undefined) &&
  ('anchorX' in left ? left.anchorX : undefined) ===
    ('anchorX' in right ? right.anchorX : undefined) &&
  ('anchorY' in left ? left.anchorY : undefined) ===
    ('anchorY' in right ? right.anchorY : undefined);

const normalizeTextItem = (text: TextItem): TextItem => ({
  ...text,
  rotation: text.rotation ?? 0,
});

const cloneTexts = (texts: TextItem[]): TextItem[] => texts.map((text) => normalizeTextItem(text));

const normalizeActiveTextId = (
  texts: TextItem[],
  activeTextId: string | null | undefined,
): string | null => {
  if (texts.length === 0) {
    return null;
  }

  if (activeTextId === null) {
    return null;
  }

  if (activeTextId && texts.some((text) => text.id === activeTextId)) {
    return activeTextId;
  }

  return activeTextId === undefined ? texts[0].id : texts[0]?.id ?? null;
};

export const normalizeTextToolState = (
  textToolState: TextToolState | null | undefined,
  texts: TextItem[],
): TextToolState => {
  if (!textToolState) {
    return createIdleTextToolState();
  }

  switch (textToolState.mode) {
    case 'idle':
      return {
        mode: 'idle',
        hoverTextId:
          textToolState.hoverTextId && texts.some((text) => text.id === textToolState.hoverTextId)
            ? textToolState.hoverTextId
            : null,
      };
    case 'inserting':
      return textToolState;
    case 'editing':
    case 'dragging':
    case 'rotating':
      return texts.some((text) => text.id === textToolState.textId)
        ? cloneTextToolState(textToolState)
        : createIdleTextToolState();
  }
};

export const normalizeTextState = (
  state: TextStateCarrier,
): NormalizedTextState => {
  const legacyTextOverlay = state.textOverlay ?? null;
  const baseTexts =
    state.texts && state.texts.length > 0
      ? cloneTexts(state.texts)
      : legacyTextOverlay
        ? [textOverlayToTextItem(legacyTextOverlay, state.activeTextId ?? DEFAULT_LEGACY_TEXT_ID)]
        : [];
  const activeTextId = normalizeActiveTextId(baseTexts, state.activeTextId);
  const texts =
    legacyTextOverlay && baseTexts.length > 0
      ? baseTexts.map((text) =>
          text.id === activeTextId ? mergeTextOverlayIntoTextItem(text, legacyTextOverlay) : text,
        )
      : baseTexts;
  const textToolState = normalizeTextToolState(state.textToolState, texts);
  const activeText = activeTextId ? texts.find((text) => text.id === activeTextId) ?? null : null;

  return {
    textOverlay: textItemToTextOverlay(activeText),
    texts,
    activeTextId,
    textToolState,
  };
};
