import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageCanvasEditor } from './editor';

type PreviewMetrics = {
  canvasWidth: number;
  canvasHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  baseDisplayWidth: number;
  baseDisplayHeight: number;
  displayX: number;
  displayY: number;
  displayWidth: number;
  displayHeight: number;
};

describe('viewport interaction', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses continuous wheel zoom instead of fixed jumps', () => {
    const editor = new ImageCanvasEditor();
    const editorInternals = editor as unknown as {
      canvas: {
        getBoundingClientRect: () => DOMRect;
        style: {
          cursor: string;
        };
      };
      renderer: {
        render: () => void;
        getPreviewViewMetrics: () => PreviewMetrics;
      };
      store: {
        setState: (state: ReturnType<ImageCanvasEditor['getState']>) => void;
      };
      onCanvasWheel: (event: WheelEvent) => void;
    };
    const previewMetrics: PreviewMetrics = {
      canvasWidth: 1000,
      canvasHeight: 800,
      sourceWidth: 1200,
      sourceHeight: 900,
      baseDisplayWidth: 800,
      baseDisplayHeight: 600,
      displayX: 100,
      displayY: 100,
      displayWidth: 800,
      displayHeight: 600,
    };
    let prevented = false;

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
      style: {
        cursor: 'default',
      },
    };
    editorInternals.renderer = {
      render: () => undefined,
      getPreviewViewMetrics: () => previewMetrics,
    };

    editorInternals.onCanvasWheel({
      deltaY: -40,
      deltaMode: 0,
      clientX: 500,
      clientY: 400,
      preventDefault: () => {
        prevented = true;
      },
    } as WheelEvent);

    expect(prevented).toBe(true);
    expect(editor.getState().viewport.zoom).toBeGreaterThan(1);
    expect(editor.getState().viewport.zoom).toBeLessThan(1.2);
  });

  it('batches wheel updates into a single animation frame render', () => {
    const editor = new ImageCanvasEditor();
    const editorInternals = editor as unknown as {
      canvas: {
        getBoundingClientRect: () => DOMRect;
        style: {
          cursor: string;
        };
      };
      renderer: {
        render: () => void;
        getPreviewViewMetrics: () => PreviewMetrics;
      };
      store: {
        setState: (state: ReturnType<ImageCanvasEditor['getState']>) => void;
      };
      onCanvasWheel: (event: WheelEvent) => void;
    };
    const previewMetrics: PreviewMetrics = {
      canvasWidth: 1000,
      canvasHeight: 800,
      sourceWidth: 1200,
      sourceHeight: 900,
      baseDisplayWidth: 800,
      baseDisplayHeight: 600,
      displayX: 100,
      displayY: 100,
      displayWidth: 800,
      displayHeight: 600,
    };
    const frameCallbacks: Array<FrameRequestCallback> = [];
    const renderSpy = vi.fn();

    vi.stubGlobal('window', {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      },
      cancelAnimationFrame: () => undefined,
      devicePixelRatio: 1,
    });

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
      style: {
        cursor: 'default',
      },
    };
    editorInternals.renderer = {
      render: renderSpy,
      getPreviewViewMetrics: () => previewMetrics,
    };

    editorInternals.onCanvasWheel({
      deltaY: -40,
      deltaMode: 0,
      clientX: 500,
      clientY: 400,
      preventDefault: () => undefined,
    } as WheelEvent);
    editorInternals.onCanvasWheel({
      deltaY: -40,
      deltaMode: 0,
      clientX: 500,
      clientY: 400,
      preventDefault: () => undefined,
    } as WheelEvent);

    expect(frameCallbacks).toHaveLength(1);
    expect(renderSpy).not.toHaveBeenCalled();

    frameCallbacks[0]!(16);

    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(editor.getState().viewport.zoom).toBeGreaterThan(1.1);
  });

  it('adds panning resistance near the edge and clamps back on release', () => {
    const editor = new ImageCanvasEditor();
    const editorInternals = editor as unknown as {
      canvas: {
        hasPointerCapture: (pointerId: number) => boolean;
        releasePointerCapture: (pointerId: number) => void;
        style: {
          cursor: string;
        };
      };
      renderer: {
        getCropViewMetrics: () => null;
        getPreviewViewMetrics: () => PreviewMetrics;
        render: () => void;
      };
      store: {
        setState: (state: ReturnType<ImageCanvasEditor['getState']>) => void;
      };
      previewInteraction: {
        mode: 'panning';
        startClientX: number;
        startClientY: number;
        offsetX: number;
        offsetY: number;
      };
      onCanvasPointerMove: (event: PointerEvent) => void;
      stopCropInteraction: (event: PointerEvent) => void;
    };
    const previewMetrics: PreviewMetrics = {
      canvasWidth: 1000,
      canvasHeight: 800,
      sourceWidth: 1200,
      sourceHeight: 900,
      baseDisplayWidth: 800,
      baseDisplayHeight: 600,
      displayX: -300,
      displayY: -200,
      displayWidth: 1600,
      displayHeight: 1200,
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
      viewport: {
        zoom: 2,
        offsetX: 0,
        offsetY: 0,
      },
    });
    editorInternals.canvas = {
      hasPointerCapture: () => true,
      releasePointerCapture: () => undefined,
      style: {
        cursor: 'grab',
      },
    };
    editorInternals.renderer = {
      getCropViewMetrics: () => null,
      getPreviewViewMetrics: () => previewMetrics,
      render: () => undefined,
    };
    editorInternals.previewInteraction = {
      mode: 'panning',
      startClientX: 0,
      startClientY: 0,
      offsetX: 0,
      offsetY: 0,
    };

    editorInternals.onCanvasPointerMove({
      clientX: 500,
      clientY: 0,
    } as PointerEvent);

    expect(editor.getState().viewport.offsetX).toBeGreaterThan(300);
    expect(editor.getState().viewport.offsetX).toBeLessThan(500);

    editorInternals.stopCropInteraction({
      pointerId: 1,
    } as PointerEvent);

    expect(editor.getState().viewport.offsetX).toBe(300);
  });
});
