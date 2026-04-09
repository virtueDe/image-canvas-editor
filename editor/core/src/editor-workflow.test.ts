import { describe, expect, it, vi } from 'vitest';
import { ImageCanvasEditor } from './editor';
import { resolveTextRotateHandleScreenPoint } from './text-engine';

const attachPreviewHarness = (
  editor: ImageCanvasEditor,
  metricOverrides: Partial<{
    canvasWidth: number;
    canvasHeight: number;
    baseDisplayWidth: number;
    baseDisplayHeight: number;
    displayX: number;
    displayY: number;
    displayWidth: number;
    displayHeight: number;
    sourceWidth: number;
    sourceHeight: number;
  }> = {},
) => {
  const editorInternals = editor as unknown as {
    canvas: {
      getBoundingClientRect: () => DOMRect;
      setPointerCapture: (pointerId: number) => void;
      releasePointerCapture: (pointerId: number) => void;
      hasPointerCapture: (pointerId: number) => boolean;
      style: {
        cursor: string;
      };
    };
    renderer: {
      getCropViewMetrics: () => null;
      render: () => void;
      getPreviewViewMetrics: () => {
        canvasWidth: number;
        canvasHeight: number;
        baseDisplayWidth: number;
        baseDisplayHeight: number;
        displayX: number;
        displayY: number;
        displayWidth: number;
        displayHeight: number;
        sourceWidth: number;
        sourceHeight: number;
      };
    };
    store: {
      setState: (updater: ReturnType<ImageCanvasEditor['getState']>) => void;
    };
    onCanvasPointerDown: (event: PointerEvent) => void;
    onCanvasPointerMove: (event: PointerEvent) => void;
    onCanvasDoubleClick: (event: MouseEvent) => void;
    stopCropInteraction: (event: PointerEvent) => void;
  };
  const previewMetrics = {
    canvasWidth: 1000,
    canvasHeight: 800,
    baseDisplayWidth: 1000,
    baseDisplayHeight: 800,
    displayX: 0,
    displayY: 0,
    displayWidth: 1000,
    displayHeight: 800,
    sourceWidth: 1000,
    sourceHeight: 800,
    ...metricOverrides,
  };

  editorInternals.store.setState({
    ...editor.getState(),
    image: {
      element: {} as HTMLImageElement,
      width: previewMetrics.sourceWidth,
      height: previewMetrics.sourceHeight,
      name: 'mock.png',
      dataUrl: 'data:image/png;base64,mock',
    },
  });
  editorInternals.canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0 } as DOMRect),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
    hasPointerCapture: () => false,
    style: {
      cursor: 'default',
    },
  };
  editorInternals.renderer = {
    getCropViewMetrics: () => null,
    render: () => undefined,
    getPreviewViewMetrics: () => previewMetrics,
  };

  return {
    editorInternals,
    previewMetrics,
  };
};

