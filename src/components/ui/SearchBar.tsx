import { Search, X } from 'lucide-react';
import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { classNames } from './classNames';

export interface SearchBarProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onClear?: () => void;
  clearLabel?: string;
}

export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  {
    'aria-label': ariaLabel = 'Buscar',
    className,
    clearLabel = 'Limpiar búsqueda',
    onClear,
    value,
    ...props
  },
  ref,
) {
  const hasValue = value !== undefined && String(value).length > 0;

  return (
    <div className="relative w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-academy-text-muted" aria-hidden="true" />
      <input
        ref={ref}
        type="search"
        aria-label={ariaLabel}
        value={value}
        className={classNames(
          'min-h-touch w-full rounded-af-md border border-academy-border bg-academy-surface py-2 pl-10 pr-12 text-academy-text shadow-sm',
          'placeholder:text-academy-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary',
          className,
        )}
        {...props}
      />
      {onClear && hasValue && (
        <button
          type="button"
          onClick={onClear}
          aria-label={clearLabel}
          className="absolute right-0 top-1/2 flex min-h-touch min-w-touch -translate-y-1/2 items-center justify-center rounded-af-md text-academy-text-muted hover:text-academy-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
});
