import { createStore, emptyBoard, isConnector, placeUnpositioned, type Board } from '@dbm/core';
import { parse, serialize } from '@dbm/format';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Editor } from '../editor/editor';
import { loadBoardText, saveBoardText } from '../persist';
import { WELCOME } from '../welcome';
import { FileMenu, TopRight, ZoomBar } from './Chrome';
import { StyleBar } from './StyleBar';
import { TextEditor } from './TextEditor';
import { TextPane } from './TextPane';
import { Toolbar } from './Toolbar';
import { useBoard, useEditorState } from './useEditor';

type ThemePref = 'light' | 'dark' | 'system';
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const readPref = (): ThemePref => {
  try {
    const v = localStorage.getItem('dbm-theme');
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};

const loadBoard = (text: string | undefined): Board => {
  const r = parse(text ?? WELCOME);
  return placeUnpositioned(r.board.elements.length || text ? r.board : emptyBoard());
};

export function App() {
  const [themePref, setThemePref] = useState<ThemePref>(readPref);
  const editor = useMemo(() => new Editor(createStore(emptyBoard()), themePref === 'system' ? (systemDark() ? 'dark' : 'light') : themePref), []);
  const state = useEditorState(editor);
  const container = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [message, setMessage] = useState<string>();

  // canvas + input
  useEffect(() => editor.attach(container.current!, scene.current!, overlay.current!), [editor]);
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __dbm: Editor }).__dbm = editor;
  }, [editor]);

  // load once, then autosave as .board text
  useEffect(() => {
    let off: (() => void) | undefined;
    let t: number | undefined;
    loadBoardText()
      .catch(() => undefined)
      .then((text) => {
        editor.store.replace(loadBoard(text), { history: false });
        requestAnimationFrame(() => editor.zoomToFit());
        off = editor.store.subscribe((b) => {
          window.clearTimeout(t);
          t = window.setTimeout(() => saveBoardText(serialize(b)).catch(() => setMessage('Autosave failed')), 300);
        });
      });
    return () => off?.();
  }, [editor]);

  // theme
  useEffect(() => {
    const apply = () => editor.set({ theme: themePref === 'system' ? (systemDark() ? 'dark' : 'light') : themePref });
    apply();
    try {
      localStorage.setItem('dbm-theme', themePref);
    } catch {
      /* storage unavailable */
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [themePref, editor]);
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(undefined), 2500);
    return () => clearTimeout(t);
  }, [message]);

  return (
    <div className="app">
      <main className="stage">
        <div ref={container} className="canvas-host" tabIndex={0} aria-label="Whiteboard canvas" role="application">
          <canvas ref={scene} className="layer" />
          <canvas ref={overlay} className="layer" />
        </div>
        <TextEditor editor={editor} />
        <FileMenu editor={editor} onMessage={setMessage} />
        <Toolbar editor={editor} />
        <TopRight editor={editor} themePref={themePref} setThemePref={setThemePref} />
        <StyleBar editor={editor} />
        <ZoomBar editor={editor} />
        <SelectionAnnouncer editor={editor} />
        {message && <div className="toast" role="status">{message}</div>}
      </main>
      {state.paneOpen && <TextPane editor={editor} />}
    </div>
  );
}

/** Screen-reader announcement of the current selection. */
function SelectionAnnouncer({ editor }: { editor: Editor }) {
  const { selection } = useEditorState(editor);
  const board = useBoard(editor);
  let text = '';
  if (selection.length === 1) {
    const el = board.elements.find((e) => e.id === selection[0]);
    if (el) {
      const label = isConnector(el) ? el.label : 'label' in el ? el.label : 'text' in el ? el.text : 'name' in el ? el.name : undefined;
      text = `${el.type}${label ? ` “${label}”` : ''} selected`;
    }
  } else if (selection.length > 1) text = `${selection.length} elements selected`;
  return <div className="sr-only" aria-live="polite">{text}</div>;
}
