import { ArrowUp, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Session } from '../collab/session';

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function Chat({ session, onClose, onStart }: { session?: Session; onClose: () => void; onStart: () => void }) {
  const state = useSyncExternalStore((cb) => session?.subscribe(cb) ?? (() => {}), () => session?.getState());
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    session?.setChatOpen(true);
    input.current?.focus();
    return () => session?.setChatOpen(false);
  }, [session]);

  useLayoutEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state?.messages.length]);

  const send = () => {
    const t = text.trim();
    if (!t || !session) return;
    void session.sendChat(t);
    setText('');
  };

  return (
    <aside className="chat panel" aria-label="Chat">
      <header className="sheet-head">
        <h2 className="sheet-title">Chat</h2>
        {state && <span className="sheet-meta">{state.peers.length + 1} here</span>}
        <button className="icon-btn sm" aria-label="Close chat" title="Close" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      {!session ? (
        <div className="chat-empty">
          <p>Chat with everyone on the board once a live session is running.</p>
          <button className="btn primary" onClick={onStart}>Start session</button>
        </div>
      ) : (
        <>
          <div ref={list} className="chat-list" role="log" aria-live="polite">
            {state?.messages.length === 0 && <p className="chat-hint">Say hello. Messages are end-to-end encrypted.</p>}
            {state?.messages.map((m, i) => {
              const prev = state.messages[i - 1];
              const grouped = prev && prev.from === m.from && m.ts - prev.ts < 120_000;
              return (
                <div key={m.id} className={`msg${grouped ? ' grouped' : ''}`}>
                  {!grouped && (
                    <div className="msg-head">
                      <span className="msg-dot" style={{ background: m.color }} />
                      <span className="msg-name">{m.name}</span>
                      <span className="msg-time">{time(m.ts)}</span>
                    </div>
                  )}
                  <p className="msg-text">{m.text}</p>
                </div>
              );
            })}
          </div>
          <form className="chat-input" onSubmit={(e) => (e.preventDefault(), send())}>
            <textarea
              ref={input}
              rows={1}
              value={text}
              placeholder="Message"
              aria-label="Message"
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
                if (e.key === 'Escape') e.currentTarget.blur();
              }}
            />
            <button className="send" type="submit" aria-label="Send" disabled={!text.trim()}>
              <ArrowUp size={16} />
            </button>
          </form>
        </>
      )}
    </aside>
  );
}
