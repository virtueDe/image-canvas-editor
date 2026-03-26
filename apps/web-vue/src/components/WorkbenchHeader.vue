<script setup lang="ts">
const props = defineProps<{
  hasImage: boolean;
  onFileChange: (event: Event) => void;
  saveCurrentDraft: () => void;
  restoreCurrentDraft: () => void;
  download: () => void;
}>();
</script>

<template>
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
        <input class="hidden" type="file" accept="image/*" @change="props.onFileChange" />
        选择图片
      </label>
      <button class="btn-soft" type="button" :disabled="!props.hasImage" @click="props.saveCurrentDraft">
        保存草稿
      </button>
      <button class="btn-soft" type="button" @click="props.restoreCurrentDraft">恢复草稿</button>
      <button class="btn-primary" type="button" :disabled="!props.hasImage" @click="props.download">
        下载 PNG
      </button>
    </div>
  </header>
</template>
