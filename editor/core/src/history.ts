import type { EditorState, ImageResource, Rect, TextItem, TextOverlay, TextToolState } from './types';

export interface HistorySnapshot {
  image: ImageResource | null;
  cropRect: Rect | null;
  texts: TextItem[];
  activeTextId: string | null;
  textToolState: TextToolState;
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

const createIdleTextToolState = (): TextToolState => ({
  mode: 'idle',
  hoverTextId: null,
});

const cloneTexts = (texts: TextItem[]): TextItem[] => texts.map((text) => ({ ...text }));

const cloneTextToolState = (textToolState: TextToolState): TextToolState => ({ ...textToolState });

const legacyOverlayToTextItem = (textOverlay: TextOverlay): TextItem => ({
  id: 'legacy-text-1',
  content: textOverlay.text,
  xRatio: textOverlay.xRatio,
  yRatio: textOverlay.yRatio,
  fontSize: textOverlay.fontSize,
  color: textOverlay.color,
  align: 'center',
  lineHeight: 1.25,
});

const textItemToLegacyOverlay = (text: TextItem | null): TextOverlay | null => {
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

const resolveSnapshotTexts = (state: EditorState): TextItem[] => {
  if (state.texts && state.texts.length > 0) {
    return cloneTexts(state.texts);
  }

  if (state.textOverlay) {
    return [legacyOverlayToTextItem(state.textOverlay)];
  }

  return [];
};

const resolveSnapshotActiveTextId = (state: EditorState, texts: TextItem[]): string | null => {
  if (texts.length === 0) {
    return null;
  }

  if (state.activeTextId && texts.some((text) => text.id === state.activeTextId)) {
    return state.activeTextId;
  }

  return texts[0].id;
};

const resolveSnapshotTextToolState = (state: EditorState, activeTextId: string | null): TextToolState => {
  if (state.textToolState) {
    return cloneTextToolState(state.textToolState);
  }

  if (activeTextId) {
    return {
      mode: 'editing',
      textId: activeTextId,
      caretIndex: 0,
      selectionStart: 0,
      selectionEnd: 0,
      composing: false,
    };
  }

  return createIdleTextToolState();
};

export const captureHistorySnapshot = (state: EditorState): HistorySnapshot => {
  const texts = resolveSnapshotTexts(state);
  const activeTextId = resolveSnapshotActiveTextId(state, texts);

  return {
    image: cloneImage(state.image),
    cropRect: cloneRect(state.cropRect),
    texts,
    activeTextId,
    textToolState: resolveSnapshotTextToolState(state, activeTextId),
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
        text.lineHeight === other.lineHeight
      );
    });

  return (
    imageEqual &&
    cropRectEqual &&
    textsEqual &&
    left.activeTextId === right.activeTextId &&
    left.textToolState.mode === right.textToolState.mode &&
    ('hoverTextId' in left.textToolState ? left.textToolState.hoverTextId : undefined) ===
      ('hoverTextId' in right.textToolState ? right.textToolState.hoverTextId : undefined) &&
    ('textId' in left.textToolState ? left.textToolState.textId : undefined) ===
      ('textId' in right.textToolState ? right.textToolState.textId : undefined) &&
    ('caretIndex' in left.textToolState ? left.textToolState.caretIndex : undefined) ===
      ('caretIndex' in right.textToolState ? right.textToolState.caretIndex : undefined) &&
    ('selectionStart' in left.textToolState ? left.textToolState.selectionStart : undefined) ===
      ('selectionStart' in right.textToolState ? right.textToolState.selectionStart : undefined) &&
    ('selectionEnd' in left.textToolState ? left.textToolState.selectionEnd : undefined) ===
      ('selectionEnd' in right.textToolState ? right.textToolState.selectionEnd : undefined) &&
    ('composing' in left.textToolState ? left.textToolState.composing : undefined) ===
      ('composing' in right.textToolState ? right.textToolState.composing : undefined) &&
    ('startClientX' in left.textToolState ? left.textToolState.startClientX : undefined) ===
      ('startClientX' in right.textToolState ? right.textToolState.startClientX : undefined) &&
    ('startClientY' in left.textToolState ? left.textToolState.startClientY : undefined) ===
      ('startClientY' in right.textToolState ? right.textToolState.startClientY : undefined) &&
    ('originXRatio' in left.textToolState ? left.textToolState.originXRatio : undefined) ===
      ('originXRatio' in right.textToolState ? right.textToolState.originXRatio : undefined) &&
    ('originYRatio' in left.textToolState ? left.textToolState.originYRatio : undefined) ===
      ('originYRatio' in right.textToolState ? right.textToolState.originYRatio : undefined) &&
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
  texts: cloneTexts(snapshot.texts),
  activeTextId: snapshot.activeTextId,
  textToolState: cloneTextToolState(snapshot.textToolState),
  textOverlay: textItemToLegacyOverlay(
    snapshot.texts.find((text) => text.id === snapshot.activeTextId) ?? snapshot.texts[0] ?? null,
  ),
  draftCropRect: null,
  cropMode: false,
  adjustments: { ...snapshot.adjustments },
  transform: { ...snapshot.transform },
  activePreset: snapshot.activePreset,
});
