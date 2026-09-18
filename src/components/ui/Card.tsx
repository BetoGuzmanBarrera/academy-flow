import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { classNames } from './classNames';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={classNames('rounded-af-lg border border-academy-border bg-academy-surface shadow-af-card', className)} {...props} />;
});

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames('border-b border-academy-border p-af-6', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames('p-af-6', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={classNames('flex items-center gap-3 border-t border-academy-border p-af-6', className)} {...props} />;
}
