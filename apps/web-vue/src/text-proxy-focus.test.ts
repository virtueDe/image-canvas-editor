import { describe, expect, it, vi } from 'vitest';
import { syncHiddenTextProxyFocus, type HiddenTextProxyInput } from './text-proxy-focus';

const createInput = (): HiddenTextProxyInput => ({
  focus: vi.fn(),
  blur: vi.fn(),
  setSelectionRange: vi.fn(),
});

describe('syncHiddenTextProxyFocus', () => {
  it('在编辑态会等待调度完成后再聚焦并同步选区', async () => {
    const input = createInput();
    let activeElement: HiddenTextProxyInput | null = null;
    let resumeScheduler!: () => void;
    const scheduler = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resumeScheduler = resolve;
        }),
    );

    const pending = syncHiddenTextProxyFocus(
      input,
      { mode: 'editing', selectionStart: 1, selectionEnd: 3 },
      scheduler,
      () => activeElement,
    );

    expect(scheduler).toHaveBeenCalledTimes(1);
    expect(input.focus).not.toHaveBeenCalled();
    expect(input.setSelectionRange).not.toHaveBeenCalled();

    resumeScheduler();
    await pending;

    expect(input.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(input.setSelectionRange).toHaveBeenCalledWith(1, 3);
  });

  it('输入框已聚焦时不会再走延后调度，但仍会同步选区', async () => {
    const input = createInput();
    const scheduler = vi.fn(() => Promise.resolve());

    await syncHiddenTextProxyFocus(
      input,
      { mode: 'editing', selectionStart: 2, selectionEnd: 2 },
      scheduler,
      () => input,
    );

    expect(scheduler).not.toHaveBeenCalled();
    expect(input.focus).not.toHaveBeenCalled();
    expect(input.setSelectionRange).toHaveBeenCalledWith(2, 2);
  });

  it('非编辑态会直接失焦，不会触发延后聚焦', async () => {
    const input = createInput();
    const scheduler = vi.fn(() => Promise.resolve());

    await syncHiddenTextProxyFocus(input, { mode: 'idle' }, scheduler);

    expect(input.blur).toHaveBeenCalledTimes(1);
    expect(scheduler).not.toHaveBeenCalled();
  });
});
