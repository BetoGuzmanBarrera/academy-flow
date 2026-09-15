type OperationLock = {
  current: boolean;
};

export function requiresOrderCancellationConfirmation(status: string): boolean {
  return status === 'cancelled';
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
