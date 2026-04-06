<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import WorkbenchHeader from './components/WorkbenchHeader.vue';
import WorkbenchIcon from './components/WorkbenchIcon.vue';
import InspectorSection from './components/InspectorSection.vue';
import { useImageEditor } from '@image-canvas-editor/editor-vue';
import { syncHiddenTextProxyFocus } from './text-proxy-focus';

const {
  PRESET_OPTIONS,
  TEXT_PRESET_COLORS,
  canvasRef,
  state,
  hasImage,
  activeText,
  hasActiveText,
  activeTextRotation,
  isTextInserting,
  isTextEditing,
  hiddenTextareaValue,
  canEditText,
  textHint,
  activeTextFontSize,
  rotationText,
  zoomText,
  canApplyCrop,
  canCancelCrop,
  canUndo,
  canRedo,
  imageMetaRows,
  getPresetButtonClass,
  onFileChange,
  undo,
  redo,
  rotateBy,
  toggleFlip,
  previewRotation,
  commitRotation,
  previewActiveTextRotation,
  commitActiveTextRotation,
  startTextInsertion,
  removeTextOverlay,
  onHiddenTextareaInput,
  onHiddenTextareaSelectionChange,
  onHiddenTextareaCompositionStart,
  onHiddenTextareaCompositionEnd,
  updateTextOverlayFontSize,
  updateTextOverlayColor,
  previewAdjustment,
  commitAdjustment,
  applyPreset,
  zoomIn,
  zoomOut,
  resetViewport,
  resetEdits,
  enterCropMode,
  resetCrop,
  applyCrop,
  cancelCrop,
  download,
  saveCurrentDraft,
  restoreCurrentDraft,
} = useImageEditor();

type SectionId = 'meta' | 'transform' | 'crop' | 'text' | 'preset' | 'adjust';
type WorkbenchTheme = 'light' | 'dark';

const sectionOpen = reactive<Record<SectionId, boolean>>({
  meta: true,
  transform: true,
  crop: false,
  text: true,
  preset: false,
  adjust: true,
});
const theme = ref<WorkbenchTheme>('dark');
const isInspectorOpen = ref(false);
const isStageToolsOpen = ref(false);
const isDesktopViewport = ref(typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false);
const isFixedWorkbenchViewport = ref(
  typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px) and (min-height: 780px)').matches : false,
);
const stageFileInputRef = ref<HTMLInputElement | null>(null);
const inspectorPanelRef = ref<HTMLElement | null>(null);
const inspectorTriggerButtonRef = ref<HTMLButtonElement | null>(null);
const inspectorDialogTitleId = 'workbench-inspector-title';
const inspectorPanelId = 'workbench-inspector-panel';
const stageToolsPanelId = 'workbench-stage-tools';
let desktopViewportMediaQuery: MediaQueryList | null = null;
let fixedWorkbenchViewportMediaQuery: MediaQueryList | null = null;
let isDocumentScrollLocked = false;
let lockedScrollY = 0;
let shouldRestoreInspectorFocus = false;
let previousHtmlOverflow = '';
let previousBodyOverflow = '';
let previousBodyPosition = '';
let previousBodyTop = '';
let previousBodyLeft = '';
let previousBodyRight = '';
let previousBodyWidth = '';
const hiddenTextInputRef = ref<HTMLTextAreaElement | null>(null);
let hiddenTextInputSyncVersion = 0;
const TEXT_FONT_SIZE_MIN = 12;
const TEXT_FONT_SIZE_MAX = 180;
const TEXT_ROTATION_MIN = -180;
const TEXT_ROTATION_MAX = 180;

const applyDocumentTheme = (nextTheme: WorkbenchTheme): void => {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.dataset.theme = nextTheme;
  document.body?.setAttribute('data-theme', nextTheme);
};
const clearDocumentTheme = (): void => {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.removeAttribute('data-theme');
  document.body?.removeAttribute('data-theme');
};
applyDocumentTheme(theme.value);

