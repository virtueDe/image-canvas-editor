import { afterEach, describe, expect, it } from 'vitest';
import { createProcessedCanvas } from './image-processing';
import type { EditorState } from './types';

type MockContext = {
  drawCalls: Array<{
    text: string;
    x: number;
    y: number;
    textAlign: string;
    fillStyle: string;
  }>;
};

type MockCanvasDocument = {
  createElement: (tagName: string) => {
    width: number;
    height: number;
    getContext: () => {
      imageSmoothingEnabled: boolean;
      imageSmoothingQuality: string;
      filter: string;
      font: string;
      fillStyle: string;
      textAlign: string;
      textBaseline: string;
      drawImage: () => void;
      getImageData: () => { data: Uint8ClampedArray };
      putImageData: () => void;
      save: () => void;
      restore: () => void;
      translate: () => void;
      scale: () => void;
      rotate: () => void;
      measureText: (text: string) => {
        width: number;
        actualBoundingBoxAscent: number;
        actualBoundingBoxDescent: number;
      };
      fillText: (text: string, x: number, y: number) => void;
    };
  };
};

const globalDocument = globalThis as typeof globalThis & {
  document?: MockCanvasDocument;
};
const originalDocument = globalDocument.document;

const createMockCanvasDocument = (context: MockContext): MockCanvasDocument => ({
  createElement: () => {
    const ctx = {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
      filter: 'none',
      font: '',
      fillStyle: '#000000',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      drawImage: () => undefined,
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: () => undefined,
      save: () => undefined,
      restore: () => undefined,
      translate: () => undefined,
      scale: () => undefined,
      rotate: () => undefined,
      measureText: (text: string) => ({
        width:
          {
            第一行: 64,
            第二行: 72,
            尾注: 36,
            ' ': 16,
          }[text] ?? Math.max(16, text.length * 16),
        actualBoundingBoxAscent: 24,
        actualBoundingBoxDescent: 8,
      }),
      fillText: (text: string, x: number, y: number) => {
        context.drawCalls.push({
          text,
          x,
          y,
          textAlign: ctx.textAlign,
          fillStyle: String(ctx.fillStyle),
        });
      },
    };

    return {
      width: 0,
      height: 0,
      getContext: () => ctx,
    };
  },
});

const makeStateWithTexts = (texts: NonNullable<EditorState['texts']>): EditorState => ({
  image: {
    element: {} as HTMLImageElement,
    width: 1200,
    height: 800,
    name: 'sample.png',
    dataUrl: 'data:image/png;base64,stub',
  },
  cropRect: null,
  draftCropRect: null,
  cropMode: false,
  textOverlay: null,
  texts,
  activeTextId: texts[0]?.id ?? null,
  textToolState: {
    mode: 'idle',
    hoverTextId: null,
  },
  adjustments: { contrast: 0, exposure: 0, highlights: 0 },
  transform: { rotation: 0, flipX: false, flipY: false },
  viewport: { zoom: 1, offsetX: 0, offsetY: 0 },
  activePreset: 'original',
});

afterEach(() => {
  if (originalDocument) {
    globalDocument.document = originalDocument;
    return;
  }

  delete globalDocument.document;
});

describe('text export rendering', () => {
  it('draws multiline text content from texts[] instead of relying on legacy textOverlay', () => {
    const context: MockContext = { drawCalls: [] };
    globalDocument.document = createMockCanvasDocument(context);

    const result = createProcessedCanvas(
      makeStateWithTexts([
        {
          id: 'text-1',
          content: '第一行\n第二行',
          xRatio: 0.5,
          yRatio: 0.5,
          fontSize: 32,
          color: '#ffffff',
          align: 'center',
          lineHeight: 1.25,
        },
        {
          id: 'text-2',
          content: '尾注',
          xRatio: 0.18,
          yRatio: 0.82,
          fontSize: 20,
          color: '#38BDF8',
          align: 'left',
          lineHeight: 1.25,
        },
      ]),
    );

    expect(result).not.toBeNull();
    expect(context.drawCalls.map((call) => call.text)).toEqual(['第一行', '第二行', '尾注']);
    expect(context.drawCalls[0]?.textAlign).toBe('center');
    expect(context.drawCalls[2]).toMatchObject({
      textAlign: 'left',
      fillStyle: '#38BDF8',
    });
  });
});
