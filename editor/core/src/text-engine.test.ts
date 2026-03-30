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

describe('text engine layout', () => {
  it('measures multiline content and exposes line boxes', () => {
    const layout = resolveTextLayout(item, 1200, 800, () => ({
      width: 80,
      actualBoundingBoxAscent: 30,
      actualBoundingBoxDescent: 10,
    }));

    expect(layout.lines).toHaveLength(2);
    expect(layout.height).toBeGreaterThan(70);
  });

  it('exposes a drag handle rect outside the text body', () => {
    const rect = resolveTextScreenRect(
      item,
      1200,
      800,
      { x: 0, y: 0, width: 1200, height: 800 },
      () => ({
        width: 80,
        actualBoundingBoxAscent: 30,
        actualBoundingBoxDescent: 10,
      }),
    );

    expect(rect).not.toBeNull();

    const handle = resolveDragHandleRect(rect!);
    expect(handle.x).toBeGreaterThan(rect!.x + rect!.width - 1);
  });

  it('treats the body rect as editable hit area', () => {
    const rect = resolveTextScreenRect(
      item,
      1200,
      800,
      { x: 0, y: 0, width: 1200, height: 800 },
      () => ({
        width: 80,
        actualBoundingBoxAscent: 30,
        actualBoundingBoxDescent: 10,
      }),
    );

    expect(rect).not.toBeNull();
    expect(isPointInTextBlock(rect!, rect!.x + 10, rect!.y + 10)).toBe(true);
  });
});
