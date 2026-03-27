<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import WorkbenchHeader from './components/WorkbenchHeader.vue';
import InspectorSection from './components/InspectorSection.vue';
import { useImageEditor } from '@image-canvas-editor/editor-vue';

const {
  PRESET_OPTIONS,
  canvasRef,
  state,
  hasImage,
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

type SectionId = 'meta' | 'transform' | 'crop' | 'preset' | 'adjust';

const sectionOpen = reactive<Record<SectionId, boolean>>({
  meta: true,
  transform: true,
  crop: false,
  preset: false,
  adjust: true,
});

const isCropMode = computed(() => Boolean(state.value.cropMode));
const stageHint = computed(() =>
  isCropMode.value
    ? '裁剪模式：拖拽裁剪框，拖动内部移动，四角缩放。'
    : '普通模式：拖拽移动画布，滚轮缩放，双击复位视图。',
);

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

const getRangeValue = (event: Event): number => Number((event.target as HTMLInputElement).value);
</script>

<template>
  <div class="min-h-screen studio-shell">
    <div class="mx-auto max-w-[1600px] p-4 md:p-6 xl:p-8">
      <div class="studio-header">
        <WorkbenchHeader
          :has-image="hasImage"
          :editing-locked="isCropMode"
          @file-change="onFileChange"
          @save-draft="saveCurrentDraft"
          @restore-draft="restoreCurrentDraft"
          @download="download"
        />
      </div>

      <main class="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside class="space-y-4">
          <InspectorSection title="图片信息" :open="sectionOpen.meta" @toggle="(next) => setSectionOpen('meta', next)">
            <div class="mb-3 flex items-center justify-end">
              <button class="btn-soft px-2 py-1 text-xs" type="button" :disabled="!hasImage || isCropMode" @click="resetEdits">
                重置全部
              </button>
            </div>
            <dl class="grid grid-cols-[80px_1fr] gap-y-2 text-sm text-[color:var(--studio-ink-muted)]">
              <template v-for="item in imageMetaRows" :key="item.label">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
              </template>
            </dl>
          </InspectorSection>

          <InspectorSection
            title="旋转与翻转"
            :hint="`当前角度 ${rotationText}`"
            :open="sectionOpen.transform"
            @toggle="(next) => setSectionOpen('transform', next)"
          >
            <div class="grid grid-cols-2 gap-2">
              <button class="btn-soft" type="button" :disabled="!hasImage || isCropMode" @click="rotateBy(-90)">左转 90°</button>
              <button class="btn-soft" type="button" :disabled="!hasImage || isCropMode" @click="rotateBy(90)">右转 90°</button>
              <button class="btn-soft" type="button" :disabled="!hasImage || isCropMode" @click="toggleFlip('flipX')">水平翻转</button>
              <button class="btn-soft" type="button" :disabled="!hasImage || isCropMode" @click="toggleFlip('flipY')">垂直翻转</button>
            </div>
            <label class="mt-4 block text-sm text-[color:var(--studio-ink-muted)]">
              <span class="mb-2 flex items-center justify-between">
                <span>任意角度</span>
                <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ rotationText }}</span>
              </span>
              <input
                class="input-range"
                type="range"
                min="-180"
                max="180"
                step="1"
                :disabled="!hasImage || isCropMode"
                :value="state.transform.rotation"
                @input="previewRotation(getRangeValue($event))"
                @change="commitRotation(getRangeValue($event))"
              />
            </label>
          </InspectorSection>

          <InspectorSection
            title="裁剪"
            hint="拖拽框选，拖动内部移动，四角缩放"
            :tone="isCropMode ? 'accent' : 'muted'"
            :open="sectionOpen.crop"
            @toggle="(next) => setSectionOpen('crop', next)"
          >
            <div class="grid grid-cols-2 gap-2">
              <button class="btn-soft" type="button" :disabled="!hasImage || isCropMode" @click="enterCropMode">进入裁剪</button>
              <button class="btn-soft" type="button" :disabled="!hasImage" @click="resetCrop">清除裁剪</button>
              <button class="btn-primary" type="button" :disabled="!canApplyCrop" @click="applyCrop">应用裁剪</button>
              <button class="btn-soft" type="button" :disabled="!canCancelCrop" @click="cancelCrop">取消裁剪</button>
            </div>
            <p class="mt-3 text-xs leading-5 text-[color:var(--studio-ink-dim)]">
              裁剪坐标始终基于原图。这样后面再旋转、翻转，状态也不会乱。
            </p>
          </InspectorSection>

          <InspectorSection
            title="滤镜预设"
            hint="先预设，再微调"
            :open="sectionOpen.preset"
            @toggle="(next) => setSectionOpen('preset', next)"
          >
            <div class="preset-grid grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                v-for="item in PRESET_OPTIONS"
                :key="item.value"
                type="button"
                :disabled="isCropMode"
                :class="getPresetButtonClass(item.value)"
                @click="applyPreset(item.value)"
              >
                {{ item.label }}
              </button>
            </div>
          </InspectorSection>

          <InspectorSection
            title="参数调节"
            hint="-100 ~ 100"
            :open="sectionOpen.adjust"
            @toggle="(next) => setSectionOpen('adjust', next)"
          >
            <div class="space-y-4">
              <label class="block text-sm text-[color:var(--studio-ink-muted)]">
                <span class="mb-2 flex items-center justify-between">
                  <span>对比度</span>
                  <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ state.adjustments.contrast }}</span>
                </span>
                <input
                  class="input-range"
                  type="range"
                  min="-100"
                  max="100"
                  step="1"
                  :disabled="!hasImage || isCropMode"
                  :value="state.adjustments.contrast"
                  @input="previewAdjustment('contrast', getRangeValue($event))"
                  @change="commitAdjustment('contrast', getRangeValue($event))"
                />
              </label>
              <label class="block text-sm text-[color:var(--studio-ink-muted)]">
                <span class="mb-2 flex items-center justify-between">
                  <span>曝光</span>
                  <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ state.adjustments.exposure }}</span>
                </span>
                <input
                  class="input-range"
                  type="range"
                  min="-100"
                  max="100"
                  step="1"
                  :disabled="!hasImage || isCropMode"
                  :value="state.adjustments.exposure"
                  @input="previewAdjustment('exposure', getRangeValue($event))"
                  @change="commitAdjustment('exposure', getRangeValue($event))"
                />
              </label>
              <label class="block text-sm text-[color:var(--studio-ink-muted)]">
                <span class="mb-2 flex items-center justify-between">
                  <span>高光</span>
                  <span class="text-xs text-[color:var(--studio-ink-dim)]">{{ state.adjustments.highlights }}</span>
                </span>
                <input
                  class="input-range"
                  type="range"
                  min="-100"
                  max="100"
                  step="1"
                  :disabled="!hasImage || isCropMode"
                  :value="state.adjustments.highlights"
                  @input="previewAdjustment('highlights', getRangeValue($event))"
                  @change="commitAdjustment('highlights', getRangeValue($event))"
                />
              </label>
            </div>
          </InspectorSection>
        </aside>

        <section class="panel flex min-h-[560px] flex-col overflow-hidden md:min-h-[720px]">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--studio-border)] px-4 py-3">
            <div>
              <h2 class="panel-title">编辑工作台</h2>
              <p class="text-xs text-[color:var(--studio-ink-dim)]">
                {{ hasImage ? (isCropMode ? '裁剪模式' : '普通模式') : '等待上传图片' }}
              </p>
            </div>
            <div class="studio-readout flex w-full flex-wrap items-center gap-2 px-3 py-2 text-xs sm:w-auto">
              <button class="btn-soft px-2 py-1" type="button" :disabled="!canUndo || isCropMode" @click="undo">撤销</button>
              <button class="btn-soft px-2 py-1" type="button" :disabled="!canRedo || isCropMode" @click="redo">重做</button>
              <div class="studio-readout__text">
                <span class="studio-readout__label">缩放</span>
                <span class="studio-readout__value">{{ zoomText }}</span>
              </div>
              <button class="btn-soft px-2 py-1" type="button" :disabled="!hasImage || isCropMode" @click="zoomOut">缩小</button>
              <button class="btn-soft px-2 py-1" type="button" :disabled="!hasImage || isCropMode" @click="zoomIn">放大</button>
              <button class="btn-soft px-2 py-1" type="button" :disabled="!hasImage || isCropMode" @click="resetViewport">
                复位视图
              </button>
            </div>
          </div>
          <div class="relative flex-1 p-3">
            <div class="editor-stage absolute inset-3">
              <canvas ref="canvasRef" class="block h-full w-full select-none rounded-4" />
            </div>
            <div
              v-if="!hasImage"
              class="stage-empty absolute inset-3 flex items-center justify-center rounded-4 text-center text-sm"
            >
              <div class="max-w-[320px]">
                <div class="text-base font-semibold text-[color:var(--studio-ink)]">上传图片开始编辑</div>
                <div class="mt-2 text-xs leading-5 text-[color:var(--studio-ink-dim)]">使用上方按钮上传图片开始编辑。</div>
              </div>
            </div>
            <div
              v-else
              class="stage-hint pointer-events-none absolute bottom-6 left-6 max-w-[280px] rounded-3 px-4 py-3 text-sm"
            >
              <div class="stage-hint__title">{{ isCropMode ? '裁剪模式' : '普通模式' }}</div>
              <div class="mt-1 text-xs leading-5 text-[color:var(--studio-ink-dim)]">{{ stageHint }}</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
