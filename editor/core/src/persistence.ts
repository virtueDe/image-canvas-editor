import type { EditorState, ImageResource, SerializableEditorState, TextItem, TextOverlay, TextToolState } from './types';
import { loadImageFromDataUrl } from './utils';

const DRAFT_STORAGE_KEY = 'image-canvas-editor:draft:v2';
const DRAFT_SCHEMA_VERSION = 2;
const createIdleTextToolState = (): TextToolState => ({
  mode: 'idle',
  hoverTextId: null,
});

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

const resolveDraftTexts = (state: EditorState): TextItem[] => {
  if (state.texts && state.texts.length > 0) {
    return state.texts.map((text) => ({ ...text }));
  }

  if (state.textOverlay) {
    return [legacyOverlayToTextItem(state.textOverlay)];
  }

  return [];
};

const resolveDraftActiveTextId = (state: EditorState, texts: TextItem[]): string | null => {
  if (texts.length === 0) {
    return null;
  }

  if (state.activeTextId && texts.some((text) => text.id === state.activeTextId)) {
    return state.activeTextId;
  }

  return texts[0].id;
};

const cloneTextToolState = (textToolState: TextToolState): TextToolState => ({ ...textToolState });

export interface DraftStore {
  save(state: EditorState): void;
  restore(): Promise<SerializableEditorState & { image: ImageResource | null }>;
}

const toSerializable = (state: EditorState): SerializableEditorState => {
  const texts = resolveDraftTexts(state);
  const activeTextId = resolveDraftActiveTextId(state, texts);

  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    image: state.image
      ? {
          width: state.image.width,
          height: state.image.height,
          name: state.image.name,
          dataUrl: state.image.dataUrl,
        }
      : null,
    cropRect: state.cropRect,
    texts,
    activeTextId,
    textToolState: state.textToolState ? cloneTextToolState(state.textToolState) : createIdleTextToolState(),
    adjustments: state.adjustments,
    transform: state.transform,
    activePreset: state.activePreset,
  };
};

const hydrateImage = async (rawImage: SerializableEditorState['image']): Promise<ImageResource | null> => {
  if (!rawImage) {
    return null;
  }

  const element = await loadImageFromDataUrl(rawImage.dataUrl);

  return {
    ...rawImage,
    element,
  };
};

export const createLocalDraftStore = (storageKey = DRAFT_STORAGE_KEY): DraftStore => ({
  save(state) {
    localStorage.setItem(storageKey, JSON.stringify(toSerializable(state)));
  },

  async restore() {
    const rawValue = localStorage.getItem(storageKey);

    if (!rawValue) {
      throw new Error('没有找到可恢复的草稿');
    }

    const parsed = JSON.parse(rawValue) as Partial<SerializableEditorState>;
    const texts = parsed.texts?.map((text) => ({ ...text })) ?? (parsed.textOverlay ? [legacyOverlayToTextItem(parsed.textOverlay)] : []);
    const activeTextId =
      parsed.activeTextId && texts.some((text) => text.id === parsed.activeTextId)
        ? parsed.activeTextId
        : texts[0]?.id ?? null;

    return {
      ...parsed,
      schemaVersion: parsed.schemaVersion ?? DRAFT_SCHEMA_VERSION,
      cropRect: parsed.cropRect ?? null,
      textOverlay: textItemToLegacyOverlay(texts.find((text) => text.id === activeTextId) ?? texts[0] ?? null),
      texts,
      activeTextId,
      textToolState: parsed.textToolState ? cloneTextToolState(parsed.textToolState) : createIdleTextToolState(),
      adjustments: parsed.adjustments ?? {
        contrast: 0,
        exposure: 0,
        highlights: 0,
      },
      transform: parsed.transform ?? {
        rotation: 0,
        flipX: false,
        flipY: false,
      },
      activePreset: parsed.activePreset ?? 'original',
      image: await hydrateImage(parsed.image ?? null),
    } as SerializableEditorState & { image: ImageResource | null };
  },
});
