<script setup lang="ts">
import { useImageEditor } from '@image-canvas-editor/editor-vue';

const {
  PRESET_OPTIONS,
  canvasRef,
  state,
  hasImage,
  rotationText,
  canApplyCrop,
  canCancelCrop,
  imageMetaRows,
  getPresetButtonClass,
  onFileChange,
  rotateBy,
  toggleFlip,
  updateRotation,
  updateAdjustment,
  applyPreset,
  resetEdits,
  enterCropMode,
  resetCrop,
  applyCrop,
  cancelCrop,
  download,
  saveCurrentDraft,
  restoreCurrentDraft,
} = useImageEditor();

const getRangeValue = (event: Event): number => Number((event.target as HTMLInputElement).value);
</script>

<template>
  <div
    class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_35%),linear-gradient(180deg,#020617_0%,#0f172a_100%)] text-slate-100"
  >
    <div class="mx-auto max-w-[1600px] p-4 md:p-6 xl:p-8">
      <header class="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="text-sm tracking-[0.3em] text-cyan-300/80 uppercase">Canvas Image Editor</p>
          <h1 class="mt-2 text-3xl font-bold md:text-4xl">在线图片编辑器</h1>
          <p class="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            用最少的概念做最有用的事：Vue 只做 UI，Canvas + TypeScript 内核只做编辑。
          </p>
        </div>
        <div class="panel flex flex-wrap items-center gap-2 px-4 py-3">
          <label class="btn-primary cursor-pointer">
            <input class="hidden" type="file" accept="image/*" @change="onFileChange" />
            选择图片
          </label>
          <button class="btn-soft" type="button" :disabled="!hasImage" @click="saveCurrentDraft">保存草稿</button>
          <button class="btn-soft" type="button" @click="restoreCurrentDraft">恢复草稿</button>
          <button class="btn-primary" type="button" :disabled="!hasImage" @click="download">下载 PNG</button>
        </div>
      </header>

      <main class="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside class="space-y-4">
          <section class="panel p-4">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="panel-title">图片信息</h2>
              <button class="btn-soft px-2 py-1 text-xs" type="button" :disabled="!hasImage" @click="resetEdits">
                重置全部
              </button>
            </div>
            <dl class="grid grid-cols-[80px_1fr] gap-y-2 text-sm text-slate-300">
              <template v-for="item in imageMetaRows" :key="item.label">
                <dt>{{ item.label }}</dt>
                <dd>{{ item.value }}</dd>
              </template>
            </dl>
          </section>

          <section class="panel p-4">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="panel-title">旋转与翻转</h2>
              <span class="text-xs text-slate-400">{{ rotationText }}</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <button class="btn-soft" type="button" :disabled="!hasImage" @click="rotateBy(-90)">左转 90°</button>
              <button class="btn-soft" type="button" :disabled="!hasImage" @click="rotateBy(90)">右转 90°</button>
              <button class="btn-soft" type="button" :disabled="!hasImage" @click="toggleFlip('flipX')">水平翻转</button>
              <button class="btn-soft" type="button" :disabled="!hasImage" @click="toggleFlip('flipY')">垂直翻转</button>
            </div>
            <label class="mt-4 block text-sm text-slate-300">
              <span class="mb-2 flex items-center justify-between">
                <span>任意角度</span>
                <span class="text-xs text-slate-400">{{ rotationText }}</span>
              </span>
              <input
                class="input-range"
                type="range"
                min="-180"
                max="180"
                step="1"
                :disabled="!hasImage"
                :value="state.transform.rotation"
                @input="updateRotation(getRangeValue($event))"
              />
            </label>
          </section>

          <section class="panel p-4">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="panel-title">裁剪</h2>
              <span class="text-xs text-slate-400">拖拽框选，拖动内部移动，四角缩放</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <button class="btn-soft" type="button" :disabled="!hasImage" @click="enterCropMode">进入裁剪</button>
              <button class="btn-soft" type="button" :disabled="!hasImage" @click="resetCrop">清除裁剪</button>
              <button class="btn-primary" type="button" :disabled="!canApplyCrop" @click="applyCrop">应用裁剪</button>
              <button class="btn-soft" type="button" :disabled="!canCancelCrop" @click="cancelCrop">取消裁剪</button>
            </div>
            <p class="mt-3 text-xs leading-5 text-slate-400">
              裁剪坐标始终基于原图。这样后面再旋转、翻转，状态也不会乱。
            </p>
          </section>

          <section class="panel p-4">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="panel-title">滤镜预设</h2>
              <span class="text-xs text-slate-400">先预设，再微调</span>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="item in PRESET_OPTIONS"
                :key="item.value"
                type="button"
                :class="getPresetButtonClass(item.value)"
                @click="applyPreset(item.value)"
              >
                {{ item.label }}
              </button>
            </div>
          </section>

          <section class="panel p-4">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="panel-title">参数调节</h2>
              <span class="text-xs text-slate-400">-100 ~ 100</span>
            </div>
            <div class="space-y-4">
              <label class="block text-sm text-slate-300">
                <span class="mb-2 flex items-center justify-between">
                  <span>对比度</span>
                  <span class="text-xs text-slate-400">{{ state.adjustments.contrast }}</span>
                </span>
                <input
                  class="input-range"
                  type="range"
                  min="-100"
                  max="100"
                  step="1"
                  :disabled="!hasImage"
                  :value="state.adjustments.contrast"
                  @input="updateAdjustment('contrast', getRangeValue($event))"
                />
              </label>
              <label class="block text-sm text-slate-300">
                <span class="mb-2 flex items-center justify-between">
                  <span>曝光</span>
                  <span class="text-xs text-slate-400">{{ state.adjustments.exposure }}</span>
                </span>
                <input
                  class="input-range"
                  type="range"
                  min="-100"
                  max="100"
                  step="1"
                  :disabled="!hasImage"
                  :value="state.adjustments.exposure"
                  @input="updateAdjustment('exposure', getRangeValue($event))"
                />
              </label>
              <label class="block text-sm text-slate-300">
                <span class="mb-2 flex items-center justify-between">
                  <span>高光</span>
                  <span class="text-xs text-slate-400">{{ state.adjustments.highlights }}</span>
                </span>
                <input
                  class="input-range"
                  type="range"
                  min="-100"
                  max="100"
                  step="1"
                  :disabled="!hasImage"
                  :value="state.adjustments.highlights"
                  @input="updateAdjustment('highlights', getRangeValue($event))"
                />
              </label>
            </div>
          </section>
        </aside>

        <section class="panel relative min-h-[560px] overflow-hidden p-3 md:min-h-[720px]">
          <canvas ref="canvasRef" class="block h-full w-full select-none rounded-4" />
          <div
            class="pointer-events-none absolute bottom-6 left-6 max-w-[280px] rounded-3 bg-slate-950/72 px-4 py-3 text-sm text-slate-200 shadow-lg"
          >
            <div class="font-semibold">操作提示</div>
            <div class="mt-1 text-xs leading-5 text-slate-400">
              上传图片后即可直接编辑。裁剪模式下，画布交互由编辑器 class 自己接管。
            </div>
          </div>
        </section>
      </main>
    </div>
  </div>
</template>