const isCropMode = computed(() => Boolean(state.value.cropMode));
const stageModeLabel = computed(() => {
  if (!hasImage.value) {
    return '等待上传图片';
  }

  if (isCropMode.value) {
    return '裁剪模式';
  }

  if (isTextInserting.value) {
    return '文字插入';
  }

  if (isTextEditing.value) {
    return '文字编辑';
  }

  return hasActiveText.value ? '文字已选中' : '普通模式';
});
const stageHint = computed(() =>
  isCropMode.value
    ? '裁剪模式：拖拽裁剪框，拖动内部移动，四角缩放。'
    : isTextInserting.value
      ? '插入态：点击画布中的落点创建一段新文字。'
      : isTextEditing.value
        ? '编辑态：直接输入文字，点击空白区域结束本次编辑。'
        : hasActiveText.value
          ? '文字已选中：点击文字继续编辑，拖动方形手柄移动位置，拖动圆形手柄旋转角度。'
          : '普通模式：拖拽移动画布，滚轮缩放，双击复位视图。',
);
const isMobileInspectorModal = computed(() => !isDesktopViewport.value && isInspectorOpen.value);
const shouldScrollInspectorContent = computed(() => isMobileInspectorModal.value || isFixedWorkbenchViewport.value);
const activePresetLabel = computed(
  () => PRESET_OPTIONS.find((item) => item.value === state.value.activePreset)?.label ?? '原图',
);
const metaSummary = computed(() => {
  const [fileNameRow, sizeRow, cropRow, statusRow] = imageMetaRows.value;

  return {
    fileName: fileNameRow?.value ?? '未加载',
    size: sizeRow?.value ?? '-',
    crop: cropRow?.value ?? '-',
    status: statusRow?.value ?? '等待上传图片',
  };
});
const compactMetaLine = computed(() => `${metaSummary.value.fileName} · ${metaSummary.value.size}`);

