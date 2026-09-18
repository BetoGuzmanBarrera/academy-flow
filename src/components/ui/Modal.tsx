import { X } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { classNames } from './classNames';
import { useDialogBehavior } from './useDialogBehavior';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function Modal({
  ariaLabel = 'Diálogo',
  children,
  className,
  dismissible = true,
  footer,
  onClose,
  open,
  title,
}: ModalProps) {
  const titleId = useId();
  const dialogRef = useDialogBehavior(open, onClose, dismissible);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
      onMouseDown={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
        className={classNames(
          'flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-af-lg bg-academy-surface shadow-af-elevated',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary',
          className,
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-academy-border p-af-6">
          {title ? <h2 id={titleId} className="text-af-h3 text-academy-text">{title}</h2> : <span />}
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar diálogo"
              className="flex min-h-touch min-w-touch items-center justify-center rounded-af-md text-academy-text-muted hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto p-af-6">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-academy-border p-af-6">{footer}</div>}
      </div>
    </div>
  );
}
