import { ICONS } from '@dbm/render';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import { CATEGORIES, LIBRARY_MIME, searchLibrary, type LibraryItem } from '../library';
import { useEditorState } from './useEditor';

function Preview({ item }: { item: LibraryItem }) {
  const icon = ICONS[item.preview];
  const common = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  if (icon) return <svg {...common} aria-hidden><path d={icon.d} /></svg>;
  const shapes: Record<string, string> = {
    'shape:frame': 'M3 6h18v14H3z M3 3h7',
    'shape:diamond': 'M12 3l9 9-9 9-9-9z',
    'shape:note': 'M4 4h16v12l-4 4H4z M16 20v-4h4',
    'shape:flow': 'M2 9h5v6H2z M10 9h4v6h-4z M17 9h5v6h-5z M7 12h3 M14 12h3',
  };
  return <svg {...common} aria-hidden><path d={shapes[item.preview] ?? ''} /></svg>;
}

/** Searchable library of system-design figures. Click to insert at the centre, or drag onto the board. */
export function Library({ editor }: { editor: Editor }) {
  const { libraryOpen } = useEditorState(editor);
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const items = useMemo(() => searchLibrary(q), [q]);

  useEffect(() => {
    if (libraryOpen) requestAnimationFrame(() => input.current?.focus());
  }, [libraryOpen]);

  if (!libraryOpen) return null;
  return (
    <aside className="library panel" aria-label="System design library">
      <header className="sheet-head">
        <h2 className="sheet-title">Library</h2>
        <button className="icon-btn sm" aria-label="Close library (B)" title="Close — B" onClick={() => editor.set({ libraryOpen: false })}>
          <X size={16} />
        </button>
      </header>
      <label className="search">
        <Search size={15} aria-hidden />
        <input
          ref={input}
          value={q}
          placeholder="Search — queue, cache, auth…"
          aria-label="Search the library"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (q) setQ('');
              else editor.set({ libraryOpen: false });
            }
            if (e.key === 'Enter' && items[0]) editor.insertLibraryItem(items[0].id);
          }}
        />
      </label>
      <div className="library-body">
        {items.length === 0 && <p className="empty">No figures match “{q}”.</p>}
        {CATEGORIES.map((cat) => {
          const list = items.filter((i) => i.category === cat);
          if (!list.length) return null;
          return (
            <section key={cat} className="lib-group">
              <h3 className="lib-cat">{cat}</h3>
              <div className="lib-grid">
                {list.map((item) => (
                  <button
                    key={item.id}
                    className="lib-item"
                    draggable
                    title={`${item.name} — click to add, or drag onto the board`}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(LIBRARY_MIME, item.id);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => editor.insertLibraryItem(item.id)}
                  >
                    <Preview item={item} />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
