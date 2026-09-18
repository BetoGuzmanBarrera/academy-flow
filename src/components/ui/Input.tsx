import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { classNames } from './classNames';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    error,
    helperText,
    id,
    label,
    leadingIcon,
    required,
    trailingIcon,
    'aria-describedby': ariaDescribedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helperId = helperText ? `${inputId}-helper` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [ariaDescribedBy, helperId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-af-label text-academy-text">
          {label}
          {required && <span className="ml-1 text-academy-danger" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="relative">
        {leadingIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-academy-text-muted" aria-hidden="true">
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={classNames(
            'min-h-touch w-full rounded-af-md border bg-academy-surface px-3 text-academy-text shadow-sm',
            'placeholder:text-academy-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary',
            'disabled:cursor-not-allowed disabled:bg-academy-subtle disabled:opacity-70',
            error ? 'border-academy-danger' : 'border-academy-border',
            Boolean(leadingIcon) && 'pl-10',
            Boolean(trailingIcon) && 'pr-10',
            className,
          )}
          {...props}
        />
        {trailingIcon && (
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-academy-text-muted" aria-hidden="true">
            {trailingIcon}
          </span>
        )}
      </div>
      {helperText && <p id={helperId} className="mt-1.5 text-af-body-sm text-academy-text-muted">{helperText}</p>}
      {error && <p id={errorId} className="mt-1.5 text-af-body-sm text-academy-danger">{error}</p>}
    </div>
  );
});
