import {
  cloneTextToolState,
  normalizeTextState,
  type EditorState,
  type ImageResource,
  type SerializableEditorState,
} from './types';
import { loadImageFromDataUrl } from './utils';

const DRAFT_STORAGE_KEY = 'image-canvas-editor:draft:v2';
const DRAFT_SCHEMA_VERSION = 2;

export interface DraftStore {
  save(state: EditorState): void;
  restore(): Promise<SerializableEditorState & { image: ImageResource | null }>;
}

const toSerializable = (state: EditorState): SerializableEditorState => {
  const normalizedTextState = normalizeTextState(state);

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
    texts: normalizedTextState.texts.map((text) => ({ ...text })),
    activeTextId: normalizedTextState.activeTextId,
    textToolState: cloneTextToolState(normalizedTextState.textToolState),
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
    const normalizedTextState = normalizeTextState(parsed);

    return {
      ...parsed,
      schemaVersion: parsed.schemaVersion ?? DRAFT_SCHEMA_VERSION,
      cropRect: parsed.cropRect ?? null,
      textOverlay: normalizedTextState.textOverlay,
      texts: normalizedTextState.texts.map((text) => ({ ...text })),
      activeTextId: normalizedTextState.activeTextId,
      textToolState: cloneTextToolState(normalizedTextState.textToolState),
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
