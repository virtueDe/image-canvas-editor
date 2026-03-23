import { createProcessedCanvas } from './core/image-processing';
import { PRESET_OPTIONS } from './core/presets';
import { restoreDraft, saveDraft } from './core/persistence';
import { CanvasRenderer } from './core/renderer';
import { EditorStore } from './core/store';
import type { CropViewMetrics, EditorState, FilterPreset, ImageResource, Rect } from './core/types';
import {
  approximatelyFullRect,
  clamp,
  fullImageRect,
  loadImageFromDataUrl,
  normalizeRect,
  pointInRect,
  readFileAsDataUrl,
  round,
} from './core/utils';

type CropHandle = 'inside' | 'nw' | 'ne' | 'sw' | 'se';

type CropInteraction =
  | { mode: 'idle' }
  | { mode: 'creating'; startX: number; startY: number }
  | { mode: 'moving'; originX: number; originY: number; rect: Rect }
  | { mode: 'resizing'; handle: Exclude<CropHandle, 'inside'>; rect: Rect };

const initialState: EditorState = {
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
};

const buildPresetButtons = (): string =>
  PRESET_OPTIONS.map(
    (item) => `
      <button
        type="button"
        data-preset="${item.value}"
        class="preset-btn btn-soft px-3 py-2 text-xs"
      >${item.label}</button>
    `,
  ).join('');

const template = `
  <div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_35%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] text-slate-100">
    <div class="mx-auto max-w-[1600px] p-4 md:p-6 xl:p-8">
      <header class="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="text-sm tracking-[0.3em] text-cyan-300/80 uppercase">Canvas Image Editor</p>
          <h1 class="mt-2 text-3xl font-bold md:text-4xl">在线图片编辑器</h1>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            用最少的概念做最有用的事：上传图片后即可在浏览器中完成旋转、裁剪、滤镜、翻转、曝光、高光和下载导出。
          </p>
        </div>
        <div class="panel flex flex-wrap items-center gap-2 px-4 py-3">
          <label class="btn-primary cursor-pointer">
            <input id="file-input" type="file" accept="image/*" class="hidden" />
            选择图片
          </label>
          <button id="save-draft-btn" type="button" class="btn-soft">保存草稿</button>
          <button id="restore-draft-btn" type="button" class="btn-soft">恢复草稿</button>
          <button id="download-btn" type="button" class="btn-primary">下载 PNG</button>
        </div>
      </header>

      <main class="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside class="space-y-4">
          <section class="panel p-4">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="panel-title">图片信息</h2>
              <button id="reset-all-btn" type="button" class="btn-soft px-2 py-1 text-xs">重置全部</button>
            </div>
            <dl id="image-meta" class="grid grid-cols-[80px_1fr] gap-y-2 text-sm text-slate-300">
              <dt>文件名</dt><dd>未加载</dd>
              <dt>尺寸</dt><dd>-</dd>
              <dt>状态</dt><dd>等待上传图片</dd>
            </dl>
          </section>

          <section class="panel p-4">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="panel-title">旋转与翻转</h2>
              <span id="rotation-label" class="text-xs text-slate-400">0°</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <button id="rotate-left-btn" type="button" class="btn-soft">左转 90°</button>
              <button id="rotate-right-btn" type="button" class="btn-soft">右转 90°</button>
              <button id="flip-x-btn" type="button" class="btn-soft">水平翻转</button>
              <button id="flip-y-btn" type="button" class="btn-soft">垂直翻转</button>
            </div>
            <label class="mt-4 block text-sm text-slate-300">
              <span class="mb-2 flex items-center justify-between">
                <span>任意角度</span>
                <span id="rotation-range-label" class="text-xs text-slate-400">0°</span>
              </span>
              <input id="rotation-range" type="range" min="-180" max="180" step="1" class="input-range" />
            </label>
          </section>

          <section class="panel p-4">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="panel-title">裁剪</h2>
              <span class="text-xs text-slate-400">拖拽框选，拖动内部移动，四角缩放</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <button id="start-crop-btn" type="button" class="btn-soft">进入裁剪</button>
              <button id="reset-crop-btn" type="button" class="btn-soft">清除裁剪</button>
              <button id="apply-crop-btn" type="button" class="btn-primary">应用裁剪</button>
              <button id="cancel-crop-btn" type="button" class="btn-soft">取消裁剪</button>
            </div>
            <p class="mt-3 text-xs leading-5 text-slate-400">
              裁剪坐标始终基于原图。这样做的好处是：无论你后面再旋转还是翻转，状态都不会乱。
            </p>
          </section>

          <section class="panel p-4">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="panel-title">滤镜预设</h2>
              <span class="text-xs text-slate-400">先预设，再微调</span>
            </div>
            <div class="grid grid-cols-3 gap-2">
              ${buildPresetButtons()}
            </div>
          </section>

          <section class="panel p-4">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="panel-title">参数调节</h2>
              <span class="text-xs text-slate-400">-100 ~ 100</span>
            </div>
            <div class="space-y-4">
              <label class="block text-sm text-slate-300">
                <span class="mb-2 flex items-center justify-between"><span>对比度</span><span id="contrast-value" class="text-xs text-slate-400">0</span></span>
                <input id="contrast-range" type="range" min="-100" max="100" step="1" value="0" class="input-range" />
              </label>
              <label class="block text-sm text-slate-300">
                <span class="mb-2 flex items-center justify-between"><span>曝光</span><span id="exposure-value" class="text-xs text-slate-400">0</span></span>
                <input id="exposure-range" type="range" min="-100" max="100" step="1" value="0" class="input-range" />
              </label>
              <label class="block text-sm text-slate-300">
                <span class="mb-2 flex items-center justify-between"><span>高光</span><span id="highlights-value" class="text-xs text-slate-400">0</span></span>
                <input id="highlights-range" type="range" min="-100" max="100" step="1" value="0" class="input-range" />
              </label>
            </div>
          </section>
        </aside>

        <section class="panel relative min-h-[720px] overflow-hidden p-3">
          <canvas id="editor-canvas" class="block h-full w-full select-none rounded-4"></canvas>
          <div class="pointer-events-none absolute bottom-6 left-6 rounded-3 bg-slate-950/72 px-4 py-3 text-sm text-slate-200 shadow-lg">
            <div class="font-semibold">操作提示</div>
            <div class="mt-1 text-xs leading-5 text-slate-400">
              上传图片后即可直接编辑。进入裁剪模式时，画布会显示原图裁剪视图。
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
`;

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

