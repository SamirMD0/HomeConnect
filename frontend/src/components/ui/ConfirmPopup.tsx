import React, { useEffect, useId, useRef } from 'react';
import { Button } from './Button';
import { portalToBody } from './portal';

export interface ConfirmPopupProps {
  title: string;
  /** Line breaks are shown as written. */
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmPopupContent: React.FC<ConfirmPopupProps> = ({
  title,
  message,
  onConfirm,
  onCancel,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = `confirm-title-${useId()}`;
  const cancel = useRef(onCancel);
  useEffect(() => {
    cancel.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Cancel takes focus, so a stray Enter never confirms something irreversible.
    panelRef.current?.querySelector<HTMLElement>('[data-confirm-cancel]')?.focus();
    // On window, ahead of an open Modal's document listener, so only this popup reacts.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        cancel.current();
      } else if (event.key === 'Tab') {
        event.stopPropagation();
        event.preventDefault();
        const buttons = Array.from(
          panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []
        );
        const at = buttons.indexOf(document.activeElement as HTMLElement);
        const step = event.shiftKey ? buttons.length - 1 : 1;
        buttons[(at + step) % buttons.length]?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      previous?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60" onClick={onCancel} />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-bold text-slate-800">
          {title}
        </h2>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-600" dir="auto">
          {message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} data-confirm-cancel>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Confirm</Button>
        </div>
      </div>
    </div>
  );
};

/** In-app confirmation that can sit on top of an open Modal. */
export const ConfirmPopup: React.FC<ConfirmPopupProps> = (props) =>
  portalToBody(<ConfirmPopupContent {...props} />);
