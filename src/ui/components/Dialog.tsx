import type { ReactNode } from 'react';

interface DialogProps {
  title: string;
  children?: ReactNode;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
}

/** Modal used both for messages (no onConfirm) and confirmations. */
export function Dialog({
  title,
  children,
  details,
  confirmLabel = 'Confirm',
  cancelLabel,
  danger,
  onConfirm,
  onClose,
}: DialogProps) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dialog">
        <h3>{title}</h3>
        {children}
        {details && details.length > 0 && (
          <ul className="dialog-details">
            {details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          {onConfirm ? (
            <>
              <button className="btn" onClick={onClose}>
                {cancelLabel ?? 'Cancel'}
              </button>
              <button className={danger ? 'btn danger' : 'btn primary'} onClick={onConfirm}>
                {confirmLabel}
              </button>
            </>
          ) : (
            <button className="btn primary" onClick={onClose}>
              {cancelLabel ?? 'OK'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
