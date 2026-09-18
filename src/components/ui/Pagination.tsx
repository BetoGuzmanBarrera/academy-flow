import { ChevronLeft, ChevronRight } from 'lucide-react';
import { classNames } from './classNames';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  siblingCount?: number;
  ariaLabel?: string;
  className?: string;
}

type PageItem = number | 'ellipsis-start' | 'ellipsis-end';

function getPageItems(page: number, totalPages: number, siblingCount: number): PageItem[] {
  if (totalPages <= 1) return totalPages === 1 ? [1] : [];
  const visible = new Set([1, totalPages]);
  for (let candidate = Math.max(1, page - siblingCount); candidate <= Math.min(totalPages, page + siblingCount); candidate += 1) {
    visible.add(candidate);
  }
  const pages = Array.from(visible).sort((a, b) => a - b);
  const items: PageItem[] = [];
  pages.forEach((value, index) => {
    const previous = pages[index - 1];
    if (previous && value - previous > 1) items.push(index === 1 ? 'ellipsis-start' : 'ellipsis-end');
    items.push(value);
  });
  return items;
}

export function Pagination({
  ariaLabel = 'Paginación',
  className,
  onPageChange,
  page,
  siblingCount = 1,
  totalPages,
}: PaginationProps) {
  const items = getPageItems(page, totalPages, siblingCount);
  if (items.length === 0) return null;

  const buttonClass = 'flex min-h-touch min-w-touch items-center justify-center rounded-af-md border text-af-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <nav aria-label={ariaLabel} className={classNames('flex items-center justify-center gap-1', className)}>
      <button
        type="button"
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className={classNames(buttonClass, 'border-academy-border bg-academy-surface text-academy-text')}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>
      {items.map((item) =>
        typeof item === 'number' ? (
          <button
            key={item}
            type="button"
            aria-label={`Página ${item}`}
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onPageChange(item)}
            className={classNames(
              buttonClass,
              item === page
                ? 'border-academy-primary bg-academy-primary text-academy-text-inverse'
                : 'border-academy-border bg-academy-surface text-academy-text hover:bg-academy-subtle',
            )}
          >
            {item}
          </button>
        ) : (
          <span key={item} className="flex min-h-touch min-w-touch items-center justify-center text-academy-text-muted" aria-hidden="true">…</span>
        ),
      )}
      <button
        type="button"
        aria-label="Página siguiente"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className={classNames(buttonClass, 'border-academy-border bg-academy-surface text-academy-text')}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
