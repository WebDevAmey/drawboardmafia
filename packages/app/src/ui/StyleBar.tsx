import { PALETTE_TOKENS, THEMES, isConnector, type Color, type Element } from '@dbm/core';
import { ArrowDownToLine, ArrowUpToLine, Copy, Trash2 } from 'lucide-react';
import type { Editor } from '../editor/editor';
import { useBoard, useEditorState } from './useEditor';

export function StyleBar({ editor }: { editor: Editor }) {
  const { selection, theme, editingId } = useEditorState(editor);
  const board = useBoard(editor);
  if (!selection.length || editingId) return null;
  const els = board.elements.filter((e) => selection.includes(e.id));
  const first = els[0];
  if (!first) return null;
  const hasFill = els.some((e) => !isConnector(e) && e.type !== 'ink');
  const connectors = els.filter(isConnector);
  const t = THEMES[theme];
  const set = (patch: Partial<Element> | Record<string, unknown>) => editor.style(patch as Partial<Element>);
  const same = <K extends string>(k: K) => {
    const vals = new Set(els.map((e) => (e as unknown as Record<string, unknown>)[k]));
    return vals.size === 1 ? [...vals][0] : undefined;
  };

  return (
    <div className="stylebar panel" role="group" aria-label="Style">
      <Section label="Stroke">
        {PALETTE_TOKENS.map((c) => (
          <Swatch key={c} color={t.stroke[c]} label={c} active={same('stroke') === c} onClick={() => set({ stroke: c as Color })} />
        ))}
      </Section>
      {hasFill && (
        <Section label="Fill">
          <Swatch color="transparent" label="none" active={same('fill') === 'none'} onClick={() => set({ fill: 'none' })} />
          {PALETTE_TOKENS.map((c) => (
            <Swatch key={c} color={t.fill[c]} label={c} active={same('fill') === c} onClick={() => set({ fill: c as Color })} />
          ))}
        </Section>
      )}
      <Section label="Width">
        {([1, 2, 4] as const).map((w) => (
          <button key={w} className="chip" aria-pressed={same('width') === w} onClick={() => set({ width: w })}>
            <span className="line-sample" style={{ height: w }} />
          </button>
        ))}
      </Section>
      <Section label="Line">
        {(['solid', 'dashed', 'dotted'] as const).map((d) => (
          <button key={d} className="chip" aria-pressed={same('dash') === d} onClick={() => set({ dash: d })}>
            {d}
          </button>
        ))}
      </Section>
      {connectors.length > 0 && (
        <>
          <Section label="Route">
            {(['straight', 'elbow', 'curve'] as const).map((r) => (
              <button key={r} className="chip" aria-pressed={same('route') === r} onClick={() => set({ route: r })}>
                {r}
              </button>
            ))}
          </Section>
          <Section label="Heads">
            {([['none', '—'], ['end', '→'], ['both', '↔']] as const).map(([h, glyph]) => (
              <button key={h} className="chip" aria-pressed={same('head') === h} aria-label={h} onClick={() => set({ head: h })}>
                {glyph}
              </button>
            ))}
          </Section>
        </>
      )}
      <Section label="Actions">
        <button className="icon-btn" title="Bring to front — Cmd+Shift+]" aria-label="Bring to front" onClick={() => editor.restack('front')}><ArrowUpToLine size={16} /></button>
        <button className="icon-btn" title="Send to back — Cmd+Shift+[" aria-label="Send to back" onClick={() => editor.restack('back')}><ArrowDownToLine size={16} /></button>
        <button className="icon-btn" title="Duplicate — Cmd+D" aria-label="Duplicate" onClick={() => editor.duplicateSelection()}><Copy size={16} /></button>
        <button className="icon-btn danger" title="Delete — Backspace" aria-label="Delete" onClick={() => editor.deleteSelection()}><Trash2 size={16} /></button>
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="style-section">
      <div className="style-label">{label}</div>
      <div className="style-row">{children}</div>
    </div>
  );
}

function Swatch({ color, label, active, onClick }: { color: string; label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`swatch${color === 'transparent' ? ' none' : ''}`} style={{ background: color }} aria-label={label} title={label} aria-pressed={active} onClick={onClick} />
  );
}
