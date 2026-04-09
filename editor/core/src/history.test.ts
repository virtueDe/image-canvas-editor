import { describe, expect, it } from 'vitest';
import type { EditorState, ImageResource, Rect, TextItem } from './types';
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

const createText = (overrides: Partial<TextItem> = {}): TextItem => ({
  id: 'text-1',
  content: '示例文案',
  xRatio: 0.35,
  yRatio: 0.42,
  fontSize: 56,
  color: '#E9C083',
  align: 'center',
  lineHeight: 1.25,
  rotation: 0,
  ...overrides,
});

const createState = (overrides: Partial<EditorState> = {}): EditorState => ({
  image: createImage('sample.png'),
  cropRect: createRect(10, 20, 200, 120),
  draftCropRect: createRect(5, 6, 300, 200),
  cropMode: true,
  activeTool: 'navigate',
  textOverlay: {
    text: '示例文案',
    xRatio: 0.35,
    yRatio: 0.42,
    fontSize: 56,
    color: '#E9C083',
    rotation: 0,
  },
  texts: [createText()],
  activeTextId: 'text-1',
  textToolState: {
    mode: 'editing',
    textId: 'text-1',
    caretIndex: 4,
    selectionStart: 4,
    selectionEnd: 4,
    composing: false,
  },
  brush: {
    type: 'brush',
    color: '#E9C083',
    size: 24,
    hardness: 0.68,
  },
  brushStrokes: [],
  brushToolState: {
    mode: 'idle',
  },
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
      activeTool: state.activeTool,
      texts: state.texts,
      activeTextId: state.activeTextId,
      textToolState: state.textToolState,
      brush: state.brush,
      brushStrokes: state.brushStrokes,
      brushToolState: state.brushToolState,
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
        textOverlay: null,
        texts: [
          createText({
            id: 'text-2',
            content: '回滚文字',
            xRatio: 0.7,
            yRatio: 0.3,
            fontSize: 36,
            color: '#38BDF8',
          }),
        ],
        activeTextId: 'text-2',
        textToolState: {
          mode: 'editing',
          textId: 'text-2',
          caretIndex: 2,
          selectionStart: 1,
          selectionEnd: 2,
          composing: true,
        },
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
    expect(nextState.texts).toEqual(snapshot.texts);
    expect(nextState.activeTextId).toEqual(snapshot.activeTextId);
    expect(nextState.textToolState).toEqual(snapshot.textToolState);
    expect(nextState.activeTool).toEqual(snapshot.activeTool);
    expect(nextState.brush).toEqual(snapshot.brush);
    expect(nextState.brushStrokes).toEqual(snapshot.brushStrokes);
    expect(nextState.brushToolState).toEqual(snapshot.brushToolState);
    expect(nextState.adjustments).toEqual(snapshot.adjustments);
    expect(nextState.transform).toEqual(snapshot.transform);
    expect(nextState.activePreset).toEqual(snapshot.activePreset);
    expect(nextState.draftCropRect).toBeNull();
    expect(nextState.cropMode).toBe(false);
    expect(nextState.viewport).toEqual(currentState.viewport);
    expect(nextState.textOverlay).toEqual({
      text: '回滚文字',
      xRatio: 0.7,
      yRatio: 0.3,
      fontSize: 36,
      color: '#38BDF8',
      rotation: 0,
    });
  });

  it('在历史恢复后仅修改 textOverlay 时，重新抓取快照也会保留最新文本', () => {
    const restoredState = applyHistorySnapshot(
      createState(),
      captureHistorySnapshot(
        createState({
          textOverlay: null,
          texts: [
            createText({
              id: 'text-2',
              content: '旧文字',
              xRatio: 0.4,
              yRatio: 0.6,
              fontSize: 40,
              color: '#22C55E',
            }),
          ],
          activeTextId: 'text-2',
          textToolState: {
            mode: 'editing',
            textId: 'text-2',
            caretIndex: 1,
            selectionStart: 1,
            selectionEnd: 1,
            composing: false,
          },
        }),
      ),
    );

    const legacyEditedState: EditorState = {
      ...restoredState,
      textOverlay: {
        ...restoredState.textOverlay!,
        text: '最新文字',
        xRatio: 0.55,
      },
    };

    const snapshot = captureHistorySnapshot(legacyEditedState);

    expect(snapshot.texts).toEqual([
      {
        id: 'text-2',
        content: '最新文字',
        xRatio: 0.55,
        yRatio: 0.6,
        fontSize: 40,
        color: '#22C55E',
        align: 'center',
        lineHeight: 1.25,
        rotation: 0,
      },
    ]);
    expect(snapshot.activeTextId).toBe('text-2');
  });

  it('多文字状态下 legacy textOverlay 只会合并当前激活文字，不会丢掉其他项', () => {
    const snapshot = captureHistorySnapshot(
      createState({
        textOverlay: {
          text: '第二条最新文本',
          xRatio: 0.72,
          yRatio: 0.66,
          fontSize: 44,
          color: '#F97316',
        },
        texts: [
          createText({
            id: 'text-1',
            content: '第一条保持不变',
            xRatio: 0.2,
            yRatio: 0.25,
            fontSize: 30,
            color: '#E2E8F0',
            align: 'left',
            lineHeight: 1.6,
          }),
          createText({
            id: 'text-2',
            content: '第二条旧文本',
            xRatio: 0.62,
            yRatio: 0.58,
            fontSize: 38,
            color: '#22C55E',
            align: 'right',
            lineHeight: 1.8,
          }),
        ],
        activeTextId: 'text-2',
        textToolState: {
          mode: 'editing',
          textId: 'text-2',
          caretIndex: 2,
          selectionStart: 2,
          selectionEnd: 2,
          composing: false,
        },
      }),
    );

    expect(snapshot.texts).toEqual([
      {
        id: 'text-1',
        content: '第一条保持不变',
        xRatio: 0.2,
        yRatio: 0.25,
        fontSize: 30,
        color: '#E2E8F0',
        align: 'left',
        lineHeight: 1.6,
        rotation: 0,
      },
      {
        id: 'text-2',
        content: '第二条最新文本',
        xRatio: 0.72,
        yRatio: 0.66,
        fontSize: 44,
        color: '#F97316',
        align: 'right',
        lineHeight: 1.8,
        rotation: 0,
      },
    ]);
    expect(snapshot.activeTextId).toBe('text-2');
  });

  it('legacy textOverlay 合并 active text 时不会覆盖 richer fields', () => {
    const snapshot = captureHistorySnapshot(
      createState({
        textOverlay: {
          text: '更新后的文本',
          xRatio: 0.48,
          yRatio: 0.52,
          fontSize: 34,
          color: '#0EA5E9',
        },
        texts: [
          createText({
            id: 'text-5',
            content: '原始文本',
            xRatio: 0.4,
            yRatio: 0.45,
            fontSize: 28,
            color: '#F8FAFC',
            align: 'right',
            lineHeight: 1.9,
          }),
        ],
        activeTextId: 'text-5',
      }),
    );

    expect(snapshot.texts[0]).toEqual({
      id: 'text-5',
      content: '更新后的文本',
      xRatio: 0.48,
      yRatio: 0.52,
      fontSize: 34,
      color: '#0EA5E9',
      align: 'right',
      lineHeight: 1.9,
      rotation: 0,
    });
  });

  it('history snapshot includes active text rotation', () => {
    const snapshot = captureHistorySnapshot({
      ...createState(),
      textOverlay: null,
      texts: [createText({ rotation: 32 })],
    });

    expect(snapshot.texts[0]?.rotation).toBe(32);
  });

  it('legacy textOverlay 缺失 rotation 时，不会覆盖 active text 的 richer rotation', () => {
    const snapshot = captureHistorySnapshot(
      createState({
        textOverlay: {
          text: '沿用 richer rotation',
          xRatio: 0.41,
          yRatio: 0.47,
          fontSize: 30,
          color: '#F8FAFC',
        },
        texts: [
          createText({
            id: 'text-6',
            content: '沿用 richer rotation',
            xRatio: 0.35,
            yRatio: 0.42,
            fontSize: 28,
            color: '#E9C083',
            rotation: 27,
          }),
        ],
        activeTextId: 'text-6',
      }),
    );

    expect(snapshot.texts[0]).toEqual({
      id: 'text-6',
      content: '沿用 richer rotation',
      xRatio: 0.41,
      yRatio: 0.47,
      fontSize: 30,
      color: '#F8FAFC',
      align: 'center',
      lineHeight: 1.25,
      rotation: 27,
    });
  });

  it('captureHistorySnapshot 会把无效的 activeTextId 和 textToolState 归一化', () => {
    const snapshot = captureHistorySnapshot(
      createState({
        textOverlay: null,
        texts: [createText({ id: 'text-9', content: '唯一文字' })],
        activeTextId: 'missing-text',
        textToolState: {
          mode: 'editing',
          textId: 'missing-text',
          caretIndex: 7,
          selectionStart: 2,
          selectionEnd: 7,
          composing: true,
        },
      }),
    );

    expect(snapshot.activeTextId).toBe('text-9');
    expect(snapshot.textToolState).toEqual({
      mode: 'idle',
      hoverTextId: null,
    });
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
    const snapshot4 = captureHistorySnapshot(
      createState({
        cropRect: createRect(100, 100, 400, 300),
        texts: [
          createText({
            content: '新文字',
            xRatio: 0.5,
            yRatio: 0.8,
            fontSize: 64,
            color: '#FB7185',
          }),
        ],
      }),
    );

    const trimmed = pushHistorySnapshot([snapshot1, snapshot2, snapshot3], snapshot4, 3);

    expect(trimmed).toEqual([snapshot2, snapshot3, snapshot4]);

    const deduped = pushHistorySnapshot(trimmed, snapshot4, 3);

    expect(deduped).toEqual(trimmed);
  });

  it('pushHistorySnapshot 不会把仅有激活项和工具态变化当成新的历史记录', () => {
    const sharedImage = createImage('shared.png');

    const snapshot1 = captureHistorySnapshot(
      createState({
        image: sharedImage,
        textOverlay: null,
        texts: [
          createText({
            id: 'text-1',
            content: '第一条文本',
            xRatio: 0.2,
            yRatio: 0.25,
          }),
          createText({
            id: 'text-2',
            content: '第二条文本',
            xRatio: 0.7,
            yRatio: 0.3,
            fontSize: 36,
            color: '#38BDF8',
          }),
        ],
        activeTextId: 'text-1',
        textToolState: {
          mode: 'idle',
          hoverTextId: null,
        },
      }),
    );
    const snapshot2 = captureHistorySnapshot(
      createState({
        image: sharedImage,
        textOverlay: null,
        texts: [
          createText({
            id: 'text-1',
            content: '第一条文本',
            xRatio: 0.2,
            yRatio: 0.25,
          }),
          createText({
            id: 'text-2',
            content: '第二条文本',
            xRatio: 0.7,
            yRatio: 0.3,
            fontSize: 36,
            color: '#38BDF8',
          }),
        ],
        activeTextId: 'text-2',
        textToolState: {
          mode: 'editing',
          textId: 'text-2',
          caretIndex: 0,
          selectionStart: 0,
          selectionEnd: 0,
          composing: false,
        },
      }),
    );

    expect(pushHistorySnapshot([snapshot1], snapshot2, 3)).toEqual([snapshot1]);
  });
});
