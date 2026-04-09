import { createProcessedCanvas, resolveProcessedCanvasSize } from './image-processing';
import { createLocalDraftStore, type DraftStore } from './persistence';
import { CanvasRenderer } from './renderer';
import { EditorStore } from './store';
import {
  applyHistorySnapshot,
  captureHistorySnapshot,
  pushHistorySnapshot,
  snapshotsEqual,
  type HistorySnapshot,
} from './history';
import {
  cloneBrushStrokes,
  createDefaultBrushSettings,
  createIdleBrushToolState,
  createIdleTextToolState,
  normalizeBrushSettings,
  normalizeBrushToolState,
  normalizeTextState,
  textItemToTextOverlay,
  type BrushStroke,
  type BrushStrokePoint,
  type BrushToolState,
  type BrushType,
  type CropViewMetrics,
  type EditorState,
  type FilterPreset,
  type ImageResource,
  type PreviewViewMetrics,
  type Rect,
  type TextItem,
  type TextToolState,
} from './types';
import {
  isPointInTextBlock,
  isPointInRotatedTextBlock,
  normalizeTextRotation,
  resolveEmptyTextAnchorCompensation,
  resolveTextRotateHandleScreenPoint,
  resolveTextScreenRect,
} from './text-engine';
import {
  approximatelyFullRect,
  clamp,
  clampViewportOffset,
  fullImageRect,
  loadImageFromDataUrl,
  normalizeRect,
  pointInRect,
  readFileAsDataUrl,
  softenViewportOffset,
} from './utils';
import {
  createDefaultTextOverlay,
  sanitizeTextOverlay,
} from './text-overlay';

type CropHandle = 'inside' | 'nw' | 'ne' | 'sw' | 'se';

type CropInteraction =
  | { mode: 'idle' }
  | { mode: 'creating'; startX: number; startY: number }
  | { mode: 'moving'; originX: number; originY: number; rect: Rect }
  | { mode: 'resizing'; handle: Exclude<CropHandle, 'inside'>; rect: Rect };

type PreviewInteraction =
  | { mode: 'idle' }
  | { mode: 'panning'; startClientX: number; startClientY: number; offsetX: number; offsetY: number }
  | {
      mode: 'moving-text';
      textId: string;
      startClientX: number;
      startClientY: number;
      originXRatio: number;
      originYRatio: number;
      displayWidth: number;
      displayHeight: number;
    }
  | {
      mode: 'rotating-text';
      textId: string;
      startClientX: number;
      startClientY: number;
      originRotation: number;
      anchorClientX: number;
      anchorClientY: number;
      startAngle: number;
    }
  | {
      mode: 'drawing-brush';
      strokeId: string;
    };

type TextHitTarget =
  | {
      type: 'body';
      textId: string;
    }
  | {
      type: 'rotate-handle';
      textId: string;
    };

export interface ImageCanvasEditorOptions {
  draftStore?: DraftStore;
}

const DEFAULT_VIEWPORT = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
} as const;

const MIN_VIEWPORT_ZOOM = 1;
const MAX_VIEWPORT_ZOOM = 4;
const VIEWPORT_ZOOM_STEP = 0.2;
const VIEWPORT_WHEEL_SENSITIVITY = 0.0015;
const VIEWPORT_PAN_OVERSCROLL_RESISTANCE = 0.2;
const WHEEL_LINE_PIXELS = 16;
const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const HISTORY_LIMIT = 100;
const ROTATED_TEXT_HANDLE_SIZE = 24;
const PREVIEW_PROCESSED_MAX_DIMENSION = 1600;
const MIN_BRUSH_POINT_DISTANCE_RATIO = 0.0008;

const padDateSegment = (value: number): string => value.toString().padStart(2, '0');

const createTimestampFileName = (extension: string, date = new Date()): string => {
  const year = date.getFullYear();
  const month = padDateSegment(date.getMonth() + 1);
  const day = padDateSegment(date.getDate());
  const hours = padDateSegment(date.getHours());
  const minutes = padDateSegment(date.getMinutes());
  const seconds = padDateSegment(date.getSeconds());

  return `${year}${month}${day}${hours}${minutes}${seconds}${extension}`;
};

const createEditingTextToolState = (textId: string, caretIndex: number): TextToolState => ({
  mode: 'editing',
  textId,
  caretIndex,
  selectionStart: caretIndex,
  selectionEnd: caretIndex,
  composing: false,
});

const createDrawingBrushToolState = (strokeId: string): BrushToolState => ({
  mode: 'drawing',
  strokeId,
});

const createTextItem = (id: string, xRatio: number, yRatio: number, content = ''): TextItem => {
  const defaults = createDefaultTextOverlay();

  return {
    id,
    content,
    xRatio: clamp(xRatio, 0, 1),
    yRatio: clamp(yRatio, 0, 1),
    fontSize: defaults.fontSize,
    color: defaults.color,
    align: 'center',
    lineHeight: 1.25,
    rotation: defaults.rotation,
  };
};

export const createInitialEditorState = (): EditorState => ({
  image: null,
  cropRect: null,
  draftCropRect: null,
  cropMode: false,
  activeTool: 'navigate',
  textOverlay: null,
  texts: [],
  activeTextId: null,
  textToolState: createIdleTextToolState(),
  brush: createDefaultBrushSettings(),
  brushStrokes: [],
  brushToolState: createIdleBrushToolState(),
  brushCursor: null,
  adjustments: {
    contrast: 0,
    exposure: 0,
    highlights: 0,
  },
  transform: {
    rotation: 0,
    flipX: false,
    flipY: false,
  },
  viewport: { ...DEFAULT_VIEWPORT },
  activePreset: 'original',
});

const createStateFromImage = (image: ImageResource): EditorState => ({
  ...createInitialEditorState(),
  image,
});

const createImageResource = async (file: File): Promise<ImageResource> => {
  const dataUrl = await readFileAsDataUrl(file);
  const element = await loadImageFromDataUrl(dataUrl);

  return {
    element,
    width: element.naturalWidth,
    height: element.naturalHeight,
    name: file.name,
    dataUrl,
  };
};

const getPointerOnPreview = (
  event: PointerEvent,
  canvas: HTMLCanvasElement,
): { canvasX: number; canvasY: number } => {
  const rect = canvas.getBoundingClientRect();

  return {
    canvasX: event.clientX - rect.left,
    canvasY: event.clientY - rect.top,
  };
};

const getPreviewDisplayRect = (metrics: PreviewViewMetrics): Rect => ({
  x: metrics.displayX,
  y: metrics.displayY,
  width: metrics.displayWidth,
  height: metrics.displayHeight,
});

const isPointOnPreviewImage = (
  point: { canvasX: number; canvasY: number },
  metrics: PreviewViewMetrics,
): boolean => pointInRect(point.canvasX, point.canvasY, getPreviewDisplayRect(metrics));

const getPointerPreviewRatio = (
  point: { canvasX: number; canvasY: number },
  metrics: PreviewViewMetrics,
): { xRatio: number; yRatio: number } => ({
  xRatio:
    metrics.displayWidth > 0 ? clamp((point.canvasX - metrics.displayX) / metrics.displayWidth, 0, 1) : 0.5,
  yRatio:
    metrics.displayHeight > 0 ? clamp((point.canvasY - metrics.displayY) / metrics.displayHeight, 0, 1) : 0.5,
});

const resolvePreviewSourcePoint = (
  point: { canvasX: number; canvasY: number },
  metrics: PreviewViewMetrics,
): { sourceX: number; sourceY: number } => ({
  sourceX:
    metrics.displayWidth > 0 ? ((point.canvasX - metrics.displayX) / metrics.displayWidth) * metrics.sourceWidth : 0,
  sourceY:
    metrics.displayHeight > 0
      ? ((point.canvasY - metrics.displayY) / metrics.displayHeight) * metrics.sourceHeight
      : 0,
});

const resolveCropRectForState = (state: EditorState): Rect | null => {
  if (!state.image) {
    return null;
  }

  return state.cropRect ?? fullImageRect(state.image);
};

const createCenteredRect = (centerX: number, centerY: number, size: number): Rect => ({
  x: centerX - size / 2,
  y: centerY - size / 2,
  width: size,
  height: size,
});

const resolvePointerAngle = (
  clientX: number,
  clientY: number,
  anchorClientX: number,
  anchorClientY: number,
): number => (Math.atan2(clientY - anchorClientY, clientX - anchorClientX) * 180) / Math.PI;

