import { emptyBoard, placeUnpositioned } from '@dbm/core';
import { serialize } from '@dbm/format';
import { Code2, Maximize, Menu, Minus, Moon, Plus, Redo2, Sun, Undo2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import { download, exportPng, exportSvg, importFile } from './export';
import { useEditorState } from './useEditor';

export function TopRight({ editor, themePref, setThemePref }: { editor: Editor; themePref: string; setThemePref: (t: 'light' | 'dark' | 'system') => void }) {
  const { canUndo, canRedo, paneOpen, theme } = useEditorState(editor);
  return (
    <div className="topright panel">
      <button className="icon-btn" aria-label="Undo (Cmd+Z)" title="Undo — Cmd+Z" disabled={!canUndo} onClick={() => editor.undo()}><Undo2 size={18} /></button>
      <button className="icon-btn" aria-label="Redo (Cmd+Shift+Z)" title="Redo — Cmd+Shift+Z" disabled={!canRedo} onClick={() => editor.redo()}><Redo2 size={18} /></button>
      <span className="divider" />
      <button
        className="icon-btn"
        aria-label={`Theme: ${themePref}`}
        title={`Theme: ${themePref} (click to cycle)`}
        onClick={() => setThemePref(themePref === 'system' ? (theme === 'dark' ? 'light' : 'dark') : themePref === 'dark' ? 'light' : 'system')}
      >
        {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
      </button>
      <button className="icon-btn" aria-pressed={paneOpen} aria-label="Board as text (Cmd+/)" title="Board as text — Cmd+/" onClick={() => editor.set({ paneOpen: !paneOpen })}>
        <Code2 size={18} />
      </button>
    </div>
  );
}

export function FileMenu({ editor, onMessage }: { editor: Editor; onMessage: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { theme } = useEditorState(editor);
  const item = (label: string, hint: string, fn: () => void | Promise<void>) => (
    <button role="menuitem" className="menu-item" onClick={async () => {
      setOpen(false);
      await fn();
    }}>
      <span>{label}</span>
      <span className="menu-hint">{hint}</span>
    </button>
  );
  return (
    <div className="topleft">
      <div className="panel brand-row">
        <button className="icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}>
          <Menu size={18} />
        </button>
        <span className="brand">drawboardmafia</span>
      </div>
      {open && (
        <div className="menu panel" role="menu" onMouseLeave={() => setOpen(false)}>
          {item('Open file…', '.board .excalidraw .mmd', () => fileInput.current?.click())}
          {item('Download .board', 'plain text', () => download('board.board', new Blob([serialize(editor.board)], { type: 'text/plain' })))}
          {item('Export SVG', 'embeds source', () => download('board.svg', new Blob([exportSvg(editor.board, theme)], { type: 'image/svg+xml' })))}
          {item('Export PNG', '2×', async () => download('board.png', await exportPng(editor.board, theme)))}
          {item('Copy as .board', 'clipboard', async () => {
            await navigator.clipboard.writeText(serialize(editor.board));
            onMessage('Copied board text');
          })}
          <div className="menu-sep" />
          {item('Clear board', 'undoable', () => editor.store.replace(emptyBoard()))}
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".board,.excalidraw,.json,.mmd,.txt"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const r = await importFile(f);
          if (r.error || !r.board) return onMessage(`Could not open ${f.name}: ${r.error}`);
          editor.store.replace(placeUnpositioned(r.board));
          editor.zoomToFit();
          onMessage(`Opened ${f.name}`);
        }}
      />
    </div>
  );
}

export function ZoomBar({ editor }: { editor: Editor }) {
  const { zoom } = useEditorState(editor);
  return (
    <div className="zoombar panel">
      <button className="icon-btn" aria-label="Zoom out (Cmd+-)" title="Zoom out — Cmd+-" onClick={() => editor.zoomBy(0.8)}><Minus size={16} /></button>
      <button className="zoom-value" title="Reset to 100% — Cmd+0" onClick={() => editor.setCamera({ ...editor.camera, zoom: 1 })}>
        {Math.round(zoom * 100)}%
      </button>
      <button className="icon-btn" aria-label="Zoom in (Cmd+=)" title="Zoom in — Cmd+=" onClick={() => editor.zoomBy(1.25)}><Plus size={16} /></button>
      <button className="icon-btn" aria-label="Zoom to fit (Shift+1)" title="Zoom to fit — Shift+1" onClick={() => editor.zoomToFit()}><Maximize size={16} /></button>
    </div>
  );
}
