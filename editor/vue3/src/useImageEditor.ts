import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import {
  ImageCanvasEditor,
  PRESET_OPTIONS,
  createInitialEditorState,
  type EditorState,
  type FilterPreset,
} from '@image-canvas-editor/editor-core';

type AdjustmentKey = 'contrast' | 'exposure' | 'highlights';
type TextEditorBridge = ImageCanvasEditor & {
  ensureTextOverlay: () => void;
  removeTextOverlay: () => void;
  updateTextOverlayText: (text: string) => void;
  updateTextOverlayFontSize: (fontSize: number) => void;
  updateTextOverlayColor: (color: string) => void;
};

const TEXT_PRESET_COLORS = [
  { label: '云白', value: '#F5EFE7' },
  { label: '暖金', value: '#E9C083' },
  { label: '天青', value: '#38BDF8' },
  { label: '莓红', value: '#FB7185' },
  { label: '薄荷', value: '#86EFAC' },
  { label: '墨黑', value: '#1C1917' },
] as const;

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
  const getTextEditor = (): TextEditorBridge => getEditor() as TextEditorBridge;

  const renderState = computed(() => state.value);
  const hasImage = computed(() => Boolean(renderState.value.image));
  const textOverlay = computed<EditorState['textOverlay']>(() => renderState.value.textOverlay);
  const hasTextOverlay = computed(() => Boolean(textOverlay.value));
  const rotationText = computed(() => `${Math.round(renderState.value.transform.rotation)}°`);
  const zoomText = computed(() => `${Math.round(renderState.value.viewport.zoom * 100)}%`);
  const canApplyCrop = computed(
    () => Boolean(renderState.value.image && renderState.value.cropMode && (renderState.value.draftCropRect ?? renderState.value.cropRect)),
  );
  const canCancelCrop = computed(() => Boolean(renderState.value.image && renderState.value.cropMode));
  const canEditText = computed(() => Boolean(renderState.value.image && !renderState.value.cropMode));
  const canUndo = computed(() => {
    const editor = editorRef.value;
    renderState.value;
    return editor ? editor.canUndo() : false;
  });
  const canRedo = computed(() => {
    const editor = editorRef.value;
    renderState.value;
    return editor ? editor.canRedo() : false;
  });
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
  const textOverlayLength = computed(() => textOverlay.value?.text.length ?? 0);
  const textOverlayFontSize = computed(() => textOverlay.value?.fontSize ?? 48);
  const textOverlayHint = computed(() => {
    if (!hasImage.value) {
      return '先上传图片，再添加一段文字。';
    }

    if (renderState.value.cropMode) {
      return '裁剪模式下暂不支持文字编辑。';
    }

    return hasTextOverlay.value ? '已启用文字，可在画布中直接拖动定位。' : '先新增一段文字，再调整内容、字号和颜色。';
  });

  const imageMetaRows = computed(() => {
    const image = renderState.value.image;
    const status = !image
      ? '等待上传图片'
      : renderState.value.cropMode
        ? '正在裁剪'
        : hasTextOverlay.value
          ? '文字已启用'
          : '可编辑';

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

  const previewAdjustment = (key: AdjustmentKey, value: number): void => {
    getEditor().previewAdjustment(key, value);
  };

  const commitAdjustment = (key: AdjustmentKey, value: number): void => {
    getEditor().commitAdjustment(key, value);
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

  const previewRotation = (rotation: number): void => {
    getEditor().previewRotation(rotation);
  };

  const commitRotation = (rotation: number): void => {
    getEditor().commitRotation(rotation);
  };
  const ensureTextOverlay = (): void => {
    getTextEditor().ensureTextOverlay();
  };
  const removeTextOverlay = (): void => {
    getTextEditor().removeTextOverlay();
  };
  const updateTextOverlayText = (text: string): void => {
    getTextEditor().updateTextOverlayText(text);
  };
  const updateTextOverlayFontSize = (fontSize: number): void => {
    getTextEditor().updateTextOverlayFontSize(fontSize);
  };
  const updateTextOverlayColor = (color: string): void => {
    getTextEditor().updateTextOverlayColor(color);
  };

  const undo = (): void => {
    getEditor().undo();
  };

  const redo = (): void => {
    getEditor().redo();
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

  const zoomIn = (): void => {
    getEditor().zoomIn();
  };

  const zoomOut = (): void => {
    getEditor().zoomOut();
  };

  const resetViewport = (): void => {
    getEditor().resetViewport();
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
    unsubscribe = editor.subscribe((nextState: EditorState) => {
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
    TEXT_PRESET_COLORS,
    canvasRef,
    editorRef,
    state: renderState,
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
    updateRotation,
    previewRotation,
    commitRotation,
    ensureTextOverlay,
    removeTextOverlay,
    updateTextOverlayText,
    updateTextOverlayFontSize,
    updateTextOverlayColor,
    updateAdjustment,
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
  };
};
