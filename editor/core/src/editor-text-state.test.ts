import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyHistorySnapshot, captureHistorySnapshot } from './history';
import { createLocalDraftStore } from './persistence';
import type { EditorState } from './types';

type StorageMock = {
  clear(): void;
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
};

const baseState = (): EditorState => ({
  image: null,
  cropRect: null,
  draftCropRect: null,
  cropMode: false,
  textOverlay: {
    text: '第一段',
    xRatio: 0.25,
    yRatio: 0.3,
    fontSize: 32,
    color: '#ffffff',
  },
  texts: [
    {
      id: 'text-1',
      content: '第一段',
      xRatio: 0.25,
      yRatio: 0.3,
      fontSize: 32,
      color: '#ffffff',
      align: 'center',
      lineHeight: 1.25,
    },
  ],
  activeTextId: 'text-1',
  textToolState: {
    mode: 'editing',
    textId: 'text-1',
    caretIndex: 3,
    selectionStart: 3,
    selectionEnd: 3,
    composing: false,
  },
  adjustments: { contrast: 0, exposure: 0, highlights: 0 },
  transform: { rotation: 0, flipX: false, flipY: false },
  viewport: { zoom: 1, offsetX: 0, offsetY: 0 },
  activePreset: 'original',
});

const createStorageMock = () => {
  const store = new Map<string, string>();

  const localStorage: StorageMock = {
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.get(key) ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };

  return { localStorage, store };
};

describe('history snapshot with multi-text state', () => {
  it('captures texts, activeTextId and textToolState instead of single textOverlay', () => {
    const snapshot = captureHistorySnapshot(baseState());
    expect(snapshot.texts).toHaveLength(1);
    expect(snapshot.activeTextId).toBe('text-1');
    expect(snapshot.textToolState).toEqual(baseState().textToolState);
    expect('textOverlay' in snapshot).toBe(false);
  });

  it('restores textToolState from snapshot instead of keeping current state', () => {
    const currentState: EditorState = {
      ...baseState(),
      textToolState: {
        mode: 'idle',
        hoverTextId: null,
      },
    };

    const snapshot = captureHistorySnapshot(baseState());
    const nextState = applyHistorySnapshot(currentState, snapshot);

    expect(nextState.textToolState).toEqual(snapshot.textToolState);
    expect(nextState.textOverlay).toEqual(baseState().textOverlay);
  });
});

describe('draft store with multi-text schema', () => {
  const originalLocalStorage = globalThis.localStorage;
  let storage: ReturnType<typeof createStorageMock>['store'];

  beforeEach(() => {
    const mocked = createStorageMock();
    storage = mocked.store;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mocked.localStorage,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
  });

  it('stores v2 draft payload with texts and text tool state', () => {
    const store = createLocalDraftStore();

    store.save(baseState());

    const rawDraft = storage.get('image-canvas-editor:draft:v2');
    expect(rawDraft).toBeTruthy();

    const payload = JSON.parse(rawDraft ?? '');
    expect(payload).toMatchObject({
      schemaVersion: 2,
      texts: baseState().texts,
      activeTextId: 'text-1',
      textToolState: baseState().textToolState,
    });
    expect('textOverlay' in payload).toBe(false);
  });
});