const resolveTextHitTarget = (
  state: EditorState,
  metrics: PreviewViewMetrics,
  pointX: number,
  pointY: number,
): TextHitTarget | null => {
  const textState = normalizeTextState(state);
  const displayRect = getPreviewDisplayRect(metrics);
  const activeText = textState.texts.find((text) => text.id === textState.activeTextId) ?? null;

  if (activeText) {
    const activeTextRect = resolveTextScreenRect(
      activeText,
      metrics.sourceWidth,
      metrics.sourceHeight,
      displayRect,
    );

    if (activeTextRect) {
      const rotatedHandlePoint = resolveTextRotateHandleScreenPoint(
        activeText,
        metrics.sourceWidth,
        metrics.sourceHeight,
        displayRect,
      );
      const rotateHandleRect =
        rotatedHandlePoint
          ? createCenteredRect(rotatedHandlePoint.x, rotatedHandlePoint.y, ROTATED_TEXT_HANDLE_SIZE)
          : null;

      if (rotateHandleRect && pointInRect(pointX, pointY, rotateHandleRect)) {
        return {
          type: 'rotate-handle',
          textId: activeText.id,
        };
      }
    }
  }

  const bodyHitOrder = activeText
    ? [activeText, ...textState.texts.filter((text) => text.id !== activeText.id).reverse()]
    : [...textState.texts].reverse();

  for (const text of bodyHitOrder) {
    const sourceX =
      displayRect.width > 0 ? ((pointX - displayRect.x) / displayRect.width) * metrics.sourceWidth : 0;
    const sourceY =
      displayRect.height > 0 ? ((pointY - displayRect.y) / displayRect.height) * metrics.sourceHeight : 0;
    const bodyRect = resolveTextScreenRect(text, metrics.sourceWidth, metrics.sourceHeight, displayRect);
    const isBodyHit =
      normalizeTextRotation(text.rotation ?? 0) === 0
        ? bodyRect !== null && isPointInTextBlock(bodyRect, pointX, pointY)
        : isPointInRotatedTextBlock(text, sourceX, sourceY, metrics.sourceWidth, metrics.sourceHeight);

    if (isBodyHit) {
      return {
        type: 'body',
        textId: text.id,
      };
    }
  }

  return null;
};

const getPointerOnImage = (
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  metrics: CropViewMetrics,
): { x: number; y: number } => {
  const rect = canvas.getBoundingClientRect();
  const canvasX = event.clientX - rect.left;
  const canvasY = event.clientY - rect.top;
  const x = ((canvasX - metrics.displayX) / metrics.displayWidth) * metrics.sourceWidth;
  const y = ((canvasY - metrics.displayY) / metrics.displayHeight) * metrics.sourceHeight;

  return {
    x: clamp(x, 0, metrics.sourceWidth),
    y: clamp(y, 0, metrics.sourceHeight),
  };
};

const detectHandle = (pointX: number, pointY: number, rect: Rect, metrics: CropViewMetrics): CropHandle | null => {
  const threshold = 12 / Math.min(metrics.displayWidth / metrics.sourceWidth, metrics.displayHeight / metrics.sourceHeight);
  const corners: Array<[CropHandle, number, number]> = [
    ['nw', rect.x, rect.y],
    ['ne', rect.x + rect.width, rect.y],
    ['sw', rect.x, rect.y + rect.height],
    ['se', rect.x + rect.width, rect.y + rect.height],
  ];

  for (const [name, x, y] of corners) {
    if (Math.abs(pointX - x) <= threshold && Math.abs(pointY - y) <= threshold) {
      return name;
    }
  }

  if (pointInRect(pointX, pointY, rect)) {
    return 'inside';
  }

  return null;
};

