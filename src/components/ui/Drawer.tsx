import { X } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';
import { classNames } from './classNames';
import { useDialogBehavior } from './useDialogBehavior';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
  ariaLabel?: string;
  side?: 'left' | 'right';
  className?: string;
}

export function Drawer({
  ariaLabel = 'Panel lateral',
  children,
  className,
  dismissible = true,
  footer,
  onClose,
  open,
  side = 'right',
  title,
}: DrawerProps) {
  const titleId = useId();
  const dialogRef = useDialogBehavior(open, onClose, dismissible);

  if (!open) return null;

  return (
    <div
      className={classNames('fixed inset-0 z-50 flex bg-slate-950/55', side === 'right' ? 'justify-end' : 'justify-start')}
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
          'flex h-full w-full max-w-md flex-col bg-academy-surface shadow-af-elevated',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-academy-border p-af-6">
          {title ? <h2 id={titleId} className="text-af-h3 text-academy-text">{title}</h2> : <span />}
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar panel"
              className="flex min-h-touch min-w-touch items-center justify-center rounded-af-md text-academy-text-muted hover:bg-academy-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-af-6">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-academy-border p-af-6">{footer}</div>}
      </div>
    </div>
  );
}
