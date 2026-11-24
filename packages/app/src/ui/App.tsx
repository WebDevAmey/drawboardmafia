import { createStore, emptyBoard, isConnector, placeUnpositioned, type Board } from '@dbm/core';
import { parse, serialize } from '@dbm/format';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAssetLoaded } from '../assets';
import { newRoom, parseHash, shareUrl } from '../collab/crypto';
import { Session } from '../collab/session';
import { Editor } from '../editor/editor';
import { loadBoardText, saveBoardText } from '../persist';
import { WELCOME } from '../welcome';
import { Chat } from './Chat';
import { FileMenu, TopRight, ZoomBar } from './Chrome';
import { Library } from './Library';
import { SharePopover } from './Share';
import { StyleBar } from './StyleBar';
import { TextEditor } from './TextEditor';
import { TextPane } from './TextPane';
import { Toolbar } from './Toolbar';
import { useBoard, useEditorState } from './useEditor';

type ThemePref = 'light' | 'dark' | 'system';
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
};
const readPref = (): ThemePref => {
  const v = store.get('dbm-theme-v2');
  return v === 'dark' || v === 'system' ? v : 'light'; // plain white canvas by default
};
const ANIMALS = ['Otter', 'Heron', 'Lynx', 'Panda', 'Falcon', 'Koala', 'Badger', 'Gecko', 'Puffin', 'Orca'];
const defaultName = () => store.get('dbm-name') ?? `Guest ${ANIMALS[Math.floor(Math.random() * ANIMALS.length)]}`;

const loadBoard = (text: string | undefined, fallback = WELCOME): Board => {
  const r = parse(text ?? fallback);
  return placeUnpositioned(r.board.elements.length || text ? r.board : emptyBoard());
};

export function App() {
  const [themePref, setThemePref] = useState<ThemePref>(readPref);
  const editor = useMemo(() => new Editor(createStore(emptyBoard()), themePref === 'system' ? (systemDark() ? 'dark' : 'light') : themePref), []);
  const state = useEditorState(editor);
  const container = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string>();
  const [session, setSession] = useState<Session>();
  const [shareOpen, setShareOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [name, setNameState] = useState(defaultName);
  /** IndexedDB key the current board autosaves to (`current`, or `room:<id>` while joined). */
  const storageKey = useRef('current');
  const ownsBoard = useRef(true);

  // canvas + input
  useEffect(() => editor.attach(container.current!, scene.current!, overlay.current!), [editor]);
  useEffect(() => {
    editor.onMessage = setMessage;
    editor.onPickImage = () => imageInput.current?.click();
    onAssetLoaded(() => editor.requestDraw());
    if (import.meta.env.DEV) (window as unknown as { __dbm: Editor }).__dbm = editor;
  }, [editor]);
  useEffect(() => {
    editor.onPresence = () => session?.sendPresence();
  }, [editor, session]);

  const join = useCallback(
    (room: string, key: string, creator: boolean) => {
      storageKey.current = `room:${room}`;
      ownsBoard.current = creator;
      const s = new Session(editor, room, key, name, creator);
      setSession(s);
      void s.start();
      return s;
    },
    [editor, name],
  );

  // load once: a live link joins the room, otherwise the personal board
  useEffect(() => {
    let off: (() => void) | undefined;
    let t: number | undefined;
    let joined: Session | undefined;
    let cancelled = false;
    const live = parseHash(location.hash);
    const start = async () => {
      if (live) {
        const cached = await loadBoardText(`room:${live.room}`).catch(() => undefined);
        if (cancelled) return;
        editor.store.replace(loadBoard(cached, 'board 1\n'), { history: false });
        joined = join(live.room, live.key, false);
      } else {
        const text = await loadBoardText().catch(() => undefined);
        if (cancelled) return;
        editor.store.replace(loadBoard(text), { history: false });
      }
      requestAnimationFrame(() => editor.zoomToFit());
      off = editor.store.subscribe((b) => {
        window.clearTimeout(t);
        const key = storageKey.current;
        t = window.setTimeout(() => saveBoardText(serialize(b), key).catch(() => setMessage('Autosave failed')), 300);
      });
    };
    void start();
    const onHash = () => parseHash(location.hash)?.room !== storageKey.current.slice(5) && location.reload();
    window.addEventListener('hashchange', onHash);
    return () => {
      cancelled = true;
      joined?.stop();
      off?.();
      window.removeEventListener('hashchange', onHash);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const startSession = async () => {
    const { room, key } = newRoom();
    history.replaceState(null, '', `#live=${room}.${key}`);
    join(room, key, true);
    try {
      await navigator.clipboard.writeText(shareUrl(room, key));
      setMessage('Live — link copied to clipboard');
    } catch {
      setMessage('Live — copy the link to invite people');
    }
  };

  const stopSession = async () => {
    session?.stop();
    setSession(undefined);
    setShareOpen(false);
    history.replaceState(null, '', location.pathname + location.search);
    if (ownsBoard.current) {
      // keep working on this board as your own
      storageKey.current = 'current';
      await saveBoardText(serialize(editor.board));
    } else {
      storageKey.current = 'current';
      editor.store.replace(loadBoard(await loadBoardText().catch(() => undefined)), { history: false });
    }
  };

  const setName = (n: string) => {
    setNameState(n);
    store.set('dbm-name', n);
    session?.rename(n.trim() || 'Guest');
  };

  // theme
  useEffect(() => {
    const apply = () => editor.set({ theme: themePref === 'system' ? (systemDark() ? 'dark' : 'light') : themePref });
    apply();
    store.set('dbm-theme-v2', themePref);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [themePref, editor]);
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(undefined), 2600);
    return () => clearTimeout(t);
  }, [message]);

  return (
    <div className="app">
      <main className={`stage${state.libraryOpen ? ' with-library' : ''}${chatOpen ? ' with-chat' : ''}`}>
        <div ref={container} className="canvas-host" tabIndex={0} aria-label="Whiteboard canvas" role="application">
          <canvas ref={scene} className="layer" />
          <canvas ref={overlay} className="layer" />
        </div>
        <TextEditor editor={editor} />
        <FileMenu editor={editor} onMessage={setMessage} />
        <Toolbar editor={editor} />
        <TopRight
          editor={editor}
          themePref={themePref}
          setThemePref={setThemePref}
          session={session}
          chatOpen={chatOpen}
          toggleChat={() => setChatOpen(!chatOpen)}
          shareOpen={shareOpen}
          toggleShare={() => setShareOpen(!shareOpen)}
        />
        {shareOpen && (
          <SharePopover
            session={session}
            name={name}
            setName={setName}
            onStart={() => void startSession()}
            onStop={() => void stopSession()}
            onClose={() => setShareOpen(false)}
          />
        )}
        <Library editor={editor} />
        <StyleBar editor={editor} />
        {chatOpen && <Chat session={session} onClose={() => setChatOpen(false)} onStart={() => setShareOpen(true)} />}
        <ZoomBar editor={editor} />
        <SelectionAnnouncer editor={editor} />
        {message && <div className="toast" role="status">{message}</div>}
        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void editor.insertImage(f);
          }}
        />
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
