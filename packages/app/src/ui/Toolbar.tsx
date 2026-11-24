import { ArrowUpRight, Circle, Diamond, Hand, MousePointer2, Pencil, Square, StickyNote, Type } from 'lucide-react';
import type { Editor, Tool } from '../editor/editor';
import { useEditorState } from './useEditor';

const TOOLS: { tool: Tool; label: string; key: string; Icon: typeof Square }[] = [
  { tool: 'select', label: 'Select', key: 'V', Icon: MousePointer2 },
  { tool: 'hand', label: 'Pan', key: 'H', Icon: Hand },
  { tool: 'box', label: 'Box', key: 'R', Icon: Square },
  { tool: 'ellipse', label: 'Ellipse', key: 'O', Icon: Circle },
  { tool: 'diamond', label: 'Diamond', key: 'D', Icon: Diamond },
  { tool: 'arrow', label: 'Arrow', key: 'A', Icon: ArrowUpRight },
  { tool: 'ink', label: 'Draw', key: 'P', Icon: Pencil },
  { tool: 'text', label: 'Text', key: 'T', Icon: Type },
  { tool: 'note', label: 'Note', key: 'N', Icon: StickyNote },
];

export function Toolbar({ editor }: { editor: Editor }) {
  const { tool } = useEditorState(editor);
  return (
    <div className="toolbar panel" role="toolbar" aria-label="Tools">
      {TOOLS.map(({ tool: t, label, key, Icon }) => (
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
    </div>
  );
}
