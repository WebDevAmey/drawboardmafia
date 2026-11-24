import {
  ArrowUpRight, Circle, Diamond, Eraser, Hand, ImagePlus, LayoutGrid, Minus, MousePointer2, Pencil, Square,
  StickyNote, Type,
} from 'lucide-react';
import { Fragment } from 'react';
import type { Editor, Tool } from '../editor/editor';
import { useEditorState } from './useEditor';

type Item = { tool: Tool; label: string; key: string; Icon: typeof Square };
const GROUPS: Item[][] = [
  [
    { tool: 'select', label: 'Select', key: 'V', Icon: MousePointer2 },
    { tool: 'hand', label: 'Pan', key: 'H', Icon: Hand },
  ],
  [
    { tool: 'box', label: 'Rectangle', key: 'R', Icon: Square },
    { tool: 'ellipse', label: 'Ellipse', key: 'O', Icon: Circle },
    { tool: 'diamond', label: 'Diamond', key: 'D', Icon: Diamond },
    { tool: 'arrow', label: 'Arrow', key: 'A', Icon: ArrowUpRight },
    { tool: 'line', label: 'Line', key: 'L', Icon: Minus },
    { tool: 'ink', label: 'Draw', key: 'P', Icon: Pencil },
    { tool: 'text', label: 'Text', key: 'T', Icon: Type },
    { tool: 'note', label: 'Sticky note', key: 'N', Icon: StickyNote },
  ],
  [{ tool: 'eraser', label: 'Eraser', key: 'E', Icon: Eraser }],
];

export function Toolbar({ editor }: { editor: Editor }) {
  const { tool, libraryOpen } = useEditorState(editor);
  return (
    <div className="toolbar panel" role="toolbar" aria-label="Tools">
      {GROUPS.map((group, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="divider" aria-hidden />}
          {group.map(({ tool: t, label, key, Icon }) => (
            <button
              key={t}
              className="icon-btn"
              aria-pressed={tool === t}
              aria-label={`${label} (${key})`}
              title={`${label} — ${key}`}
              onClick={() => editor.setTool(t)}
            >
              <Icon size={18} strokeWidth={1.75} />
              <span className="kbd-hint" aria-hidden>{key}</span>
            </button>
          ))}
          {i === 1 && (
            <button className="icon-btn" aria-label="Insert image (I)" title="Image — I" onClick={() => editor.onPickImage?.()}>
              <ImagePlus size={18} strokeWidth={1.75} />
              <span className="kbd-hint" aria-hidden>I</span>
            </button>
          )}
        </Fragment>
      ))}
      <span className="divider" aria-hidden />
      <button
        className="icon-btn"
        aria-pressed={libraryOpen}
        aria-label="System design library (B)"
        title="Library — B"
        onClick={() => editor.set({ libraryOpen: !libraryOpen })}
      >
        <LayoutGrid size={18} strokeWidth={1.75} />
        <span className="kbd-hint" aria-hidden>B</span>
      </button>
    </div>
  );
}
