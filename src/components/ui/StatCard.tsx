import type { HTMLAttributes, ReactNode } from 'react';
import { Card, CardContent } from './Card';

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  trend?: ReactNode;
}

export function StatCard({ className, icon, label, trend, value, ...props }: StatCardProps) {
  return (
    <Card className={className} {...props}>
      <CardContent className="flex items-start justify-between gap-4">
        <div>
          <p className="text-af-label text-academy-text-muted">{label}</p>
          <p className="mt-2 text-af-h2 text-academy-text">{value}</p>
          {trend && <div className="mt-2 text-af-body-sm text-academy-text-muted">{trend}</div>}
        </div>
        {icon && <div className="rounded-af-md bg-academy-subtle p-3 text-academy-primary" aria-hidden="true">{icon}</div>}
      </CardContent>
    </Card>
  );
}
