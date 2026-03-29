<script setup lang="ts">
import { computed } from 'vue';
import WorkbenchIcon from './WorkbenchIcon.vue';

const props = defineProps<{
  hasImage: boolean;
  editingLocked: boolean;
  theme: 'light' | 'dark';
}>();

const emit = defineEmits<{
  (event: 'fileChange', payload: Event): void;
  (event: 'saveDraft'): void;
  (event: 'restoreDraft'): void;
  (event: 'download'): void;
  (event: 'toggleTheme'): void;
}>();

const handleFileChange = (event: Event) => emit('fileChange', event);
const saveDraft = () => emit('saveDraft');
const restoreDraft = () => emit('restoreDraft');
const downloadImage = () => emit('download');
const toggleTheme = () => emit('toggleTheme');

const isDarkTheme = computed(() => props.theme === 'dark');
const currentThemeIcon = computed(() => (isDarkTheme.value ? 'theme-dark' : 'theme-light'));
const currentThemeLabel = computed(() => (isDarkTheme.value ? '主题：深色' : '主题：浅色'));
const themeAriaLabel = computed(() =>
  isDarkTheme.value ? '当前为深色模式，点击切换为浅色模式' : '当前为浅色模式，点击切换为深色模式',
);
</script>

<template>
  <header class="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <p class="studio-header-eyebrow text-sm tracking-[0.3em] uppercase">Canvas Image Editor</p>
      <h1 class="mt-2 text-3xl font-bold md:text-4xl">在线图片编辑器</h1>
      <p class="studio-header-copy mt-2 max-w-3xl text-sm leading-6">
        用最少的概念做最有用的事：Vue 只做 UI，Canvas + TypeScript 内核只做编辑。
      </p>
    </div>
    <div class="workbench-frame flex flex-wrap items-center gap-2 rounded-4 px-4 py-3">
      <button
        class="theme-toggle-btn"
        type="button"
        :aria-label="themeAriaLabel"
        :aria-pressed="isDarkTheme"
        @click="toggleTheme"
      >
        <WorkbenchIcon :name="currentThemeIcon" :size="16" />
        <span>{{ currentThemeLabel }}</span>
      </button>
      <label
        class="header-primary-btn cursor-pointer"
        :class="{ 'pointer-events-none opacity-60': props.editingLocked }"
      >
        <input class="hidden" type="file" accept="image/*" :disabled="props.editingLocked" @change="handleFileChange" />
        <WorkbenchIcon name="upload" :size="16" />
        <span>上传图片</span>
      </label>
      <button
        class="header-action-btn"
        type="button"
        :disabled="!props.hasImage || props.editingLocked"
        @click="saveDraft"
      >
        <WorkbenchIcon name="draft-save" :size="16" />
        <span>保存草稿</span>
      </button>
      <button
        class="header-action-btn"
        type="button"
        :disabled="props.editingLocked"
        @click="restoreDraft"
      >
        <WorkbenchIcon name="draft-restore" :size="16" />
        <span>恢复草稿</span>
      </button>
      <button
        class="header-primary-btn"
        type="button"
        :disabled="!props.hasImage || props.editingLocked"
        @click="downloadImage"
      >
        <WorkbenchIcon name="download" :size="16" />
        <span>下载 PNG</span>
      </button>
    </div>
  </header>
</template>
