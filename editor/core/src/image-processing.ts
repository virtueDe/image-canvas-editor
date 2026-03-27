import { PRESET_FILTERS } from './presets';
import type { EditorAdjustments, EditorState, ImageResource, Rect } from './types';
import { resolveTextOverlayDrawConfig, sanitizeTextOverlay } from './text-overlay';
import { clamp, createCanvas, fullImageRect } from './utils';

interface RenderOptions {
  maxDimension?: number;
}

const resolveCropRect = (image: ImageResource, rect: Rect | null): Rect => rect ?? fullImageRect(image);

const drawPresetRegion = (
  image: ImageResource,
  cropRect: Rect,
  preset: EditorState['activePreset'],
  options: RenderOptions,
): HTMLCanvasElement => {
  const longestEdge = Math.max(cropRect.width, cropRect.height);
  const scale =
    options.maxDimension && longestEdge > options.maxDimension ? options.maxDimension / longestEdge : 1;
  const targetWidth = Math.max(1, Math.round(cropRect.width * scale));
  const targetHeight = Math.max(1, Math.round(cropRect.height * scale));
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

  ctx.translate(targetWidth / 2, targetHeight / 2);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.rotate(radians);
  ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);

  return canvas;
};

const drawTextOverlay = (canvas: HTMLCanvasElement, state: EditorState): void => {
  if (!state.textOverlay) {
    return;
  }

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('无法获取文字渲染上下文');
  }

  const textOverlay = sanitizeTextOverlay(state.textOverlay);
  const drawConfig = resolveTextOverlayDrawConfig(textOverlay, canvas.width, canvas.height, (text, fontSize) => {
    ctx.font = `${fontSize}px "Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif`;
    return ctx.measureText(text);
  });

  ctx.save();
  ctx.font = drawConfig.font;
  ctx.fillStyle = textOverlay.color;
  ctx.textAlign = drawConfig.textAlign;
  ctx.textBaseline = drawConfig.textBaseline;
  ctx.fillText(drawConfig.text, drawConfig.x, drawConfig.y);
  ctx.restore();
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

  return {
    canvas: (() => {
      const transformedCanvas = transformCanvas(
        workingCanvas,
        state.transform.rotation,
        state.transform.flipX,
        state.transform.flipY,
      );

      drawTextOverlay(transformedCanvas, state);
      return transformedCanvas;
    })(),
    cropRect,
  };
};
