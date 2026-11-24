import { Check, Copy, Lock, Users } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Session } from '../collab/session';
import { shareUrl } from '../collab/crypto';

export function Avatars({ session }: { session: Session }) {
  const { peers } = useSyncExternalStore((cb) => session.subscribe(cb), session.getState);
  const shown = peers.slice(0, 3);
  return (
    <span className="avatars" aria-hidden>
      <span className="avatar" style={{ background: session.myColor }}>{initial(session.name)}</span>
      {shown.map((p) => <span key={p.id} className="avatar" style={{ background: p.color }}>{initial(p.name)}</span>)}
      {peers.length > 3 && <span className="avatar more">+{peers.length - 3}</span>}
    </span>
  );
}
const initial = (n: string) => (n.trim()[0] ?? '?').toUpperCase();

export function SharePopover({
  session, name, setName, onStart, onStop, onClose,
}: {
  session?: Session;
  name: string;
  setName: (n: string) => void;
  onStart: () => void;
  onStop: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const state = useSyncExternalStore((cb) => session?.subscribe(cb) ?? (() => {}), () => session?.getState());

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('.share-btn')) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const link = session ? shareUrl(session.room, session.keyText) : '';
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div ref={ref} className="popover share-pop panel" role="dialog" aria-label="Live collaboration">
      <h2 className="pop-title">{session ? 'Live session' : 'Collaborate live'}</h2>
      <p className="pop-copy">
        {session
          ? 'Anyone with this link can view and edit this board.'
          : 'Invite people to draw on this board with you in real time.'}
      </p>
      <label className="field">
        <span>Your name</span>
        <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => !session && e.key === 'Enter' && onStart()} />
      </label>
      {session ? (
        <>
          <div className="link-row">
            <input className="link" value={link} readOnly aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
            <button className="btn primary" onClick={copy}>
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="people">
            <Users size={14} aria-hidden />
            <span>
              {state?.status === 'live'
                ? `${(state.peers.length ?? 0) + 1} ${state.peers.length ? 'people' : 'person'} here`
                : state?.status === 'connecting' ? 'Connecting…' : 'Offline — reconnecting'}
            </span>
          </div>
          <button className="btn ghost danger-text" onClick={onStop}>Stop session</button>
        </>
      ) : (
        <button className="btn primary wide" onClick={onStart}>Start session</button>
      )}
      <p className="pop-foot"><Lock size={12} aria-hidden /> End-to-end encrypted. The server never sees your board.</p>
    </div>
  );
}
