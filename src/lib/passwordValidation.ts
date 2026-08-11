import { useMemo } from 'react';

export interface PasswordChecks {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
}

export function usePasswordChecks(password: string): PasswordChecks {
  return useMemo(
    () => ({
      length: password.length >= 10,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    }),
    [password],
  );
}

export const REQUIREMENT_LABELS: { key: keyof PasswordChecks; label: string }[] = [
  { key: 'length', label: 'Mínimo 10 caracteres' },
  { key: 'uppercase', label: 'Una letra mayúscula' },
  { key: 'lowercase', label: 'Una letra minúscula' },
  { key: 'number', label: 'Un número' },
  { key: 'special', label: 'Un carácter especial' },
];

export function allRequirementsMet(checks: PasswordChecks): boolean {
  return (
    checks.length &&
    checks.uppercase &&
    checks.lowercase &&
    checks.number &&
    checks.special
  );
}
