<script setup lang="ts">
import { computed, useTemplateRef } from 'vue';
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

const fileInput = useTemplateRef<HTMLInputElement>('fileInput');

const handleFileChange = (event: Event) => emit('fileChange', event);
const openFilePicker = () => {
  if (props.editingLocked) {
    return;
  }

  fileInput.value?.click();
};
const saveDraft = () => emit('saveDraft');
const restoreDraft = () => emit('restoreDraft');
const downloadImage = () => emit('download');
const toggleTheme = () => emit('toggleTheme');

const isDarkTheme = computed(() => props.theme === 'dark');
const currentThemeIcon = computed(() => (isDarkTheme.value ? 'theme-dark' : 'theme-light'));
const currentThemeLabel = computed(() => (isDarkTheme.value ? '深色' : '浅色'));
const themeAriaLabel = computed(() =>
  isDarkTheme.value ? '当前为深色模式，点击切换为浅色模式' : '当前为浅色模式，点击切换为深色模式',
);
</script>

<template>
  <header class="studio-topbar">
    <p class="studio-topbar__eyebrow">Canvas Workspace</p>

    <div class="studio-topbar__actions">
      <button
        class="header-icon-btn header-icon-btn--primary"
        type="button"
        :disabled="props.editingLocked"
        title="上传图片"
        aria-label="上传图片"
        @click="openFilePicker"
      >
        <WorkbenchIcon name="upload" :size="16" />
      </button>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        tabindex="-1"
        aria-hidden="true"
        style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; border: 0; clip: rect(0, 0, 0, 0); clip-path: inset(50%); white-space: nowrap;"
        :disabled="props.editingLocked"
        @change="handleFileChange"
      />
      <button
        class="header-icon-btn"
        type="button"
        :disabled="!props.hasImage || props.editingLocked"
        title="保存草稿"
        aria-label="保存草稿"
        @click="saveDraft"
      >
        <WorkbenchIcon name="draft-save" :size="16" />
      </button>
      <button
        class="header-icon-btn"
        type="button"
        :disabled="props.editingLocked"
        title="恢复草稿"
        aria-label="恢复草稿"
        @click="restoreDraft"
      >
        <WorkbenchIcon name="draft-restore" :size="16" />
      </button>
      <button
        class="header-icon-btn header-icon-btn--primary"
        type="button"
        :disabled="!props.hasImage || props.editingLocked"
        title="导出 PNG"
        aria-label="导出 PNG"
        @click="downloadImage"
      >
        <WorkbenchIcon name="download" :size="16" />
      </button>
      <button
        class="header-icon-btn"
        type="button"
        :title="`切换主题：${currentThemeLabel}`"
        :aria-label="themeAriaLabel"
        :aria-pressed="isDarkTheme"
        @click="toggleTheme"
      >
        <WorkbenchIcon :name="currentThemeIcon" :size="16" />
      </button>
    </div>
  </header>
</template>
