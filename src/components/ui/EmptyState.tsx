import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from './classNames';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ action, className, description, icon, title, ...props }: EmptyStateProps) {
  return (
    <div className={classNames('flex flex-col items-center rounded-af-lg border border-dashed border-academy-border px-af-6 py-af-12 text-center', className)} {...props}>
      {icon && <div className="mb-4 text-academy-text-muted" aria-hidden="true">{icon}</div>}
      <h3 className="text-af-h4 text-academy-text">{title}</h3>
      {description && <p className="mt-2 max-w-md text-af-body-sm text-academy-text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
