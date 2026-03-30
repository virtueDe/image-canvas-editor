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
  });

  it('deletes an empty text when editing finishes', () => {
    const editor = new ImageCanvasEditor();

    editor.startTextInsertion();
    editor.placeTextAt(0.5, 0.5);
    editor.finishTextEditing();

    expect(editor.getState().texts).toEqual([]);
  });
});
