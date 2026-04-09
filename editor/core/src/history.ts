import {
  cloneBrushStrokes,
  cloneTextToolState,
  normalizeBrushSettings,
  normalizeBrushToolState,
  normalizeTextState,
  textItemToTextOverlay,
  type BrushSettings,
  type BrushStroke,
  type BrushToolState,
  type EditorCanvasTool,
  type EditorState,
  type ImageResource,
  type Rect,
  type TextItem,
  type TextToolState,
} from './types';

export interface HistorySnapshot {
  image: ImageResource | null;
  cropRect: Rect | null;
  activeTool: EditorCanvasTool;
  texts: TextItem[];
  activeTextId: string | null;
  textToolState: TextToolState;
  brush: BrushSettings;
  brushStrokes: BrushStroke[];
  brushToolState: BrushToolState;
  adjustments: EditorState['adjustments'];
  transform: EditorState['transform'];
  activePreset: EditorState['activePreset'];
}

const cloneRect = (rect: Rect | null): Rect | null => {
  if (!rect) {
    return null;
  }

  return { ...rect };
};

const cloneImage = (image: ImageResource | null): ImageResource | null => {
  if (!image) {
    return null;
  }

  return { ...image };
};

const cloneTexts = (texts: TextItem[]): TextItem[] => texts.map((text) => ({ ...text }));

export const captureHistorySnapshot = (state: EditorState): HistorySnapshot => {
  const normalizedTextState = normalizeTextState(state);
  const brushStrokes = cloneBrushStrokes(state.brushStrokes ?? []);

  return {
    image: cloneImage(state.image),
    cropRect: cloneRect(state.cropRect),
    activeTool: state.activeTool ?? 'navigate',
    texts: cloneTexts(normalizedTextState.texts),
    activeTextId: normalizedTextState.activeTextId,
    textToolState: cloneTextToolState(normalizedTextState.textToolState),
    brush: normalizeBrushSettings(state.brush),
    brushStrokes,
    brushToolState: normalizeBrushToolState(state.brushToolState, brushStrokes),
    adjustments: { ...state.adjustments },
    transform: { ...state.transform },
    activePreset: state.activePreset,
  };
};

export const snapshotsEqual = (left: HistorySnapshot, right: HistorySnapshot): boolean => {
  const leftImage = left.image;
  const rightImage = right.image;

  const imageEqual =
    leftImage === rightImage ||
    (leftImage !== null &&
      rightImage !== null &&
      leftImage.element === rightImage.element &&
      leftImage.width === rightImage.width &&
      leftImage.height === rightImage.height &&
      leftImage.name === rightImage.name &&
      leftImage.dataUrl === rightImage.dataUrl);

  const leftRect = left.cropRect;
  const rightRect = right.cropRect;
  const cropRectEqual =
    leftRect === rightRect ||
    (leftRect !== null &&
      rightRect !== null &&
      leftRect.x === rightRect.x &&
      leftRect.y === rightRect.y &&
      leftRect.width === rightRect.width &&
      leftRect.height === rightRect.height);

  const textsEqual =
    left.texts.length === right.texts.length &&
    left.texts.every((text, index) => {
      const other = right.texts[index];

      return (
        other !== undefined &&
        text.id === other.id &&
        text.content === other.content &&
        text.xRatio === other.xRatio &&
        text.yRatio === other.yRatio &&
        text.fontSize === other.fontSize &&
        text.color === other.color &&
        text.align === other.align &&
        text.lineHeight === other.lineHeight &&
        text.rotation === other.rotation
      );
    });

  const brushStrokesEqual =
    left.brushStrokes.length === right.brushStrokes.length &&
    left.brushStrokes.every((stroke, index) => {
      const other = right.brushStrokes[index];

      return (
        other !== undefined &&
        stroke.id === other.id &&
        stroke.type === other.type &&
        stroke.color === other.color &&
        stroke.size === other.size &&
        stroke.hardness === other.hardness &&
        stroke.points.length === other.points.length &&
        stroke.points.every((point, pointIndex) => {
          const otherPoint = other.points[pointIndex];

          return (
            otherPoint !== undefined &&
            point.xRatio === otherPoint.xRatio &&
            point.yRatio === otherPoint.yRatio
          );
        })
      );
    });

  return (
    imageEqual &&
    cropRectEqual &&
    left.activeTool === right.activeTool &&
    textsEqual &&
    brushStrokesEqual &&
    left.brush.type === right.brush.type &&
    left.brush.color === right.brush.color &&
    left.brush.size === right.brush.size &&
    left.brush.hardness === right.brush.hardness &&
    left.adjustments.contrast === right.adjustments.contrast &&
    left.adjustments.exposure === right.adjustments.exposure &&
    left.adjustments.highlights === right.adjustments.highlights &&
    left.transform.rotation === right.transform.rotation &&
    left.transform.flipX === right.transform.flipX &&
    left.transform.flipY === right.transform.flipY &&
    left.activePreset === right.activePreset
  );
};

export const pushHistorySnapshot = (
  history: HistorySnapshot[],
  snapshot: HistorySnapshot,
  limit: number,
): HistorySnapshot[] => {
  if (limit <= 0) {
    return [];
  }

  const tail = history[history.length - 1];

  if (tail && snapshotsEqual(tail, snapshot)) {
    return history;
  }

  const next = [...history, snapshot];

  if (next.length <= limit) {
    return next;
  }

  return next.slice(next.length - limit);
};

export const applyHistorySnapshot = (state: EditorState, snapshot: HistorySnapshot): EditorState => {
  const normalizedTextState = normalizeTextState(snapshot);
  const brushStrokes = cloneBrushStrokes(snapshot.brushStrokes);

  return {
    ...state,
    image: cloneImage(snapshot.image),
    cropRect: cloneRect(snapshot.cropRect),
    activeTool: snapshot.activeTool,
    textOverlay: textItemToTextOverlay(
      normalizedTextState.texts.find((text) => text.id === normalizedTextState.activeTextId) ??
        normalizedTextState.texts[0] ??
        null,
    ),
    texts: cloneTexts(normalizedTextState.texts),
    activeTextId: normalizedTextState.activeTextId,
    textToolState: cloneTextToolState(normalizedTextState.textToolState),
    brush: normalizeBrushSettings(snapshot.brush),
    brushStrokes,
    brushToolState: normalizeBrushToolState(snapshot.brushToolState, brushStrokes),
    draftCropRect: null,
    cropMode: false,
    adjustments: { ...snapshot.adjustments },
    transform: { ...snapshot.transform },
    activePreset: snapshot.activePreset,
  };
};
