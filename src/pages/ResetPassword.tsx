import { useState } from 'react';
import { Check, Circle, Eye, EyeOff, Lock } from 'lucide-react';
import { Alert, Button, Card, CardContent } from '../components/ui';
import { allRequirementsMet, REQUIREMENT_LABELS, usePasswordChecks } from '../lib/passwordValidation';
import { supabase } from '../lib/supabase';

interface ResetPasswordProps {
  onComplete: () => void;
}

export function ResetPassword({ onComplete }: ResetPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const passwordChecks = usePasswordChecks(password);
  const requirementsMet = allRequirementsMet(passwordChecks);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');

    if (!requirementsMet) {
      setError('Tu contraseña no cumple todos los requisitos.');
      return;
    }
    if (!passwordsMatch) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError('No se pudo actualizar la contraseña. Inténtalo de nuevo.');
      } else {
        setSuccess(true);
        setTimeout(onComplete, 2000);
      }
    } catch {
      setError('Ocurrió un error al cambiar la contraseña');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-academy-background px-4 py-10 sm:px-6">
      <Card className="w-full max-w-lg shadow-af-elevated">
        <CardContent className="p-6 sm:p-8">
          {success ? (
            <div className="py-8 text-center" role="status" aria-live="polite">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <Check className="h-8 w-8 text-green-700" aria-hidden="true" />
              </div>
              <h1 className="mt-5 text-af-h2 text-academy-text">Contraseña actualizada</h1>
              <p className="mt-3 text-academy-text-muted">
                Tu contraseña ha sido cambiada exitosamente. Serás redirigido en un momento…
              </p>
            </div>
          ) : (
            <>
              <header className="text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                  <Lock className="h-8 w-8 text-academy-primary" aria-hidden="true" />
                </div>
                <h1 className="mt-5 text-af-h2 text-academy-text">Nueva contraseña</h1>
                <p className="mt-2 text-academy-text-muted">Ingresa y confirma tu nueva contraseña.</p>
              </header>

              <form onSubmit={handleSubmit} className="mt-8 space-y-5" aria-busy={loading || undefined}>
                <PasswordInput
                  id="reset-password"
                  label="Nueva contraseña"
                  value={password}
                  onChange={setPassword}
                  visible={showPassword}
                  onToggle={() => setShowPassword((visible) => !visible)}
                />

                <div className="space-y-2 rounded-af-md border border-academy-border bg-academy-subtle p-4">
                  <p className="text-af-label text-academy-text">Tu contraseña debe contener:</p>
                  <ul className="grid gap-2 sm:grid-cols-2" aria-label="Requisitos de contraseña">
                    {REQUIREMENT_LABELS.map(({ key, label }) => {
                      const met = passwordChecks[key];
                      return (
                        <li key={key} className="flex items-center gap-2 text-af-body-sm">
                          {met ? <Check className="h-4 w-4 shrink-0 text-green-700" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0 text-academy-text-muted" aria-hidden="true" />}
                          <span className={met ? 'text-green-800' : 'text-academy-text-muted'}>
                            <span className="sr-only">{met ? 'Cumplido: ' : 'Pendiente: '}</span>{label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <PasswordInput
                  id="reset-confirm-password"
                  label="Confirmar contraseña"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  visible={showConfirmPassword}
                  onToggle={() => setShowConfirmPassword((visible) => !visible)}
                  describedBy={confirmPassword.length > 0 ? 'reset-password-match' : undefined}
                  invalid={confirmPassword.length > 0 && !passwordsMatch}
                />

                {confirmPassword.length > 0 && (
                  <p id="reset-password-match" className={`flex items-center gap-2 text-af-body-sm ${passwordsMatch ? 'text-green-800' : 'text-academy-danger'}`}>
                    {passwordsMatch ? <Check className="h-4 w-4" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}
                    {passwordsMatch ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
                  </p>
                )}

                {error && <Alert variant="error" role="alert">{error}</Alert>}

                <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!requirementsMet || !passwordsMatch}>
                  {loading ? 'Actualizando…' : 'Cambiar contraseña'}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  describedBy?: string;
  invalid?: boolean;
}

function PasswordInput({ id, label, value, onChange, visible, onToggle, describedBy, invalid }: PasswordInputProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-af-label text-academy-text">{label}</label>
      <div className="relative">
        <Lock className="pointer-events-none absolute inset-y-0 left-3 my-auto h-5 w-5 text-academy-text-muted" aria-hidden="true" />
        <input id={id} type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-touch w-full rounded-af-md border border-academy-border bg-academy-surface py-2 pl-10 pr-12 text-academy-text shadow-sm placeholder:text-academy-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary" placeholder="••••••••" required minLength={10} autoComplete="new-password" aria-describedby={describedBy} aria-invalid={invalid || undefined} />
        <button type="button" onClick={onToggle} className="absolute inset-y-0 right-0 flex min-h-touch min-w-touch items-center justify-center rounded-af-md text-academy-text-muted hover:text-academy-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
          {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
