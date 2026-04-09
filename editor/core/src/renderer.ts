import { createProcessedCanvas, resolveProcessedCanvasSize } from './image-processing';
import {
  resolveTextCaretRect,
  resolveTextLayout,
  resolveTextRotateHandleScreenPoint,
  resolveTextScreenRect,
  toScreenTextPoint,
} from './text-engine';
import {
  normalizeBrushSettings,
  normalizeTextState,
  type CropViewMetrics,
  type EditorState,
  type PreviewViewMetrics,
  type Rect,
} from './types';
import { fullImageRect } from './utils';

const HANDLE_SIZE = 10;
const TEXT_SELECTION_PADDING = 6;
const ROTATED_TEXT_HANDLE_SIZE = 24;
const TEXT_FONT_FAMILY = '"Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';

type ScreenPoint = {
  x: number;
  y: number;
};

type ProcessedPreview = NonNullable<ReturnType<typeof createProcessedCanvas>>;

type ProcessedPreviewCache = {
  image: EditorState['image'];
  cropRectKey: string;
  preset: EditorState['activePreset'];
  adjustmentsKey: string;
  transformKey: string;
  textsKey: string;
  brushStrokesKey: string;
  result: ProcessedPreview;
};

const drawPolygonPath = (ctx: CanvasRenderingContext2D, points: ScreenPoint[]): void => {
  if (points.length === 0) {
    return;
  }

  ctx.beginPath();
  ctx.moveTo(points[0]!.x, points[0]!.y);

  for (const point of points.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }

  ctx.closePath();
};

const createCenteredRect = (centerX: number, centerY: number, size: number): Rect => ({
  x: centerX - size / 2,
  y: centerY - size / 2,
  width: size,
  height: size,
});

export class CanvasRenderer {
  private cropViewMetrics: CropViewMetrics | null = null;
  private previewViewMetrics: PreviewViewMetrics | null = null;
  private frameTimestamps: number[] = [];
  private framesPerSecond: number | null = null;
  private processedPreviewCache: ProcessedPreviewCache | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  getCropViewMetrics(): CropViewMetrics | null {
    return this.cropViewMetrics;
  }

  getPreviewViewMetrics(): PreviewViewMetrics | null {
    return this.previewViewMetrics;
  }

  getFramesPerSecond(): number | null {
    return this.framesPerSecond;
  }

