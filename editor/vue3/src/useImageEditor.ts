import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import {
  ImageCanvasEditor,
  PRESET_OPTIONS,
  createInitialEditorState,
  type EditorState,
  type FilterPreset,
} from '@image-canvas-editor/editor-core';

type AdjustmentKey = Parameters<ImageCanvasEditor['updateAdjustment']>[0];
type TextEditorBridge = Pick<
  ImageCanvasEditor,
  | 'startTextInsertion'
  | 'replaceActiveTextContent'
  | 'updateActiveTextSelection'
  | 'setActiveTextComposing'
  | 'removeTextOverlay'
  | 'updateTextOverlayFontSize'
  | 'updateTextOverlayColor'
  | 'previewActiveTextRotation'
  | 'updateActiveTextRotation'
  | 'commitActiveTextRotation'
>;
type BrushEditorBridge = Pick<
  ImageCanvasEditor,
  | 'selectBrushTool'
  | 'updateBrushType'
  | 'updateBrushColor'
  | 'updateBrushSize'
  | 'updateBrushHardness'
>;
type EditorTextItem = NonNullable<EditorState['texts']>[number];

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
  const getTextEditor = (): TextEditorBridge => getEditor();
  const getBrushEditor = (): BrushEditorBridge => getEditor();

  const renderState = computed(() => state.value);
  const hasImage = computed(() => Boolean(renderState.value.image));
  const texts = computed<NonNullable<EditorState['texts']>>(() => renderState.value.texts ?? []);
  const activeText = computed<EditorTextItem | null>(
    () => texts.value.find((item: EditorTextItem) => item.id === renderState.value.activeTextId) ?? null,
  );
  const hasActiveText = computed(() => Boolean(activeText.value));
  const activeTextRotation = computed(() => activeText.value?.rotation ?? 0);
  const isTextInserting = computed(() => renderState.value.textToolState.mode === 'inserting');
  const isTextEditing = computed(() => renderState.value.textToolState.mode === 'editing');
  const isBrushActive = computed(() => renderState.value.activeTool === 'brush');
  const hiddenTextareaValue = computed(() => activeText.value?.content ?? '');
  const rotationText = computed(() => `${Math.round(renderState.value.transform.rotation)}°`);
  const zoomText = computed(() => `${Math.round(renderState.value.viewport.zoom * 100)}%`);
  const fpsText = computed(() => {
    renderState.value;

    if (!hasImage.value) {
      return '--';
    }

    const fps = editorRef.value?.getRenderFps() ?? null;
    return fps === null ? '--' : `${Math.round(fps)} FPS`;
  });
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
  const activeTextFontSize = computed(() => activeText.value?.fontSize ?? 48);
  const brushSettings = computed(() => renderState.value.brush);
  const activeBrushType = computed(() => brushSettings.value?.type ?? 'brush');
  const activeBrushColor = computed(() => brushSettings.value?.color ?? '#E9C083');
  const activeBrushSize = computed(() => brushSettings.value?.size ?? 24);
  const activeBrushHardness = computed(() => Math.round((brushSettings.value?.hardness ?? 0.68) * 100));
  const textHint = computed(() => {
    if (!hasImage.value) {
      return '先上传图片，再添加一段文字。';
    }

    if (renderState.value.cropMode) {
      return '裁剪模式下暂不支持文字编辑。';
    }

    if (isTextInserting.value) {
      return '点击画布中的落点创建一段新文字。';
    }

    if (isTextEditing.value) {
      return '正在编辑文字；完成后单击选中，双击再次进入编辑。';
    }

    if (hasActiveText.value) {
      return '当前对象已选中；拖拽文字本体移动，双击文字进入编辑，拖动圆形手柄旋转角度。';
    }

    return '点击左侧文字按钮进入插入态，再在画布中落点创建文字。';
  });
  const brushHint = computed(() => {
    if (!hasImage.value) {
      return '先上传图片，再启用画笔。';
    }

    if (renderState.value.cropMode) {
      return '裁剪模式下暂不支持画笔。';
    }

    if (isBrushActive.value) {
      return '画笔模式：在图片区域拖拽即可绘制，滚轮仍可缩放，撤销会按整笔回退。';
    }

    return '点击左侧画笔按钮进入独立画笔图层模式。';
  });

  const imageMetaRows = computed(() => {
    const image = renderState.value.image;
    const status = !image
      ? '等待上传图片'
      : renderState.value.cropMode
        ? '正在裁剪'
        : isBrushActive.value
          ? '正在绘制画笔图层'
        : isTextEditing.value
          ? '正在编辑文字'
          : isTextInserting.value
            ? '等待放置文字'
            : hasActiveText.value
              ? '文字已选中'
              : '可编辑'
          ;

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
  const previewActiveTextRotation = (rotation: number): void => {
    getTextEditor().previewActiveTextRotation(rotation);
  };
  const updateActiveTextRotation = (rotation: number): void => {
    getTextEditor().updateActiveTextRotation(rotation);
  };
  const commitActiveTextRotation = (rotation: number): void => {
    getTextEditor().commitActiveTextRotation(rotation);
  };
  const startTextInsertion = (): void => {
    getTextEditor().startTextInsertion();
  };
  const selectBrushTool = (): void => {
    getBrushEditor().selectBrushTool();
  };
  const updateBrushType = (type: 'pencil' | 'brush' | 'pen' | 'eraser'): void => {
    getBrushEditor().updateBrushType(type);
  };
  const updateBrushColor = (color: string): void => {
    getBrushEditor().updateBrushColor(color);
  };
  const updateBrushSize = (size: number): void => {
    getBrushEditor().updateBrushSize(size);
  };
  const updateBrushHardness = (hardness: number): void => {
    getBrushEditor().updateBrushHardness(hardness);
  };
  const removeTextOverlay = (): void => {
    getTextEditor().removeTextOverlay();
  };
  const updateTextOverlayFontSize = (fontSize: number): void => {
    getTextEditor().updateTextOverlayFontSize(fontSize);
  };
  const updateTextOverlayColor = (color: string): void => {
    getTextEditor().updateTextOverlayColor(color);
  };
  const replaceActiveTextContent = (
    text: string,
    selectionStart = text.length,
    selectionEnd = selectionStart,
  ): void => {
    getTextEditor().replaceActiveTextContent(text, selectionStart, selectionEnd);
  };
  const updateActiveTextSelection = (selectionStart: number, selectionEnd: number): void => {
    getTextEditor().updateActiveTextSelection(selectionStart, selectionEnd);
  };
  const setActiveTextComposing = (composing: boolean): void => {
    getTextEditor().setActiveTextComposing(composing);
  };
  const readSelectionRange = (
    target: HTMLTextAreaElement,
  ): { selectionStart: number; selectionEnd: number } => ({
    selectionStart: target.selectionStart ?? target.value.length,
    selectionEnd: target.selectionEnd ?? target.selectionStart ?? target.value.length,
  });
  const onHiddenTextareaInput = (event: Event): void => {
    const target = event.target as HTMLTextAreaElement;
    const selection = readSelectionRange(target);

    replaceActiveTextContent(target.value, selection.selectionStart, selection.selectionEnd);
  };
  const onHiddenTextareaSelectionChange = (event: Event): void => {
    const target = event.target as HTMLTextAreaElement;
    const selection = readSelectionRange(target);

    updateActiveTextSelection(selection.selectionStart, selection.selectionEnd);
  };
  const onHiddenTextareaCompositionStart = (): void => {
    setActiveTextComposing(true);
  };
  const onHiddenTextareaCompositionEnd = (event: CompositionEvent): void => {
    setActiveTextComposing(false);
    onHiddenTextareaInput(event as unknown as Event);
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
    texts,
    activeText,
    hasActiveText,
    activeTextRotation,
    isTextInserting,
    isTextEditing,
    isBrushActive,
    hiddenTextareaValue,
    canEditText,
    textHint,
    brushHint,
    activeTextFontSize,
    activeBrushType,
    activeBrushColor,
    activeBrushSize,
    activeBrushHardness,
    rotationText,
    zoomText,
    fpsText,
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
    previewActiveTextRotation,
    updateActiveTextRotation,
    commitActiveTextRotation,
    startTextInsertion,
    selectBrushTool,
    updateBrushType,
    updateBrushColor,
    updateBrushSize,
    updateBrushHardness,
    removeTextOverlay,
    replaceActiveTextContent,
    onHiddenTextareaInput,
    onHiddenTextareaSelectionChange,
    onHiddenTextareaCompositionStart,
    onHiddenTextareaCompositionEnd,
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

export type UseImageEditorReturn = ReturnType<typeof useImageEditor>;
