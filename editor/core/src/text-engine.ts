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
const DRAG_HANDLE_SIZE = 24;
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

const normalizeLineBreaks = (content: string): string => content.replace(/\r\n?/g, '\n');

export const splitTextLines = (content: string): string[] => normalizeLineBreaks(content).split('\n');

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
  const firstLine = measuredLines[0]!;
  const lastLine = measuredLines[measuredLines.length - 1]!;
  const height =
    firstLine.ascent +
    lastLine.descent +
    (measuredLines.length > 1 ? lineAdvance * (measuredLines.length - 1) : 0);
  const bodyX = resolveBodyX(item.align, anchorX, width);
  const bodyY = anchorY - height / 2;
  const firstBaselineY = bodyY + firstLine.ascent;

  return {
    lines: measuredLines.map((line, index) => ({
      text: line.text,
      width: line.width,
      baselineY: firstBaselineY + index * lineAdvance,
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

/**
 * 基于屏幕空间正文矩形生成拖拽手柄命中区；请勿传入 source/image 坐标。
 */
export const resolveDragHandleScreenRect = (screenBodyRect: Rect): Rect => ({
  x: screenBodyRect.x + screenBodyRect.width + DRAG_HANDLE_GAP,
  y: screenBodyRect.y - DRAG_HANDLE_SIZE - DRAG_HANDLE_GAP,
  width: DRAG_HANDLE_SIZE,
  height: DRAG_HANDLE_SIZE,
});

export const resolveDragHandleRect = (screenBodyRect: Rect): Rect =>
  resolveDragHandleScreenRect(screenBodyRect);

export const isPointInTextBlock = (bodyRect: Rect, pointX: number, pointY: number): boolean =>
  pointX >= bodyRect.x &&
  pointX <= bodyRect.x + bodyRect.width &&
  pointY >= bodyRect.y &&
  pointY <= bodyRect.y + bodyRect.height;
