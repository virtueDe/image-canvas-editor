import type { EditorState, ImageResource, SerializableEditorState } from './types';
export interface DraftStore {
    save(state: EditorState): void;
    restore(): Promise<SerializableEditorState & {
        image: ImageResource | null;
    }>;
}
export declare const createLocalDraftStore: (storageKey?: string) => DraftStore;
