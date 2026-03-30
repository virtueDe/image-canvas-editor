export type HiddenTextProxyInput = Pick<
  HTMLTextAreaElement,
  'focus' | 'blur' | 'setSelectionRange'
>;

export type TextToolFocusState =
  | { mode: 'idle' | 'inserting' | 'dragging' }
  | { mode: 'editing'; selectionStart: number; selectionEnd: number };

export type FocusScheduler = () => Promise<void>;
export type ActiveElementReader = () => Element | HiddenTextProxyInput | null;

export const waitForTextProxyFocusFrame: FocusScheduler = () =>
  new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
      return;
    }

    setTimeout(resolve, 0);
  });

export const syncHiddenTextProxyFocus = async (
  input: HiddenTextProxyInput | null,
  textToolState: TextToolFocusState,
  schedule: FocusScheduler = waitForTextProxyFocusFrame,
  getActiveElement: ActiveElementReader = () => (typeof document !== 'undefined' ? document.activeElement : null),
): Promise<void> => {
  if (!input) {
    return;
  }

  if (textToolState.mode !== 'editing') {
    input.blur();
    return;
  }

  if (getActiveElement() !== input) {
    await schedule();
    input.focus({ preventScroll: true });
  }

  input.setSelectionRange(textToolState.selectionStart, textToolState.selectionEnd);
};
