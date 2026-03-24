import type { EditorState } from './types';

type Listener = (state: EditorState) => void;
type Updater = Partial<EditorState> | ((state: EditorState) => EditorState);

export class EditorStore {
  private state: EditorState;
  private readonly listeners = new Set<Listener>();

  constructor(initialState: EditorState) {
    this.state = initialState;
  }

  getState(): EditorState {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);

    return () => {
      this.listeners.delete(listener);
    };
  }

  setState(updater: Updater): void {
    const nextState =
      typeof updater === 'function'
        ? updater(this.state)
        : {
            ...this.state,
            ...updater,
          };

    this.state = nextState;
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => {
      listener(this.state);
    });
  }
}
