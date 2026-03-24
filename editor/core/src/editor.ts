import { createProcessedCanvas } from './image-processing';
import { createLocalDraftStore, type DraftStore } from './persistence';
import { CanvasRenderer } from './renderer';
import { EditorStore } from './store';
import type { CropViewMetrics, EditorState, FilterPreset, ImageResource, Rect } from './types';
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

export interface ImageCanvasEditorOptions {
  draftStore?: DraftStore;
}

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
  private cropInteraction: CropInteraction = { mode: 'idle' };
  private resizeObserver: ResizeObserver | null = null;
  private readonly onWindowResize = (): void => {
    this.render();
  };

  private readonly onCanvasPointerDown = (event: PointerEvent): void => {
    const canvas = this.canvas;
    const state = this.store.getState();
    const metrics = this.renderer?.getCropViewMetrics() ?? null;
    const draftRect = state.draftCropRect;

    if (!canvas || !state.cropMode || !state.image || !metrics || !draftRect) {
      return;
    }

    const point = getPointerOnImage(event, canvas, metrics);
    const handle = detectHandle(point.x, point.y, draftRect, metrics);

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
    const metrics = this.renderer?.getCropViewMetrics() ?? null;

    if (!canvas || !state.cropMode || !state.image || !metrics || this.cropInteraction.mode === 'idle') {
      return;
    }

    const point = getPointerOnImage(event, canvas, metrics);

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

  private readonly stopCropInteraction = (event: PointerEvent): void => {
    if (this.canvas?.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }

    this.cropInteraction = { mode: 'idle' };
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
    window.removeEventListener('resize', this.onWindowResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.cropInteraction = { mode: 'idle' };
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
    this.store.setState(createStateFromImage(image));
    this.render();
  }

  resetEdits(): void {
    const { image } = this.store.getState();

    if (!image) {
      return;
    }

    this.store.setState(createStateFromImage(image));
    this.render();
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

    this.setState({
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

    this.setState({
      cropRect: null,
      draftCropRect: state.cropMode ? fullImageRect(state.image) : null,
    });
  }

  updateRotation(rotation: number): void {
    this.setState((currentState) => ({
      ...currentState,
      transform: {
        ...currentState.transform,
        rotation,
      },
    }));
  }

  rotateBy(delta: number): void {
    this.updateRotation(this.store.getState().transform.rotation + delta);
  }

  toggleFlip(axis: 'flipX' | 'flipY'): void {
    this.setState((currentState) => ({
      ...currentState,
      transform: {
        ...currentState.transform,
        [axis]: !currentState.transform[axis],
      },
    }));
  }

  updateAdjustment(key: 'contrast' | 'exposure' | 'highlights', value: number): void {
    this.setState((currentState) => ({
      ...currentState,
      adjustments: {
        ...currentState.adjustments,
        [key]: value,
      },
    }));
  }

  applyPreset(preset: FilterPreset): void {
    this.setState((currentState) => ({
      ...currentState,
      activePreset: preset,
    }));
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

    this.store.setState({
      image: draft.image,
      cropRect: draft.cropRect,
      draftCropRect: null,
      cropMode: false,
      adjustments: draft.adjustments,
      transform: draft.transform,
      activePreset: draft.activePreset,
    });
    this.render();
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

  private render(): void {
    this.renderer?.render(this.store.getState());
  }
}
