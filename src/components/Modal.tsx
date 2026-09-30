import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const openDialogs: symbol[] = [];
let originalOverflow = '';
export function Modal({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const closeRef = React.useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const token = Symbol('dialog');
    if (!openDialogs.length) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openDialogs.push(token);
    const previous = document.activeElement as HTMLElement;
    const container = ref.current;
    const focusables = () =>
      Array.from(
        container?.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href]') || [],
      ).filter((e) => !e.hasAttribute('disabled') && e.getClientRects().length > 0);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (openDialogs.at(-1) !== token) return;
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab') {
        const list = focusables(),
          first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const wasTop = openDialogs.at(-1) === token;
      openDialogs.splice(openDialogs.indexOf(token), 1);
      if (!openDialogs.length) document.body.style.overflow = originalOverflow;
      if (wasTop && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={'modal ' + (wide ? 'wide' : '')}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-btn" aria-label="Fechar" onClick={close}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
