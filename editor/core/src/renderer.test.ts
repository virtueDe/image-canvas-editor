import { afterEach, describe, expect, it, vi } from 'vitest';
import * as imageProcessing from './image-processing';
import { CanvasRenderer } from './renderer';
import type { EditorState, Rect, TextItem } from './types';

const createFakeContext = (): CanvasRenderingContext2D =>
  ({
    save: () => undefined,
    restore: () => undefined,
    setLineDash: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    arc: () => undefined,
    measureText: (text: string) => ({ width: Math.max(1, text.length * 32) }) as TextMetrics,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    shadowColor: '',
    shadowBlur: 0,
    font: '',
  }) as CanvasRenderingContext2D;

const createTextState = (): EditorState => {
  const text: TextItem = {
    id: 'text-1',
    content: '标题',
    xRatio: 0.5,
    yRatio: 0.5,
    fontSize: 48,
    color: '#ffffff',
    align: 'center',
    lineHeight: 1.25,
    rotation: 0,
  };

  return {
    image: {
      element: {} as HTMLImageElement,
      width: 1200,
      height: 800,
      name: 'mock.png',
      dataUrl: 'data:image/png;base64,mock',
    },
    cropRect: null,
    draftCropRect: null,
    cropMode: false,
    activeTool: 'text',
    textOverlay: {
      text: text.content,
      xRatio: text.xRatio,
      yRatio: text.yRatio,
      fontSize: text.fontSize,
      color: text.color,
      rotation: text.rotation,
    },
    texts: [text],
    activeTextId: text.id,
    textToolState: {
      mode: 'editing',
      textId: text.id,
      caretIndex: text.content.length,
      selectionStart: text.content.length,
      selectionEnd: text.content.length,
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
    brushCursor: null,
    adjustments: {
      contrast: 0,
      exposure: 0,
      highlights: 0,
    },
    transform: {
      rotation: 0,
      flipX: false,
      flipY: false,
    },
    viewport: {
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    },
    activePreset: 'original',
  };
};

describe('canvas renderer text handles', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws the rotate handle for the active text while editing', () => {
    const renderer = new CanvasRenderer({} as HTMLCanvasElement);
    const rendererInternals = renderer as unknown as {
      drawActiveTextSelection: (
        ctx: CanvasRenderingContext2D,
        state: EditorState,
        sourceWidth: number,
        sourceHeight: number,
        imageRect: Rect,
      ) => void;
      drawTextRotateHandle: (
        ctx: CanvasRenderingContext2D,
        startPoint: { x: number; y: number },
        handlePoint: { x: number; y: number },
      ) => void;
    };
    let rotateHandleDrawn = false;

    rendererInternals.drawTextRotateHandle = () => {
      rotateHandleDrawn = true;
    };

    rendererInternals.drawActiveTextSelection(
      createFakeContext(),
      createTextState(),
      1200,
      800,
      { x: 0, y: 0, width: 1200, height: 800 },
    );

    expect(rotateHandleDrawn).toBe(true);
  });

  it('tracks frames per second from recent render timestamps', () => {
    const renderer = new CanvasRenderer({} as HTMLCanvasElement);
    const rendererInternals = renderer as unknown as {
      updateFrameStats: (now: number) => void;
    };

    rendererInternals.updateFrameStats(0);
    rendererInternals.updateFrameStats(16);
    rendererInternals.updateFrameStats(32);
    rendererInternals.updateFrameStats(48);

    expect(renderer.getFramesPerSecond()).toBeCloseTo(62.5, 1);
  });

  it('reuses processed canvas cache when only viewport changes', () => {
    const renderer = new CanvasRenderer({} as HTMLCanvasElement);
    const rendererInternals = renderer as unknown as {
      getProcessedPreview: (state: EditorState) => unknown;
    };
    const processed = {
      canvas: {} as HTMLCanvasElement,
      cropRect: { x: 0, y: 0, width: 1200, height: 800 },
    };
    const createProcessedCanvasSpy = vi
      .spyOn(imageProcessing, 'createProcessedCanvas')
      .mockReturnValue(processed);
    const baseState = createTextState();

    rendererInternals.getProcessedPreview(baseState);
    rendererInternals.getProcessedPreview({
      ...baseState,
      viewport: {
        zoom: 2,
        offsetX: 180,
        offsetY: -60,
      },
    });

    expect(createProcessedCanvasSpy).toHaveBeenCalledTimes(1);
  });

  it('invalidates processed canvas cache when brush strokes change', () => {
    const renderer = new CanvasRenderer({} as HTMLCanvasElement);
    const rendererInternals = renderer as unknown as {
      getProcessedPreview: (state: EditorState) => unknown;
    };
    const processed = {
      canvas: {} as HTMLCanvasElement,
      cropRect: { x: 0, y: 0, width: 1200, height: 800 },
    };
    const createProcessedCanvasSpy = vi
      .spyOn(imageProcessing, 'createProcessedCanvas')
      .mockReturnValue(processed);
    const baseState = createTextState();

    rendererInternals.getProcessedPreview(baseState);
    rendererInternals.getProcessedPreview({
      ...baseState,
      brushStrokes: [
        {
          id: 'stroke-1',
          type: 'brush',
          color: '#E9C083',
          size: 24,
          hardness: 0.68,
          points: [
            { xRatio: 0.2, yRatio: 0.3 },
            { xRatio: 0.25, yRatio: 0.35 },
          ],
        },
      ],
    });

    expect(createProcessedCanvasSpy).toHaveBeenCalledTimes(2);
  });
});
