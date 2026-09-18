import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from './classNames';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'title'> {
  variant?: AlertVariant;
  title?: ReactNode;
  role?: 'alert' | 'status';
}

const variantConfig = {
  info: { icon: Info, classes: 'border-blue-200 bg-blue-50 text-blue-900' },
  success: { icon: CheckCircle2, classes: 'border-green-200 bg-green-50 text-green-900' },
  warning: { icon: AlertTriangle, classes: 'border-amber-200 bg-amber-50 text-amber-950' },
  error: { icon: XCircle, classes: 'border-red-200 bg-red-50 text-red-900' },
} satisfies Record<AlertVariant, { icon: typeof Info; classes: string }>;

export function Alert({ children, className, role, title, variant = 'info', ...props }: AlertProps) {
  const { icon: Icon, classes } = variantConfig[variant];

  return (
    <div role={role} className={classNames('flex gap-3 rounded-af-md border p-af-4', classes, className)} {...props}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div className="text-af-body-sm">{children}</div>
      </div>
    </div>
  );
}