const lockDocumentScroll = (): void => {
  if (typeof document === 'undefined' || typeof window === 'undefined' || isDocumentScrollLocked) {
    return;
  }

  const { body, documentElement } = document;
  lockedScrollY = window.scrollY;
  previousHtmlOverflow = documentElement.style.overflow;
  previousBodyOverflow = body.style.overflow;
  previousBodyPosition = body.style.position;
  previousBodyTop = body.style.top;
  previousBodyLeft = body.style.left;
  previousBodyRight = body.style.right;
  previousBodyWidth = body.style.width;

  documentElement.style.overflow = 'hidden';
  body.style.overflow = 'hidden';
  body.style.position = 'fixed';
  body.style.top = `-${lockedScrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  isDocumentScrollLocked = true;
};
const unlockDocumentScroll = (): void => {
  if (typeof document === 'undefined' || typeof window === 'undefined' || !isDocumentScrollLocked) {
    return;
  }

  const { body, documentElement } = document;
  documentElement.style.overflow = previousHtmlOverflow;
  body.style.overflow = previousBodyOverflow;
  body.style.position = previousBodyPosition;
  body.style.top = previousBodyTop;
  body.style.left = previousBodyLeft;
  body.style.right = previousBodyRight;
  body.style.width = previousBodyWidth;
  window.scrollTo({ top: lockedScrollY });
  isDocumentScrollLocked = false;
};
const setSectionOpen = (section: SectionId, nextOpen: boolean): void => {
  sectionOpen[section] = nextOpen;
};
const syncHiddenTextInput = async (): Promise<void> => {
  const input = hiddenTextInputRef.value;
  const textToolState = state.value.textToolState;
  const syncVersion = ++hiddenTextInputSyncVersion;

  if (!input) {
    return;
  }

  await nextTick();

  if (syncVersion !== hiddenTextInputSyncVersion || hiddenTextInputRef.value !== input) {
    return;
  }

  await syncHiddenTextProxyFocus(input, textToolState);

  if (syncVersion !== hiddenTextInputSyncVersion || hiddenTextInputRef.value !== input) {
    return;
  }
};
const getRangeValue = (event: Event): number => Number((event.target as HTMLInputElement).value);
const clampTextFontSize = (value: number): number =>
  Math.min(TEXT_FONT_SIZE_MAX, Math.max(TEXT_FONT_SIZE_MIN, Math.round(value)));
const clampTextRotation = (value: number): number =>
  Math.min(TEXT_ROTATION_MAX, Math.max(TEXT_ROTATION_MIN, Math.round(value)));
const activeTextRotationLabel = computed(() => `${Math.round(activeTextRotation.value)}°`);
const handleTextFontSizeChange = (nextValue: number): void => {
  if (!hasActiveText.value || !canEditText.value || Number.isNaN(nextValue)) {
    return;
  }

  const normalized = clampTextFontSize(nextValue);
  updateTextOverlayFontSize(normalized);
};
const handleTextRotationPreview = (nextValue: number): void => {
  if (!hasActiveText.value || !canEditText.value || Number.isNaN(nextValue)) {
    return;
  }

  previewActiveTextRotation(clampTextRotation(nextValue));
};
const handleTextRotationCommit = (nextValue: number): void => {
  if (!hasActiveText.value || !canEditText.value || Number.isNaN(nextValue)) {
    return;
  }

  commitActiveTextRotation(clampTextRotation(nextValue));
};

watch(
  () => state.value.cropMode,
  (next) => {
    if (next) {
      sectionOpen.crop = true;
    }
  },
);
watch(
  () => state.value.activeTextId,
  (next) => {
    if (next) {
      sectionOpen.text = true;
    }
  },
);
watch(
  () => state.value.textToolState,
  () => {
    void syncHiddenTextInput();
  },
  { deep: true },
);
watch(hiddenTextareaValue, () => {
  if (state.value.textToolState.mode === 'editing') {
    void syncHiddenTextInput();
  }
});
watch(isDesktopViewport, (next) => {
  if (next) {
    closeInspector();
    isStageToolsOpen.value = false;
  }
});
watch(theme, applyDocumentTheme);
watch(isMobileInspectorModal, async (next) => {
  if (next) {
    lockDocumentScroll();
    await nextTick();
    inspectorPanelRef.value?.focus();
    return;
  }

  unlockDocumentScroll();
  if (shouldRestoreInspectorFocus && !isDesktopViewport.value) {
    await nextTick();
    inspectorTriggerButtonRef.value?.focus();
  }
  shouldRestoreInspectorFocus = false;
});
const toggleTheme = (): void => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
};
const openStageFilePicker = (): void => {
  if (isCropMode.value) {
    return;
  }

  stageFileInputRef.value?.click();
};
const openInspector = (): void => {
  shouldRestoreInspectorFocus = false;
  isInspectorOpen.value = true;
};
const closeInspector = (options: { restoreFocus?: boolean } = {}): void => {
  shouldRestoreInspectorFocus = Boolean(options.restoreFocus);
  isInspectorOpen.value = false;
};
const toggleStageTools = (): void => {
  isStageToolsOpen.value = !isStageToolsOpen.value;
};
const handleDesktopViewportChange = (event: MediaQueryListEvent): void => {
  isDesktopViewport.value = event.matches;
};
const handleFixedWorkbenchViewportChange = (event: MediaQueryListEvent): void => {
  isFixedWorkbenchViewport.value = event.matches;
};
const handleWindowKeydown = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape' || !isMobileInspectorModal.value) {
    return;
  }

  event.preventDefault();
  closeInspector({ restoreFocus: true });
};

onMounted(() => {
  applyDocumentTheme(theme.value);
  desktopViewportMediaQuery = window.matchMedia('(min-width: 1024px)');
  fixedWorkbenchViewportMediaQuery = window.matchMedia('(min-width: 1024px) and (min-height: 780px)');
  isDesktopViewport.value = desktopViewportMediaQuery.matches;
  isFixedWorkbenchViewport.value = fixedWorkbenchViewportMediaQuery.matches;
  desktopViewportMediaQuery.addEventListener('change', handleDesktopViewportChange);
  fixedWorkbenchViewportMediaQuery.addEventListener('change', handleFixedWorkbenchViewportChange);
  window.addEventListener('keydown', handleWindowKeydown);
});

onBeforeUnmount(() => {
  unlockDocumentScroll();
  clearDocumentTheme();
  desktopViewportMediaQuery?.removeEventListener('change', handleDesktopViewportChange);
  fixedWorkbenchViewportMediaQuery?.removeEventListener('change', handleFixedWorkbenchViewportChange);
  window.removeEventListener('keydown', handleWindowKeydown);
});
</script>

<template>
  <div
    class="studio-shell"
    :class="isFixedWorkbenchViewport ? 'h-screen overflow-hidden' : 'min-h-screen'"
    :data-theme="theme"
  >
    <div class="flex flex-col" :class="isFixedWorkbenchViewport ? 'h-full' : 'min-h-screen'">
      <div
        class="studio-header shrink-0 px-4 py-4 md:px-6 md:py-5 xl:px-8 xl:py-6"
        :inert="isMobileInspectorModal ? '' : undefined"
        :aria-hidden="isMobileInspectorModal ? 'true' : undefined"
      >
        <div class="mx-auto max-w-[1720px]">
          <WorkbenchHeader
            :has-image="hasImage"
            :editing-locked="isCropMode"
            :theme="theme"
            @file-change="onFileChange"
            @save-draft="saveCurrentDraft"
            @restore-draft="restoreCurrentDraft"
            @download="download"
            @toggle-theme="toggleTheme"
          />
        </div>
      </div>
      <div
        v-if="isMobileInspectorModal"
        class="fixed inset-0 z-30 bg-[color:var(--studio-backdrop)] backdrop-blur-sm lg:hidden"
        aria-hidden="true"
        @click="closeInspector({ restoreFocus: true })"
      />
      <main
        class="studio-main mx-auto flex w-full max-w-[1720px] flex-1 px-4 pb-4 md:px-6 md:pb-6 xl:px-8 xl:pb-8"
        :class="isFixedWorkbenchViewport ? 'min-h-0' : ''"
      >
        <div class="studio-workbench relative w-full flex-1" :class="isFixedWorkbenchViewport ? 'min-h-0' : ''">
          <aside
            class="tool-dock tool-dock--desktop workbench-panel flex-col"
            :class="
              isDesktopViewport
                ? isFixedWorkbenchViewport
                  ? 'flex lg:min-h-0 lg:overflow-hidden'
                  : 'flex'
                : isStageToolsOpen
                  ? 'flex'
                  : 'hidden'
            "
            :id="!isDesktopViewport ? stageToolsPanelId : undefined"
            :inert="isMobileInspectorModal ? '' : undefined"
            :aria-hidden="isMobileInspectorModal ? 'true' : undefined"
          >
            <div class="tool-dock__group">
              <span class="tool-dock__label">历史</span>
              <div class="tool-dock__grid">
                <button class="dock-tool-btn" type="button" :disabled="!canUndo || isCropMode" title="撤销" aria-label="撤销" @click="undo">
                  <WorkbenchIcon name="undo" :size="18" />
                </button>
                <button class="dock-tool-btn" type="button" :disabled="!canRedo || isCropMode" title="重做" aria-label="重做" @click="redo">
                  <WorkbenchIcon name="redo" :size="18" />
                </button>
              </div>
            </div>
            <div class="tool-dock__group">
              <span class="tool-dock__label">动作</span>
              <div class="tool-dock__grid">
                <button class="dock-tool-btn dock-tool-btn--primary" type="button" :disabled="!hasImage || isCropMode" title="裁剪" aria-label="裁剪" @click="enterCropMode">
                  <WorkbenchIcon name="crop" :size="18" />
                </button>
                <button class="dock-tool-btn" :class="{ 'dock-tool-btn--primary': isTextInserting || isTextEditing }" type="button" :disabled="!canEditText" title="文字" aria-label="文字" @click="startTextInsertion">
                  <WorkbenchIcon name="text" :size="18" />
                </button>
              </div>
            </div>
            <div class="tool-dock__group">
              <span class="tool-dock__label">视图</span>
              <div class="tool-dock__grid">
                <button class="dock-tool-btn" type="button" :disabled="!hasImage || isCropMode" title="缩小" aria-label="缩小" @click="zoomOut">
                  <WorkbenchIcon name="zoom-out" :size="18" />
                </button>
                <button class="dock-tool-btn" type="button" :disabled="!hasImage || isCropMode" title="放大" aria-label="放大" @click="zoomIn">
                  <WorkbenchIcon name="zoom-in" :size="18" />
                </button>
                <button class="dock-tool-btn" type="button" :disabled="!hasImage || isCropMode" title="复位视图" aria-label="复位视图" @click="resetViewport">
                  <WorkbenchIcon name="viewport-reset" :size="18" />
                </button>
              </div>
            </div>
            <div class="tool-dock__meta lg:hidden">
              <span class="tool-dock__meta-label">预设</span>
              <strong>{{ activePresetLabel }}</strong>
              <span>{{ metaSummary.size }}</span>
            </div>
          </aside>
          <aside
            v-if="isDesktopViewport || isInspectorOpen"
            ref="inspectorPanelRef"
            class="inspector-shell inspector-shell--desktop workbench-frame flex flex-col"
            :class="
              isDesktopViewport
                ? isFixedWorkbenchViewport
                  ? 'min-h-0 overflow-hidden'
                  : ''
                : 'fixed inset-y-0 right-0 z-40 h-full w-[min(23rem,100vw)] max-w-full rounded-l-[28px] border-r-0 shadow-[var(--studio-shadow)]'
            "
            :id="!isDesktopViewport ? inspectorPanelId : undefined"
            :role="isMobileInspectorModal ? 'dialog' : undefined"
            :aria-modal="isMobileInspectorModal ? 'true' : undefined"
            :aria-labelledby="isMobileInspectorModal ? inspectorDialogTitleId : undefined"
            :tabindex="isMobileInspectorModal ? -1 : undefined"
          >
            <div class="inspector-shell__header">
              <div class="min-w-0">
                <h2 :id="inspectorDialogTitleId" class="inspector-shell__title">调节</h2>
                <p class="inspector-shell__meta">{{ compactMetaLine }}</p>
              </div>
              <button class="mobile-toggle-btn lg:hidden" type="button" @click="closeInspector({ restoreFocus: true })">关闭</button>
            </div>
            <div class="min-h-0 px-4 py-4" :class="shouldScrollInspectorContent ? 'flex-1 overflow-y-auto overscroll-contain' : ''">
              <div class="space-y-3 pb-3">
                <InspectorSection title="图片信息" :open="sectionOpen.meta" @toggle="(next) => setSectionOpen('meta', next)">
                  <div class="inspector-meta-row">
                    <div class="inspector-meta-chip">
                      <span class="inspector-meta-chip__label">文件</span>
                      <strong class="inspector-meta-chip__value">{{ metaSummary.fileName }}</strong>
                    </div>
                    <div class="inspector-meta-chip">
                      <span class="inspector-meta-chip__label">尺寸</span>
                      <strong class="inspector-meta-chip__value">{{ metaSummary.size }}</strong>
                    </div>
                    <button class="mini-action-btn" type="button" :disabled="!hasImage || isCropMode" @click="resetEdits">重置</button>
                  </div>
                </InspectorSection>
                <InspectorSection title="旋转与翻转" :hint="`当前角度 ${rotationText}`" :open="sectionOpen.transform" @toggle="(next) => setSectionOpen('transform', next)">
                  <div class="grid grid-cols-2 gap-2">
                    <button class="btn-soft workbench-icon-btn w-full justify-start" type="button" :disabled="!hasImage || isCropMode" @click="rotateBy(-90)">
                      <WorkbenchIcon name="rotate-left" :size="16" />
                      <span>左转 90°</span>
                    </button>
                    <button class="btn-soft workbench-icon-btn w-full justify-start" type="button" :disabled="!hasImage || isCropMode" @click="rotateBy(90)">
                      <WorkbenchIcon name="rotate-right" :size="16" />
                      <span>右转 90°</span>
                    </button>
                    <button class="btn-soft workbench-icon-btn w-full justify-start" type="button" :disabled="!hasImage || isCropMode" @click="toggleFlip('flipX')">
                      <WorkbenchIcon name="flip-horizontal" :size="16" />
                      <span>水平翻转</span>
                    </button>
                    <button class="btn-soft workbench-icon-btn w-full justify-start" type="button" :disabled="!hasImage || isCropMode" @click="toggleFlip('flipY')">
                      <WorkbenchIcon name="flip-vertical" :size="16" />
                      <span>垂直翻转</span>
                    </button>
                  </div>
                  <label class="mt-4 block text-sm text-[color:var(--studio-ink-muted)]">
                    <span class="mb-2 flex items-center justify-between">
                      <span>任意角度</span>
                      <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ rotationText }}</span>
                    </span>
                    <input class="input-range" type="range" min="-180" max="180" step="1" :disabled="!hasImage || isCropMode" :value="state.transform.rotation" @input="previewRotation(getRangeValue($event))" @change="commitRotation(getRangeValue($event))" />
                  </label>
                </InspectorSection>
                <InspectorSection title="裁剪" hint="拖拽框选，拖动内部移动，四角缩放" :tone="isCropMode ? 'accent' : 'muted'" :open="sectionOpen.crop" @toggle="(next) => setSectionOpen('crop', next)">
                  <div class="grid grid-cols-2 gap-2">
                    <button class="btn-soft workbench-icon-btn w-full justify-start" type="button" :disabled="!hasImage || isCropMode" @click="enterCropMode">
                      <WorkbenchIcon name="crop" :size="16" />
                      <span>进入裁剪</span>
                    </button>
                    <button class="btn-soft workbench-icon-btn w-full justify-start" type="button" :disabled="!hasImage" @click="resetCrop">
                      <WorkbenchIcon name="crop-cancel" :size="16" />
                      <span>清除裁剪</span>
                    </button>
                    <button class="btn-primary workbench-icon-btn w-full justify-start" type="button" :disabled="!canApplyCrop" @click="applyCrop">
                      <WorkbenchIcon name="crop-apply" :size="16" />
                      <span>应用裁剪</span>
                    </button>
                    <button class="btn-soft workbench-icon-btn w-full justify-start" type="button" :disabled="!canCancelCrop" @click="cancelCrop">
                      <WorkbenchIcon name="crop-cancel" :size="16" />
                      <span>取消裁剪</span>
                    </button>
                  </div>
                  <p class="mt-3 text-xs leading-5 text-[color:var(--studio-ink-dim)]">裁剪坐标始终基于原图。这样后面再旋转、翻转，状态也不会乱。</p>
                </InspectorSection>
                <InspectorSection title="文字" :hint="textHint" :tone="(hasActiveText || isTextInserting || isTextEditing) && !isCropMode ? 'accent' : 'muted'" :open="sectionOpen.text" @toggle="(next) => setSectionOpen('text', next)">
                  <div class="text-tool-stack space-y-4">
                    <div class="grid grid-cols-2 gap-2">
                      <button class="btn-primary workbench-icon-btn w-full justify-start" type="button" :disabled="!canEditText" @click="startTextInsertion">
                        <WorkbenchIcon name="text" :size="16" />
                        <span>{{ isTextInserting ? '等待落点' : '新增文字' }}</span>
                      </button>
                      <button class="btn-soft workbench-icon-btn w-full justify-start" type="button" :disabled="!hasActiveText || !canEditText" @click="removeTextOverlay">
                        <WorkbenchIcon name="text-remove" :size="16" />
                        <span>删除文字</span>
                      </button>
                    </div>
                    <label class="block text-sm text-[color:var(--studio-ink-muted)]">
                      <span class="mb-2 flex items-center justify-between">
                        <span>字号</span>
                        <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ activeTextFontSize }} px</span>
                      </span>
                      <input class="input-range" type="range" :min="TEXT_FONT_SIZE_MIN" :max="TEXT_FONT_SIZE_MAX" step="1" :disabled="!hasActiveText || !canEditText" :value="activeTextFontSize" @input="handleTextFontSizeChange(getRangeValue($event))" />
                    </label>
                    <label class="block text-sm text-[color:var(--studio-ink-muted)]">
                      <span class="mb-2 flex items-center justify-between">
                        <span>旋转</span>
                        <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ activeTextRotationLabel }}</span>
                      </span>
                      <input
                        class="input-range"
                        type="range"
                        :min="TEXT_ROTATION_MIN"
                        :max="TEXT_ROTATION_MAX"
                        step="1"
                        :disabled="!hasActiveText || !canEditText"
                        :value="activeTextRotation"
                        @input="handleTextRotationPreview(getRangeValue($event))"
                        @change="handleTextRotationCommit(getRangeValue($event))"
                      />
                    </label>
                    <div>
                      <div class="mb-2 flex items-center justify-between text-sm text-[color:var(--studio-ink-muted)]">
                        <span>颜色</span>
                        <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ hasActiveText ? '点击切换预设色' : '先创建文字' }}</span>
                      </div>
                      <div class="text-color-grid grid grid-cols-3 gap-2">
                        <button v-for="item in TEXT_PRESET_COLORS" :key="item.value" class="text-color-chip" :class="{ 'is-active': activeText?.color === item.value }" type="button" :disabled="!hasActiveText || !canEditText" :aria-label="`文字颜色：${item.label}`" @click="updateTextOverlayColor(item.value)">
                          <span class="text-color-chip__swatch" :style="{ backgroundColor: item.value }" />
                          <span class="text-color-chip__label">{{ item.label }}</span>
                        </button>
                      </div>
                    </div>
                    <p class="text-helper text-xs leading-5 text-[color:var(--studio-ink-dim)]">{{ hasActiveText ? '当前选中文字会参与撤销、重做和 PNG 导出。' : '新增后可点击文字直接编辑；选中后拖动方形手柄移动位置，拖动圆形手柄旋转角度。' }}</p>
                  </div>
                </InspectorSection>
                <InspectorSection title="滤镜预设" hint="先预设，再微调" :open="sectionOpen.preset" @toggle="(next) => setSectionOpen('preset', next)">
                  <div class="preset-grid grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <button v-for="item in PRESET_OPTIONS" :key="item.value" type="button" :disabled="isCropMode" :class="getPresetButtonClass(item.value)" @click="applyPreset(item.value)">{{ item.label }}</button>
                  </div>
                </InspectorSection>
                <InspectorSection title="参数调节" hint="-100 ~ 100" :open="sectionOpen.adjust" @toggle="(next) => setSectionOpen('adjust', next)">
                  <div class="space-y-4">
                    <label class="block text-sm text-[color:var(--studio-ink-muted)]">
                      <span class="mb-2 flex items-center justify-between">
                        <span>对比度</span>
                        <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ state.adjustments.contrast }}</span>
                      </span>
                      <input class="input-range" type="range" min="-100" max="100" step="1" :disabled="!hasImage || isCropMode" :value="state.adjustments.contrast" @input="previewAdjustment('contrast', getRangeValue($event))" @change="commitAdjustment('contrast', getRangeValue($event))" />
                    </label>
                    <label class="block text-sm text-[color:var(--studio-ink-muted)]">
                      <span class="mb-2 flex items-center justify-between">
                        <span>曝光</span>
                        <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ state.adjustments.exposure }}</span>
                      </span>
                      <input class="input-range" type="range" min="-100" max="100" step="1" :disabled="!hasImage || isCropMode" :value="state.adjustments.exposure" @input="previewAdjustment('exposure', getRangeValue($event))" @change="commitAdjustment('exposure', getRangeValue($event))" />
                    </label>
                    <label class="block text-sm text-[color:var(--studio-ink-muted)]">
                      <span class="mb-2 flex items-center justify-between">
                        <span>高光</span>
                        <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ state.adjustments.highlights }}</span>
                      </span>
                      <input class="input-range" type="range" min="-100" max="100" step="1" :disabled="!hasImage || isCropMode" :value="state.adjustments.highlights" @input="previewAdjustment('highlights', getRangeValue($event))" @change="commitAdjustment('highlights', getRangeValue($event))" />
                    </label>
                  </div>
                </InspectorSection>
              </div>
            </div>
          </aside>
          <section
            class="stage-shell stage-shell--desktop workbench-panel flex flex-1 flex-col overflow-hidden"
            :class="isFixedWorkbenchViewport ? 'min-h-0' : 'min-h-[720px]'"
            :inert="isMobileInspectorModal ? '' : undefined"
            :aria-hidden="isMobileInspectorModal ? 'true' : undefined"
          >
            <div class="stage-shell__topbar">
              <div class="stage-shell__headline">
                <p class="stage-shell__eyebrow">Stage</p>
                <div class="stage-shell__badges">
                  <span class="status-pill stage-status-pill">{{ stageModeLabel }}</span>
                  <span v-if="hasImage" class="status-pill">{{ activePresetLabel }}</span>
                </div>
              </div>
              <div class="stage-shell__controls">
                <div class="stage-metric">
                  <span class="stage-metric__label">缩放</span>
                  <strong class="stage-metric__value">{{ zoomText }}</strong>
                </div>
                <div class="stage-metric">
                  <span class="stage-metric__label">角度</span>
                  <strong class="stage-metric__value">{{ rotationText }}</strong>
                </div>
                <div class="stage-metric">
                  <span class="stage-metric__label">状态</span>
                  <strong class="stage-metric__value">{{ metaSummary.status }}</strong>
                </div>
                <div class="flex items-center gap-2 lg:hidden">
                  <button
                    class="mobile-toggle-btn"
                    type="button"
                    :aria-expanded="isStageToolsOpen"
                    :aria-controls="stageToolsPanelId"
                    @click="toggleStageTools"
                  >
                    {{ isStageToolsOpen ? '收起工具' : '展开工具' }}
                  </button>
                  <button
                    ref="inspectorTriggerButtonRef"
                    class="mobile-toggle-btn"
                    type="button"
                    :aria-expanded="isInspectorOpen"
                    :aria-controls="inspectorPanelId"
                    @click="openInspector"
                  >
                    调节面板
                  </button>
                </div>
              </div>
            </div>
            <div class="stage-shell__viewport stage-shell__viewport--workspace" :class="isFixedWorkbenchViewport ? 'min-h-0' : 'min-h-[520px]'">
              <input
                ref="stageFileInputRef"
                type="file"
                accept="image/*"
                tabindex="-1"
                aria-hidden="true"
                class="sr-only"
                :disabled="isCropMode"
                @change="onFileChange"
              />
              <div class="editor-stage absolute inset-4 md:inset-5" :class="{ 'is-text-inserting': isTextInserting, 'is-text-editing': isTextEditing }">
                <textarea
                  ref="hiddenTextInputRef"
                  class="canvas-text-proxy"
                  :value="hiddenTextareaValue"
                  :disabled="!isTextEditing"
                  tabindex="-1"
                  @input="onHiddenTextareaInput"
                  @click="onHiddenTextareaSelectionChange"
                  @keyup="onHiddenTextareaSelectionChange"
                  @select="onHiddenTextareaSelectionChange"
                  @compositionstart="onHiddenTextareaCompositionStart"
                  @compositionend="onHiddenTextareaCompositionEnd"
                />
                <canvas ref="canvasRef" class="block h-full w-full select-none rounded-[22px]" />
              </div>
              <div
                v-if="!hasImage"
                class="stage-empty absolute inset-4 flex items-center justify-center rounded-[22px] text-center md:inset-5"
              >
                <div class="stage-empty__body">
                  <p class="stage-empty__eyebrow">Ready</p>
                  <div class="stage-empty__title">上传一张图，把画布激活</div>
                  <div class="stage-empty__copy">
                    工具和调节都贴边悬浮，中间只留给画布。先给它一张图，界面才开始有价值。
                  </div>
                  <div class="stage-empty__actions">
                    <button class="btn-primary workbench-icon-btn" type="button" @click="openStageFilePicker">
                      <WorkbenchIcon name="upload" :size="16" />
                      <span>上传图片</span>
                    </button>
                    <button class="btn-soft workbench-icon-btn" type="button" @click="restoreCurrentDraft">
                      <WorkbenchIcon name="draft-restore" :size="16" />
                      <span>恢复草稿</span>
                    </button>
                  </div>
                </div>
              </div>
              <div
                v-if="hasImage"
                class="stage-hint pointer-events-none absolute bottom-7 left-7 max-w-[320px] rounded-[18px] px-4 py-3 text-sm"
              >
                <div class="stage-hint__title">{{ stageModeLabel }}</div>
                <div class="mt-1 text-xs leading-5 text-[color:var(--studio-ink-dim)]">{{ stageHint }}</div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>
