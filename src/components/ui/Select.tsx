import { ChevronDown } from 'lucide-react';
import { forwardRef, useId } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { classNames } from './classNames';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { children, className, error, helperText, id, label, required, 'aria-describedby': ariaDescribedBy, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const helperId = helperText ? `${selectId}-helper` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;
  const describedBy = [ariaDescribedBy, helperId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-af-label text-academy-text">
          {label}
          {required && <span className="ml-1 text-academy-danger" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={classNames(
            'min-h-touch w-full appearance-none rounded-af-md border bg-academy-surface px-3 pr-10 text-academy-text shadow-sm',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary',
            'disabled:cursor-not-allowed disabled:bg-academy-subtle disabled:opacity-70',
            error ? 'border-academy-danger' : 'border-academy-border',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-academy-text-muted" aria-hidden="true" />
      </div>
      {helperText && <p id={helperId} className="mt-1.5 text-af-body-sm text-academy-text-muted">{helperText}</p>}
      {error && <p id={errorId} className="mt-1.5 text-af-body-sm text-academy-danger">{error}</p>}
    </div>
  );
});
