import { forwardRef } from 'react';
import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react';
import { classNames } from './classNames';

export function TableContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames('w-full overflow-x-auto rounded-af-lg border border-academy-border', className)} {...props} />;
}

export const Table = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(function Table(
  { className, ...props },
  ref,
) {
  return <table ref={ref} className={classNames('w-full border-collapse text-left text-af-body-sm', className)} {...props} />;
});

export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(function TableHeader(
  { className, ...props },
  ref,
) {
  return <thead ref={ref} className={classNames('bg-academy-subtle text-academy-text', className)} {...props} />;
});

export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(function TableBody(
  { className, ...props },
  ref,
) {
  return <tbody ref={ref} className={classNames('divide-y divide-academy-border bg-academy-surface', className)} {...props} />;
});

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(function TableRow(
  { className, ...props },
  ref,
) {
  return <tr ref={ref} className={classNames('transition-colors hover:bg-academy-subtle', className)} {...props} />;
});

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(function TableHead(
  { className, scope = 'col', ...props },
  ref,
) {
  return <th ref={ref} scope={scope} className={classNames('px-4 py-3 font-semibold', className)} {...props} />;
});

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(function TableCell(
  { className, ...props },
  ref,
) {
  return <td ref={ref} className={classNames('px-4 py-3 text-academy-text', className)} {...props} />;
});