const createStateFromImage = (image: ImageResource): EditorState => ({
  ...initialState,
  image,
});

const getPointerOnImage = (event: PointerEvent, metrics: CropViewMetrics): { x: number; y: number } => {
  const canvas = event.currentTarget as HTMLCanvasElement;
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

export const createApp = (root: HTMLDivElement): void => {
  root.innerHTML = template;

  const store = new EditorStore(initialState);
  const canvas = root.querySelector<HTMLCanvasElement>('#editor-canvas');
  const fileInput = root.querySelector<HTMLInputElement>('#file-input');
  const imageMeta = root.querySelector<HTMLDListElement>('#image-meta');
  const rotateLeftButton = root.querySelector<HTMLButtonElement>('#rotate-left-btn');
  const rotateRightButton = root.querySelector<HTMLButtonElement>('#rotate-right-btn');
  const flipXButton = root.querySelector<HTMLButtonElement>('#flip-x-btn');
  const flipYButton = root.querySelector<HTMLButtonElement>('#flip-y-btn');
  const resetAllButton = root.querySelector<HTMLButtonElement>('#reset-all-btn');
  const downloadButton = root.querySelector<HTMLButtonElement>('#download-btn');
  const saveDraftButton = root.querySelector<HTMLButtonElement>('#save-draft-btn');
  const restoreDraftButton = root.querySelector<HTMLButtonElement>('#restore-draft-btn');
  const startCropButton = root.querySelector<HTMLButtonElement>('#start-crop-btn');
  const applyCropButton = root.querySelector<HTMLButtonElement>('#apply-crop-btn');
  const cancelCropButton = root.querySelector<HTMLButtonElement>('#cancel-crop-btn');
  const resetCropButton = root.querySelector<HTMLButtonElement>('#reset-crop-btn');
  const rotationLabel = root.querySelector<HTMLSpanElement>('#rotation-label');
  const rotationRangeLabel = root.querySelector<HTMLSpanElement>('#rotation-range-label');
  const rotationRange = root.querySelector<HTMLInputElement>('#rotation-range');
  const contrastRange = root.querySelector<HTMLInputElement>('#contrast-range');
  const exposureRange = root.querySelector<HTMLInputElement>('#exposure-range');
  const highlightsRange = root.querySelector<HTMLInputElement>('#highlights-range');
  const contrastValue = root.querySelector<HTMLSpanElement>('#contrast-value');
  const exposureValue = root.querySelector<HTMLSpanElement>('#exposure-value');
  const highlightsValue = root.querySelector<HTMLSpanElement>('#highlights-value');
  const presetButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('.preset-btn'));

  if (
    !canvas ||
    !fileInput ||
    !imageMeta ||
    !rotateLeftButton ||
    !rotateRightButton ||
    !flipXButton ||
    !flipYButton ||
    !resetAllButton ||
    !downloadButton ||
    !saveDraftButton ||
    !restoreDraftButton ||
    !startCropButton ||
    !applyCropButton ||
    !cancelCropButton ||
    !resetCropButton ||
    !rotationLabel ||
    !rotationRangeLabel ||
    !rotationRange ||
    !contrastRange ||
    !exposureRange ||
    !highlightsRange ||
    !contrastValue ||
    !exposureValue ||
    !highlightsValue
  ) {
    throw new Error('应用初始化失败：DOM 节点缺失');
  }

  const renderer = new CanvasRenderer(canvas);
  let cropInteraction: CropInteraction = { mode: 'idle' };

  const setMeta = (state: EditorState): void => {
    const image = state.image;
    const status = !image ? '等待上传图片' : state.cropMode ? '正在裁剪' : '可编辑';
    const currentRect = image ? state.cropRect ?? fullImageRect(image) : null;

    imageMeta.innerHTML = `
      <dt>文件名</dt><dd>${image?.name ?? '未加载'}</dd>
      <dt>尺寸</dt><dd>${image ? `${image.width} × ${image.height}` : '-'}</dd>
      <dt>裁剪</dt><dd>${currentRect ? `${Math.round(currentRect.width)} × ${Math.round(currentRect.height)}` : '-'}</dd>
      <dt>状态</dt><dd>${status}</dd>
    `;
  };

  const setDisabled = (button: HTMLButtonElement, disabled: boolean): void => {
    button.disabled = disabled;
    button.classList.toggle('opacity-40', disabled);
    button.classList.toggle('cursor-not-allowed', disabled);
  };

  const syncUI = (state: EditorState): void => {
    renderer.render(state);
    setMeta(state);

    const hasImage = Boolean(state.image);
    const rotation = round(state.transform.rotation, 0);
    const draftRect = state.image ? state.draftCropRect ?? state.cropRect ?? fullImageRect(state.image) : null;

    rotationLabel.textContent = `${rotation}°`;
    rotationRangeLabel.textContent = `${rotation}°`;
    rotationRange.value = String(rotation);
    contrastRange.value = String(state.adjustments.contrast);
    exposureRange.value = String(state.adjustments.exposure);
    highlightsRange.value = String(state.adjustments.highlights);
    contrastValue.textContent = String(state.adjustments.contrast);
    exposureValue.textContent = String(state.adjustments.exposure);
    highlightsValue.textContent = String(state.adjustments.highlights);

    presetButtons.forEach((button) => {
      const active = button.dataset.preset === state.activePreset;
      button.className = active
        ? 'preset-btn btn-primary px-3 py-2 text-xs'
        : 'preset-btn btn-soft px-3 py-2 text-xs';
    });

    [rotateLeftButton, rotateRightButton, flipXButton, flipYButton, resetAllButton, downloadButton, saveDraftButton, startCropButton, resetCropButton].forEach((button) => {
      setDisabled(button, !hasImage);
    });
    setDisabled(applyCropButton, !hasImage || !state.cropMode || !draftRect);
    setDisabled(cancelCropButton, !hasImage || !state.cropMode);
  };

  store.subscribe(syncUI);

  const resetEdits = (): void => {
    const { image } = store.getState();

    if (!image) {
      return;
    }

    store.setState(createStateFromImage(image));
  };

  const enterCropMode = (): void => {
    const state = store.getState();

    if (!state.image) {
      return;
    }

    store.setState({
      cropMode: true,
      draftCropRect: state.cropRect ?? fullImageRect(state.image),
    });
  };

  const applyCrop = (): void => {
    const state = store.getState();

    if (!state.image || !state.draftCropRect) {
      return;
    }

    const nextRect = approximatelyFullRect(state.draftCropRect, state.image) ? null : state.draftCropRect;

    store.setState({
      cropRect: nextRect,
      draftCropRect: null,
      cropMode: false,
    });
  };

  const cancelCrop = (): void => {
    store.setState({
      cropMode: false,
      draftCropRect: null,
    });
  };

  const resetCrop = (): void => {
    const state = store.getState();

    if (!state.image) {
      return;
    }

    store.setState({
      cropRect: null,
      draftCropRect: state.cropMode ? fullImageRect(state.image) : null,
    });
  };

  const download = (): void => {
    const processed = createProcessedCanvas(store.getState());

    if (!processed) {
      return;
    }

    const link = document.createElement('a');
    const state = store.getState();
    const fileName = (state.image?.name ?? 'edited-image').replace(/\.[a-zA-Z0-9]+$/, '');

    link.download = `${fileName}-edited.png`;
    link.href = processed.canvas.toDataURL('image/png');
    link.click();
  };

  const saveCurrentDraft = (): void => {
    const state = store.getState();

    if (!state.image) {
      return;
    }

    saveDraft(state);
    window.alert('草稿已保存到浏览器本地存储。');
  };

  const restoreCurrentDraft = async (): Promise<void> => {
    try {
      const draft = await restoreDraft();

      store.setState({
        image: draft.image,
        cropRect: draft.cropRect,
        draftCropRect: null,
        cropMode: false,
        adjustments: draft.adjustments,
        transform: draft.transform,
        activePreset: draft.activePreset,
      });
      window.alert('草稿恢复成功。');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '草稿恢复失败');
    }
  };

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];

    if (!file) {
      return;
    }

    try {
      const image = await createImageResource(file);
      store.setState(createStateFromImage(image));
      fileInput.value = '';
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '图片加载失败');
    }
  });

  rotateLeftButton.addEventListener('click', () => {
    store.setState((state) => ({
      ...state,
      transform: {
        ...state.transform,
        rotation: state.transform.rotation - 90,
      },
    }));
  });

  rotateRightButton.addEventListener('click', () => {
    store.setState((state) => ({
      ...state,
      transform: {
        ...state.transform,
        rotation: state.transform.rotation + 90,
      },
    }));
  });

  flipXButton.addEventListener('click', () => {
    store.setState((state) => ({
      ...state,
      transform: {
        ...state.transform,
        flipX: !state.transform.flipX,
      },
    }));
  });

  flipYButton.addEventListener('click', () => {
    store.setState((state) => ({
      ...state,
      transform: {
        ...state.transform,
        flipY: !state.transform.flipY,
      },
    }));
  });

  rotationRange.addEventListener('input', () => {
    const value = Number(rotationRange.value);
    store.setState((state) => ({
      ...state,
      transform: {
        ...state.transform,
        rotation: value,
      },
    }));
  });

  contrastRange.addEventListener('input', () => {
    const value = Number(contrastRange.value);
    store.setState((state) => ({
      ...state,
      adjustments: {
        ...state.adjustments,
        contrast: value,
      },
    }));
  });

  exposureRange.addEventListener('input', () => {
    const value = Number(exposureRange.value);
    store.setState((state) => ({
      ...state,
      adjustments: {
        ...state.adjustments,
        exposure: value,
      },
    }));
  });

  highlightsRange.addEventListener('input', () => {
    const value = Number(highlightsRange.value);
    store.setState((state) => ({
      ...state,
      adjustments: {
        ...state.adjustments,
        highlights: value,
      },
    }));
  });

  presetButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const preset = button.dataset.preset as FilterPreset | undefined;

      if (preset) {
        store.setState((state) => ({
          ...state,
          activePreset: preset,
        }));
      }
    });
  });

  resetAllButton.addEventListener('click', resetEdits);
  startCropButton.addEventListener('click', enterCropMode);
  applyCropButton.addEventListener('click', applyCrop);
  cancelCropButton.addEventListener('click', cancelCrop);
  resetCropButton.addEventListener('click', resetCrop);
  downloadButton.addEventListener('click', download);
  saveDraftButton.addEventListener('click', saveCurrentDraft);
  restoreDraftButton.addEventListener('click', () => {
    void restoreCurrentDraft();
  });

  canvas.addEventListener('pointerdown', (event) => {
    const state = store.getState();
    const metrics = renderer.getCropViewMetrics();
    const draftRect = state.draftCropRect;

    if (!state.cropMode || !state.image || !metrics || !draftRect) {
      return;
    }

    const point = getPointerOnImage(event, metrics);
    const handle = detectHandle(point.x, point.y, draftRect, metrics);

    canvas.setPointerCapture(event.pointerId);

    if (handle === 'inside') {
      cropInteraction = {
        mode: 'moving',
        originX: point.x - draftRect.x,
        originY: point.y - draftRect.y,
        rect: draftRect,
      };
      return;
    }

    if (handle) {
      cropInteraction = {
        mode: 'resizing',
        handle,
        rect: draftRect,
      };
      return;
    }

    cropInteraction = {
      mode: 'creating',
      startX: point.x,
      startY: point.y,
    };

    store.setState({
      draftCropRect: normalizeRect(
        point.x,
        point.y,
        point.x + 1,
        point.y + 1,
        state.image.width,
        state.image.height,
      ),
    });
  });

  canvas.addEventListener('pointermove', (event) => {
    const state = store.getState();
    const metrics = renderer.getCropViewMetrics();

    if (!state.cropMode || !state.image || !metrics || cropInteraction.mode === 'idle') {
      return;
    }

    const point = getPointerOnImage(event, metrics);

    if (cropInteraction.mode === 'creating') {
      store.setState({
        draftCropRect: normalizeRect(
          cropInteraction.startX,
          cropInteraction.startY,
          point.x,
          point.y,
          state.image.width,
          state.image.height,
        ),
      });
      return;
    }

    if (cropInteraction.mode === 'moving') {
      const nextX = clamp(point.x - cropInteraction.originX, 0, state.image.width - cropInteraction.rect.width);
      const nextY = clamp(point.y - cropInteraction.originY, 0, state.image.height - cropInteraction.rect.height);

      store.setState({
        draftCropRect: {
          ...cropInteraction.rect,
          x: nextX,
          y: nextY,
        },
      });
      return;
    }

    if (cropInteraction.mode === 'resizing') {
      const current = cropInteraction.rect;
      let nextRect = current;

      switch (cropInteraction.handle) {
        case 'nw':
          nextRect = normalizeRect(
            point.x,
            point.y,
            current.x + current.width,
            current.y + current.height,
            state.image.width,
            state.image.height,
          );
          break;
        case 'ne':
          nextRect = normalizeRect(
            current.x,
            point.y,
            point.x,
            current.y + current.height,
            state.image.width,
            state.image.height,
          );
          break;
        case 'sw':
          nextRect = normalizeRect(
            point.x,
            current.y,
            current.x + current.width,
            point.y,
            state.image.width,
            state.image.height,
          );
          break;
        case 'se':
          nextRect = normalizeRect(
            current.x,
            current.y,
            point.x,
            point.y,
            state.image.width,
            state.image.height,
          );
          break;
      }

      store.setState({
        draftCropRect: nextRect,
      });
    }
  });

  const stopCropInteraction = (event: PointerEvent): void => {
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    cropInteraction = { mode: 'idle' };
  };

  canvas.addEventListener('pointerup', stopCropInteraction);
  canvas.addEventListener('pointercancel', stopCropInteraction);

  window.addEventListener('resize', () => {
    renderer.render(store.getState());
  });
};
