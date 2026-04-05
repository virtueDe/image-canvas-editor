import { describe, expect, it } from 'vitest';
import {
  createDefaultTextOverlay,
  isPointInTextOverlay,
  resolveTextOverlayDrawConfig,
  resolveTextOverlayLayout,
  resolveTextOverlayPosition,
  resolveTextOverlayScreenRect,
  sanitizeTextOverlay,
} from './text-overlay';

describe('text overlay helpers', () => {
  it('sanitizeTextOverlay 会约束归一化坐标和字号范围', () => {
    const overlay = sanitizeTextOverlay({
      text: '测试',
      xRatio: -0.2,
      yRatio: 1.4,
      fontSize: 220,
      color: '#fff',
    });

    expect(overlay).toEqual({
      text: '测试',
      xRatio: 0,
      yRatio: 1,
      fontSize: 180,
      color: '#fff',
    });
  });

  it('resolveTextOverlayLayout 会生成以中心点为锚的布局', () => {
    const layout = resolveTextOverlayLayout(
      {
        ...createDefaultTextOverlay(),
        text: '标题',
        xRatio: 0.25,
        yRatio: 0.75,
        fontSize: 40,
      },
      800,
      600,
      () => ({
        width: 160,
        actualBoundingBoxAscent: 28,
        actualBoundingBoxDescent: 12,
      }),
    );

    expect(layout.anchorX).toBe(200);
    expect(layout.anchorY).toBe(450);
    expect(layout.x).toBe(120);
    expect(layout.y).toBe(430);
    expect(layout.width).toBe(160);
    expect(layout.height).toBe(40);
  });

  it('isPointInTextOverlay 与 resolveTextOverlayPosition 使用相同边界约束', () => {
    const layout = resolveTextOverlayLayout(createDefaultTextOverlay(), 1000, 500, () => ({
      width: 240,
      actualBoundingBoxAscent: 36,
      actualBoundingBoxDescent: 12,
    }));

    expect(isPointInTextOverlay(layout, layout.anchorX, layout.anchorY)).toBe(true);
    expect(isPointInTextOverlay(layout, layout.x - 24, layout.y - 24)).toBe(false);
    expect(resolveTextOverlayPosition(1600, -20, 800, 600)).toEqual({
      xRatio: 1,
      yRatio: 0,
    });
  });

  it('resolveTextOverlayDrawConfig 会返回与布局一致的绘制基线配置', () => {
    const drawConfig = resolveTextOverlayDrawConfig(
      {
        ...createDefaultTextOverlay(),
        text: '标题',
        xRatio: 0.25,
        yRatio: 0.75,
        fontSize: 40,
      },
      800,
      600,
      () => ({
        width: 160,
        actualBoundingBoxAscent: 28,
        actualBoundingBoxDescent: 12,
      }),
    );

    expect(drawConfig).toEqual({
      text: '标题',
      x: 200,
      y: 458,
      font: '40px "Source Han Sans SC", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
      textAlign: 'center',
      textBaseline: 'alphabetic',
    });
  });

  it('resolveTextOverlayScreenRect 会把图像内坐标映射到舞台坐标', () => {
    const screenRect = resolveTextOverlayScreenRect(
      {
        ...createDefaultTextOverlay(),
        text: '标题',
        xRatio: 0.5,
        yRatio: 0.5,
        fontSize: 40,
      },
      800,
      600,
      {
        x: 120,
        y: 80,
        width: 400,
        height: 300,
      },
      () => ({
        width: 160,
        actualBoundingBoxAscent: 28,
        actualBoundingBoxDescent: 12,
      }),
    );

    expect(screenRect).toEqual({
      x: 280,
      y: 220,
      width: 80,
      height: 20,
    });
  });
});
