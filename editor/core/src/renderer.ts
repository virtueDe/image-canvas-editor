import { createProcessedCanvas } from './image-processing';
import type { CropViewMetrics, EditorState, PreviewViewMetrics, Rect } from './types';
import { clamp, createCanvas, fullImageRect } from './utils';

const HANDLE_SIZE = 10;

export class CanvasRenderer {
  private cropViewMetrics: CropViewMetrics | null = null;
  private previewViewMetrics: PreviewViewMetrics | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  getCropViewMetrics(): CropViewMetrics | null {
    return this.cropViewMetrics;
  }

  getPreviewViewMetrics(): PreviewViewMetrics | null {
    return this.previewViewMetrics;
  }

  render(state: EditorState): void {
    const { width, height, ctx } = this.prepareCanvas();

    // this.drawBackground(ctx, width, height);

    if (!state.image) {
      this.cropViewMetrics = null;
      this.previewViewMetrics = null;
      return;
    }

    if (state.cropMode) {
      this.previewViewMetrics = null;
      this.renderCropMode(ctx, width, height, state);
      return;
    }

    this.cropViewMetrics = null;
    const processed = createProcessedCanvas(state, { maxDimension: 1600 });

    if (!processed) {
      this.previewViewMetrics = null;
      return;
    }

    const baseRect = this.fitRect(processed.canvas.width, processed.canvas.height, width, height, 40);
    const imageRect = this.resolvePreviewRect(baseRect, width, height, state.viewport.zoom, state.viewport.offsetX, state.viewport.offsetY);
    this.previewViewMetrics = {
      canvasWidth: width,
      canvasHeight: height,
      baseDisplayWidth: baseRect.width,
      baseDisplayHeight: baseRect.height,
      displayX: imageRect.x,
      displayY: imageRect.y,
      displayWidth: imageRect.width,
      displayHeight: imageRect.height,
    };
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(processed.canvas, imageRect.x, imageRect.y, imageRect.width, imageRect.height);
    this.drawInfo(ctx, imageRect, `${processed.canvas.width} × ${processed.canvas.height} · ${Math.round(state.viewport.zoom * 100)}%`);
  }

