import { bounds, connectorPoints, isConnector, type Element, type NodeEl } from '@dbm/core';
import { FONT_FAMILY, FONT_PX, LINE_HEIGHT, midpoint } from '@dbm/render';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '../editor/editor';
import { useBoard, useEditorState } from './useEditor';

function initialText(el: Element): string {
  if (isConnector(el)) return el.label ?? '';
  switch (el.type) {
    case 'text': case 'note': case 'code': return el.text;
    case 'frame': return el.name;
    case 'box': case 'ellipse': case 'diamond': case 'cylinder': return el.label ?? '';
    default: return '';
  }
}

/** Positions a textarea over the element being edited, matching its on-canvas text. */
export function TextEditor({ editor }: { editor: Editor }) {
  const { editingId, zoom } = useEditorState(editor);
  const board = useBoard(editor);
  const el = editingId ? board.elements.find((e) => e.id === editingId) : undefined;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState('');
  const done = useRef(false);

  useEffect(() => {
    if (!el) return;
    done.current = false;
    setValue(initialText(el));
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) return;
    ta.style.height = '0px';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [value, zoom, editingId]);

  if (!el) return null;
  const commit = () => {
    if (done.current) return;
    done.current = true;
    editor.finishEditing(value);
  };

  const byId = new Map(board.elements.map((e) => [e.id, e]));
  let style: React.CSSProperties;
  const z = editor.camera.zoom;
  if (isConnector(el)) {
    const geo = connectorPoints(el, byId);
    const mid = geo ? midpoint(geo.pts) : { x: 0, y: 0 };
    const s = editor.toScreen(mid);
    style = { left: s.x - 100 * z, top: s.y - 10 * z, width: 200 * z, fontSize: 14 * z, textAlign: 'center', fontFamily: FONT_FAMILY.sans };
  } else {
    const n = el as NodeEl;
    const r = bounds(n)!;
    const tl = editor.toScreen({ x: r.x, y: r.y });
    const font = 'font' in n && n.font ? n.font : 'sans';
    const px = ('size' in n && n.size ? FONT_PX[n.size] : FONT_PX[2]) * z;
    if (n.type === 'text') {
      style = { left: tl.x, top: tl.y, minWidth: Math.max(r.w * z, 40), fontSize: px, fontFamily: FONT_FAMILY[font], textAlign: n.align === 'c' ? 'center' : n.align === 'r' ? 'right' : 'left' };
    } else if (n.type === 'note' || n.type === 'code') {
      const pad = (n.type === 'note' ? 16 : 12) * z;
      style = {
        left: tl.x + pad, top: tl.y + pad, width: r.w * z - pad * 2, maxHeight: r.h * z - pad * 2,
        fontSize: n.type === 'code' ? 14 * z : px, fontFamily: FONT_FAMILY[n.type === 'code' ? 'mono' : font],
        textAlign: n.type === 'note' && n.align === 'c' ? 'center' : 'left', whiteSpace: n.type === 'code' ? 'pre' : 'pre-wrap',
      };
    } else if (n.type === 'frame') {
      style = { left: tl.x, top: tl.y - 24 * z, width: Math.max(r.w * z, 120), fontSize: 14 * z, fontFamily: FONT_FAMILY.sans };
    } else {
      const lines = Math.max(1, value.split('\n').length);
      const textH = lines * px * LINE_HEIGHT;
      style = { left: tl.x, top: tl.y + (r.h * z - textH) / 2, width: r.w * z, fontSize: px, fontFamily: FONT_FAMILY[font], textAlign: 'center' };
    }
  }

  return (
    <textarea
      ref={ref}
      className="text-editor"
      aria-label="Edit text"
      spellCheck={el.type !== 'code'}
      value={value}
      style={{ ...style, lineHeight: LINE_HEIGHT }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          commit();
        }
        if (e.key === 'Tab' && el.type === 'code') {
          e.preventDefault();
          const ta = e.currentTarget;
          const { selectionStart: a, selectionEnd: b } = ta;
          setValue(value.slice(0, a) + '  ' + value.slice(b));
          requestAnimationFrame(() => ta.setSelectionRange(a + 2, a + 2));
        }
      }}
    />
  );
}
