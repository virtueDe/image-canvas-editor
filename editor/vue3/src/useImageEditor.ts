import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import {
  ImageCanvasEditor,
  PRESET_OPTIONS,
  createInitialEditorState,
  type EditorState,
  type FilterPreset,
} from '@image-canvas-editor/editor-core';

type AdjustmentKey = 'contrast' | 'exposure' | 'highlights';

export const useImageEditor = () => {
  const canvasRef = ref<HTMLCanvasElement | null>(null);
  const editorRef = shallowRef<ImageCanvasEditor | null>(null);
  const state = ref<EditorState>(createInitialEditorState());
  let unsubscribe: (() => void) | null = null;

  const getEditor = (): ImageCanvasEditor => {
    if (!editorRef.value) {
      throw new Error('编辑器尚未初始化');
    }

    return editorRef.value;
  };

  const renderState = computed(() => state.value);
  const hasImage = computed(() => Boolean(renderState.value.image));
  const rotationText = computed(() => `${Math.round(renderState.value.transform.rotation)}°`);
  const canApplyCrop = computed(
    () => Boolean(renderState.value.image && renderState.value.cropMode && (renderState.value.draftCropRect ?? renderState.value.cropRect)),
  );
  const canCancelCrop = computed(() => Boolean(renderState.value.image && renderState.value.cropMode));
  const currentCropSize = computed(() => {
    const image = renderState.value.image;

    if (!image) {
      return '-';
    }

    const rect = renderState.value.cropRect ?? {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    };

    return `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  });

  const imageMetaRows = computed(() => {
    const image = renderState.value.image;
    const status = !image ? '等待上传图片' : renderState.value.cropMode ? '正在裁剪' : '可编辑';

    return [
      { label: '文件名', value: image?.name ?? '未加载' },
      { label: '尺寸', value: image ? `${image.width} × ${image.height}` : '-' },
      { label: '裁剪', value: currentCropSize.value },
      { label: '状态', value: status },
    ];
  });

  const getPresetButtonClass = (preset: FilterPreset): string =>
    preset === renderState.value.activePreset
      ? 'preset-btn btn-primary px-3 py-2 text-xs'
      : 'preset-btn btn-soft px-3 py-2 text-xs';

  const notifyError = (fallbackMessage: string, error: unknown): void => {
    window.alert(error instanceof Error ? error.message : fallbackMessage);
  };

  const onFileChange = async (event: Event): Promise<void> => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) {
      return;
    }

    try {
      await getEditor().loadFile(file);
      target.value = '';
    } catch (error) {
      notifyError('图片加载失败', error);
    }
  };

  const updateAdjustment = (key: AdjustmentKey, value: number): void => {
    getEditor().updateAdjustment(key, value);
  };

  const applyPreset = (preset: FilterPreset): void => {
    getEditor().applyPreset(preset);
  };

  const resetEdits = (): void => {
    getEditor().resetEdits();
  };

  const enterCropMode = (): void => {
    getEditor().enterCropMode();
  };

  const resetCrop = (): void => {
    getEditor().resetCrop();
  };

  const applyCrop = (): void => {
    getEditor().applyCrop();
  };

  const cancelCrop = (): void => {
    getEditor().cancelCrop();
  };

  const rotateBy = (delta: number): void => {
    getEditor().rotateBy(delta);
  };

  const toggleFlip = (axis: 'flipX' | 'flipY'): void => {
    getEditor().toggleFlip(axis);
  };

  const updateRotation = (rotation: number): void => {
    getEditor().updateRotation(rotation);
  };

  const download = (): void => {
    const editor = getEditor();
    const dataUrl = editor.exportAsDataUrl('image/png');

    if (!dataUrl) {
      return;
    }

    const link = document.createElement('a');
    link.download = editor.getSuggestedFileName('.png');
    link.href = dataUrl;
    link.click();
  };

  const saveCurrentDraft = (): void => {
    if (!getEditor().saveDraft()) {
      return;
    }

    window.alert('草稿已保存到浏览器本地存储。');
  };

  const restoreCurrentDraft = async (): Promise<void> => {
    try {
      await getEditor().restoreDraft();
    } catch (error) {
      notifyError('草稿恢复失败', error);
      return;
    }

    window.alert('草稿恢复成功。');
  };

  onMounted(() => {
    if (!canvasRef.value) {
      throw new Error('应用初始化失败：Canvas 节点缺失');
    }

    const editor = new ImageCanvasEditor();
    unsubscribe = editor.subscribe((nextState) => {
      state.value = nextState;
    });
    editor.mount(canvasRef.value);
    editorRef.value = editor;
  });

  onBeforeUnmount(() => {
    unsubscribe?.();
    unsubscribe = null;
    editorRef.value?.destroy();
    editorRef.value = null;
  });

  return {
    PRESET_OPTIONS,
    canvasRef,
    editorRef,
    state: renderState,
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
  };
};