export class ImageCanvasEditor {
  private canvas: HTMLCanvasElement | null = null;
  private renderer: CanvasRenderer | null = null;
  private readonly draftStore: DraftStore;
  private readonly store = new EditorStore(createInitialEditorState());
  private nextTextId = 1;
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];
  private pendingHistorySnapshot: HistorySnapshot | null = null;
  private pendingWheelViewportUpdate:
    | {
        zoom: number;
        clientX: number;
        clientY: number;
        metrics: PreviewViewMetrics;
      }
    | null = null;
  private wheelFrameRequestId: number | null = null;
  private cropInteraction: CropInteraction = { mode: 'idle' };
  private previewInteraction: PreviewInteraction = { mode: 'idle' };
  private resizeObserver: ResizeObserver | null = null;
  private readonly onWindowResize = (): void => {
    this.render();
  };

  private readonly onCanvasPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }

    const canvas = this.canvas;
    const state = this.store.getState();
    const cropMetrics = this.renderer?.getCropViewMetrics() ?? null;
    const previewMetrics = this.renderer?.getPreviewViewMetrics() ?? null;
    const draftRect = state.draftCropRect;

    if (!canvas || !state.image) {
      return;
    }

    if (!state.cropMode && previewMetrics) {
      const point = getPointerOnPreview(event, canvas);
      const textState = normalizeTextState(state);
      const editingTextId = textState.textToolState.mode === 'editing' ? textState.textToolState.textId : null;

      if (state.activeTool === 'brush') {
        if (editingTextId) {
          this.finishTextEditing();
        }

        if (normalizeTextState(this.store.getState()).activeTextId) {
          this.clearTextSelection();
        }

        if (!isPointOnPreviewImage(point, previewMetrics)) {
          return;
        }

        const brushPoint = this.resolveBrushPointFromPreview(point, previewMetrics);

        if (!brushPoint) {
          return;
        }

        canvas.setPointerCapture(event.pointerId);
        this.beginBrushStroke(brushPoint);
        return;
      }

      if (textState.textToolState.mode === 'inserting') {
        if (isPointOnPreviewImage(point, previewMetrics)) {
          const nextPosition = getPointerPreviewRatio(point, previewMetrics);
          this.placeTextAt(nextPosition.xRatio, nextPosition.yRatio);
        }

        return;
      }

      const hitTarget = resolveTextHitTarget(state, previewMetrics, point.canvasX, point.canvasY);

      if (hitTarget) {
        const shouldFinishCurrentEditing = editingTextId !== null && editingTextId !== hitTarget.textId;

        if (shouldFinishCurrentEditing) {
          this.finishTextEditing();
        }

        if (hitTarget.type === 'rotate-handle') {
          if (editingTextId === hitTarget.textId) {
            this.finishTextEditing();
          }

          canvas.setPointerCapture(event.pointerId);
          this.beginTextRotation(
            hitTarget.textId,
            event.clientX,
            event.clientY,
            previewMetrics,
            canvas.getBoundingClientRect(),
          );
          return;
        }

        if (editingTextId === hitTarget.textId) {
          return;
        }

        if (textState.activeTextId !== hitTarget.textId) {
          this.selectText(hitTarget.textId);
          return;
        }

        canvas.setPointerCapture(event.pointerId);
        this.beginTextDrag(hitTarget.textId, event.clientX, event.clientY, previewMetrics);
        return;
      }

      if (editingTextId) {
        this.finishTextEditing();
      }

      if (normalizeTextState(this.store.getState()).activeTextId) {
        this.clearTextSelection();
      }

      canvas.setPointerCapture(event.pointerId);
      this.previewInteraction = {
        mode: 'panning',
        startClientX: event.clientX,
        startClientY: event.clientY,
        offsetX: this.store.getState().viewport.offsetX,
        offsetY: this.store.getState().viewport.offsetY,
      };
      this.syncCanvasCursor();
      return;
    }

    if (!state.cropMode || !cropMetrics || !draftRect) {
      return;
    }

    const point = getPointerOnImage(event, canvas, cropMetrics);
    const handle = detectHandle(point.x, point.y, draftRect, cropMetrics);

    canvas.setPointerCapture(event.pointerId);

    if (handle === 'inside') {
      this.cropInteraction = {
        mode: 'moving',
        originX: point.x - draftRect.x,
        originY: point.y - draftRect.y,
        rect: draftRect,
      };
      return;
    }

    if (handle) {
      this.cropInteraction = {
        mode: 'resizing',
        handle,
        rect: draftRect,
      };
      return;
    }

    this.cropInteraction = {
      mode: 'creating',
      startX: point.x,
      startY: point.y,
    };

    this.setState({
      draftCropRect: normalizeRect(
        point.x,
        point.y,
        point.x + 1,
        point.y + 1,
        state.image.width,
        state.image.height,
      ),
    });
  };

  private readonly onCanvasPointerMove = (event: PointerEvent): void => {
    const canvas = this.canvas;
    const state = this.store.getState();
    const cropMetrics = this.renderer?.getCropViewMetrics() ?? null;
    const previewMetrics = this.renderer?.getPreviewViewMetrics() ?? null;

    if (!canvas || !state.image) {
      return;
    }

    if (this.previewInteraction.mode === 'drawing-brush' && !state.cropMode && previewMetrics) {
      const point = getPointerOnPreview(event, canvas);

      if (!isPointOnPreviewImage(point, previewMetrics)) {
        return;
      }

      const brushPoint = this.resolveBrushPointFromPreview(point, previewMetrics);

      if (!brushPoint) {
        return;
      }

      this.updateBrushCursor(brushPoint);
      this.extendBrushStroke(brushPoint);
      return;
    }

    if (!state.cropMode && state.activeTool === 'brush' && previewMetrics) {
      const point = getPointerOnPreview(event, canvas);

      if (!isPointOnPreviewImage(point, previewMetrics)) {
        this.clearBrushCursor();
        return;
      }

      this.updateBrushCursor(this.resolveBrushPointFromPreview(point, previewMetrics));
      return;
    }

    if (this.previewInteraction.mode === 'moving-text' && !state.cropMode) {
      this.dragTextTo(
        this.previewInteraction.originXRatio +
          (this.previewInteraction.displayWidth > 0
            ? (event.clientX - this.previewInteraction.startClientX) / this.previewInteraction.displayWidth
            : 0),
        this.previewInteraction.originYRatio +
          (this.previewInteraction.displayHeight > 0
            ? (event.clientY - this.previewInteraction.startClientY) / this.previewInteraction.displayHeight
            : 0),
      );
      return;
    }

    if (this.previewInteraction.mode === 'rotating-text' && !state.cropMode) {
      this.rotateTextTo(event.clientX, event.clientY);
      return;
    }

    if (this.previewInteraction.mode === 'panning' && !state.cropMode) {
      this.setViewport({
        offsetX: this.previewInteraction.offsetX + (event.clientX - this.previewInteraction.startClientX),
        offsetY: this.previewInteraction.offsetY + (event.clientY - this.previewInteraction.startClientY),
      }, { overscrollResistance: VIEWPORT_PAN_OVERSCROLL_RESISTANCE });
      return;
    }

    if (!state.cropMode || !cropMetrics || this.cropInteraction.mode === 'idle') {
      return;
    }

    const point = getPointerOnImage(event, canvas, cropMetrics);

    if (this.cropInteraction.mode === 'creating') {
      this.setState({
        draftCropRect: normalizeRect(
          this.cropInteraction.startX,
          this.cropInteraction.startY,
          point.x,
          point.y,
          state.image.width,
          state.image.height,
        ),
      });
      return;
    }

    if (this.cropInteraction.mode === 'moving') {
      const nextX = clamp(
        point.x - this.cropInteraction.originX,
        0,
        state.image.width - this.cropInteraction.rect.width,
      );
      const nextY = clamp(
        point.y - this.cropInteraction.originY,
        0,
        state.image.height - this.cropInteraction.rect.height,
      );

      this.setState({
        draftCropRect: {
          ...this.cropInteraction.rect,
          x: nextX,
          y: nextY,
        },
      });
      return;
    }

    const currentRect = this.cropInteraction.rect;
    let nextRect = currentRect;

    switch (this.cropInteraction.handle) {
      case 'nw':
        nextRect = normalizeRect(
          point.x,
          point.y,
          currentRect.x + currentRect.width,
          currentRect.y + currentRect.height,
          state.image.width,
          state.image.height,
        );
        break;
      case 'ne':
        nextRect = normalizeRect(
          currentRect.x,
          point.y,
          point.x,
          currentRect.y + currentRect.height,
          state.image.width,
          state.image.height,
        );
        break;
      case 'sw':
        nextRect = normalizeRect(
          point.x,
          currentRect.y,
          currentRect.x + currentRect.width,
          point.y,
          state.image.width,
          state.image.height,
        );
        break;
      case 'se':
        nextRect = normalizeRect(
          currentRect.x,
          currentRect.y,
          point.x,
          point.y,
          state.image.width,
          state.image.height,
        );
        break;
    }

    this.setState({
      draftCropRect: nextRect,
    });
  };

  private readonly onCanvasWheel = (event: WheelEvent): void => {
    const state = this.store.getState();
    const metrics = this.renderer?.getPreviewViewMetrics() ?? null;

    if (!state.image || state.cropMode || !metrics) {
      return;
    }

    event.preventDefault();
    const wheelDelta = this.normalizeWheelDelta(event.deltaY, event.deltaMode, metrics.canvasHeight);
    const baseZoom = this.pendingWheelViewportUpdate?.zoom ?? state.viewport.zoom;
    const nextZoom = this.clampZoom(baseZoom * Math.exp(-wheelDelta * VIEWPORT_WHEEL_SENSITIVITY));

    if (nextZoom === baseZoom) {
      return;
    }

    this.pendingWheelViewportUpdate = {
      zoom: nextZoom,
      clientX: event.clientX,
      clientY: event.clientY,
      metrics,
    };
    this.scheduleWheelViewportUpdate();
  };

  private readonly onCanvasDoubleClick = (event: MouseEvent): void => {
    const canvas = this.canvas;
    const state = this.store.getState();
    const previewMetrics = this.renderer?.getPreviewViewMetrics() ?? null;

    if (!canvas || !state.image || state.cropMode) {
      return;
    }

    if (previewMetrics && state.activeTool !== 'brush') {
      const point = getPointerOnPreview(event as PointerEvent, canvas);
      const hitTarget = resolveTextHitTarget(state, previewMetrics, point.canvasX, point.canvasY);

      if (hitTarget?.type === 'body') {
        const currentTextState = normalizeTextState(this.store.getState());
        const currentToolState = currentTextState.textToolState;
        const editingTextId = currentToolState.mode === 'editing' ? currentToolState.textId : null;

        if (editingTextId && editingTextId !== hitTarget.textId) {
          this.finishTextEditing();
        }

        this.focusText(hitTarget.textId);
        return;
      }
    }

    this.resetViewport();
  };

  private readonly stopCropInteraction = (event: PointerEvent): void => {
    const previewInteraction = this.previewInteraction;

    if (this.canvas?.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }

    this.cropInteraction = { mode: 'idle' };
    this.previewInteraction = { mode: 'idle' };

    if (previewInteraction.mode === 'moving-text') {
      this.finishTextDrag();
      return;
    }

    if (previewInteraction.mode === 'rotating-text') {
      this.finishTextRotation();
      return;
    }

    if (previewInteraction.mode === 'drawing-brush') {
      this.finishBrushStroke();
      return;
    }

    if (previewInteraction.mode === 'panning') {
      const { viewport } = this.store.getState();
      this.setViewport({
        offsetX: viewport.offsetX,
        offsetY: viewport.offsetY,
      });
    }

    this.syncCanvasCursor();
  };

  private readonly onCanvasPointerLeave = (): void => {
    const state = this.store.getState();

    if (state.activeTool === 'brush' && this.previewInteraction.mode !== 'drawing-brush') {
      this.clearBrushCursor();
    }
  };

  constructor(options: ImageCanvasEditorOptions = {}) {
    this.draftStore = options.draftStore ?? createLocalDraftStore();
  }

  mount(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas && this.renderer) {
      this.render();
      return;
    }

    this.unmount();

    this.canvas = canvas;
    this.renderer = new CanvasRenderer(canvas);

    canvas.addEventListener('pointerdown', this.onCanvasPointerDown);
    canvas.addEventListener('pointermove', this.onCanvasPointerMove);
    canvas.addEventListener('pointerleave', this.onCanvasPointerLeave);
    canvas.addEventListener('pointerup', this.stopCropInteraction);
    canvas.addEventListener('pointercancel', this.stopCropInteraction);
    canvas.addEventListener('wheel', this.onCanvasWheel, { passive: false });
    canvas.addEventListener('dblclick', this.onCanvasDoubleClick);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.render();
      });
      this.resizeObserver.observe(canvas.parentElement ?? canvas);
    } else {
      window.addEventListener('resize', this.onWindowResize);
    }

    this.render();
  }

  unmount(): void {
    if (!this.canvas) {
      return;
    }

    this.canvas.removeEventListener('pointerdown', this.onCanvasPointerDown);
    this.canvas.removeEventListener('pointermove', this.onCanvasPointerMove);
    this.canvas.removeEventListener('pointerleave', this.onCanvasPointerLeave);
    this.canvas.removeEventListener('pointerup', this.stopCropInteraction);
    this.canvas.removeEventListener('pointercancel', this.stopCropInteraction);
    this.canvas.removeEventListener('wheel', this.onCanvasWheel);
    this.canvas.removeEventListener('dblclick', this.onCanvasDoubleClick);
    window.removeEventListener('resize', this.onWindowResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.cancelPendingWheelViewportUpdate();
    this.cropInteraction = { mode: 'idle' };
    this.previewInteraction = { mode: 'idle' };
    this.canvas = null;
    this.renderer = null;
  }

  destroy(): void {
    this.unmount();
  }

  subscribe(listener: (state: EditorState) => void): () => void {
    return this.store.subscribe(listener);
  }

  getState(): EditorState {
    return this.store.getState();
  }

  async loadFile(file: File): Promise<void> {
    if (this.store.getState().cropMode) {
      return;
    }

    const image = await createImageResource(file);
    this.clearHistory();
    this.store.setState(createStateFromImage(image));
    this.render();
  }

  resetEdits(): void {
    const { image, cropMode } = this.store.getState();

    if (!image || cropMode) {
      return;
    }

    this.commitPendingTextEditing();
    this.commitChange(createStateFromImage(image));
  }

  enterCropMode(): void {
    const state = this.store.getState();

    if (!state.image || state.cropMode) {
      return;
    }

    this.commitPendingTextEditing();
    this.setState({
      cropMode: true,
      draftCropRect: state.cropRect ?? fullImageRect(state.image),
    });
  }

  applyCrop(): void {
    const state = this.store.getState();

    if (!state.image || !state.draftCropRect) {
      return;
    }

    const nextRect = approximatelyFullRect(state.draftCropRect, state.image) ? null : state.draftCropRect;

    this.commitChange({
      cropRect: nextRect,
      draftCropRect: null,
      cropMode: false,
    });
  }

  cancelCrop(): void {
    this.setState({
      cropMode: false,
      draftCropRect: null,
    });
  }

  resetCrop(): void {
    const state = this.store.getState();

    if (!state.image) {
      return;
    }

    if (!state.cropMode && !state.cropRect) {
      return;
    }

    if (!state.cropMode) {
      this.commitChange({
        cropRect: null,
        draftCropRect: null,
      });
      return;
    }

    this.setState({
      draftCropRect: fullImageRect(state.image),
    });
  }

  startTextInsertion(): void {
    const state = this.store.getState();

    if (state.cropMode) {
      return;
    }

    this.setState((currentState) => ({
      ...currentState,
      activeTool: 'text',
      textToolState: { mode: 'inserting' },
      brushToolState: createIdleBrushToolState(),
      brushCursor: null,
    }));
  }

  placeTextAt(xRatio: number, yRatio: number): void {
    const state = normalizeTextState(this.store.getState());

    if (this.store.getState().cropMode || state.textToolState.mode !== 'inserting') {
      return;
    }

    const textId = this.createTextId(state.texts);
    const text = createTextItem(textId, xRatio, yRatio);

    this.previewChange((currentState) => {
      const currentTextState = normalizeTextState(currentState);

      const nextTexts = [...currentTextState.texts, text];

      return {
        ...currentState,
        activeTool: 'text',
        ...this.createTextStatePatch(nextTexts, textId, createEditingTextToolState(textId, text.content.length)),
      };
    });
  }

  focusText(textId: string): void {
    const state = normalizeTextState(this.store.getState());
    const activeText = state.texts.find((text) => text.id === textId);

    if (this.store.getState().cropMode || !activeText) {
      return;
    }

    this.setState((currentState) => ({
      ...currentState,
      activeTool: 'text',
      ...this.createTextStatePatch(
        normalizeTextState(currentState).texts,
        textId,
        createEditingTextToolState(textId, activeText.content.length),
      ),
    }));
  }

  selectText(textId: string): void {
    const state = normalizeTextState(this.store.getState());
    const activeText = state.texts.find((text) => text.id === textId);

    if (this.store.getState().cropMode || !activeText) {
      return;
    }

    this.setState((currentState) => ({
      ...currentState,
      activeTool: 'text',
      ...this.createTextStatePatch(normalizeTextState(currentState).texts, textId, createIdleTextToolState()),
    }));
  }

  clearTextSelection(): void {
    if (this.store.getState().cropMode) {
      return;
    }

    this.setState((currentState) => ({
      ...currentState,
      ...this.createTextStatePatch(normalizeTextState(currentState).texts, null, createIdleTextToolState()),
    }));
  }

  selectBrushTool(type?: BrushType): void {
    const state = this.store.getState();

    if (state.cropMode || !state.image) {
      return;
    }

    if (normalizeTextState(state).textToolState.mode === 'editing') {
      this.finishTextEditing();
    }

    this.setState((currentState) => ({
      ...currentState,
      activeTool: 'brush',
      brush: {
        ...normalizeBrushSettings(currentState.brush),
        ...(type ? { type } : {}),
      },
      brushToolState: createIdleBrushToolState(),
      brushCursor: currentState.brushCursor ?? null,
      ...this.createTextStatePatch(normalizeTextState(currentState).texts, null, createIdleTextToolState()),
    }));
  }

  updateBrushType(type: BrushType): void {
    const state = this.store.getState();

    if (state.cropMode) {
      return;
    }

    this.commitPendingTextEditing();
    this.commitChange((currentState) => ({
      ...currentState,
      activeTool: 'brush',
      brush: {
        ...normalizeBrushSettings(currentState.brush),
        type,
      },
    }));
  }

  updateBrushColor(color: string): void {
    const state = this.store.getState();

    if (state.cropMode) {
      return;
    }

    this.commitPendingTextEditing();
    this.commitChange((currentState) => ({
      ...currentState,
      brush: {
        ...normalizeBrushSettings(currentState.brush),
        color,
      },
    }));
  }

  updateBrushSize(size: number): void {
    const state = this.store.getState();

    if (state.cropMode) {
      return;
    }

    this.commitPendingTextEditing();
    this.commitChange((currentState) => ({
      ...currentState,
      brush: {
        ...normalizeBrushSettings(currentState.brush),
        size,
      },
    }));
  }

  updateBrushHardness(hardness: number): void {
    const state = this.store.getState();

    if (state.cropMode) {
      return;
    }

    this.commitPendingTextEditing();
    this.commitChange((currentState) => ({
      ...currentState,
      brush: {
        ...normalizeBrushSettings(currentState.brush),
        hardness,
      },
    }));
  }

  insertText(text: string): void {
    const state = normalizeTextState(this.store.getState());

    if (state.textToolState.mode !== 'editing') {
      return;
    }

    this.previewChange((currentState) => {
      const currentTextState = normalizeTextState(currentState);

      if (currentTextState.textToolState.mode !== 'editing') {
        return currentState;
      }

      const editingState = currentTextState.textToolState;
      const activeText = currentTextState.texts.find((item) => item.id === editingState.textId);

      if (!activeText) {
        return currentState;
      }

      const selectionStart = Math.min(editingState.selectionStart, editingState.selectionEnd);
      const selectionEnd = Math.max(editingState.selectionStart, editingState.selectionEnd);
      const nextContent =
        activeText.content.slice(0, selectionStart) + text + activeText.content.slice(selectionEnd);
      const nextCaretIndex = selectionStart + text.length;
      const nextActiveText = this.stabilizeEmptyTextAnchor(activeText, nextContent);
      const nextTexts = currentTextState.texts.map((item) =>
        item.id === activeText.id
          ? {
              ...nextActiveText,
              content: nextContent,
            }
          : item,
      );

      return {
        ...currentState,
        ...this.createTextStatePatch(nextTexts, activeText.id, createEditingTextToolState(activeText.id, nextCaretIndex)),
      };
    });
  }

  insertLineBreak(): void {
    this.insertText('\n');
  }

  replaceActiveTextContent(content: string, selectionStart = content.length, selectionEnd = selectionStart): void {
    const state = normalizeTextState(this.store.getState());

    if (state.textToolState.mode !== 'editing') {
      return;
    }

    const safeSelectionStart = clamp(selectionStart, 0, content.length);
    const safeSelectionEnd = clamp(selectionEnd, 0, content.length);

    this.previewChange((currentState) => {
      const currentTextState = normalizeTextState(currentState);

      if (currentTextState.textToolState.mode !== 'editing') {
        return currentState;
      }

      const editingState = currentTextState.textToolState;
      const activeText = currentTextState.texts.find((item) => item.id === editingState.textId);

      if (!activeText) {
        return currentState;
      }

      const nextActiveText = this.stabilizeEmptyTextAnchor(activeText, content);

      const nextTexts = currentTextState.texts.map((item) =>
        item.id === activeText.id
          ? {
              ...nextActiveText,
              content,
            }
          : item,
      );

      return {
        ...currentState,
        ...this.createTextStatePatch(nextTexts, activeText.id, {
          ...editingState,
          caretIndex: safeSelectionEnd,
          selectionStart: safeSelectionStart,
          selectionEnd: safeSelectionEnd,
        }),
      };
    });
  }

  updateActiveTextSelection(selectionStart: number, selectionEnd: number): void {
    const state = normalizeTextState(this.store.getState());

    if (state.textToolState.mode !== 'editing') {
      return;
    }

    const editingState = state.textToolState;
    const activeText = state.texts.find((item) => item.id === editingState.textId);

    if (!activeText) {
      return;
    }

    const safeSelectionStart = clamp(selectionStart, 0, activeText.content.length);
    const safeSelectionEnd = clamp(selectionEnd, 0, activeText.content.length);

    this.setState((currentState) => {
      const currentTextState = normalizeTextState(currentState);

      if (currentTextState.textToolState.mode !== 'editing') {
        return currentState;
      }

      return {
        ...currentState,
        ...this.createTextStatePatch(currentTextState.texts, currentTextState.activeTextId, {
          ...currentTextState.textToolState,
          caretIndex: safeSelectionEnd,
          selectionStart: safeSelectionStart,
          selectionEnd: safeSelectionEnd,
        }),
      };
    });
  }

  setActiveTextComposing(composing: boolean): void {
    const state = normalizeTextState(this.store.getState());

    if (state.textToolState.mode !== 'editing') {
      return;
    }

    this.setState((currentState) => {
      const currentTextState = normalizeTextState(currentState);

      if (currentTextState.textToolState.mode !== 'editing') {
        return currentState;
      }

      return {
        ...currentState,
        ...this.createTextStatePatch(currentTextState.texts, currentTextState.activeTextId, {
          ...currentTextState.textToolState,
          composing,
        }),
      };
    });
  }

  finishTextEditing(): void {
    const state = normalizeTextState(this.store.getState());

    if (state.textToolState.mode !== 'editing' && state.textToolState.mode !== 'inserting') {
      return;
    }

    this.commitPreviewState((previewState) => {
      const previewTextState = normalizeTextState(previewState);
      const previewToolState = previewTextState.textToolState;
      let nextTexts = previewTextState.texts;
      let nextActiveTextId = previewTextState.activeTextId;

      if (previewToolState.mode === 'editing') {
        const activeText = previewTextState.texts.find((text) => text.id === previewToolState.textId);

        if (activeText && activeText.content.length === 0) {
          nextTexts = previewTextState.texts.filter((text) => text.id !== activeText.id);
          nextActiveTextId = nextTexts[0]?.id ?? null;
        }
      }

      return {
        ...previewState,
        ...this.createTextStatePatch(nextTexts, nextActiveTextId, createIdleTextToolState()),
      };
    });
  }

  startTextDrag(textId: string): void {
    const state = normalizeTextState(this.store.getState());
    const activeText = state.texts.find((text) => text.id === textId);

    if (this.store.getState().cropMode || !activeText) {
      return;
    }

    this.seedPreviewBaselineFromCommittedState();
    this.setState((currentState) => ({
      ...currentState,
      ...this.createTextStatePatch(normalizeTextState(currentState).texts, textId, {
        mode: 'dragging',
        textId,
        startClientX: 0,
        startClientY: 0,
        originXRatio: activeText.xRatio,
        originYRatio: activeText.yRatio,
      }),
    }));
  }

  dragTextTo(xRatio: number, yRatio: number): void {
    const state = normalizeTextState(this.store.getState());

    if (state.textToolState.mode !== 'dragging') {
      return;
    }

    this.previewChange((currentState) => {
      const currentTextState = normalizeTextState(currentState);

      if (currentTextState.textToolState.mode !== 'dragging') {
        return currentState;
      }

      const draggingState = currentTextState.textToolState;
      const nextTexts = currentTextState.texts.map((text) =>
        text.id === draggingState.textId
          ? {
              ...text,
              xRatio: clamp(xRatio, 0, 1),
              yRatio: clamp(yRatio, 0, 1),
            }
          : text,
      );

      return {
        ...currentState,
        ...this.createTextStatePatch(nextTexts, draggingState.textId, draggingState),
      };
    });
  }

  finishTextDrag(): void {
    const state = normalizeTextState(this.store.getState());

    if (state.textToolState.mode !== 'dragging') {
      return;
    }

    this.commitPreviewState((previewState) => ({
      ...previewState,
      ...this.createTextStatePatch(normalizeTextState(previewState).texts, normalizeTextState(previewState).activeTextId, createIdleTextToolState()),
    }));
  }

  ensureTextOverlay(): void {
    const state = normalizeTextState(this.store.getState());

    if (this.store.getState().cropMode || state.texts.length > 0) {
      return;
    }

    const textId = this.createTextId(state.texts);
    const text = createTextItem(textId, 0.5, 0.18, createDefaultTextOverlay().text);

    this.commitChange((currentState) => ({
      ...currentState,
      ...this.createTextStatePatch(
        [...normalizeTextState(currentState).texts, text],
        textId,
        createIdleTextToolState(),
      ),
    }));
  }

  removeTextOverlay(): void {
    const state = normalizeTextState(this.store.getState());

    if (this.store.getState().cropMode || !state.activeTextId) {
      return;
    }

    this.applyTextInspectorChange((currentState) => {
      const currentTextState = normalizeTextState(currentState);
      const nextTexts = currentTextState.texts.filter((text) => text.id !== currentTextState.activeTextId);

      return {
        ...currentState,
        ...this.createTextStatePatch(nextTexts, nextTexts[0]?.id ?? null, createIdleTextToolState()),
      };
    }, { commitPreviewWhenEditing: true });
  }

  updateTextOverlayText(text: string): void {
    const state = normalizeTextState(this.store.getState());

    if (this.store.getState().cropMode || !state.activeTextId) {
      return;
    }

    this.applyTextInspectorChange((currentState) => {
      const currentTextState = normalizeTextState(currentState);
      const nextTexts = currentTextState.texts.map((item) =>
        item.id === currentTextState.activeTextId
          ? {
              ...item,
              content: text,
            }
          : item,
      );

      return {
        ...currentState,
        ...this.createTextStatePatch(nextTexts, currentTextState.activeTextId, currentTextState.textToolState),
      };
    });
  }

  updateTextOverlayFontSize(fontSize: number): void {
    const state = normalizeTextState(this.store.getState());

    if (this.store.getState().cropMode || !state.activeTextId) {
      return;
    }

    this.applyTextInspectorChange((currentState) => {
      const currentTextState = normalizeTextState(currentState);
      const activeText = currentTextState.texts.find((item) => item.id === currentTextState.activeTextId);

      if (!activeText) {
        return currentState;
      }

      const normalizedOverlay = sanitizeTextOverlay({
        text: activeText.content,
        xRatio: activeText.xRatio,
        yRatio: activeText.yRatio,
        fontSize,
        color: activeText.color,
        rotation: activeText.rotation,
      });
      const nextTexts = currentTextState.texts.map((item) =>
        item.id === activeText.id
          ? {
              ...item,
              fontSize: normalizedOverlay.fontSize,
            }
          : item,
      );

      return {
        ...currentState,
        ...this.createTextStatePatch(nextTexts, currentTextState.activeTextId, currentTextState.textToolState),
      };
    });
  }

  updateTextOverlayColor(color: string): void {
    const state = normalizeTextState(this.store.getState());

    if (this.store.getState().cropMode || !state.activeTextId) {
      return;
    }

    this.applyTextInspectorChange((currentState) => {
      const currentTextState = normalizeTextState(currentState);
      const nextTexts = currentTextState.texts.map((item) =>
        item.id === currentTextState.activeTextId
          ? {
              ...item,
              color,
            }
          : item,
      );

      return {
        ...currentState,
        ...this.createTextStatePatch(nextTexts, currentTextState.activeTextId, currentTextState.textToolState),
      };
    });
  }

  previewActiveTextRotation(rotation: number): void {
    if (this.store.getState().cropMode) {
      return;
    }

    this.previewChange((currentState) => this.resolveActiveTextRotationState(currentState, rotation));
  }

  updateActiveTextRotation(rotation: number): void {
    this.commitActiveTextRotation(rotation);
  }

  commitActiveTextRotation(rotation: number): void {
    if (this.store.getState().cropMode) {
      return;
    }

    this.applyTextInspectorChange((currentState) => this.resolveActiveTextRotationState(currentState, rotation));
  }

  updateRotation(rotation: number): void {
    this.commitRotation(rotation);
  }

  rotateBy(delta: number): void {
    if (this.store.getState().cropMode) {
      return;
    }

    this.commitPendingTextEditing();
    this.commitChange((currentState) => ({
      ...currentState,
      transform: {
        ...currentState.transform,
        rotation: currentState.transform.rotation + delta,
      },
    }));
  }

  toggleFlip(axis: 'flipX' | 'flipY'): void {
    if (this.store.getState().cropMode) {
      return;
    }

    this.commitPendingTextEditing();
    this.commitChange((currentState) => ({
      ...currentState,
      transform: {
        ...currentState.transform,
        [axis]: !currentState.transform[axis],
      },
    }));
  }

  updateAdjustment(key: 'contrast' | 'exposure' | 'highlights', value: number): void {
    this.commitAdjustment(key, value);
  }

  applyPreset(preset: FilterPreset): void {
    if (this.store.getState().cropMode) {
      return;
    }

    this.commitPendingTextEditing();
    this.commitChange((currentState) => ({
      ...currentState,
      activePreset: preset,
    }));
  }

  undo(): void {
    const state = this.store.getState();

    if (state.cropMode) {
      return;
    }

    if (this.pendingHistorySnapshot) {
      this.store.setState(applyHistorySnapshot(state, this.pendingHistorySnapshot));
      this.clearPendingPreview();
      this.render();
      return;
    }

    const snapshot = this.undoStack[this.undoStack.length - 1];

    if (!snapshot) {
      return;
    }

    this.undoStack = this.undoStack.slice(0, -1);
    this.redoStack = pushHistorySnapshot(this.redoStack, captureHistorySnapshot(state), HISTORY_LIMIT);
    this.store.setState(applyHistorySnapshot(state, snapshot));
    this.render();
  }

  redo(): void {
    if (this.store.getState().cropMode) {
      return;
    }

    const state = this.getCommittedState();

    if (this.pendingHistorySnapshot) {
      this.clearPendingPreview();
    }

    const snapshot = this.redoStack[this.redoStack.length - 1];

    if (!snapshot) {
      this.render();
      return;
    }

    this.redoStack = this.redoStack.slice(0, -1);
    this.undoStack = pushHistorySnapshot(this.undoStack, captureHistorySnapshot(state), HISTORY_LIMIT);
    this.store.setState(applyHistorySnapshot(state, snapshot));
    this.render();
  }

  canUndo(): boolean {
    const state = this.store.getState();

    if (state.cropMode) {
      return false;
    }

    return this.pendingHistorySnapshot !== null || this.undoStack.length > 0;
  }

  canRedo(): boolean {
    if (this.store.getState().cropMode) {
      return false;
    }

    return this.redoStack.length > 0;
  }

  previewRotation(rotation: number): void {
    if (this.store.getState().cropMode) {
      return;
    }

    this.commitPendingTextEditing();
    this.previewChange((currentState) => ({
      ...currentState,
      transform: {
        ...currentState.transform,
        rotation,
      },
    }));
  }

  commitRotation(rotation: number): void {
    if (this.store.getState().cropMode) {
      return;
    }

    this.commitPendingTextEditing();
    this.commitChange((currentState) => ({
      ...currentState,
      transform: {
        ...currentState.transform,
        rotation,
      },
    }));
  }

  previewAdjustment(key: 'contrast' | 'exposure' | 'highlights', value: number): void {
    if (this.store.getState().cropMode) {
      return;
    }

    this.commitPendingTextEditing();
    this.previewChange((currentState) => ({
      ...currentState,
      adjustments: {
        ...currentState.adjustments,
        [key]: value,
      },
    }));
  }

  commitAdjustment(key: 'contrast' | 'exposure' | 'highlights', value: number): void {
    if (this.store.getState().cropMode) {
      return;
    }

    this.commitPendingTextEditing();
    this.commitChange((currentState) => ({
      ...currentState,
      adjustments: {
        ...currentState.adjustments,
        [key]: value,
      },
    }));
  }

  zoomIn(): void {
    if (this.store.getState().cropMode) {
      return;
    }

    this.setViewport({
      zoom: this.clampZoom(this.store.getState().viewport.zoom + VIEWPORT_ZOOM_STEP),
    });
  }

  zoomOut(): void {
    if (this.store.getState().cropMode) {
      return;
    }

    this.setViewport({
      zoom: this.clampZoom(this.store.getState().viewport.zoom - VIEWPORT_ZOOM_STEP),
    });
  }

  resetViewport(): void {
    if (this.store.getState().cropMode) {
      return;
    }

    this.setViewport({ ...DEFAULT_VIEWPORT });
  }

  saveDraft(): boolean {
    const state = this.store.getState();

    if (!state.image || state.cropMode) {
      return false;
    }

    this.draftStore.save(state);
    return true;
  }

  async restoreDraft(): Promise<void> {
    if (this.store.getState().cropMode) {
      return;
    }

    const draft = await this.draftStore.restore();

    this.commitChange({
      image: draft.image,
      cropRect: draft.cropRect,
      activeTool: draft.activeTool,
      textOverlay: draft.textOverlay ?? null,
      texts: draft.texts,
      activeTextId: draft.activeTextId,
      textToolState: draft.textToolState,
      brush: draft.brush,
      brushStrokes: draft.brushStrokes,
      brushToolState: draft.brushToolState,
      brushCursor: null,
      draftCropRect: null,
      cropMode: false,
      adjustments: draft.adjustments,
      transform: draft.transform,
      viewport: { ...DEFAULT_VIEWPORT },
      activePreset: draft.activePreset,
    });
  }

  exportAsDataUrl(type: string = 'image/png', quality?: number): string | null {
    const processed = createProcessedCanvas(this.store.getState());
    return processed?.canvas.toDataURL(type, quality) ?? null;
  }

  getRenderFps(): number | null {
    return this.renderer?.getFramesPerSecond() ?? null;
  }

  getSuggestedFileName(extension = '.png'): string {
    return createTimestampFileName(extension);
  }

  private setState(updater: Partial<EditorState> | ((currentState: EditorState) => EditorState)): void {
    this.store.setState(this.resolveStateUpdater(updater, this.store.getState()));
    this.render();
  }

  private clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.clearPendingPreview();
  }

  private scheduleWheelViewportUpdate(): void {
    if (this.wheelFrameRequestId !== null) {
      return;
    }

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      this.wheelFrameRequestId = window.requestAnimationFrame(() => {
        this.wheelFrameRequestId = null;
        this.flushPendingWheelViewportUpdate();
      });
      return;
    }

    this.flushPendingWheelViewportUpdate();
  }

  private flushPendingWheelViewportUpdate(): void {
    if (!this.pendingWheelViewportUpdate) {
      return;
    }

    const pendingUpdate = this.pendingWheelViewportUpdate;
    this.pendingWheelViewportUpdate = null;
    this.updateViewportZoom(
      pendingUpdate.zoom,
      pendingUpdate.clientX,
      pendingUpdate.clientY,
      pendingUpdate.metrics,
    );
  }

  private cancelPendingWheelViewportUpdate(): void {
    if (
      this.wheelFrameRequestId !== null &&
      typeof window !== 'undefined' &&
      typeof window.cancelAnimationFrame === 'function'
    ) {
      window.cancelAnimationFrame(this.wheelFrameRequestId);
    }

    this.wheelFrameRequestId = null;
    this.pendingWheelViewportUpdate = null;
  }

  private clearPendingPreview(): void {
    this.pendingHistorySnapshot = null;
  }

  private seedPreviewBaselineFromCommittedState(): void {
    this.pendingHistorySnapshot = captureHistorySnapshot(this.getCommittedState());
  }

  private resolveStateUpdater(
    updater: Partial<EditorState> | ((currentState: EditorState) => EditorState),
    currentState: EditorState,
  ): EditorState {
    const nextState =
      typeof updater === 'function'
        ? updater(currentState)
        : {
            ...currentState,
            ...updater,
          };

    return this.synchronizeTextState(nextState);
  }

  private previewChange(updater: Partial<EditorState> | ((currentState: EditorState) => EditorState)): void {
    const currentState = this.store.getState();
    const baselineSnapshot = this.pendingHistorySnapshot ?? captureHistorySnapshot(currentState);

    if (!this.pendingHistorySnapshot) {
      this.pendingHistorySnapshot = baselineSnapshot;
    }

    const nextState = this.resolveStateUpdater(updater, currentState);
    const nextSnapshot = captureHistorySnapshot(nextState);

    if (snapshotsEqual(nextSnapshot, baselineSnapshot)) {
      this.clearPendingPreview();
    }

    this.store.setState(nextState);
    this.render();
  }

  private commitPreviewState(updater?: (currentState: EditorState) => EditorState): void {
    const currentState = this.getCommittedState();
    const baselineSnapshot = captureHistorySnapshot(currentState);
    const previewState = updater ? this.resolveStateUpdater(updater, this.store.getState()) : this.store.getState();
    const nextSnapshot = captureHistorySnapshot(previewState);

    this.clearPendingPreview();

    if (!snapshotsEqual(baselineSnapshot, nextSnapshot)) {
      this.undoStack = pushHistorySnapshot(this.undoStack, baselineSnapshot, HISTORY_LIMIT);
      this.redoStack = [];
    }

    this.store.setState(previewState);
    this.render();
  }

  private commitChange(updater: Partial<EditorState> | ((currentState: EditorState) => EditorState)): void {
    const currentState = this.getCommittedState();
    const baselineSnapshot = captureHistorySnapshot(currentState);
    const nextState = this.resolveStateUpdater(updater, currentState);
    const nextSnapshot = captureHistorySnapshot(nextState);

    this.clearPendingPreview();

    if (!snapshotsEqual(baselineSnapshot, nextSnapshot)) {
      this.undoStack = pushHistorySnapshot(this.undoStack, baselineSnapshot, HISTORY_LIMIT);
      this.redoStack = [];
    }

    this.store.setState(nextState);
    this.render();
  }

  private getCommittedState(): EditorState {
    const currentState = this.store.getState();

    if (!this.pendingHistorySnapshot) {
      return currentState;
    }

    return applyHistorySnapshot(currentState, this.pendingHistorySnapshot);
  }

  private beginTextDrag(
    textId: string,
    startClientX: number,
    startClientY: number,
    previewMetrics: PreviewViewMetrics,
  ): void {
    const textState = normalizeTextState(this.store.getState());
    const activeText = textState.texts.find((text) => text.id === textId);

    if (!activeText) {
      return;
    }

    this.previewInteraction = {
      mode: 'moving-text',
      textId,
      startClientX,
      startClientY,
      originXRatio: activeText.xRatio,
      originYRatio: activeText.yRatio,
      displayWidth: previewMetrics.displayWidth,
      displayHeight: previewMetrics.displayHeight,
    };
    this.seedPreviewBaselineFromCommittedState();
    this.setState((currentState) => ({
      ...currentState,
      ...this.createTextStatePatch(normalizeTextState(currentState).texts, textId, {
        mode: 'dragging',
        textId,
        startClientX,
        startClientY,
        originXRatio: activeText.xRatio,
        originYRatio: activeText.yRatio,
      }),
    }));
  }

  private beginTextRotation(
    textId: string,
    startClientX: number,
    startClientY: number,
    previewMetrics: PreviewViewMetrics,
    canvasRect: DOMRect,
  ): void {
    const textState = normalizeTextState(this.store.getState());
    const activeText = textState.texts.find((text) => text.id === textId);

    if (!activeText) {
      return;
    }

    const anchorClientX = canvasRect.left + previewMetrics.displayX + activeText.xRatio * previewMetrics.displayWidth;
    const anchorClientY = canvasRect.top + previewMetrics.displayY + activeText.yRatio * previewMetrics.displayHeight;
    const originRotation = normalizeTextRotation(activeText.rotation ?? 0);

    this.previewInteraction = {
      mode: 'rotating-text',
      textId,
      startClientX,
      startClientY,
      originRotation,
      anchorClientX,
      anchorClientY,
      startAngle: resolvePointerAngle(startClientX, startClientY, anchorClientX, anchorClientY),
    };
    this.seedPreviewBaselineFromCommittedState();
    this.setState((currentState) => ({
      ...currentState,
      ...this.createTextStatePatch(normalizeTextState(currentState).texts, textId, {
        mode: 'rotating',
        textId,
        startClientX,
        startClientY,
        originRotation,
        anchorX: activeText.xRatio * previewMetrics.sourceWidth,
        anchorY: activeText.yRatio * previewMetrics.sourceHeight,
      }),
    }));
  }

  private rotateTextTo(clientX: number, clientY: number): void {
    const interaction = this.previewInteraction;
    const state = normalizeTextState(this.store.getState());

    if (interaction.mode !== 'rotating-text' || state.textToolState.mode !== 'rotating') {
      return;
    }

    const nextAngle = resolvePointerAngle(clientX, clientY, interaction.anchorClientX, interaction.anchorClientY);
    const delta = normalizeTextRotation(nextAngle - interaction.startAngle);
    const nextRotation = normalizeTextRotation(interaction.originRotation + delta);

    this.previewChange((currentState) => {
      const currentTextState = normalizeTextState(currentState);

      if (currentTextState.textToolState.mode !== 'rotating') {
        return currentState;
      }

      const rotatingState = currentTextState.textToolState;
      const nextTexts = currentTextState.texts.map((text) =>
        text.id === rotatingState.textId
          ? {
              ...text,
              rotation: nextRotation,
            }
          : text,
      );

      return {
        ...currentState,
        ...this.createTextStatePatch(nextTexts, rotatingState.textId, rotatingState),
      };
    });
  }

  private finishTextRotation(): void {
    const state = normalizeTextState(this.store.getState());

    if (state.textToolState.mode !== 'rotating') {
      return;
    }

    this.commitPreviewState((previewState) => ({
      ...previewState,
      ...this.createTextStatePatch(
        normalizeTextState(previewState).texts,
        normalizeTextState(previewState).activeTextId,
        createIdleTextToolState(),
      ),
    }));
  }

  private beginBrushStroke(point: BrushStrokePoint): void {
    const state = this.store.getState();
    const brush = normalizeBrushSettings(state.brush);
    const strokeId = this.createBrushStrokeId(state.brushStrokes ?? []);
    const stroke: BrushStroke = {
      id: strokeId,
      type: brush.type,
      color: brush.color,
      size: brush.size,
      hardness: brush.hardness,
      points: [point],
    };

    this.previewInteraction = {
      mode: 'drawing-brush',
      strokeId,
    };
    this.seedPreviewBaselineFromCommittedState();
    this.setState((currentState) => ({
      ...currentState,
      brushToolState: createDrawingBrushToolState(strokeId),
      brushCursor: point,
      brushStrokes: [...(currentState.brushStrokes ?? []), stroke],
    }));
  }

  private extendBrushStroke(point: BrushStrokePoint): void {
    const interaction = this.previewInteraction;

    if (interaction.mode !== 'drawing-brush') {
      return;
    }

    this.previewChange((currentState) => {
      const nextBrushStrokes = (currentState.brushStrokes ?? []).map((stroke) => {
        if (stroke.id !== interaction.strokeId) {
          return stroke;
        }

        const previousPoint = stroke.points[stroke.points.length - 1];

        if (
          previousPoint &&
          Math.hypot(point.xRatio - previousPoint.xRatio, point.yRatio - previousPoint.yRatio) <
            MIN_BRUSH_POINT_DISTANCE_RATIO
        ) {
          return stroke;
        }

        return {
          ...stroke,
          points: [...stroke.points, point],
        };
      });

      return {
        ...currentState,
        brushCursor: point,
        brushStrokes: nextBrushStrokes,
      };
    });
  }

  private finishBrushStroke(): void {
    const state = this.store.getState();

    if ((state.brushToolState?.mode ?? 'idle') !== 'drawing') {
      return;
    }

    this.commitPreviewState((previewState) => ({
      ...previewState,
      brushToolState: createIdleBrushToolState(),
    }));
  }

  private resolveBrushPointFromPreview(
    point: { canvasX: number; canvasY: number },
    previewMetrics: PreviewViewMetrics,
  ): BrushStrokePoint | null {
    const state = this.store.getState();
    const cropRect = resolveCropRectForState(state);

    if (!state.image || !cropRect) {
      return null;
    }

    const processedSize = resolveProcessedCanvasSize(cropRect, {
      maxDimension: PREVIEW_PROCESSED_MAX_DIMENSION,
    });
    const previewSourcePoint = resolvePreviewSourcePoint(point, previewMetrics);
    const radians = (state.transform.rotation * Math.PI) / 180;
    const transformedX = previewSourcePoint.sourceX - previewMetrics.sourceWidth / 2;
    const transformedY = previewSourcePoint.sourceY - previewMetrics.sourceHeight / 2;
    const unflippedX = state.transform.flipX ? -transformedX : transformedX;
    const unflippedY = state.transform.flipY ? -transformedY : transformedY;
    const unrotatedX = unflippedX * Math.cos(-radians) - unflippedY * Math.sin(-radians);
    const unrotatedY = unflippedX * Math.sin(-radians) + unflippedY * Math.cos(-radians);
    const sourceX = unrotatedX + processedSize.width / 2;
    const sourceY = unrotatedY + processedSize.height / 2;

    if (
      sourceX < 0 ||
      sourceY < 0 ||
      sourceX > processedSize.width ||
      sourceY > processedSize.height
    ) {
      return null;
    }

    return {
      xRatio: clamp((cropRect.x + (sourceX / processedSize.width) * cropRect.width) / state.image.width, 0, 1),
      yRatio: clamp((cropRect.y + (sourceY / processedSize.height) * cropRect.height) / state.image.height, 0, 1),
    };
  }

  private updateBrushCursor(point: BrushStrokePoint | null): void {
    const currentCursor = this.store.getState().brushCursor ?? null;

    if (
      (currentCursor === null && point === null) ||
      (currentCursor !== null &&
        point !== null &&
        currentCursor.xRatio === point.xRatio &&
        currentCursor.yRatio === point.yRatio)
    ) {
      return;
    }

    this.setState({
      brushCursor: point,
    });
  }

  private clearBrushCursor(): void {
    if (this.store.getState().brushCursor === null) {
      return;
    }

    this.setState({
      brushCursor: null,
    });
  }

  private synchronizeTextState(state: EditorState): EditorState {
    const normalizedTextState = normalizeTextState(state);
    const brushStrokes = cloneBrushStrokes(state.brushStrokes ?? []);

    return {
      ...state,
      activeTool: state.activeTool ?? 'navigate',
      textOverlay: normalizedTextState.textOverlay,
      texts: normalizedTextState.texts,
      activeTextId: normalizedTextState.activeTextId,
      textToolState: normalizedTextState.textToolState,
      brush: normalizeBrushSettings(state.brush),
      brushStrokes,
      brushToolState: normalizeBrushToolState(state.brushToolState, brushStrokes),
    };
  }

  private createTextStatePatch(
    texts: TextItem[],
    activeTextId: string | null,
    textToolState: TextToolState,
  ): Pick<EditorState, 'textOverlay' | 'texts' | 'activeTextId' | 'textToolState'> {
    const activeText = activeTextId ? texts.find((text) => text.id === activeTextId) ?? null : null;
    const normalizedTextState = normalizeTextState({
      texts,
      activeTextId,
      textToolState,
      textOverlay: textItemToTextOverlay(activeText),
    });

    return {
      textOverlay: normalizedTextState.textOverlay,
      texts: normalizedTextState.texts,
      activeTextId: normalizedTextState.activeTextId,
      textToolState: normalizedTextState.textToolState,
    };
  }

  private applyTextInspectorChange(
    updater: (currentState: EditorState) => EditorState,
    options: { commitPreviewWhenEditing?: boolean } = {},
  ): void {
    const textState = normalizeTextState(this.store.getState());
    const isEditingText = textState.textToolState.mode === 'editing';

    if (!isEditingText) {
      this.commitChange(updater);
      return;
    }

    if (options.commitPreviewWhenEditing) {
      this.commitPreviewState(updater);
      return;
    }

    this.previewChange(updater);
  }

  private commitPendingTextEditing(): void {
    const textState = normalizeTextState(this.store.getState());

    if (textState.textToolState.mode === 'editing' || textState.textToolState.mode === 'inserting') {
      this.finishTextEditing();
    }
  }

  private stabilizeEmptyTextAnchor(text: TextItem, nextContent: string): TextItem {
    const previewMetrics = this.renderer?.getPreviewViewMetrics() ?? null;
    const sourceWidth = previewMetrics?.sourceWidth ?? this.store.getState().image?.width ?? 0;
    const sourceHeight = previewMetrics?.sourceHeight ?? this.store.getState().image?.height ?? 0;

    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return text;
    }

    const deltaX = resolveEmptyTextAnchorCompensation(text, nextContent, sourceWidth, sourceHeight);

    if (deltaX === 0) {
      return text;
    }

    return {
      ...text,
      xRatio: clamp(text.xRatio + deltaX / sourceWidth, 0, 1),
    };
  }

  private resolveActiveTextRotationState(currentState: EditorState, rotation: number): EditorState {
    const currentTextState = normalizeTextState(currentState);

    if (!currentTextState.activeTextId) {
      return currentState;
    }

    const nextRotation = normalizeTextRotation(rotation);
    const nextTexts = currentTextState.texts.map((text) =>
      text.id === currentTextState.activeTextId
        ? {
            ...text,
            rotation: nextRotation,
          }
        : text,
    );

    return {
      ...currentState,
      ...this.createTextStatePatch(nextTexts, currentTextState.activeTextId, currentTextState.textToolState),
    };
  }

  private createTextId(texts: TextItem[]): string {
    let textId = `text-${this.nextTextId}`;

    while (texts.some((text) => text.id === textId)) {
      this.nextTextId += 1;
      textId = `text-${this.nextTextId}`;
    }

    this.nextTextId += 1;
    return textId;
  }

  private createBrushStrokeId(brushStrokes: BrushStroke[]): string {
    let strokeId = `brush-stroke-${this.nextTextId}`;

    while (brushStrokes.some((stroke) => stroke.id === strokeId)) {
      this.nextTextId += 1;
      strokeId = `brush-stroke-${this.nextTextId}`;
    }

    this.nextTextId += 1;
    return strokeId;
  }

  private setViewport(
    nextViewport: Partial<EditorState['viewport']>,
    options: { overscrollResistance?: number } = {},
  ): void {
    this.setState((currentState) => ({
      ...currentState,
      viewport: this.normalizeViewport({
        ...currentState.viewport,
        ...nextViewport,
      }, options),
    }));
  }

  private normalizeViewport(
    viewport: EditorState['viewport'],
    options: { overscrollResistance?: number } = {},
  ): EditorState['viewport'] {
    const zoom = this.clampZoom(viewport.zoom);
    const metrics = this.renderer?.getPreviewViewMetrics() ?? null;

    if (!metrics) {
      return {
        zoom,
        offsetX: viewport.offsetX,
        offsetY: viewport.offsetY,
      };
    }

    return this.clampViewportOffsets(
      {
        zoom,
        offsetX: viewport.offsetX,
        offsetY: viewport.offsetY,
      },
      metrics,
      options,
    );
  }

  private clampViewportOffsets(
    viewport: EditorState['viewport'],
    metrics: PreviewViewMetrics,
    options: { overscrollResistance?: number } = {},
  ): EditorState['viewport'] {
    const width = metrics.baseDisplayWidth * viewport.zoom;
    const height = metrics.baseDisplayHeight * viewport.zoom;
    const overscrollResistance = options.overscrollResistance ?? 0;

    return {
      zoom: viewport.zoom,
      offsetX:
        overscrollResistance > 0
          ? softenViewportOffset(viewport.offsetX, width, metrics.canvasWidth, overscrollResistance)
          : clampViewportOffset(viewport.offsetX, width, metrics.canvasWidth),
      offsetY:
        overscrollResistance > 0
          ? softenViewportOffset(viewport.offsetY, height, metrics.canvasHeight, overscrollResistance)
          : clampViewportOffset(viewport.offsetY, height, metrics.canvasHeight),
    };
  }

  private updateViewportZoom(nextZoom: number, clientX?: number, clientY?: number, metrics?: PreviewViewMetrics): void {
    const activeMetrics = metrics ?? this.renderer?.getPreviewViewMetrics() ?? null;

    if (!activeMetrics) {
      this.setViewport({
        zoom: nextZoom,
      });
      return;
    }

    if (clientX === undefined || clientY === undefined) {
      this.setViewport({
        zoom: nextZoom,
      });
      return;
    }

    const rect = this.canvas?.getBoundingClientRect();

    if (!rect) {
      this.setViewport({
        zoom: nextZoom,
      });
      return;
    }

    const pointerX = clientX - rect.left;
    const pointerY = clientY - rect.top;
    const ratioX =
      activeMetrics.displayWidth > 0 ? (pointerX - activeMetrics.displayX) / activeMetrics.displayWidth : 0.5;
    const ratioY =
      activeMetrics.displayHeight > 0 ? (pointerY - activeMetrics.displayY) / activeMetrics.displayHeight : 0.5;
    const nextWidth = activeMetrics.baseDisplayWidth * nextZoom;
    const nextHeight = activeMetrics.baseDisplayHeight * nextZoom;
    const centeredX = (activeMetrics.canvasWidth - nextWidth) / 2;
    const centeredY = (activeMetrics.canvasHeight - nextHeight) / 2;

    this.setViewport({
      zoom: nextZoom,
      offsetX: pointerX - ratioX * nextWidth - centeredX,
      offsetY: pointerY - ratioY * nextHeight - centeredY,
    });
  }

  private clampZoom(zoom: number): number {
    return Math.round(clamp(zoom, MIN_VIEWPORT_ZOOM, MAX_VIEWPORT_ZOOM) * 100) / 100;
  }

  private normalizeWheelDelta(deltaY: number, deltaMode: number, pageHeight: number): number {
    if (deltaMode === WHEEL_DELTA_LINE) {
      return deltaY * WHEEL_LINE_PIXELS;
    }

    if (deltaMode === WHEEL_DELTA_PAGE) {
      return deltaY * pageHeight;
    }

    return deltaY;
  }

  private syncCanvasCursor(): void {
    if (!this.canvas) {
      return;
    }

    const state = this.store.getState();

    if (!state.image) {
      this.canvas.style.cursor = 'default';
      return;
    }

    if (state.cropMode) {
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    if (
      this.previewInteraction.mode === 'moving-text' ||
      this.previewInteraction.mode === 'rotating-text' ||
      this.previewInteraction.mode === 'panning' ||
      this.previewInteraction.mode === 'drawing-brush'
    ) {
      this.canvas.style.cursor = this.previewInteraction.mode === 'drawing-brush' ? 'crosshair' : 'grabbing';
      return;
    }

    if (state.activeTool === 'brush') {
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    if (state.textToolState?.mode === 'inserting') {
      this.canvas.style.cursor = 'crosshair';
      return;
    }

    if (state.textToolState?.mode === 'editing') {
      this.canvas.style.cursor = 'text';
      return;
    }

    this.canvas.style.cursor = normalizeTextState(state).activeTextId ? 'grab' : 'default';
  }

  private render(): void {
    this.renderer?.render(this.store.getState());
    this.syncCanvasCursor();
  }
}