describe('multi-text editor workflow', () => {
  it('creates a text item after insertion placement', () => {
    const editor = new ImageCanvasEditor();

    editor.startTextInsertion();
    editor.placeTextAt(0.4, 0.5);

    expect(editor.getState().texts).toHaveLength(1);
    expect(editor.getState().textToolState.mode).toBe('editing');
  });

  it('focuses an existing text item for editing', () => {
    const editor = new ImageCanvasEditor();

    editor.startTextInsertion();
    editor.placeTextAt(0.25, 0.3);
    editor.insertText('标题');
    editor.finishTextEditing();

    const [text] = editor.getState().texts;

    editor.focusText(text.id);

    expect(editor.getState().activeTextId).toBe(text.id);
    expect(editor.getState().textToolState).toMatchObject({
      mode: 'editing',
      textId: text.id,
    });
  });

  it('keeps one undo entry for a single insertion editing session', () => {
    const editor = new ImageCanvasEditor();

    editor.startTextInsertion();
    editor.placeTextAt(0.4, 0.5);
    editor.insertText('标题');
    editor.insertLineBreak();
    editor.insertText('副标题');
    editor.finishTextEditing();
    editor.undo();

    expect(editor.getState().texts).toHaveLength(0);
  });

  it('replaces active text content from textarea payload and keeps caret selection', () => {
    const editor = new ImageCanvasEditor();

    editor.startTextInsertion();
    editor.placeTextAt(0.4, 0.5);
    editor.replaceActiveTextContent('标题\n副标题', 2, 2);

    expect(editor.getState().texts[0]).toMatchObject({
      content: '标题\n副标题',
    });
    expect(editor.getState().textToolState).toMatchObject({
      mode: 'editing',
      caretIndex: 2,
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it('keeps the first typed character on the original empty caret position', () => {
    const editor = new ImageCanvasEditor();
    const editorInternals = editor as unknown as {
      renderer: {
        render: () => void;
        getPreviewViewMetrics: () => {
          sourceWidth: number;
          sourceHeight: number;
        };
      };
    };

    editorInternals.renderer = {
      render: () => undefined,
      getPreviewViewMetrics: () => ({
        sourceWidth: 1200,
        sourceHeight: 800,
      }),
    };

    editor.startTextInsertion();
    editor.placeTextAt(0.4, 0.5);

    const before = editor.getState().texts[0]!;
    editor.replaceActiveTextContent('第', 1, 1);
    const after = editor.getState().texts[0]!;

    expect(before.align).toBe('center');
    expect(before.xRatio).toBe(0.4);
    expect(after.xRatio).toBeCloseTo(0.372, 6);
    expect(after.content).toBe('第');
  });

  it('keeps drag and edit as separate history sessions', () => {
    const editor = new ImageCanvasEditor();

    editor.startTextInsertion();
    editor.placeTextAt(0.3, 0.35);
    editor.insertText('初始文本');
    editor.finishTextEditing();

    const [text] = editor.getState().texts;

    editor.startTextDrag(text.id);
    editor.dragTextTo(0.7, 0.75);
    editor.finishTextDrag();
    editor.focusText(text.id);
    editor.insertText(' 已编辑');
    editor.finishTextEditing();

    editor.undo();
    expect(editor.getState().texts[0]).toMatchObject({
      id: text.id,
      content: '初始文本',
      xRatio: 0.7,
      yRatio: 0.75,
    });

    editor.undo();
    expect(editor.getState().texts[0]).toMatchObject({
      id: text.id,
      content: '初始文本',
      xRatio: 0.3,
      yRatio: 0.35,
    });
    expect(editor.getState().textToolState.mode).toBe('idle');
  });

  it('updates active text rotation', () => {
    const editor = new ImageCanvasEditor();

    editor.startTextInsertion();
    editor.placeTextAt(0.5, 0.5);
    editor.insertText('标题');
    editor.finishTextEditing();
    editor.updateActiveTextRotation(30);

    expect(editor.getState().texts[0]?.rotation).toBe(30);
  });

  it('keeps one undo session for a single text rotation update', () => {
    const editor = new ImageCanvasEditor();

    editor.startTextInsertion();
    editor.placeTextAt(0.5, 0.5);
    editor.insertText('标题');
    editor.finishTextEditing();
    editor.updateActiveTextRotation(30);

    editor.undo();
    expect(editor.getState().texts[0]).toMatchObject({
      content: '标题',
      rotation: 0,
    });

    editor.undo();
    expect(editor.getState().texts).toHaveLength(0);
  });

  it('keeps pointer-driven text rotation as a single history session', () => {
    const editor = new ImageCanvasEditor();
    const editorInternals = editor as unknown as {
      beginTextRotation: (
        textId: string,
        startClientX: number,
        startClientY: number,
        previewMetrics: {
          displayX: number;
          displayY: number;
          displayWidth: number;
          displayHeight: number;
          sourceWidth: number;
          sourceHeight: number;
        },
        canvasRect: DOMRect,
      ) => void;
      rotateTextTo: (clientX: number, clientY: number) => void;
      finishTextRotation: () => void;
    };

    editor.startTextInsertion();
    editor.placeTextAt(0.5, 0.5);
    editor.insertText('标题');
    editor.finishTextEditing();

    const [text] = editor.getState().texts;
    editorInternals.beginTextRotation(
      text.id,
      500,
      300,
      {
        displayX: 0,
        displayY: 0,
        displayWidth: 1000,
        displayHeight: 800,
        sourceWidth: 1000,
        sourceHeight: 800,
      },
      { left: 0, top: 0 } as DOMRect,
    );

    expect(editor.getState().textToolState).toMatchObject({
      mode: 'rotating',
      textId: text.id,
    });

    editorInternals.rotateTextTo(600, 400);
    expect(editor.getState().texts[0]?.rotation).toBeCloseTo(90, 6);

    editorInternals.finishTextRotation();
    expect(editor.getState().textToolState.mode).toBe('idle');

    editor.undo();
    expect(editor.getState().texts[0]).toMatchObject({
      id: text.id,
      content: '标题',
      rotation: 0,
    });
    expect(editor.getState().textToolState.mode).toBe('idle');

    editor.undo();
    expect(editor.getState().texts).toHaveLength(0);
  });

  it('starts text rotation from the rotate handle while editing', () => {
    const editor = new ImageCanvasEditor();
    editor.startTextInsertion();
    editor.placeTextAt(0.5, 0.5);
    editor.insertText('标题');

    const { editorInternals, previewMetrics } = attachPreviewHarness(editor);

    const activeText = editor.getState().texts[0]!;
    const rotateHandlePoint = resolveTextRotateHandleScreenPoint(
      activeText,
      previewMetrics.sourceWidth,
      previewMetrics.sourceHeight,
      {
        x: previewMetrics.displayX,
        y: previewMetrics.displayY,
        width: previewMetrics.displayWidth,
        height: previewMetrics.displayHeight,
      },
    );

    expect(rotateHandlePoint).not.toBeNull();

    editorInternals.onCanvasPointerDown({
      button: 0,
      pointerId: 1,
      clientX: rotateHandlePoint!.x,
      clientY: rotateHandlePoint!.y,
    } as PointerEvent);

    expect(editor.getState().textToolState).toMatchObject({
      mode: 'rotating',
      textId: activeText.id,
    });
  });

  it('selects text on single click without entering edit mode', () => {
    const editor = new ImageCanvasEditor();

    editor.startTextInsertion();
    editor.placeTextAt(0.5, 0.5);
    editor.insertText('标题');
    editor.finishTextEditing();

    const { editorInternals } = attachPreviewHarness(editor);
    editor.clearTextSelection();

    editorInternals.onCanvasPointerDown({
      button: 0,
      pointerId: 1,
      clientX: 500,
      clientY: 400,
    } as PointerEvent);

    expect(editor.getState().activeTextId).toBe(editor.getState().texts[0]?.id);
    expect(editor.getState().textToolState.mode).toBe('idle');
  });

  it('enters editing on text double click', () => {
    const editor = new ImageCanvasEditor();

    editor.startTextInsertion();
    editor.placeTextAt(0.5, 0.5);
    editor.insertText('标题');
    editor.finishTextEditing();

    const { editorInternals } = attachPreviewHarness(editor);

    editorInternals.onCanvasDoubleClick({
      clientX: 500,
      clientY: 400,
    } as MouseEvent);

    expect(editor.getState().textToolState).toMatchObject({
      mode: 'editing',
      textId: editor.getState().texts[0]?.id,
    });
  });

  it('clears selection when clicking blank canvas', () => {
    const editor = new ImageCanvasEditor();

    editor.startTextInsertion();
    editor.placeTextAt(0.5, 0.5);
    editor.insertText('标题');
    editor.finishTextEditing();
    editor.selectText(editor.getState().texts[0]!.id);

    const { editorInternals } = attachPreviewHarness(editor);

    editorInternals.onCanvasPointerDown({
      button: 0,
      pointerId: 1,
      clientX: 50,
      clientY: 50,
    } as PointerEvent);

    expect(editor.getState().activeTextId).toBeNull();
    expect(editor.getState().textToolState.mode).toBe('idle');
  });

  it('deletes an empty text when editing finishes', () => {
    const editor = new ImageCanvasEditor();

    editor.startTextInsertion();
    editor.placeTextAt(0.5, 0.5);
    editor.finishTextEditing();

    expect(editor.getState().texts).toEqual([]);
  });

  it('keeps in-progress text content when inspector updates text styles', () => {
    const editor = new ImageCanvasEditor();

    editor.startTextInsertion();
    editor.placeTextAt(0.5, 0.5);
    editor.replaceActiveTextContent('标题', 2, 2);

    editor.updateTextOverlayFontSize(72);
    editor.updateTextOverlayColor('#ff5500');
    editor.commitActiveTextRotation(45);

    expect(editor.getState().texts[0]).toMatchObject({
      content: '标题',
      fontSize: 72,
      color: '#ff5500',
      rotation: 45,
    });
    expect(editor.getState().textToolState).toMatchObject({
      mode: 'editing',
      selectionStart: 2,
      selectionEnd: 2,
    });

    editor.finishTextEditing();
    editor.undo();

    expect(editor.getState().texts).toEqual([]);
  });

  it('keeps in-progress text content when switching to image and brush inspector changes', () => {
    const editor = new ImageCanvasEditor();

    editor.startTextInsertion();
    editor.placeTextAt(0.5, 0.5);
    editor.replaceActiveTextContent('标题', 2, 2);

    editor.previewAdjustment('contrast', 24);
    expect(editor.getState().texts[0]).toMatchObject({
      content: '标题',
    });
    expect(editor.getState().textToolState.mode).toBe('idle');

    editor.commitAdjustment('contrast', 24);
    editor.commitRotation(90);
    editor.updateBrushSize(40);
    editor.applyPreset('bw');

    expect(editor.getState().texts[0]).toMatchObject({
      content: '标题',
    });
    expect(editor.getState().adjustments.contrast).toBe(24);
    expect(editor.getState().transform.rotation).toBe(90);
    expect(editor.getState().brush.size).toBe(40);
    expect(editor.getState().activePreset).toBe('bw');

    editor.undo();
    expect(editor.getState().activePreset).toBe('original');
    expect(editor.getState().texts[0]).toMatchObject({
      content: '标题',
    });

    editor.undo();
    expect(editor.getState().brush.size).toBe(24);
    expect(editor.getState().texts[0]).toMatchObject({
      content: '标题',
    });

    editor.undo();
    expect(editor.getState().transform.rotation).toBe(0);
    expect(editor.getState().texts[0]).toMatchObject({
      content: '标题',
    });

    editor.undo();
    expect(editor.getState().adjustments.contrast).toBe(0);
    expect(editor.getState().texts[0]).toMatchObject({
      content: '标题',
    });

    editor.undo();
    expect(editor.getState().texts).toEqual([]);
  });

  it('uses the current timestamp as the exported image file name', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 9, 15, 4, 5));

    try {
      const editor = new ImageCanvasEditor();

      expect(editor.getSuggestedFileName('.png')).toBe('20260409150405.png');
    } finally {
      vi.useRealTimers();
    }
  });

  it('creates a brush stroke as a single undoable history session', () => {
    const editor = new ImageCanvasEditor();
    const { editorInternals } = attachPreviewHarness(editor);

    editor.selectBrushTool();

    editorInternals.onCanvasPointerDown({
      button: 0,
      pointerId: 1,
      clientX: 300,
      clientY: 320,
    } as PointerEvent);
    editorInternals.onCanvasPointerMove({
      button: 0,
      pointerId: 1,
      clientX: 360,
      clientY: 360,
    } as PointerEvent);
    editorInternals.onCanvasPointerMove({
      button: 0,
      pointerId: 1,
      clientX: 420,
      clientY: 380,
    } as PointerEvent);
    editorInternals.stopCropInteraction({
      pointerId: 1,
    } as PointerEvent);

    expect(editor.getState().brushStrokes).toHaveLength(1);
    expect(editor.getState().brushStrokes?.[0]).toMatchObject({
      type: 'brush',
    });
    expect((editor.getState().brushStrokes?.[0]?.points.length ?? 0) >= 2).toBe(true);
    expect(editor.getState().brushToolState).toEqual({
      mode: 'idle',
    });

    editor.undo();
    expect(editor.getState().brushStrokes).toEqual([]);
  });

  it('stores eraser strokes with the selected brush tool', () => {
    const editor = new ImageCanvasEditor();
    const { editorInternals } = attachPreviewHarness(editor);

    editor.selectBrushTool();
    editor.updateBrushType('eraser');

    editorInternals.onCanvasPointerDown({
      button: 0,
      pointerId: 1,
      clientX: 500,
      clientY: 400,
    } as PointerEvent);
    editorInternals.stopCropInteraction({
      pointerId: 1,
    } as PointerEvent);

    expect(editor.getState().brushStrokes?.[0]).toMatchObject({
      type: 'eraser',
    });
  });

  it('maps brush points correctly after rotation and flip are combined', () => {
    const editor = new ImageCanvasEditor();
    const { editorInternals } = attachPreviewHarness(editor, {
      canvasWidth: 800,
      canvasHeight: 1000,
      baseDisplayWidth: 800,
      baseDisplayHeight: 1000,
      displayWidth: 800,
      displayHeight: 1000,
      sourceWidth: 800,
      sourceHeight: 1000,
    });
    const brushInternals = editorInternals as typeof editorInternals & {
      resolveBrushPointFromPreview: (
        point: { canvasX: number; canvasY: number },
        previewMetrics: {
          canvasWidth: number;
          canvasHeight: number;
          baseDisplayWidth: number;
          baseDisplayHeight: number;
          displayX: number;
          displayY: number;
          displayWidth: number;
          displayHeight: number;
          sourceWidth: number;
          sourceHeight: number;
        },
      ) => { xRatio: number; yRatio: number } | null;
    };

    editorInternals.store.setState({
      ...editor.getState(),
      image: {
        element: {} as HTMLImageElement,
        width: 1000,
        height: 800,
        name: 'mock.png',
        dataUrl: 'data:image/png;base64,mock',
      },
      transform: {
        rotation: 90,
        flipX: true,
        flipY: false,
      },
    });

    const point = brushInternals.resolveBrushPointFromPreview(
      { canvasX: 200, canvasY: 250 },
      {
        canvasWidth: 800,
        canvasHeight: 1000,
        baseDisplayWidth: 800,
        baseDisplayHeight: 1000,
        displayX: 0,
        displayY: 0,
        displayWidth: 800,
        displayHeight: 1000,
        sourceWidth: 800,
        sourceHeight: 1000,
      },
    );

    expect(point?.xRatio).toBeCloseTo(0.25, 6);
    expect(point?.yRatio).toBeCloseTo(0.25, 6);
  });
});
