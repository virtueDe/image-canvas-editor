import { describe, expect, it } from 'vitest';
import type { TextItem } from './types';
import {
  isPointInTextBlock,
  resolveDragHandleRect,
  resolveTextLayout,
  resolveTextScreenRect,
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
};

const measureText = (text: string) => ({
  width:
    {
      第一行: 100,
      第二行: 140,
      左对齐: 140,
      右对齐: 140,
      居中: 140,
      ' ': 20,
    }[text] ?? 80,
  actualBoundingBoxAscent: 30,
  actualBoundingBoxDescent: 10,
});

describe('text engine layout', () => {
  it('measures multiline content with deterministic body rect and baselines', () => {
    const layout = resolveTextLayout(item, 1200, 800, measureText);

    expect(layout.lines).toEqual([
      {
        text: '第一行',
        width: 100,
        baselineY: 380,
      },
      {
        text: '第二行',
        width: 140,
        baselineY: 430,
      },
    ]);
    expect(layout.width).toBe(140);
    expect(layout.height).toBe(100);
    expect(layout.bodyRect).toEqual({
      x: 530,
      y: 350,
      width: 140,
      height: 100,
    });
    expect(layout.lines[1]!.baselineY - layout.lines[0]!.baselineY).toBe(50);
  });

  it('maps screen rect x by align semantics', () => {
    const displayRect = { x: 100, y: 20, width: 500, height: 250 };
    const createAlignedItem = (align: TextItem['align']): TextItem => ({
      ...item,
      content: '左对齐\n第二行',
      xRatio: 0.25,
      yRatio: 0.5,
      align,
    });

    expect(resolveTextScreenRect(createAlignedItem('left'), 1000, 500, displayRect, measureText)).toEqual({
      x: 225,
      y: 120,
      width: 70,
      height: 50,
    });
    expect(resolveTextScreenRect(createAlignedItem('center'), 1000, 500, displayRect, measureText)).toEqual({
      x: 190,
      y: 120,
      width: 70,
      height: 50,
    });
    expect(resolveTextScreenRect(createAlignedItem('right'), 1000, 500, displayRect, measureText)).toEqual({
      x: 155,
      y: 120,
      width: 70,
      height: 50,
    });
  });

  it('places the drag handle hit rect at the top-right outside the body', () => {
    const handle = resolveDragHandleRect({
      x: 530,
      y: 350,
      width: 140,
      height: 100,
    });

    expect(handle).toEqual({
      x: 682,
      y: 314,
      width: 24,
      height: 24,
    });
  });

  it('treats only the body rect as editable hit area', () => {
    const bodyRect = resolveTextScreenRect(item, 1200, 800, { x: 0, y: 0, width: 1200, height: 800 }, measureText);

    expect(bodyRect).not.toBeNull();

    const handleRect = resolveDragHandleRect(bodyRect!);

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
});
