import { placeUnpositioned } from '@dbm/core';
import { parse, serialize, type Diagnostic } from '@dbm/format';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import { useBoard } from './useEditor';

/**
 * Two-way text view of the board. Canvas → text updates whenever the pane is not focused.
 * Text → canvas applies only when the text parses without errors (never deletes on a typo).
 * One focus session = one undo step.
 */
export function TextPane({ editor }: { editor: Editor }) {
  const board = useBoard(editor);
  const [text, setText] = useState(() => serialize(board));
  const [focused, setFocused] = useState(false);
  const [diags, setDiags] = useState<Diagnostic[]>([]);
  const session = useRef(0);
  const timer = useRef<number>(undefined);

  // Canvas → text, except while typing or while the text has errors (never discard unparsed input).
  const hasErrors = diags.some((d) => d.severity === 'error');
  useEffect(() => {
    if (!focused && !hasErrors) {
      setText(serialize(board));
      setDiags([]);
    }
  }, [board, focused, hasErrors]);

  const apply = (value: string) => {
    const r = parse(value);
    setDiags(r.diagnostics);
    if (r.diagnostics.some((d) => d.severity === 'error')) return;
    const next = placeUnpositioned(r.board);
    if (serialize(next) === serialize(editor.board)) return;
    editor.store.replace(next, { mergeKey: `pane-${session.current}` });
  };

  const selectLineElement = (ta: HTMLTextAreaElement) => {
    const line = ta.value.slice(0, ta.selectionStart).split('\n').length;
    const { lineOf } = parse(ta.value);
    for (const [id, l] of lineOf) if (l === line) return editor.select([id]);
  };

  const errors = diags.filter((d) => d.severity === 'error');
  return (
    <aside className="pane" aria-label="Board as text">
      <header className="pane-head">
        <span className="pane-title">board.board</span>
        <span className={`pane-status${errors.length ? ' bad' : ''}`} role="status">
          {errors.length ? `${errors.length} error${errors.length > 1 ? 's' : ''} — not applied` : focused ? 'live' : 'synced'}
        </span>
        <button className="icon-btn" aria-label="Close text pane (Cmd+/)" title="Close — Cmd+/" onClick={() => editor.set({ paneOpen: false })}>
          <X size={16} />
        </button>
      </header>
      <textarea
        className="pane-text"
        spellCheck={false}
        value={text}
        aria-label="Board source"
        onFocus={() => {
          session.current++;
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => apply(v), 120);
        }}
        onClick={(e) => selectLineElement(e.currentTarget)}
        onKeyUp={(e) => e.key.startsWith('Arrow') && selectLineElement(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.currentTarget.blur();
          if ((e.metaKey || e.ctrlKey) && e.key === '/') {
            e.preventDefault();
            editor.set({ paneOpen: false });
          }
        }}
      />
      {diags.length > 0 && (
        <ul className="pane-diags">
          {diags.map((d, i) => (
            <li key={i} className={d.severity}>
              <span className="line">{d.line}</span> {d.message}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
