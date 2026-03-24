import type { EditorState } from './types';
type Listener = (state: EditorState) => void;
type Updater = Partial<EditorState> | ((state: EditorState) => EditorState);
export declare class EditorStore {
    private state;
    private readonly listeners;
    constructor(initialState: EditorState);
    getState(): EditorState;
    subscribe(listener: Listener): () => void;
    setState(updater: Updater): void;
    private emit;
}
export {};
