import { describe, expect, it } from 'vitest';
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
      drawTextMoveHandle: (ctx: CanvasRenderingContext2D, rect: Rect) => void;
      drawTextRotateHandle: (
        ctx: CanvasRenderingContext2D,
        startPoint: { x: number; y: number },
        handlePoint: { x: number; y: number },
      ) => void;
    };
    let rotateHandleDrawn = false;

    rendererInternals.drawTextMoveHandle = () => undefined;
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
});
