import type { Order } from './database.types';

type OperationLock = {
  current: boolean;
};

const UNPAID_PROCESSING_MESSAGE =
  'No puedes iniciar esta orden porque el pago aún no está confirmado.';

export function requiresOrderCancellationConfirmation(status: string): boolean {
  return status === 'cancelled';
}

export function getOrderProcessingBlockReason(
  currentStatus: Order['status'],
  nextStatus: Order['status'],
  paymentStatus: Order['payment_status'],
): string | null {
  if (
    currentStatus === 'pending'
    && nextStatus === 'in_progress'
    && paymentStatus !== 'paid'
  ) {
    return UNPAID_PROCESSING_MESSAGE;
  }

  return null;
}

export async function runOrderCancellationOnce(
  lock: OperationLock,
  transition: () => Promise<boolean>,
): Promise<boolean | null> {
  if (lock.current) return null;

  lock.current = true;

  try {
    return await transition();
  } finally {
    lock.current = false;
  }
}
