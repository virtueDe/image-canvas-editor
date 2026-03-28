import type { Rect, TextOverlay } from './types';
import { clamp } from './utils';

export interface TextMeasurement {
  width: number;
  actualBoundingBoxAscent?: number;
  actualBoundingBoxDescent?: number;
}

export interface TextOverlayLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  baselineY: number;
  font: string;
}

export interface TextOverlayDrawConfig {
  text: string;
  x: number;
  y: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
}

const FONT_FAMILY = '"Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const DEFAULT_TEXT = '输入文字';
const DEFAULT_COLOR = '#F5EFE7';
const MIN_FONT_SIZE = 16;
const MAX_FONT_SIZE = 96;
const DEFAULT_FONT_SIZE = 48;
const DEFAULT_PADDING = 10;

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
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return fallbackMeasureText(text, fontSize);
  }

  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  const metrics = ctx.measureText(text);

  return {
    width: metrics.width,
    actualBoundingBoxAscent: metrics.actualBoundingBoxAscent,
    actualBoundingBoxDescent: metrics.actualBoundingBoxDescent,
  };
};

export const createDefaultTextOverlay = (): TextOverlay => ({
  text: DEFAULT_TEXT,
  xRatio: 0.5,
  yRatio: 0.5,
  fontSize: DEFAULT_FONT_SIZE,
  color: DEFAULT_COLOR,
});

export const sanitizeTextOverlay = (textOverlay: TextOverlay): TextOverlay => ({
  text: textOverlay.text,
  xRatio: clamp(textOverlay.xRatio, 0, 1),
  yRatio: clamp(textOverlay.yRatio, 0, 1),
  fontSize: Math.round(clamp(textOverlay.fontSize, MIN_FONT_SIZE, MAX_FONT_SIZE)),
  color: textOverlay.color,
});

export const resolveTextOverlayLayout = (
  textOverlay: TextOverlay,
  canvasWidth: number,
  canvasHeight: number,
  measureText: (text: string, fontSize: number) => TextMeasurement = defaultMeasureText,
): TextOverlayLayout => {
  const normalized = sanitizeTextOverlay(textOverlay);
  const renderText = normalized.text.trim() || ' ';
  const measurement = measureText(renderText, normalized.fontSize);
  const width = Math.max(measurement.width, normalized.fontSize * 0.5);
  const ascent = measurement.actualBoundingBoxAscent ?? normalized.fontSize * 0.78;
  const descent = measurement.actualBoundingBoxDescent ?? normalized.fontSize * 0.22;
  const height = ascent + descent;
  const anchorX = normalized.xRatio * canvasWidth;
  const anchorY = normalized.yRatio * canvasHeight;

  return {
    x: anchorX - width / 2,
    y: anchorY - height / 2,
    width,
    height,
    anchorX,
    anchorY,
    baselineY: anchorY + ascent / 2 - descent / 2,
    font: `${normalized.fontSize}px ${FONT_FAMILY}`,
  };
};

export const resolveTextOverlayDrawConfig = (
  textOverlay: TextOverlay,
  canvasWidth: number,
  canvasHeight: number,
  measureText: (text: string, fontSize: number) => TextMeasurement = defaultMeasureText,
): TextOverlayDrawConfig => {
  const normalized = sanitizeTextOverlay(textOverlay);
  const layout = resolveTextOverlayLayout(normalized, canvasWidth, canvasHeight, measureText);

  return {
    text: normalized.text || ' ',
    x: layout.anchorX,
    y: layout.baselineY,
    font: layout.font,
    textAlign: 'center',
    textBaseline: 'alphabetic',
  };
};

export const resolveTextOverlayScreenRect = (
  textOverlay: TextOverlay,
  sourceWidth: number,
  sourceHeight: number,
  displayRect: Pick<Rect, 'x' | 'y' | 'width' | 'height'>,
  measureText: (text: string, fontSize: number) => TextMeasurement = defaultMeasureText,
): Rect | null => {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return null;
  }

  const layout = resolveTextOverlayLayout(textOverlay, sourceWidth, sourceHeight, measureText);
  const scaleX = displayRect.width / sourceWidth;
  const scaleY = displayRect.height / sourceHeight;

  return {
    x: displayRect.x + layout.x * scaleX,
    y: displayRect.y + layout.y * scaleY,
    width: layout.width * scaleX,
    height: layout.height * scaleY,
  };
};

export const isPointInTextOverlay = (
  layout: Pick<TextOverlayLayout, 'x' | 'y' | 'width' | 'height'>,
  pointX: number,
  pointY: number,
  padding = DEFAULT_PADDING,
): boolean =>
  pointX >= layout.x - padding &&
  pointX <= layout.x + layout.width + padding &&
  pointY >= layout.y - padding &&
  pointY <= layout.y + layout.height + padding;

export const resolveTextOverlayPosition = (
  anchorX: number,
  anchorY: number,
  canvasWidth: number,
  canvasHeight: number,
): Pick<TextOverlay, 'xRatio' | 'yRatio'> => ({
  xRatio: canvasWidth > 0 ? clamp(anchorX / canvasWidth, 0, 1) : 0.5,
  yRatio: canvasHeight > 0 ? clamp(anchorY / canvasHeight, 0, 1) : 0.5,
});