  render(state: EditorState): void {
    const { width, height, ctx } = this.prepareCanvas();

    if (!state.image) {
      this.cropViewMetrics = null;
      this.previewViewMetrics = null;
      this.resetFrameStats();
      this.processedPreviewCache = null;
      return;
    }

    this.updateFrameStats();

    if (state.cropMode) {
      this.previewViewMetrics = null;
      this.renderCropMode(ctx, width, height, state);
      return;
    }

    this.cropViewMetrics = null;
    const processed = this.getProcessedPreview(state);

    if (!processed) {
      this.previewViewMetrics = null;
      return;
    }

    const baseRect = this.fitRect(processed.canvas.width, processed.canvas.height, width, height, 40);
    const imageRect = this.resolvePreviewRect(baseRect, width, height, state.viewport.zoom, state.viewport.offsetX, state.viewport.offsetY);
    this.previewViewMetrics = {
      canvasWidth: width,
      canvasHeight: height,
      sourceWidth: processed.canvas.width,
      sourceHeight: processed.canvas.height,
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
    this.drawActiveTextSelection(ctx, state, processed.canvas.width, processed.canvas.height, imageRect);
    this.drawBrushCursor(ctx, state, imageRect);
    this.drawInfo(ctx, imageRect, `${processed.canvas.width} × ${processed.canvas.height} · ${Math.round(state.viewport.zoom * 100)}%`);
  }

  private getProcessedPreview(state: EditorState): ProcessedPreview | null {
    if (!state.image) {
      return null;
    }

    const nextCacheKey = this.createProcessedPreviewCacheKey(state);

    if (
      this.processedPreviewCache &&
      this.processedPreviewCache.image === nextCacheKey.image &&
      this.processedPreviewCache.cropRectKey === nextCacheKey.cropRectKey &&
      this.processedPreviewCache.preset === nextCacheKey.preset &&
      this.processedPreviewCache.adjustmentsKey === nextCacheKey.adjustmentsKey &&
      this.processedPreviewCache.transformKey === nextCacheKey.transformKey &&
      this.processedPreviewCache.textsKey === nextCacheKey.textsKey &&
      this.processedPreviewCache.brushStrokesKey === nextCacheKey.brushStrokesKey
    ) {
      return this.processedPreviewCache.result;
    }

    const processed = createProcessedCanvas(state, { maxDimension: 1600 });

    if (!processed) {
      return null;
    }

    this.processedPreviewCache = {
      ...nextCacheKey,
      result: processed,
    };

    return processed;
  }

  private createProcessedPreviewCacheKey(state: EditorState): Omit<ProcessedPreviewCache, 'result'> {
    const textState = normalizeTextState(state);

    return {
      image: state.image,
      cropRectKey: state.cropRect
        ? `${state.cropRect.x},${state.cropRect.y},${state.cropRect.width},${state.cropRect.height}`
        : 'full',
      preset: state.activePreset,
      adjustmentsKey: `${state.adjustments.contrast},${state.adjustments.exposure},${state.adjustments.highlights}`,
      transformKey: `${state.transform.rotation},${state.transform.flipX ? 1 : 0},${state.transform.flipY ? 1 : 0}`,
      textsKey: JSON.stringify(
        textState.texts.map((text) => ({
          id: text.id,
          content: text.content,
          xRatio: text.xRatio,
          yRatio: text.yRatio,
          fontSize: text.fontSize,
          color: text.color,
          align: text.align,
          lineHeight: text.lineHeight,
          rotation: text.rotation,
        })),
      ),
      brushStrokesKey: JSON.stringify(
        (state.brushStrokes ?? []).map((stroke) => {
          const lastPoint = stroke.points[stroke.points.length - 1] ?? null;

          return {
            id: stroke.id,
            type: stroke.type,
            color: stroke.color,
            size: stroke.size,
            hardness: stroke.hardness,
            pointsLength: stroke.points.length,
            lastPoint,
          };
        }),
      ),
    };
  }

  private updateFrameStats(now = performance.now()): void {
    const windowStart = now - 1000;
    this.frameTimestamps.push(now);
    this.frameTimestamps = this.frameTimestamps.filter((timestamp) => timestamp >= windowStart);

    if (this.frameTimestamps.length < 2) {
      return;
    }

    const firstTimestamp = this.frameTimestamps[0]!;
    const lastTimestamp = this.frameTimestamps[this.frameTimestamps.length - 1]!;
    const duration = lastTimestamp - firstTimestamp;

    if (duration <= 0) {
      return;
    }

    this.framesPerSecond = ((this.frameTimestamps.length - 1) * 1000) / duration;
  }

  private resetFrameStats(): void {
    this.frameTimestamps = [];
    this.framesPerSecond = null;
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

  private drawBrushCursor(ctx: CanvasRenderingContext2D, state: EditorState, imageRect: Rect): void {
    if (!state.image || state.cropMode || state.activeTool !== 'brush' || !state.brushCursor || !this.previewViewMetrics) {
      return;
    }

    const cropRect = state.cropRect ?? fullImageRect(state.image);

    if (cropRect.width <= 0 || cropRect.height <= 0) {
      return;
    }

    const processedSize = resolveProcessedCanvasSize(cropRect, { maxDimension: 1600 });
    const cursorImageX = state.brushCursor.xRatio * state.image.width;
    const cursorImageY = state.brushCursor.yRatio * state.image.height;
    const workingX = ((cursorImageX - cropRect.x) / cropRect.width) * processedSize.width;
    const workingY = ((cursorImageY - cropRect.y) / cropRect.height) * processedSize.height;

    if (Number.isNaN(workingX) || Number.isNaN(workingY)) {
      return;
    }

    const radians = (state.transform.rotation * Math.PI) / 180;
    const centeredX = workingX - processedSize.width / 2;
    const centeredY = workingY - processedSize.height / 2;
    const rotatedX = centeredX * Math.cos(radians) - centeredY * Math.sin(radians);
    const rotatedY = centeredX * Math.sin(radians) + centeredY * Math.cos(radians);
    const sourceX = (state.transform.flipX ? -rotatedX : rotatedX) + this.previewViewMetrics.sourceWidth / 2;
    const sourceY = (state.transform.flipY ? -rotatedY : rotatedY) + this.previewViewMetrics.sourceHeight / 2;

    if (
      sourceX < 0 ||
      sourceY < 0 ||
      sourceX > this.previewViewMetrics.sourceWidth ||
      sourceY > this.previewViewMetrics.sourceHeight
    ) {
      return;
    }

    const brush = normalizeBrushSettings(state.brush);
    const workingRadius =
      Math.max(0.5, (brush.size * Math.min(processedSize.width / cropRect.width, processedSize.height / cropRect.height)) / 2);
    const displayScale = Math.min(
      imageRect.width / Math.max(this.previewViewMetrics.sourceWidth, Number.EPSILON),
      imageRect.height / Math.max(this.previewViewMetrics.sourceHeight, Number.EPSILON),
    );
    const displayRadius = Math.max(4, workingRadius * displayScale);
    const screenX = imageRect.x + (sourceX / this.previewViewMetrics.sourceWidth) * imageRect.width;
    const screenY = imageRect.y + (sourceY / this.previewViewMetrics.sourceHeight) * imageRect.height;

    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = brush.type === 'eraser' ? 'rgba(248, 250, 252, 0.92)' : 'rgba(248, 250, 252, 0.88)';
    ctx.fillStyle = brush.type === 'eraser' ? 'rgba(15, 23, 42, 0.18)' : 'rgba(233, 192, 131, 0.1)';
    ctx.beginPath();
    ctx.arc(screenX, screenY, displayRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawActiveTextSelection(
    ctx: CanvasRenderingContext2D,
    state: EditorState,
    sourceWidth: number,
    sourceHeight: number,
    imageRect: Rect,
  ): void {
    const textState = normalizeTextState(state);
    const activeText = textState.texts.find((text) => text.id === textState.activeTextId) ?? null;

    if (!activeText) {
      return;
    }

    const measureText = (text: string, fontSize: number): TextMetrics => {
      ctx.font = `${fontSize}px ${TEXT_FONT_FAMILY}`;
      return ctx.measureText(text);
    };
    const screenRect = resolveTextScreenRect(activeText, sourceWidth, sourceHeight, imageRect, measureText);

    if (!screenRect) {
      return;
    }

    const selectionPoints = this.resolveRotatedScreenRectPoints(
      activeText,
      sourceWidth,
      sourceHeight,
      imageRect,
      TEXT_SELECTION_PADDING,
      measureText,
    );

    if (selectionPoints) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = 'rgba(233, 192, 131, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.fillStyle = 'rgba(233, 192, 131, 0.12)';
      drawPolygonPath(ctx, selectionPoints);
      ctx.fill();
      drawPolygonPath(ctx, selectionPoints);
      ctx.stroke();
      ctx.restore();
    }

    if (textState.textToolState.mode === 'editing' && textState.textToolState.textId === activeText.id) {
      const caretPoints = this.resolveRotatedCaretPoints(
        activeText,
        sourceWidth,
        sourceHeight,
        imageRect,
        textState.textToolState.caretIndex,
        measureText,
      );

      if (caretPoints) {
        ctx.save();
        ctx.fillStyle = '#f8fafc';
        ctx.shadowColor = 'rgba(15, 23, 42, 0.45)';
        ctx.shadowBlur = 8;
        drawPolygonPath(ctx, caretPoints);
        ctx.fill();
        ctx.restore();
      }
    }

    const rotatedHandlePoint = resolveTextRotateHandleScreenPoint(
      activeText,
      sourceWidth,
      sourceHeight,
      imageRect,
      measureText,
    );

    const topCenterScreenPoint = this.resolveTextTopCenterScreenPoint(
      activeText,
      sourceWidth,
      sourceHeight,
      imageRect,
      measureText,
    );

    if (rotatedHandlePoint && topCenterScreenPoint) {
      this.drawTextRotateHandle(ctx, topCenterScreenPoint, rotatedHandlePoint);
    }
  }

  private drawTextRotateHandle(
    ctx: CanvasRenderingContext2D,
    startPoint: ScreenPoint,
    handlePoint: ScreenPoint,
  ): void {
    const handleRect = createCenteredRect(handlePoint.x, handlePoint.y, ROTATED_TEXT_HANDLE_SIZE);
    const radius = handleRect.width / 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(233, 192, 131, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startPoint.x, startPoint.y);
    ctx.lineTo(handlePoint.x, handlePoint.y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.beginPath();
    ctx.arc(handlePoint.x, handlePoint.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e9c083';
    ctx.beginPath();
    ctx.arc(handlePoint.x, handlePoint.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private resolveTextTopCenterScreenPoint(
    text: NonNullable<EditorState['texts']>[number],
    sourceWidth: number,
    sourceHeight: number,
    imageRect: Rect,
    measureText: (text: string, fontSize: number) => TextMetrics,
  ): ScreenPoint | null {
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return null;
    }

    const layout = resolveTextLayout(text, sourceWidth, sourceHeight, measureText);
    const sourcePoint = toScreenTextPoint(
      layout.bodyRect.x + layout.bodyRect.width / 2 - layout.anchorX,
      layout.bodyRect.y - layout.anchorY,
      layout.anchorX,
      layout.anchorY,
      text.rotation ?? 0,
    );

    return {
      x: imageRect.x + (sourcePoint.x / sourceWidth) * imageRect.width,
      y: imageRect.y + (sourcePoint.y / sourceHeight) * imageRect.height,
    };
  }

  private resolveRotatedScreenRectPoints(
    text: NonNullable<EditorState['texts']>[number],
    sourceWidth: number,
    sourceHeight: number,
    imageRect: Rect,
    padding: number,
    measureText: (text: string, fontSize: number) => TextMetrics,
  ): ScreenPoint[] | null {
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return null;
    }

    const layout = resolveTextLayout(text, sourceWidth, sourceHeight, measureText);
    const scaleX = imageRect.width / sourceWidth;
    const scaleY = imageRect.height / sourceHeight;

    if (scaleX <= 0 || scaleY <= 0) {
      return null;
    }

    const sourceRect = {
      x: layout.bodyRect.x - padding / scaleX,
      y: layout.bodyRect.y - padding / scaleY,
      width: layout.bodyRect.width + (padding * 2) / scaleX,
      height: layout.bodyRect.height + (padding * 2) / scaleY,
    };

    return this.toRotatedScreenPoints(sourceRect, layout.anchorX, layout.anchorY, text.rotation ?? 0, imageRect, sourceWidth, sourceHeight);
  }

  private resolveRotatedCaretPoints(
    text: NonNullable<EditorState['texts']>[number],
    sourceWidth: number,
    sourceHeight: number,
    imageRect: Rect,
    caretIndex: number,
    measureText: (text: string, fontSize: number) => TextMetrics,
  ): ScreenPoint[] | null {
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return null;
    }

    const layout = resolveTextLayout(text, sourceWidth, sourceHeight, measureText);
    const scaleX = imageRect.width / sourceWidth;
    const caretRect = resolveTextCaretRect(text, sourceWidth, sourceHeight, caretIndex, measureText);
    const sourceRect = {
      ...caretRect,
      width: Math.max(caretRect.width, 2 / Math.max(scaleX, Number.EPSILON)),
    };

    return this.toRotatedScreenPoints(sourceRect, layout.anchorX, layout.anchorY, text.rotation ?? 0, imageRect, sourceWidth, sourceHeight);
  }

  private toRotatedScreenPoints(
    rect: Rect,
    anchorX: number,
    anchorY: number,
    rotation: number,
    imageRect: Rect,
    sourceWidth: number,
    sourceHeight: number,
  ): ScreenPoint[] {
    const scaleX = imageRect.width / sourceWidth;
    const scaleY = imageRect.height / sourceHeight;
    const corners = [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ];

    return corners.map((corner) => {
      const rotated = toScreenTextPoint(corner.x - anchorX, corner.y - anchorY, anchorX, anchorY, rotation);

      return {
        x: imageRect.x + rotated.x * scaleX,
        y: imageRect.y + rotated.y * scaleY,
      };
    });
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

    return {
      x: (canvasWidth - width) / 2 + offsetX,
      y: (canvasHeight - height) / 2 + offsetY,
      width,
      height,
    };
  }
}
