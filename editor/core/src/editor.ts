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
import {
  createIdleTextToolState,
  normalizeTextState,
  textItemToTextOverlay,
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
  resolveDragHandleScreenRect,
  resolveTextScreenRect,
} from './text-engine';
import {
  approximatelyFullRect,
  clamp,
  fullImageRect,
  loadImageFromDataUrl,
  normalizeRect,
  pointInRect,
  readFileAsDataUrl,
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
    };

type TextHitTarget =
  | {
      type: 'body';
      textId: string;
    }
  | {
      type: 'handle';
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
const HISTORY_LIMIT = 100;

const createEditingTextToolState = (textId: string, caretIndex: number): TextToolState => ({
  mode: 'editing',
  textId,
  caretIndex,
  selectionStart: caretIndex,
  selectionEnd: caretIndex,
  composing: false,
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
  };
};

export const createInitialEditorState = (): EditorState => ({
  image: null,
  cropRect: null,
  draftCropRect: null,
  cropMode: false,
  textOverlay: null,
  texts: [],
  activeTextId: null,
  textToolState: createIdleTextToolState(),
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
      const handleRect = resolveDragHandleScreenRect(activeTextRect);

      if (pointInRect(pointX, pointY, handleRect)) {
        return {
          type: 'handle',
          textId: activeText.id,
        };
      }
    }
  }

  const bodyHitOrder = activeText
    ? [activeText, ...textState.texts.filter((text) => text.id !== activeText.id).reverse()]
    : [...textState.texts].reverse();

  for (const text of bodyHitOrder) {
    const bodyRect = resolveTextScreenRect(text, metrics.sourceWidth, metrics.sourceHeight, displayRect);

    if (bodyRect && isPointInTextBlock(bodyRect, pointX, pointY)) {
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

      if (textState.textToolState.mode === 'inserting') {
        if (isPointOnPreviewImage(point, previewMetrics)) {
          const nextPosition = getPointerPreviewRatio(point, previewMetrics);
          this.placeTextAt(nextPosition.xRatio, nextPosition.yRatio);
        }

        return;
      }

      const hitTarget = resolveTextHitTarget(state, previewMetrics, point.canvasX, point.canvasY);

      if (editingTextId && !hitTarget) {
        this.finishTextEditing();
        return;
      }

      if (hitTarget) {
        const shouldFinishCurrentEditing =
          editingTextId !== null &&
          (hitTarget.type === 'handle' || hitTarget.textId !== editingTextId);

        if (shouldFinishCurrentEditing) {
          this.finishTextEditing();
        }

        if (hitTarget.type === 'handle') {
          canvas.setPointerCapture(event.pointerId);
          this.beginTextDrag(hitTarget.textId, event.clientX, event.clientY, previewMetrics);
          return;
        }

        if (editingTextId === hitTarget.textId) {
          return;
        }

        this.focusText(hitTarget.textId);
        return;
      }

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

    this.commitChange(createStateFromImage(image));
  }

  enterCropMode(): void {
    const state = this.store.getState();

    if (!state.image || state.cropMode) {
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
      textToolState: { mode: 'inserting' },
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
      ...this.createTextStatePatch(
        normalizeTextState(currentState).texts,
        textId,
        createEditingTextToolState(textId, activeText.content.length),
      ),
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
      const nextTexts = currentTextState.texts.map((item) =>
        item.id === activeText.id
          ? {
              ...item,
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

      const nextTexts = currentTextState.texts.map((item) =>
        item.id === activeText.id
          ? {
              ...item,
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

    this.commitChange((currentState) => {
      const currentTextState = normalizeTextState(currentState);
      const nextTexts = currentTextState.texts.filter((text) => text.id !== currentTextState.activeTextId);

      return {
        ...currentState,
        ...this.createTextStatePatch(nextTexts, nextTexts[0]?.id ?? null, createIdleTextToolState()),
      };
    });
  }

  updateTextOverlayText(text: string): void {
    const state = normalizeTextState(this.store.getState());

    if (this.store.getState().cropMode || !state.activeTextId) {
      return;
    }

    this.commitChange((currentState) => {
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

    this.commitChange((currentState) => {
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

    this.commitChange((currentState) => {
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

  updateRotation(rotation: number): void {
    this.commitRotation(rotation);
  }

  rotateBy(delta: number): void {
    if (this.store.getState().cropMode) {
      return;
    }

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
      textOverlay: draft.textOverlay ?? null,
      texts: draft.texts,
      activeTextId: draft.activeTextId,
      textToolState: draft.textToolState,
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
    this.store.setState(this.resolveStateUpdater(updater, this.store.getState()));
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

  private synchronizeTextState(state: EditorState): EditorState {
    const normalizedTextState = normalizeTextState(state);

    return {
      ...state,
      textOverlay: normalizedTextState.textOverlay,
      texts: normalizedTextState.texts,
      activeTextId: normalizedTextState.activeTextId,
      textToolState: normalizedTextState.textToolState,
    };
  }

  private createTextStatePatch(
    texts: TextItem[],
    activeTextId: string | null,
    textToolState: TextToolState,
  ): Pick<EditorState, 'textOverlay' | 'texts' | 'activeTextId' | 'textToolState'> {
    const normalizedTextState = normalizeTextState({
      texts,
      activeTextId,
      textToolState,
      textOverlay: textItemToTextOverlay(texts.find((text) => text.id === activeTextId) ?? texts[0] ?? null),
    });

    return {
      textOverlay: normalizedTextState.textOverlay,
      texts: normalizedTextState.texts,
      activeTextId: normalizedTextState.activeTextId,
      textToolState: normalizedTextState.textToolState,
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

    if (this.previewInteraction.mode === 'moving-text' || this.previewInteraction.mode === 'panning') {
      this.canvas.style.cursor = 'grabbing';
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

    this.canvas.style.cursor =
      normalizeTextState(state).texts.length > 0 ? 'grab' : 'default';
  }

  private render(): void {
    this.renderer?.render(this.store.getState());
    this.syncCanvasCursor();
  }
}
