import { clamp } from './utils';
import type { BrushStroke, Rect } from './types';

export interface BrushRenderOptions {
  canvasWidth: number;
  canvasHeight: number;
  cropRect: Rect;
  imageWidth: number;
  imageHeight: number;
}

type BrushTypeRenderConfig = {
  flow: number;
  spacingRatio: number;
  minHardness: number;
};

const BRUSH_TYPE_CONFIG: Record<BrushStroke['type'], BrushTypeRenderConfig> = {
  pencil: {
    flow: 1,
    spacingRatio: 0.18,
    minHardness: 0.92,
  },
  brush: {
    flow: 0.88,
    spacingRatio: 0.22,
    minHardness: 0.12,
  },
  pen: {
    flow: 0.96,
    spacingRatio: 0.14,
    minHardness: 0.72,
  },
  eraser: {
    flow: 1,
    spacingRatio: 0.2,
    minHardness: 0.18,
  },
};

const toRgba = (hexColor: string, alpha: number): string => {
  const normalized = hexColor.trim();

  if (!normalized.startsWith('#')) {
    return `rgba(255,255,255,${alpha})`;
  }

  const compact = normalized.slice(1);
  const expanded =
    compact.length === 3
      ? compact
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : compact;

  if (expanded.length !== 6) {
    return `rgba(255,255,255,${alpha})`;
  }

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const createCanvasPointResolver = (options: BrushRenderOptions) => {
  const scaleX = options.canvasWidth / options.cropRect.width;
  const scaleY = options.canvasHeight / options.cropRect.height;

  return (point: BrushStroke['points'][number]) => ({
    x: (point.xRatio * options.imageWidth - options.cropRect.x) * scaleX,
    y: (point.yRatio * options.imageHeight - options.cropRect.y) * scaleY,
  });
};

const resolveBrushRadius = (
  stroke: BrushStroke,
  options: BrushRenderOptions,
): number => {
  const scale = Math.min(options.canvasWidth / options.cropRect.width, options.canvasHeight / options.cropRect.height);
  return Math.max(0.5, (stroke.size * scale) / 2);
};

const stampBrush = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  hardness: number,
  color: string,
  alpha: number,
): void => {
  const safeHardness = clamp(hardness, 0.02, 0.999);
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);

  gradient.addColorStop(0, toRgba(color, alpha));
  gradient.addColorStop(safeHardness, toRgba(color, alpha));
  gradient.addColorStop(1, toRgba(color, 0));

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
};

export const drawBrushStroke = (
  ctx: CanvasRenderingContext2D,
  stroke: BrushStroke,
  options: BrushRenderOptions,
): void => {
  if (stroke.points.length === 0 || options.cropRect.width <= 0 || options.cropRect.height <= 0) {
    return;
  }

  const config = BRUSH_TYPE_CONFIG[stroke.type];
  const radius = resolveBrushRadius(stroke, options);
  const hardness = Math.max(config.minHardness, stroke.hardness);
  const spacing = Math.max(0.75, radius * config.spacingRatio * 2);
  const toCanvasPoint = createCanvasPointResolver(options);
  const points = stroke.points.map((point) => toCanvasPoint(point));

  ctx.save();
  ctx.globalCompositeOperation = stroke.type === 'eraser' ? 'destination-out' : 'source-over';

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const previous = points[index - 1];

    if (!previous) {
      stampBrush(ctx, current.x, current.y, radius, hardness, stroke.color, config.flow);
      continue;
    }

    const deltaX = current.x - previous.x;
    const deltaY = current.y - previous.y;
    const distance = Math.hypot(deltaX, deltaY);
    const steps = Math.max(1, Math.ceil(distance / spacing));

    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;

      stampBrush(
        ctx,
        previous.x + deltaX * ratio,
        previous.y + deltaY * ratio,
        radius,
        hardness,
        stroke.color,
        config.flow,
      );
    }
  }

  ctx.restore();
};
