import { describe, expect, it } from 'vitest';
import type { EditorState, ImageResource, Rect } from './types';
import { applyHistorySnapshot, captureHistorySnapshot, pushHistorySnapshot } from './history';

const createImage = (name: string): ImageResource => ({
  element: {} as HTMLImageElement,
  width: 1600,
  height: 900,
  name,
  dataUrl: `data:image/png;base64,${name}`,
});

const createRect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

const createState = (overrides: Partial<EditorState> = {}): EditorState => ({
  image: createImage('sample.png'),
  cropRect: createRect(10, 20, 200, 120),
  draftCropRect: createRect(5, 6, 300, 200),
  cropMode: true,
  adjustments: {
    contrast: 10,
    exposure: 20,
    highlights: -10,
  },
  transform: {
    rotation: 90,
    flipX: true,
    flipY: false,
  },
  viewport: {
    zoom: 2,
    offsetX: 50,
    offsetY: -40,
  },
  activePreset: 'warm',
  ...overrides,
});

describe('history snapshots', () => {
  it('captureHistorySnapshot 只提取已提交编辑结果，不带裁剪草稿和视图状态', () => {
    const state = createState();

    const snapshot = captureHistorySnapshot(state);

    expect(snapshot).toEqual({
      image: state.image,
      cropRect: state.cropRect,
      adjustments: state.adjustments,
      transform: state.transform,
      activePreset: state.activePreset,
    });
    expect(snapshot).not.toHaveProperty('draftCropRect');
    expect(snapshot).not.toHaveProperty('cropMode');
    expect(snapshot).not.toHaveProperty('viewport');
  });

  it('applyHistorySnapshot 恢复编辑结果并清空裁剪中间态，同时保留当前视图', () => {
    const currentState = createState({
      cropRect: null,
      draftCropRect: createRect(1, 2, 30, 40),
      cropMode: true,
      viewport: {
        zoom: 3,
        offsetX: -20,
        offsetY: 120,
      },
    });
    const snapshot = captureHistorySnapshot(
      createState({
        cropRect: createRect(40, 50, 120, 80),
        adjustments: {
          contrast: -30,
          exposure: 15,
          highlights: 35,
        },
        transform: {
          rotation: 180,
          flipX: false,
          flipY: true,
        },
        activePreset: 'cool',
      }),
    );

    const nextState = applyHistorySnapshot(currentState, snapshot);

    expect(nextState.image).toEqual(snapshot.image);
    expect(nextState.cropRect).toEqual(snapshot.cropRect);
    expect(nextState.adjustments).toEqual(snapshot.adjustments);
    expect(nextState.transform).toEqual(snapshot.transform);
    expect(nextState.activePreset).toEqual(snapshot.activePreset);
    expect(nextState.draftCropRect).toBeNull();
    expect(nextState.cropMode).toBe(false);
    expect(nextState.viewport).toEqual(currentState.viewport);
  });

  it('pushHistorySnapshot 超过上限时丢弃最旧记录，且相同快照不重复压栈', () => {
    const snapshot1 = captureHistorySnapshot(createState({ activePreset: 'original' }));
    const snapshot2 = captureHistorySnapshot(
      createState({
        adjustments: {
          contrast: 1,
          exposure: 2,
          highlights: 3,
        },
      }),
    );
    const snapshot3 = captureHistorySnapshot(createState({ transform: { rotation: 30, flipX: false, flipY: false } }));
    const snapshot4 = captureHistorySnapshot(createState({ cropRect: createRect(100, 100, 400, 300) }));

    const trimmed = pushHistorySnapshot([snapshot1, snapshot2, snapshot3], snapshot4, 3);

    expect(trimmed).toEqual([snapshot2, snapshot3, snapshot4]);

    const deduped = pushHistorySnapshot(trimmed, snapshot4, 3);

    expect(deduped).toEqual(trimmed);
  });
});
