import type { EditorState, ImageResource, Rect, TextOverlay } from './types';

export interface HistorySnapshot {
  image: ImageResource | null;
  cropRect: Rect | null;
  textOverlay: TextOverlay | null;
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

const cloneTextOverlay = (textOverlay: TextOverlay | null): TextOverlay | null => {
  if (!textOverlay) {
    return null;
  }

  return { ...textOverlay };
};

export const captureHistorySnapshot = (state: EditorState): HistorySnapshot => ({
  image: cloneImage(state.image),
  cropRect: cloneRect(state.cropRect),
  textOverlay: cloneTextOverlay(state.textOverlay),
  adjustments: { ...state.adjustments },
  transform: { ...state.transform },
  activePreset: state.activePreset,
});

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

  const leftTextOverlay = left.textOverlay;
  const rightTextOverlay = right.textOverlay;
  const textOverlayEqual =
    leftTextOverlay === rightTextOverlay ||
    (leftTextOverlay !== null &&
      rightTextOverlay !== null &&
      leftTextOverlay.text === rightTextOverlay.text &&
      leftTextOverlay.xRatio === rightTextOverlay.xRatio &&
      leftTextOverlay.yRatio === rightTextOverlay.yRatio &&
      leftTextOverlay.fontSize === rightTextOverlay.fontSize &&
      leftTextOverlay.color === rightTextOverlay.color);

  return (
    imageEqual &&
    cropRectEqual &&
    textOverlayEqual &&
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

export const applyHistorySnapshot = (state: EditorState, snapshot: HistorySnapshot): EditorState => ({
  ...state,
  image: cloneImage(snapshot.image),
  cropRect: cloneRect(snapshot.cropRect),
  textOverlay: cloneTextOverlay(snapshot.textOverlay),
  draftCropRect: null,
  cropMode: false,
  adjustments: { ...snapshot.adjustments },
  transform: { ...snapshot.transform },
  activePreset: snapshot.activePreset,
});
