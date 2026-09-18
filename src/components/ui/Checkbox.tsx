import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { classNames } from './classNames';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, description, error, id, label, 'aria-describedby': ariaDescribedBy, ...props },
  ref,
) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;
  const descriptionId = description ? `${checkboxId}-description` : undefined;
  const errorId = error ? `${checkboxId}-error` : undefined;
  const describedBy = [ariaDescribedBy, descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={checkboxId} className="flex min-h-touch cursor-pointer items-start gap-3 py-2 text-academy-text">
        <input
          ref={ref}
          id={checkboxId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={classNames(
            'mt-0.5 h-5 w-5 shrink-0 rounded border-academy-border text-academy-primary',
            'focus-visible:ring-2 focus-visible:ring-academy-primary focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-60',
            className,
          )}
          {...props}
        />
        <span>
          <span className="block text-af-label">{label}</span>
          {description && <span id={descriptionId} className="mt-0.5 block text-af-body-sm text-academy-text-muted">{description}</span>}
        </span>
      </label>
      {error && <p id={errorId} className="text-af-body-sm text-academy-danger">{error}</p>}
    </div>
  );
});