  private prepareCanvas(): {
    width: number;
    height: number;
    ctx: CanvasRenderingContext2D;
  } {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect?.width ?? 960));
    const height = Math.max(420, Math.floor(rect?.height ?? 680));
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    const ctx = this.canvas.getContext('2d');

    if (!ctx) {
      throw new Error('无法获取预览 Canvas 上下文');
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    return { width, height, ctx };
  }

  private drawBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    const tile = createCanvas(24, 24);
    const tileCtx = tile.getContext('2d');

    if (!tileCtx) {
      return;
    }

    tileCtx.fillStyle = '#0f172a';
    tileCtx.fillRect(0, 0, 24, 24);
    tileCtx.fillStyle = '#111827';
    tileCtx.fillRect(0, 0, 12, 12);
    tileCtx.fillRect(12, 12, 12, 12);

    const pattern = ctx.createPattern(tile, 'repeat');

    if (!pattern) {
      return;
    }

    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
  }

  private renderCropMode(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    state: EditorState,
  ): void {
    if (!state.image) {
      return;
    }

    const viewRect = this.fitRect(state.image.width, state.image.height, width, height, 40);
    this.cropViewMetrics = {
      displayX: viewRect.x,
      displayY: viewRect.y,
      displayWidth: viewRect.width,
      displayHeight: viewRect.height,
      sourceWidth: state.image.width,
      sourceHeight: state.image.height,
    };

    ctx.drawImage(state.image.element, viewRect.x, viewRect.y, viewRect.width, viewRect.height);

    const cropRect = state.draftCropRect ?? state.cropRect ?? fullImageRect(state.image);
    const screenRect = this.toScreenRect(cropRect, this.cropViewMetrics);

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.58)';
    ctx.beginPath();
    ctx.rect(viewRect.x, viewRect.y, viewRect.width, viewRect.height);
    ctx.rect(screenRect.x, screenRect.y, screenRect.width, screenRect.height);
    ctx.fill('evenodd');
    ctx.restore();

    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2;
    ctx.strokeRect(screenRect.x, screenRect.y, screenRect.width, screenRect.height);

    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(screenRect.x + screenRect.width / 3, screenRect.y);
    ctx.lineTo(screenRect.x + screenRect.width / 3, screenRect.y + screenRect.height);
    ctx.moveTo(screenRect.x + (screenRect.width / 3) * 2, screenRect.y);
    ctx.lineTo(screenRect.x + (screenRect.width / 3) * 2, screenRect.y + screenRect.height);
    ctx.moveTo(screenRect.x, screenRect.y + screenRect.height / 3);
    ctx.lineTo(screenRect.x + screenRect.width, screenRect.y + screenRect.height / 3);
    ctx.moveTo(screenRect.x, screenRect.y + (screenRect.height / 3) * 2);
    ctx.lineTo(screenRect.x + screenRect.width, screenRect.y + (screenRect.height / 3) * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    this.drawHandles(ctx, screenRect);
    this.drawInfo(ctx, viewRect, `裁剪模式：${Math.round(cropRect.width)} × ${Math.round(cropRect.height)}`);
  }

  private drawHandles(ctx: CanvasRenderingContext2D, rect: Rect): void {
    const points = [
      [rect.x, rect.y],
      [rect.x + rect.width, rect.y],
      [rect.x, rect.y + rect.height],
      [rect.x + rect.width, rect.y + rect.height],
    ];

    ctx.fillStyle = '#f8fafc';
    points.forEach(([x, y]) => {
      ctx.fillRect(x - HANDLE_SIZE / 2, y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    });
  }

  private drawInfo(ctx: CanvasRenderingContext2D, rect: Rect, text: string): void {
    const paddingX = 12;
    const baselineY = Math.max(18, rect.y - 18);

    ctx.font = '13px "Segoe UI", sans-serif';
    const textWidth = ctx.measureText(text).width;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.fillRect(rect.x, baselineY - 14, textWidth + paddingX * 2, 28);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(text, rect.x + paddingX, baselineY + 4);
  }

  private fitRect(sourceWidth: number, sourceHeight: number, maxWidth: number, maxHeight: number, gap: number): Rect {
    const availableWidth = maxWidth - gap * 2;
    const availableHeight = maxHeight - gap * 2;
    const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight, 1);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;

    return {
      x: (maxWidth - width) / 2,
      y: (maxHeight - height) / 2,
      width,
      height,
    };
  }

  private toScreenRect(rect: Rect, metrics: CropViewMetrics): Rect {
    const scaleX = metrics.displayWidth / metrics.sourceWidth;
    const scaleY = metrics.displayHeight / metrics.sourceHeight;

    return {
      x: metrics.displayX + rect.x * scaleX,
      y: metrics.displayY + rect.y * scaleY,
      width: rect.width * scaleX,
      height: rect.height * scaleY,
    };
  }

  private resolvePreviewRect(
    baseRect: Rect,
    canvasWidth: number,
    canvasHeight: number,
    zoom: number,
    offsetX: number,
    offsetY: number,
  ): Rect {
    const width = baseRect.width * zoom;
    const height = baseRect.height * zoom;
    const maxOffsetX = Math.max(0, (width - baseRect.width) / 2);
    const maxOffsetY = Math.max(0, (height - baseRect.height) / 2);
    const safeOffsetX = clamp(offsetX, -maxOffsetX, maxOffsetX);
    const safeOffsetY = clamp(offsetY, -maxOffsetY, maxOffsetY);

    return {
      x: (canvasWidth - width) / 2 + safeOffsetX,
      y: (canvasHeight - height) / 2 + safeOffsetY,
      width,
      height,
    };
  }
}
