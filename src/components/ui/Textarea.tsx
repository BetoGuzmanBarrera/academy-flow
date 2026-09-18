import { forwardRef, useEffect, useId, useState } from 'react';
import type { ReactNode, TextareaHTMLAttributes } from 'react';
import { classNames } from './classNames';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  helperText?: ReactNode;
  error?: ReactNode;
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    className,
    defaultValue,
    error,
    helperText,
    id,
    label,
    maxLength,
    onChange,
    required,
    showCount = false,
    value,
    'aria-describedby': ariaDescribedBy,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const helperId = helperText ? `${textareaId}-helper` : undefined;
  const errorId = error ? `${textareaId}-error` : undefined;
  const countId = showCount && typeof maxLength === 'number' ? `${textareaId}-count` : undefined;
  const describedBy = [ariaDescribedBy, helperId, errorId, countId].filter(Boolean).join(' ') || undefined;
  const [characterCount, setCharacterCount] = useState(() => String(value ?? defaultValue ?? '').length);

  useEffect(() => {
    if (value !== undefined) setCharacterCount(String(value).length);
  }, [value]);

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={textareaId} className="mb-1.5 block text-af-label text-academy-text">
          {label}
          {required && <span className="ml-1 text-academy-danger" aria-hidden="true">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        required={required}
        maxLength={maxLength}
        value={value}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          setCharacterCount(event.target.value.length);
          onChange?.(event);
        }}
        className={classNames(
          'min-h-28 w-full resize-y rounded-af-md border bg-academy-surface px-3 py-2 text-academy-text shadow-sm',
          'placeholder:text-academy-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary',
          'disabled:cursor-not-allowed disabled:bg-academy-subtle disabled:opacity-70',
          error ? 'border-academy-danger' : 'border-academy-border',
          className,
        )}
        {...props}
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          {helperText && <p id={helperId} className="mt-1.5 text-af-body-sm text-academy-text-muted">{helperText}</p>}
          {error && <p id={errorId} className="mt-1.5 text-af-body-sm text-academy-danger">{error}</p>}
        </div>
        {countId && <p id={countId} className="mt-1.5 shrink-0 text-af-body-sm text-academy-text-muted">{characterCount}/{maxLength}</p>}
      </div>
    </div>
  );
});
