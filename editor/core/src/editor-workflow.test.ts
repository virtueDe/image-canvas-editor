import { describe, expect, it } from 'vitest';
import { ImageCanvasEditor } from './editor';

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

  it('deletes an empty text when editing finishes', () => {
    const editor = new ImageCanvasEditor();

    editor.startTextInsertion();
    editor.placeTextAt(0.5, 0.5);
    editor.finishTextEditing();

    expect(editor.getState().texts).toEqual([]);
  });
});
