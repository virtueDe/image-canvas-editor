import type { Rect, TextItem } from './types';
import { clamp } from './utils';

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
const EMPTY_LINE_MIN_WIDTH_FACTOR = 2;

type MeasuredTextLine = {
  text: string;
  width: number;
  ascent: number;
  descent: number;
};

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

const measureLayoutLines = (
  item: TextItem,
  measureText: (text: string, fontSize: number) => TextMeasurement,
): MeasuredTextLine[] =>
  splitTextLines(item.content).map((text) => {
    const renderText = text || ' ';
    const metrics = measureText(renderText, item.fontSize);
    const minWidth = text.length === 0 ? item.fontSize * EMPTY_LINE_MIN_WIDTH_FACTOR : 0;

    return {
      text,
      width: Math.max(minWidth, metrics.width),
      ascent: metrics.actualBoundingBoxAscent ?? item.fontSize * 0.78,
      descent: metrics.actualBoundingBoxDescent ?? item.fontSize * 0.22,
    };
  });

const resolveLineBodyX = (item: TextItem, lineWidth: number, anchorX: number): number =>
  resolveBodyX(item.align, anchorX, lineWidth);

const resolveCaretLinePosition = (
  content: string,
  caretIndex: number,
): {
  lineIndex: number;
  columnIndex: number;
} => {
  const normalized = normalizeLineBreaks(content);
  const lines = splitTextLines(normalized);
  let remaining = clamp(caretIndex, 0, normalized.length);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;

    if (remaining <= line.length) {
      return {
        lineIndex: index,
        columnIndex: remaining,
      };
    }

    remaining -= line.length;

    if (index < lines.length - 1) {
      remaining -= 1;
    }
  }

  const lastLine = lines[lines.length - 1] ?? '';

  return {
    lineIndex: Math.max(0, lines.length - 1),
    columnIndex: lastLine.length,
  };
};

export const resolveTextLayout = (
  item: TextItem,
  canvasWidth: number,
  canvasHeight: number,
  measureText: (text: string, fontSize: number) => TextMeasurement = defaultMeasureText,
): TextLayout => {
  const lineAdvance = item.fontSize * item.lineHeight;
  const anchorX = item.xRatio * canvasWidth;
  const anchorY = item.yRatio * canvasHeight;
  const measuredLines = measureLayoutLines(item, measureText);
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

export const resolveTextCaretRect = (
  item: TextItem,
  canvasWidth: number,
  canvasHeight: number,
  caretIndex: number,
  measureText: (text: string, fontSize: number) => TextMeasurement = defaultMeasureText,
): Rect => {
  const layout = resolveTextLayout(item, canvasWidth, canvasHeight, measureText);
  const measuredLines = measureLayoutLines(item, measureText);
  const { lineIndex, columnIndex } = resolveCaretLinePosition(item.content, caretIndex);
  const line = measuredLines[lineIndex] ?? measuredLines[measuredLines.length - 1]!;
  const layoutLine = layout.lines[lineIndex] ?? layout.lines[layout.lines.length - 1]!;
  const prefix = line.text.slice(0, columnIndex);
  const prefixWidth = prefix.length > 0 ? measureText(prefix, item.fontSize).width : 0;
  const lineX = resolveLineBodyX(item, line.width, layout.anchorX);

  return {
    x: lineX + prefixWidth,
    y: layoutLine.baselineY - line.ascent,
    width: 2,
    height: line.ascent + line.descent,
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

export const resolveTextCaretScreenRect = (
  item: TextItem,
  sourceWidth: number,
  sourceHeight: number,
  displayRect: Pick<Rect, 'x' | 'y' | 'width' | 'height'>,
  caretIndex: number,
  measureText: (text: string, fontSize: number) => TextMeasurement = defaultMeasureText,
): Rect | null => {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  const caretRect = resolveTextCaretRect(item, sourceWidth, sourceHeight, caretIndex, measureText);
  const scaleX = displayRect.width / sourceWidth;
  const scaleY = displayRect.height / sourceHeight;

  return {
    x: displayRect.x + caretRect.x * scaleX,
    y: displayRect.y + caretRect.y * scaleY,
    width: Math.max(2, caretRect.width * scaleX),
    height: caretRect.height * scaleY,
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
