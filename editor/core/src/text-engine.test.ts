import { describe, expect, it } from 'vitest';
import { resolveTextOverlayLayout } from './text-overlay';
import type { TextItem } from './types';
import {
  isPointInRotatedTextBlock,
  isPointInTextBlock,
  normalizeTextRotation,
  resolveEmptyTextAnchorCompensation,
  resolveTextCaretRect,
  resolveTextCaretScreenRect,
  resolveDragHandleScreenRect,
  resolveTextRotateHandleScreenPoint,
  toLocalTextPoint,
  resolveTextLayout,
  resolveTextScreenRect,
  splitTextLines,
} from './text-engine';

const item: TextItem = {
  id: 'text-1',
  content: '第一行\n第二行',
  xRatio: 0.5,
  yRatio: 0.5,
  fontSize: 40,
  color: '#fff',
  align: 'center',
  lineHeight: 1.25,
  rotation: 0,
};

const measureText = (text: string) => ({
  width:
    {
      第一行: 100,
      第二行: 140,
      左对齐: 140,
      右对齐: 140,
      居中: 140,
      第: 30,
      第一: 60,
      ' ': 20,
    }[text] ?? 80,
  actualBoundingBoxAscent: 30,
  actualBoundingBoxDescent: 10,
});

describe('splitTextLines', () => {
  it('normalizes CRLF and preserves middle and trailing empty lines', () => {
    expect(splitTextLines('第一行\r\n\r\n第三行\r\n')).toEqual(['第一行', '', '第三行', '']);
  });

  it('normalizes lone CR separators', () => {
    expect(splitTextLines('第一行\r第二行')).toEqual(['第一行', '第二行']);
  });
});

