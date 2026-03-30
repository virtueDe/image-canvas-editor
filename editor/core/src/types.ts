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
  textOverlay: TextOverlay | null;
  texts?: TextItem[];
  activeTextId?: string | null;
  textToolState?: TextToolState;
  adjustments: EditorAdjustments;
  transform: EditorTransform;
  viewport: EditorViewport;
  activePreset: FilterPreset;
}

export interface SerializableEditorState {
  schemaVersion: number;
  image: Omit<ImageResource, 'element'> | null;
  cropRect: Rect | null;
  textOverlay?: TextOverlay | null;
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

type TextStateCarrier = {
  textOverlay?: TextOverlay | null;
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

const DEFAULT_LEGACY_TEXT_ID = 'legacy-text-1';

export const createIdleTextToolState = (): TextToolState => ({
  mode: 'idle',
  hoverTextId: null,
});

export const textOverlayToTextItem = (
  textOverlay: TextOverlay,
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
});

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
    ('originYRatio' in right ? right.originYRatio : undefined);

const cloneTexts = (texts: TextItem[]): TextItem[] => texts.map((text) => ({ ...text }));

const normalizeActiveTextId = (
  texts: TextItem[],
  activeTextId: string | null | undefined,
): string | null => {
  if (texts.length === 0) {
    return null;
  }

  if (activeTextId && texts.some((text) => text.id === activeTextId)) {
    return activeTextId;
  }

  return texts[0].id;
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
      return texts.some((text) => text.id === textToolState.textId)
        ? cloneTextToolState(textToolState)
        : createIdleTextToolState();
  }
};

export const normalizeTextState = (
  state: TextStateCarrier,
): NormalizedTextState => {
  const texts = state.textOverlay
    ? [textOverlayToTextItem(state.textOverlay, state.activeTextId ?? state.texts?.[0]?.id ?? DEFAULT_LEGACY_TEXT_ID)]
    : cloneTexts(state.texts ?? []);
  const activeTextId = normalizeActiveTextId(texts, state.activeTextId);
  const textToolState = normalizeTextToolState(state.textToolState, texts);
  const activeText =
    texts.find((text) => text.id === activeTextId) ?? texts[0] ?? null;

  return {
    textOverlay: state.textOverlay ?? textItemToTextOverlay(activeText),
    texts,
    activeTextId,
    textToolState,
  };
};
