import type { Rect, TextItem } from './types';

export interface TextMeasurement {
  width: number;
  actualBoundingBoxAscent?: number;
  actualBoundingBoxDescent?: number;
}

export interface TextLayoutLine {
  text: string;
  width: number;
  baselineY: number;
}

export interface TextLayout {
  lines: TextLayoutLine[];
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  bodyRect: Rect;
}

const FONT_FAMILY = '"Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const DRAG_HANDLE_SIZE = 18;
const DRAG_HANDLE_GAP = 12;

const fallbackMeasureText = (text: string, fontSize: number): TextMeasurement => ({
  width: Math.max(fontSize * 0.6, text.length * fontSize * 0.6),
  actualBoundingBoxAscent: fontSize * 0.78,
  actualBoundingBoxDescent: fontSize * 0.22,
});

const defaultMeasureText = (text: string, fontSize: number): TextMeasurement => {
  if (typeof document === 'undefined') {
    return fallbackMeasureText(text, fontSize);
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    return fallbackMeasureText(text, fontSize);
  }

  context.font = `${fontSize}px ${FONT_FAMILY}`;
  const metrics = context.measureText(text);

  return {
    width: metrics.width,
    actualBoundingBoxAscent: metrics.actualBoundingBoxAscent,
    actualBoundingBoxDescent: metrics.actualBoundingBoxDescent,
  };
};

const resolveBodyX = (align: TextItem['align'], anchorX: number, width: number): number => {
  switch (align) {
    case 'left':
      return anchorX;
    case 'right':
      return anchorX - width;
    case 'center':
    default:
      return anchorX - width / 2;
  }
};

export const splitTextLines = (content: string): string[] => content.split('\n');

export const resolveTextLayout = (
  item: TextItem,
  canvasWidth: number,
  canvasHeight: number,
  measureText: (text: string, fontSize: number) => TextMeasurement = defaultMeasureText,
): TextLayout => {
  const lines = splitTextLines(item.content);
  const lineAdvance = item.fontSize * item.lineHeight;
  const anchorX = item.xRatio * canvasWidth;
  const anchorY = item.yRatio * canvasHeight;
  const measuredLines = lines.map((text) => {
    const renderText = text || ' ';
    const metrics = measureText(renderText, item.fontSize);

    return {
      text,
      width: metrics.width,
      ascent: metrics.actualBoundingBoxAscent ?? item.fontSize * 0.78,
      descent: metrics.actualBoundingBoxDescent ?? item.fontSize * 0.22,
    };
  });
  const width = Math.max(item.fontSize * 0.5, ...measuredLines.map((line) => line.width));
  const height = Math.max(item.fontSize, lineAdvance * measuredLines.length);
  const bodyX = resolveBodyX(item.align, anchorX, width);
  const bodyY = anchorY - height / 2;

  return {
    lines: measuredLines.map((line, index) => ({
      text: line.text,
      width: line.width,
      baselineY: bodyY + line.ascent + index * lineAdvance,
    })),
    width,
    height,
    anchorX,
    anchorY,
    bodyRect: {
      x: bodyX,
      y: bodyY,
      width,
      height,
    },
  };
};

export const resolveTextScreenRect = (
  item: TextItem,
  sourceWidth: number,
  sourceHeight: number,
  displayRect: Pick<Rect, 'x' | 'y' | 'width' | 'height'>,
  measureText: (text: string, fontSize: number) => TextMeasurement = defaultMeasureText,
): Rect | null => {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  const layout = resolveTextLayout(item, sourceWidth, sourceHeight, measureText);
  const scaleX = displayRect.width / sourceWidth;
  const scaleY = displayRect.height / sourceHeight;

  return {
    x: displayRect.x + layout.bodyRect.x * scaleX,
    y: displayRect.y + layout.bodyRect.y * scaleY,
    width: layout.bodyRect.width * scaleX,
    height: layout.bodyRect.height * scaleY,
  };
};

export const resolveDragHandleRect = (bodyRect: Rect): Rect => ({
  x: bodyRect.x + bodyRect.width + DRAG_HANDLE_GAP,
  y: bodyRect.y + bodyRect.height / 2 - DRAG_HANDLE_SIZE / 2,
  width: DRAG_HANDLE_SIZE,
  height: DRAG_HANDLE_SIZE,
});

export const isPointInTextBlock = (bodyRect: Rect, pointX: number, pointY: number): boolean =>
  pointX >= bodyRect.x &&
  pointX <= bodyRect.x + bodyRect.width &&
  pointY >= bodyRect.y &&
  pointY <= bodyRect.y + bodyRect.height;
