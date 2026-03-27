import { createProcessedCanvas } from './image-processing';
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
import type { CropViewMetrics, EditorState, FilterPreset, ImageResource, PreviewViewMetrics, Rect } from './types';
import {
  approximatelyFullRect,
  clamp,
  fullImageRect,
  loadImageFromDataUrl,
  normalizeRect,
  pointInRect,
  readFileAsDataUrl,
} from './utils';

type CropHandle = 'inside' | 'nw' | 'ne' | 'sw' | 'se';

type CropInteraction =
  | { mode: 'idle' }
  | { mode: 'creating'; startX: number; startY: number }
  | { mode: 'moving'; originX: number; originY: number; rect: Rect }
  | { mode: 'resizing'; handle: Exclude<CropHandle, 'inside'>; rect: Rect };

type PreviewInteraction =
  | { mode: 'idle' }
  | { mode: 'panning'; startClientX: number; startClientY: number; offsetX: number; offsetY: number };

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
const HISTORY_LIMIT = 100;

export const createInitialEditorState = (): EditorState => ({
  image: null,
  cropRect: null,
  draftCropRect: null,
  cropMode: false,
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
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];
  private pendingHistorySnapshot: HistorySnapshot | null = null;
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
      canvas.setPointerCapture(event.pointerId);
      this.previewInteraction = {
        mode: 'panning',
        startClientX: event.clientX,
        startClientY: event.clientY,
        offsetX: state.viewport.offsetX,
        offsetY: state.viewport.offsetY,
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

    if (!canvas || !state.image) {
      return;
    }

    if (this.previewInteraction.mode === 'panning' && !state.cropMode) {
      this.setViewport({
        offsetX: this.previewInteraction.offsetX + (event.clientX - this.previewInteraction.startClientX),
        offsetY: this.previewInteraction.offsetY + (event.clientY - this.previewInteraction.startClientY),
      });
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
    const nextZoom = this.clampZoom(
      state.viewport.zoom + (event.deltaY < 0 ? VIEWPORT_ZOOM_STEP : -VIEWPORT_ZOOM_STEP),
    );

    this.updateViewportZoom(nextZoom, event.clientX, event.clientY, metrics);
  };

  private readonly onCanvasDoubleClick = (): void => {
    const state = this.store.getState();

    if (!state.image || state.cropMode) {
      return;
    }

    this.resetViewport();
  };

  private readonly stopCropInteraction = (event: PointerEvent): void => {
    if (this.canvas?.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }

    this.cropInteraction = { mode: 'idle' };
    this.previewInteraction = { mode: 'idle' };
    this.syncCanvasCursor();
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
    this.canvas.removeEventListener('pointerup', this.stopCropInteraction);
    this.canvas.removeEventListener('pointercancel', this.stopCropInteraction);
    this.canvas.removeEventListener('wheel', this.onCanvasWheel);
    this.canvas.removeEventListener('dblclick', this.onCanvasDoubleClick);
    window.removeEventListener('resize', this.onWindowResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
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
    const image = await createImageResource(file);
    this.clearHistory();
    this.store.setState(createStateFromImage(image));
    this.render();
  }

  resetEdits(): void {
    const { image } = this.store.getState();

    if (!image) {
      return;
    }

    this.commitChange(createStateFromImage(image));
  }

  enterCropMode(): void {
    const state = this.store.getState();

    if (!state.image) {
      return;
    }

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
      cropRect: null,
      draftCropRect: state.cropMode ? fullImageRect(state.image) : null,
    });
  }

  updateRotation(rotation: number): void {
    this.previewRotation(rotation);
  }

  rotateBy(delta: number): void {
    this.commitChange((currentState) => ({
      ...currentState,
      transform: {
        ...currentState.transform,
        rotation: currentState.transform.rotation + delta,
      },
    }));
  }

  toggleFlip(axis: 'flipX' | 'flipY'): void {
    this.commitChange((currentState) => ({
      ...currentState,
      transform: {
        ...currentState.transform,
        [axis]: !currentState.transform[axis],
      },
    }));
  }

  updateAdjustment(key: 'contrast' | 'exposure' | 'highlights', value: number): void {
    this.previewAdjustment(key, value);
  }

  applyPreset(preset: FilterPreset): void {
    this.commitChange((currentState) => ({
      ...currentState,
      activePreset: preset,
    }));
  }

  undo(): void {
    const state = this.store.getState();

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
    const state = this.store.getState();
    const snapshot = this.redoStack[this.redoStack.length - 1];

    if (!snapshot) {
      return;
    }

    this.redoStack = this.redoStack.slice(0, -1);
    this.undoStack = pushHistorySnapshot(this.undoStack, captureHistorySnapshot(state), HISTORY_LIMIT);
    this.clearPendingPreview();
    this.store.setState(applyHistorySnapshot(state, snapshot));
    this.render();
  }

  canUndo(): boolean {
    return this.pendingHistorySnapshot !== null || this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  previewRotation(rotation: number): void {
    this.previewChange((currentState) => ({
      ...currentState,
      transform: {
        ...currentState.transform,
        rotation,
      },
    }));
  }

  commitRotation(rotation: number): void {
    this.commitChange((currentState) => ({
      ...currentState,
      transform: {
        ...currentState.transform,
        rotation,
      },
    }));
  }

  previewAdjustment(key: 'contrast' | 'exposure' | 'highlights', value: number): void {
    this.previewChange((currentState) => ({
      ...currentState,
      adjustments: {
        ...currentState.adjustments,
        [key]: value,
      },
    }));
  }

  commitAdjustment(key: 'contrast' | 'exposure' | 'highlights', value: number): void {
    this.commitChange((currentState) => ({
      ...currentState,
      adjustments: {
        ...currentState.adjustments,
        [key]: value,
      },
    }));
  }

  zoomIn(): void {
    this.setViewport({
      zoom: this.clampZoom(this.store.getState().viewport.zoom + VIEWPORT_ZOOM_STEP),
    });
  }

  zoomOut(): void {
    this.setViewport({
      zoom: this.clampZoom(this.store.getState().viewport.zoom - VIEWPORT_ZOOM_STEP),
    });
  }

  resetViewport(): void {
    this.setViewport({ ...DEFAULT_VIEWPORT });
  }

  saveDraft(): boolean {
    const state = this.store.getState();

    if (!state.image) {
      return false;
    }

    this.draftStore.save(state);
    return true;
  }

  async restoreDraft(): Promise<void> {
    const draft = await this.draftStore.restore();

    this.commitChange({
      image: draft.image,
      cropRect: draft.cropRect,
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

  getSuggestedFileName(extension = '.png'): string {
    const fileName = (this.store.getState().image?.name ?? 'edited-image').replace(/\.[a-zA-Z0-9]+$/, '');
    return `${fileName}-edited${extension}`;
  }

  private setState(updater: Partial<EditorState> | ((currentState: EditorState) => EditorState)): void {
    this.store.setState(updater);
    this.render();
  }

  private clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.clearPendingPreview();
  }

  private clearPendingPreview(): void {
    this.pendingHistorySnapshot = null;
  }

  private resolveStateUpdater(
    updater: Partial<EditorState> | ((currentState: EditorState) => EditorState),
    currentState: EditorState,
  ): EditorState {
    if (typeof updater === 'function') {
      return updater(currentState);
    }

    return {
      ...currentState,
      ...updater,
    };
  }

  private previewChange(updater: Partial<EditorState> | ((currentState: EditorState) => EditorState)): void {
    const currentState = this.store.getState();

    if (!currentState.image) {
      return;
    }

    if (!this.pendingHistorySnapshot) {
      this.pendingHistorySnapshot = captureHistorySnapshot(currentState);
    }

    this.setState(updater);
  }

  private commitChange(updater: Partial<EditorState> | ((currentState: EditorState) => EditorState)): void {
    const currentState = this.store.getState();
    const baselineSnapshot = this.pendingHistorySnapshot ?? captureHistorySnapshot(currentState);
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

  private setViewport(nextViewport: Partial<EditorState['viewport']>): void {
    this.setState((currentState) => ({
      ...currentState,
      viewport: this.normalizeViewport({
        ...currentState.viewport,
        ...nextViewport,
      }),
    }));
  }

  private normalizeViewport(viewport: EditorState['viewport']): EditorState['viewport'] {
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
    );
  }

  private clampViewportOffsets(
    viewport: EditorState['viewport'],
    metrics: PreviewViewMetrics,
  ): EditorState['viewport'] {
    const width = metrics.baseDisplayWidth * viewport.zoom;
    const height = metrics.baseDisplayHeight * viewport.zoom;
    const maxOffsetX = Math.max(0, (width - metrics.baseDisplayWidth) / 2);
    const maxOffsetY = Math.max(0, (height - metrics.baseDisplayHeight) / 2);

    return {
      zoom: viewport.zoom,
      offsetX: clamp(viewport.offsetX, -maxOffsetX, maxOffsetX),
      offsetY: clamp(viewport.offsetY, -maxOffsetY, maxOffsetY),
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

    this.canvas.style.cursor = this.previewInteraction.mode === 'panning' ? 'grabbing' : 'grab';
  }

  private render(): void {
    this.renderer?.render(this.store.getState());
    this.syncCanvasCursor();
  }
}
