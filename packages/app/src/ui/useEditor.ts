import { useSyncExternalStore } from 'react';
import type { Board } from '@dbm/core';
import type { Editor, EditorState } from '../editor/editor';

export const useEditorState = (editor: Editor): EditorState =>
  useSyncExternalStore((cb) => editor.subscribe(cb), editor.getState);

export const useBoard = (editor: Editor): Board =>
  useSyncExternalStore((cb) => editor.store.subscribe(cb), () => editor.store.get());