describe('text engine layout', () => {
  it('normalizes text rotation into the stable signed range', () => {
    expect(normalizeTextRotation(0)).toBe(0);
    expect(normalizeTextRotation(360)).toBe(0);
    expect(normalizeTextRotation(450)).toBe(90);
    expect(normalizeTextRotation(-450)).toBe(-90);
    expect(normalizeTextRotation(540)).toBe(180);
  });

  it('maps screen points into rotated local text space', () => {
    const point = toLocalTextPoint(650, 400, 600, 400, 90);

    expect(point.x).toBeCloseTo(0, 4);
    expect(point.y).toBeCloseTo(-50, 4);
  });

  it('measures multiline content with deterministic body rect and baselines', () => {
    const layout = resolveTextLayout(item, 1200, 800, measureText);

    expect(layout.lines).toEqual([
      {
        text: '第一行',
        width: 100,
        baselineY: 385,
      },
      {
        text: '第二行',
        width: 140,
        baselineY: 435,
      },
    ]);
    expect(layout.width).toBe(140);
    expect(layout.height).toBe(90);
    expect(layout.bodyRect).toEqual({
      x: 530,
      y: 355,
      width: 140,
      height: 90,
    });
    expect(layout.lines[1]!.baselineY - layout.lines[0]!.baselineY).toBe(50);
  });

  it('keeps an empty editing line wide enough to click and edit', () => {
    const emptyItem: TextItem = {
      ...item,
      content: '',
    };
    const layout = resolveTextLayout(emptyItem, 1200, 800, measureText);

    expect(layout.width).toBe(80);
    expect(layout.height).toBe(40);
    expect(layout.bodyRect).toEqual({
      x: 560,
      y: 380,
      width: 80,
      height: 40,
    });
  });

  it('falls back to font-size metrics when blank line bounding boxes collapse to zero', () => {
    const emptyItem: TextItem = {
      ...item,
      content: '',
    };
    const zeroMetrics = () => ({
      width: 12,
      actualBoundingBoxAscent: 0,
      actualBoundingBoxDescent: 0,
    });
    const layout = resolveTextLayout(emptyItem, 1200, 800, zeroMetrics);

    expect(layout.width).toBe(80);
    expect(layout.height).toBe(40);
    expect(layout.bodyRect).toEqual({
      x: 560,
      y: 380,
      width: 80,
      height: 40,
    });
    expect(resolveTextCaretRect(emptyItem, 1200, 800, 0, zeroMetrics)).toEqual({
      x: 560,
      y: 380,
      width: 2,
      height: 40,
    });
  });

  it('keeps single-line legacy text visually aligned with text-overlay semantics', () => {
    const legacyItem: TextItem = {
      ...item,
      content: '第一行',
      lineHeight: 1.25,
    };
    const layout = resolveTextLayout(legacyItem, 1200, 800, measureText);
    const overlayLayout = resolveTextOverlayLayout(
      {
        text: '第一行',
        xRatio: 0.5,
        yRatio: 0.5,
        fontSize: 40,
        color: '#fff',
      },
      1200,
      800,
      measureText,
    );

    expect(layout.bodyRect).toEqual({
      x: overlayLayout.x,
      y: overlayLayout.y,
      width: overlayLayout.width,
      height: overlayLayout.height,
    });
    expect(layout.lines).toEqual([
      {
        text: '第一行',
        width: 100,
        baselineY: overlayLayout.baselineY,
      },
    ]);
  });

  it('maps screen rect x by align semantics', () => {
    const displayRect = { x: 100, y: 20, width: 1000, height: 500 };
    const createAlignedItem = (align: TextItem['align']): TextItem => ({
      ...item,
      content: '左对齐\n第二行',
      xRatio: 0.25,
      yRatio: 0.5,
      align,
    });

    expect(resolveTextScreenRect(createAlignedItem('left'), 1000, 500, displayRect, measureText)).toEqual({
      x: 350,
      y: 225,
      width: 140,
      height: 90,
    });
    expect(resolveTextScreenRect(createAlignedItem('center'), 1000, 500, displayRect, measureText)).toEqual({
      x: 280,
      y: 225,
      width: 140,
      height: 90,
    });
    expect(resolveTextScreenRect(createAlignedItem('right'), 1000, 500, displayRect, measureText)).toEqual({
      x: 210,
      y: 225,
      width: 140,
      height: 90,
    });
  });

  it('resolves caret rects for empty and non-empty text editing states', () => {
    const emptyItem: TextItem = {
      ...item,
      content: '',
    };

    expect(resolveTextCaretRect(emptyItem, 1200, 800, 0, measureText)).toEqual({
      x: 560,
      y: 380,
      width: 2,
      height: 40,
    });
    expect(resolveTextCaretRect({ ...item, content: '第一行' }, 1200, 800, 2, measureText)).toEqual({
      x: 610,
      y: 380,
      width: 2,
      height: 40,
    });
  });

  it('places the drag handle hit rect from screen body rect pixels', () => {
    const screenBodyRect = resolveTextScreenRect(
      item,
      1200,
      800,
      { x: 50, y: 25, width: 600, height: 400 },
      measureText,
    );

    expect(screenBodyRect).toEqual({
      x: 315,
      y: 202.5,
      width: 70,
      height: 45,
    });

    const handle = resolveDragHandleScreenRect(screenBodyRect!);

    expect(handle).toEqual({
      x: 397,
      y: 166.5,
      width: 24,
      height: 24,
    });
  });

  it('maps caret rect into screen space', () => {
    const screenCaret = resolveTextCaretScreenRect(
      { ...item, content: '' },
      1200,
      800,
      { x: 50, y: 25, width: 600, height: 400 },
      0,
      measureText,
    );

    expect(screenCaret).toEqual({
      x: 330,
      y: 215,
      width: 2,
      height: 20,
    });
  });

  it('computes anchor compensation so the first character stays on the empty caret x', () => {
    const createEmptyAlignedItem = (align: TextItem['align']): TextItem => ({
      ...item,
      content: '',
      xRatio: 0.25,
      align,
    });

    expect(resolveEmptyTextAnchorCompensation(createEmptyAlignedItem('left'), '第', 1200, 800, measureText)).toBe(0);
    expect(resolveEmptyTextAnchorCompensation(createEmptyAlignedItem('center'), '第', 1200, 800, measureText)).toBe(-25);
    expect(resolveEmptyTextAnchorCompensation(createEmptyAlignedItem('right'), '第', 1200, 800, measureText)).toBe(-50);
  });

  it('treats only the body rect as editable hit area', () => {
    const bodyRect = resolveTextScreenRect(item, 1200, 800, { x: 0, y: 0, width: 1200, height: 800 }, measureText);

    expect(bodyRect).not.toBeNull();

    const handleRect = resolveDragHandleScreenRect(bodyRect!);

    expect(isPointInTextBlock(bodyRect!, bodyRect!.x + 10, bodyRect!.y + 10)).toBe(true);
    expect(isPointInTextBlock(bodyRect!, bodyRect!.x - 1, bodyRect!.y + 10)).toBe(false);
    expect(isPointInTextBlock(bodyRect!, bodyRect!.x + bodyRect!.width + 1, bodyRect!.y + 10)).toBe(false);
    expect(
      isPointInTextBlock(
        bodyRect!,
        handleRect.x + handleRect.width / 2,
        handleRect.y + handleRect.height / 2,
      ),
    ).toBe(false);
  });

  it('hits rotated text body via inverse transform', () => {
    const rotatedItem: TextItem = {
      ...item,
      content: '第一行',
      rotation: 90,
    };

    expect(isPointInRotatedTextBlock(rotatedItem, 602, 398, 1200, 800, measureText)).toBe(true);
    expect(isPointInRotatedTextBlock(rotatedItem, 602, 340, 1200, 800, measureText)).toBe(false);
  });

  it('resolves rotate handle point above rotated body center', () => {
    const rotatedItem: TextItem = {
      ...item,
      content: '第一行',
      rotation: 90,
    };
    const displayRect = { x: 0, y: 0, width: 1200, height: 800 };
    const handle = resolveTextRotateHandleScreenPoint(
      rotatedItem,
      1200,
      800,
      displayRect,
      measureText,
    );

    expect(handle).toEqual({
      x: 644,
      y: 400,
    });
  });
});
