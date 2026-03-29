<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, type CSSProperties } from 'vue';
import WorkbenchHeader from './components/WorkbenchHeader.vue';
import WorkbenchIcon from './components/WorkbenchIcon.vue';
import InspectorSection from './components/InspectorSection.vue';
import { useImageEditor } from '@image-canvas-editor/editor-vue';

const {
  PRESET_OPTIONS,
  TEXT_PRESET_COLORS,
  canvasRef,
  state,
  hasImage,
  textOverlay,
  hasTextOverlay,
  canEditText,
  textOverlayHint,
  textOverlayLength,
  textOverlayFontSize,
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
  ensureTextOverlay,
  removeTextOverlay,
  updateTextOverlayText,
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
const inspectorDialogTitleId = 'workbench-inspector-title';
let desktopViewportMediaQuery: MediaQueryList | null = null;
let fixedWorkbenchViewportMediaQuery: MediaQueryList | null = null;
const themeStyle = computed<CSSProperties>(() =>
  theme.value === 'dark'
    ? {
        colorScheme: 'dark',
        '--studio-bg': '#14110e',
        '--studio-surface-1': '#1c1814',
        '--studio-surface-2': '#231f1b',
        '--studio-surface-3': '#2a261f',
        '--studio-border': 'rgba(255, 239, 220, 0.08)',
        '--studio-ink': '#f5efe7',
        '--studio-ink-muted': '#d4c8bb',
        '--studio-ink-dim': '#a89f92',
        '--studio-accent': '#e9c083',
        '--studio-accent-strong': '#f2d3a0',
        '--studio-accent-ink': '#2b1d0f',
        '--studio-track': '#3a332c',
        '--studio-thumb': '#e9c083',
        '--studio-shadow': '0 24px 60px rgba(7, 5, 3, 0.55)',
        '--studio-shadow-soft': '0 12px 30px rgba(7, 5, 3, 0.35)',
      }
    : {
        colorScheme: 'light',
        '--studio-bg': '#f5efe6',
        '--studio-surface-1': '#fffaf2',
        '--studio-surface-2': '#f5eadb',
        '--studio-surface-3': '#eadac7',
        '--studio-border': 'rgba(92, 64, 34, 0.18)',
        '--studio-ink': '#2f2214',
        '--studio-ink-muted': '#5a4733',
        '--studio-ink-dim': '#846f58',
        '--studio-accent': '#a86a24',
        '--studio-accent-strong': '#8f5716',
        '--studio-accent-ink': '#fff7eb',
        '--studio-track': '#d7c2ab',
        '--studio-thumb': '#b8742b',
        '--studio-shadow': '0 24px 60px rgba(111, 79, 43, 0.18)',
        '--studio-shadow-soft': '0 12px 30px rgba(111, 79, 43, 0.12)',
      },
);

const isCropMode = computed(() => Boolean(state.value.cropMode));
const stageModeLabel = computed(() => {
  if (!hasImage.value) {
    return '等待上传图片';
  }

  if (isCropMode.value) {
    return '裁剪模式';
  }

  return hasTextOverlay.value ? '文字模式' : '普通模式';
});
const stageHint = computed(() =>
  isCropMode.value
    ? '裁剪模式：拖拽裁剪框，拖动内部移动，四角缩放。'
    : hasTextOverlay.value
      ? '文字模式：拖动画布中的文字可定位，拖动空白处继续移动画布。'
      : '普通模式：拖拽移动画布，滚轮缩放，双击复位视图。',
);
const isMobileInspectorModal = computed(() => !isDesktopViewport.value && isInspectorOpen.value);

const setSectionOpen = (section: SectionId, nextOpen: boolean): void => {
  sectionOpen[section] = nextOpen;
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
  () => state.value.textOverlay,
  (next) => {
    if (next) {
      sectionOpen.text = true;
    }
  },
);
watch(isDesktopViewport, (next) => {
  if (next) {
    closeInspector();
  }
});

const getRangeValue = (event: Event): number => Number((event.target as HTMLInputElement).value);
const toggleTheme = (): void => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
};
const openInspector = (): void => {
  isInspectorOpen.value = true;
};
const closeInspector = (): void => {
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

onMounted(() => {
  desktopViewportMediaQuery = window.matchMedia('(min-width: 1024px)');
  fixedWorkbenchViewportMediaQuery = window.matchMedia('(min-width: 1024px) and (min-height: 780px)');
  isDesktopViewport.value = desktopViewportMediaQuery.matches;
  isFixedWorkbenchViewport.value = fixedWorkbenchViewportMediaQuery.matches;
  desktopViewportMediaQuery.addEventListener('change', handleDesktopViewportChange);
  fixedWorkbenchViewportMediaQuery.addEventListener('change', handleFixedWorkbenchViewportChange);
});

onBeforeUnmount(() => {
  desktopViewportMediaQuery?.removeEventListener('change', handleDesktopViewportChange);
  fixedWorkbenchViewportMediaQuery?.removeEventListener('change', handleFixedWorkbenchViewportChange);
});
</script>

<template>
  <div
    class="studio-shell"
    :class="isFixedWorkbenchViewport ? 'h-screen overflow-hidden' : 'min-h-screen'"
    :data-theme="theme"
    :style="themeStyle"
  >
    <div class="flex flex-col" :class="isFixedWorkbenchViewport ? 'h-full' : 'min-h-screen'">
      <div
        class="studio-header shrink-0 px-4 py-4 md:px-6 md:py-5 xl:px-8 xl:py-6"
        :inert="isMobileInspectorModal ? '' : undefined"
        :aria-hidden="isMobileInspectorModal ? 'true' : undefined"
      >
        <div class="mx-auto max-w-[1680px]">
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
        class="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm lg:hidden"
        aria-hidden="true"
        @click="closeInspector"
      />
      <main
        class="mx-auto flex w-full max-w-[1680px] flex-1 px-4 pb-4 md:px-6 md:pb-6 xl:px-8 xl:pb-8"
        :class="isFixedWorkbenchViewport ? 'min-h-0' : ''"
      >
        <div
          class="grid w-full flex-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]"
          :class="isFixedWorkbenchViewport ? 'min-h-0' : ''"
        >
          <aside
            v-if="isDesktopViewport || isInspectorOpen"
            class="flex flex-col border-[color:var(--studio-border)] bg-[color:var(--studio-surface-1)]"
            :class="
              isDesktopViewport
                ? isFixedWorkbenchViewport
                  ? 'min-h-0 overflow-hidden rounded-[28px] border shadow-[var(--studio-shadow-soft)]'
                  : 'rounded-[28px] border shadow-[var(--studio-shadow-soft)]'
                : 'fixed inset-y-0 left-0 z-40 h-full w-[min(22rem,100vw)] max-w-full border-r shadow-[var(--studio-shadow)]'
            "
            :role="isMobileInspectorModal ? 'dialog' : undefined"
            :aria-modal="isMobileInspectorModal ? 'true' : undefined"
            :aria-labelledby="isMobileInspectorModal ? inspectorDialogTitleId : undefined"
            :tabindex="isMobileInspectorModal ? -1 : undefined"
          >
            <div class="flex items-start justify-between gap-3 border-b border-[color:var(--studio-border)] px-4 py-4">
              <div>
                <p class="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--studio-ink-dim)]">Inspector</p>
                <h2 :id="inspectorDialogTitleId" class="mt-1 text-base font-semibold text-[color:var(--studio-ink)]">编辑面板</h2>
                <p class="mt-1 text-xs leading-5 text-[color:var(--studio-ink-dim)]">固定侧栏只负责控件组织，滚动限制在面板内部。</p>
              </div>
              <button class="btn-soft px-3 py-2 text-xs lg:hidden" type="button" @click="closeInspector">关闭</button>
            </div>
            <div class="px-4 py-4" :class="isFixedWorkbenchViewport ? 'min-h-0 flex-1 overflow-y-auto' : ''">
              <div class="space-y-4 pb-4">
                <InspectorSection title="图片信息" :open="sectionOpen.meta" @toggle="(next) => setSectionOpen('meta', next)">
                  <div class="mb-3 flex items-center justify-end">
                    <button class="btn-soft px-2 py-1 text-xs" type="button" :disabled="!hasImage || isCropMode" @click="resetEdits">重置全部</button>
                  </div>
                  <dl class="grid grid-cols-[80px_1fr] gap-y-2 text-sm text-[color:var(--studio-ink-muted)]">
                    <template v-for="item in imageMetaRows" :key="item.label">
                      <dt>{{ item.label }}</dt>
                      <dd>{{ item.value }}</dd>
                    </template>
                  </dl>
                </InspectorSection>
                <InspectorSection title="旋转与翻转" :hint="`当前角度 ${rotationText}`" :open="sectionOpen.transform" @toggle="(next) => setSectionOpen('transform', next)">
                  <div class="grid grid-cols-2 gap-2">
                    <button class="btn-soft inline-flex items-center justify-center gap-2 px-3 py-2 text-sm" type="button" :disabled="!hasImage || isCropMode" @click="rotateBy(-90)">
                      <WorkbenchIcon name="rotate-left" :size="16" />
                      <span>左转 90°</span>
                    </button>
                    <button class="btn-soft inline-flex items-center justify-center gap-2 px-3 py-2 text-sm" type="button" :disabled="!hasImage || isCropMode" @click="rotateBy(90)">
                      <WorkbenchIcon name="rotate-right" :size="16" />
                      <span>右转 90°</span>
                    </button>
                    <button class="btn-soft inline-flex items-center justify-center gap-2 px-3 py-2 text-sm" type="button" :disabled="!hasImage || isCropMode" @click="toggleFlip('flipX')">
                      <WorkbenchIcon name="flip-horizontal" :size="16" />
                      <span>水平翻转</span>
                    </button>
                    <button class="btn-soft inline-flex items-center justify-center gap-2 px-3 py-2 text-sm" type="button" :disabled="!hasImage || isCropMode" @click="toggleFlip('flipY')">
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
                    <button class="btn-soft inline-flex items-center justify-center gap-2 px-3 py-2 text-sm" type="button" :disabled="!hasImage || isCropMode" @click="enterCropMode">
                      <WorkbenchIcon name="crop" :size="16" />
                      <span>进入裁剪</span>
                    </button>
                    <button class="btn-soft inline-flex items-center justify-center gap-2 px-3 py-2 text-sm" type="button" :disabled="!hasImage" @click="resetCrop">
                      <WorkbenchIcon name="viewport-reset" :size="16" />
                      <span>清除裁剪</span>
                    </button>
                    <button class="btn-primary inline-flex items-center justify-center gap-2 px-3 py-2 text-sm" type="button" :disabled="!canApplyCrop" @click="applyCrop">
                      <WorkbenchIcon name="crop-apply" :size="16" />
                      <span>应用裁剪</span>
                    </button>
                    <button class="btn-soft inline-flex items-center justify-center gap-2 px-3 py-2 text-sm" type="button" :disabled="!canCancelCrop" @click="cancelCrop">
                      <WorkbenchIcon name="crop-cancel" :size="16" />
                      <span>取消裁剪</span>
                    </button>
                  </div>
                  <p class="mt-3 text-xs leading-5 text-[color:var(--studio-ink-dim)]">裁剪坐标始终基于原图。这样后面再旋转、翻转，状态也不会乱。</p>
                </InspectorSection>
                <InspectorSection title="文字" :hint="textOverlayHint" :tone="hasTextOverlay && !isCropMode ? 'accent' : 'muted'" :open="sectionOpen.text" @toggle="(next) => setSectionOpen('text', next)">
                  <div class="text-tool-stack space-y-4">
                    <div class="grid grid-cols-2 gap-2">
                      <button class="btn-primary inline-flex items-center justify-center gap-2 px-3 py-2 text-sm" type="button" :disabled="!canEditText" @click="ensureTextOverlay">
                        <WorkbenchIcon name="text" :size="16" />
                        <span>{{ hasTextOverlay ? '聚焦文字' : '添加文字' }}</span>
                      </button>
                      <button class="btn-soft inline-flex items-center justify-center gap-2 px-3 py-2 text-sm" type="button" :disabled="!hasTextOverlay || !canEditText" @click="removeTextOverlay">
                        <WorkbenchIcon name="text-remove" :size="16" />
                        <span>删除文字</span>
                      </button>
                    </div>
                    <label class="block text-sm text-[color:var(--studio-ink-muted)]">
                      <span class="mb-2 flex items-center justify-between">
                        <span>文字内容</span>
                        <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ textOverlayLength }}/24</span>
                      </span>
                      <input class="text-tool-input w-full" type="text" maxlength="24" placeholder="输入一句简短文案" :disabled="!hasTextOverlay || !canEditText" :value="textOverlay?.text ?? ''" @input="updateTextOverlayText(($event.target as HTMLInputElement).value)" />
                    </label>
                    <label class="block text-sm text-[color:var(--studio-ink-muted)]">
                      <span class="mb-2 flex items-center justify-between">
                        <span>字号</span>
                        <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ textOverlayFontSize }} px</span>
                      </span>
                      <input class="input-range" type="range" min="16" max="96" step="1" :disabled="!hasTextOverlay || !canEditText" :value="textOverlayFontSize" @input="updateTextOverlayFontSize(getRangeValue($event))" />
                    </label>
                    <div>
                      <div class="mb-2 flex items-center justify-between text-sm text-[color:var(--studio-ink-muted)]">
                        <span>颜色</span>
                        <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ hasTextOverlay ? '点击切换预设色' : '先创建文字' }}</span>
                      </div>
                      <div class="text-color-grid grid grid-cols-3 gap-2">
                        <button v-for="item in TEXT_PRESET_COLORS" :key="item.value" class="text-color-chip" :class="{ 'is-active': textOverlay?.color === item.value }" type="button" :disabled="!hasTextOverlay || !canEditText" :aria-label="`文字颜色：${item.label}`" @click="updateTextOverlayColor(item.value)">
                          <span class="text-color-chip__swatch" :style="{ backgroundColor: item.value }" />
                          <span class="text-color-chip__label">{{ item.label }}</span>
                        </button>
                      </div>
                    </div>
                    <p class="text-helper text-xs leading-5 text-[color:var(--studio-ink-dim)]">{{ hasTextOverlay ? '文字会参与撤销、重做和 PNG 导出。' : '新增后可直接在画布中拖动文字定位。' }}</p>
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
            class="panel flex flex-1 flex-col rounded-[28px]"
            :class="isFixedWorkbenchViewport ? 'min-h-0 overflow-hidden' : 'min-h-[560px]'"
            :inert="isMobileInspectorModal ? '' : undefined"
            :aria-hidden="isMobileInspectorModal ? 'true' : undefined"
          >
            <div class="flex shrink-0 flex-col gap-4 border-b border-[color:var(--studio-border)] px-4 py-4 md:px-5">
              <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--studio-ink-dim)]">Stage</span>
                    <span class="rounded-full border border-[color:var(--studio-border)] bg-[color:var(--studio-surface-2)] px-2 py-1 text-[11px] text-[color:var(--studio-ink-muted)]">{{ stageModeLabel }}</span>
                  </div>
                  <h2 class="mt-2 panel-title">编辑工作台</h2>
                  <p class="mt-2 max-w-2xl text-xs leading-5 text-[color:var(--studio-ink-dim)]">{{ stageHint }}</p>
                </div>
                <div class="flex items-center gap-2 lg:hidden">
                  <button class="btn-soft px-3 py-2 text-xs" type="button" @click="toggleStageTools">{{ isStageToolsOpen ? '收起工具条' : '展开工具条' }}</button>
                  <button class="btn-soft px-3 py-2 text-xs" type="button" @click="openInspector">检查器</button>
                </div>
              </div>
              <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div class="studio-readout flex items-center gap-3 px-3 py-2 text-xs">
                  <div class="studio-readout__text">
                    <span class="studio-readout__label">缩放</span>
                    <span class="studio-readout__value">{{ zoomText }}</span>
                  </div>
                  <div class="h-4 w-px bg-[color:var(--studio-border)]" />
                  <p class="text-xs leading-5 text-[color:var(--studio-ink-dim)]">{{ hasImage ? '视图动作只影响预览窗口，不会直接写坏原图。' : '上传图片后即可启用撤销、缩放与视图复位。' }}</p>
                </div>
                <div class="flex-wrap gap-2" :class="[isStageToolsOpen ? 'flex' : 'hidden', 'lg:flex']">
                  <button class="btn-soft inline-flex items-center gap-2 px-3 py-2 text-sm" type="button" :disabled="!canUndo || isCropMode" @click="undo"><WorkbenchIcon name="undo" :size="16" /><span>撤销</span></button>
                  <button class="btn-soft inline-flex items-center gap-2 px-3 py-2 text-sm" type="button" :disabled="!canRedo || isCropMode" @click="redo"><WorkbenchIcon name="redo" :size="16" /><span>重做</span></button>
                  <button class="btn-soft inline-flex items-center gap-2 px-3 py-2 text-sm" type="button" :disabled="!hasImage || isCropMode" @click="zoomOut"><WorkbenchIcon name="zoom-out" :size="16" /><span>缩小</span></button>
                  <button class="btn-soft inline-flex items-center gap-2 px-3 py-2 text-sm" type="button" :disabled="!hasImage || isCropMode" @click="zoomIn"><WorkbenchIcon name="zoom-in" :size="16" /><span>放大</span></button>
                  <button class="btn-soft inline-flex items-center gap-2 px-3 py-2 text-sm" type="button" :disabled="!hasImage || isCropMode" @click="resetViewport"><WorkbenchIcon name="viewport-reset" :size="16" /><span>复位视图</span></button>
                </div>
              </div>
            </div>
            <div class="relative flex-1 p-3 md:p-4" :class="isFixedWorkbenchViewport ? 'min-h-0' : 'min-h-[420px]'">
              <div class="editor-stage absolute inset-3 md:inset-4">
                <canvas ref="canvasRef" class="block h-full w-full select-none rounded-4" />
              </div>
              <div v-if="!hasImage" class="stage-empty absolute inset-3 flex items-center justify-center rounded-4 text-center text-sm md:inset-4">
                <div class="max-w-[320px]">
                  <div class="text-base font-semibold text-[color:var(--studio-ink)]">上传图片开始编辑</div>
                  <div class="mt-2 text-xs leading-5 text-[color:var(--studio-ink-dim)]">使用上方按钮上传图片开始编辑。</div>
                </div>
              </div>
              <div v-else class="stage-hint pointer-events-none absolute bottom-6 left-6 max-w-[280px] rounded-3 px-4 py-3 text-sm">
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
