import { PRESET_FILTERS } from './presets';
import { drawBrushStroke } from './brush-engine';
import { normalizeTextRotation, resolveTextLayout } from './text-engine';
import { normalizeTextState, type EditorAdjustments, type EditorState, type ImageResource, type Rect } from './types';
import { clamp, createCanvas, fullImageRect } from './utils';

interface RenderOptions {
  maxDimension?: number;
}

const resolveCropRect = (image: ImageResource, rect: Rect | null): Rect => rect ?? fullImageRect(image);

export const resolveProcessedCanvasSize = (
  cropRect: Rect,
  options: RenderOptions = {},
): { width: number; height: number; scale: number } => {
  const longestEdge = Math.max(cropRect.width, cropRect.height);
  const scale =
    options.maxDimension && longestEdge > options.maxDimension ? options.maxDimension / longestEdge : 1;

  return {
    width: Math.max(1, Math.round(cropRect.width * scale)),
    height: Math.max(1, Math.round(cropRect.height * scale)),
    scale,
  };
};

const drawPresetRegion = (
  image: ImageResource,
  cropRect: Rect,
  preset: EditorState['activePreset'],
  options: RenderOptions,
): HTMLCanvasElement => {
  const { width: targetWidth, height: targetHeight } = resolveProcessedCanvasSize(cropRect, options);
  const canvas = createCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('无法获取离屏 Canvas 上下文');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = PRESET_FILTERS[preset];
  ctx.drawImage(
    image.element,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  return canvas;
};

const applyAdjustments = (canvas: HTMLCanvasElement, adjustments: EditorAdjustments): void => {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('无法获取图像处理上下文');
  }

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  const contrastFactor = (100 + adjustments.contrast) / 100;
  const exposureFactor = 2 ** (adjustments.exposure / 50);
  const highlightsStrength = adjustments.highlights / 100;

  for (let index = 0; index < pixels.length; index += 4) {
    let red = pixels[index] * exposureFactor;
    let green = pixels[index + 1] * exposureFactor;
    let blue = pixels[index + 2] * exposureFactor;

    red = (red - 128) * contrastFactor + 128;
    green = (green - 128) * contrastFactor + 128;
    blue = (blue - 128) * contrastFactor + 128;

    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const highlightWeight = clamp((luminance - 150) / 105, 0, 1);
    const highlightOffset = 255 * highlightsStrength * highlightWeight * 0.45;

    pixels[index] = clamp(red + highlightOffset, 0, 255);
    pixels[index + 1] = clamp(green + highlightOffset, 0, 255);
    pixels[index + 2] = clamp(blue + highlightOffset, 0, 255);
  }

  ctx.putImageData(imageData, 0, 0);
};

const drawBrushStrokes = (canvas: HTMLCanvasElement, state: EditorState, cropRect: Rect): void => {
  const strokes = state.brushStrokes ?? [];

  if (!state.image || strokes.length === 0) {
    return;
  }

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('无法获取画笔渲染上下文');
  }

  for (const stroke of strokes) {
    drawBrushStroke(ctx, stroke, {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      cropRect,
      imageWidth: state.image.width,
      imageHeight: state.image.height,
    });
  }
};

const transformCanvas = (
  sourceCanvas: HTMLCanvasElement,
  rotation: number,
  flipX: boolean,
  flipY: boolean,
): HTMLCanvasElement => {
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const targetWidth = Math.ceil(
    Math.abs(sourceCanvas.width * cosine) + Math.abs(sourceCanvas.height * sine),
  );
  const targetHeight = Math.ceil(
    Math.abs(sourceCanvas.width * sine) + Math.abs(sourceCanvas.height * cosine),
  );
  const canvas = createCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('无法获取变换 Canvas 上下文');
  }

  ctx.save();
  ctx.translate(targetWidth / 2, targetHeight / 2);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.rotate(radians);
  ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
  ctx.restore();

  return canvas;
};

const FONT_FAMILY = '"Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

const drawTexts = (canvas: HTMLCanvasElement, state: EditorState): void => {
  const textState = normalizeTextState(state);

  if (textState.texts.length === 0) {
    return;
  }

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('无法获取文字渲染上下文');
  }

  for (const textItem of textState.texts) {
    const layout = resolveTextLayout(textItem, canvas.width, canvas.height, (text, fontSize) => {
      ctx.font = `${fontSize}px ${FONT_FAMILY}`;
      return ctx.measureText(text);
    });
    const radians = (normalizeTextRotation(textItem.rotation ?? 0) * Math.PI) / 180;

    ctx.save();
    ctx.font = `${textItem.fontSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = textItem.color;
    ctx.textAlign = textItem.align;
    ctx.textBaseline = 'alphabetic';
    ctx.translate(layout.anchorX, layout.anchorY);
    ctx.rotate(radians);

    for (const line of layout.lines) {
      ctx.fillText(line.text || ' ', 0, line.baselineY - layout.anchorY);
    }

    ctx.restore();
  }
};

export const createProcessedCanvas = (
  state: EditorState,
  options: RenderOptions = {},
): { canvas: HTMLCanvasElement; cropRect: Rect } | null => {
  if (!state.image) {
    return null;
  }

  const cropRect = resolveCropRect(state.image, state.cropRect);
  const workingCanvas = drawPresetRegion(state.image, cropRect, state.activePreset, options);

  applyAdjustments(workingCanvas, state.adjustments);
  drawBrushStrokes(workingCanvas, state, cropRect);

  return {
    canvas: (() => {
      const transformedCanvas = transformCanvas(
        workingCanvas,
        state.transform.rotation,
        state.transform.flipX,
        state.transform.flipY,
      );

      drawTexts(transformedCanvas, state);
      return transformedCanvas;
    })(),
    cropRect,
  };
};
