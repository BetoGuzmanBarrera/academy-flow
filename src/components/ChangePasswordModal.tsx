import { useState } from 'react';
import { Check, Circle, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { allRequirementsMet, REQUIREMENT_LABELS, usePasswordChecks } from '../lib/passwordValidation';
import { supabase } from '../lib/supabase';
import { Alert, Button, Input, Modal } from './ui';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ isOpen, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [nonce, setNonce] = useState('');
  const [reauthSent, setReauthSent] = useState(false);

  const passwordChecks = usePasswordChecks(newPassword);
  const requirementsMet = allRequirementsMet(passwordChecks);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit =
    currentPassword.length > 0 &&
    requirementsMet &&
    passwordsMatch &&
    !loading &&
    (!needsReauth || nonce.length > 0);

  const clearSensitiveFields = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setNonce('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  const handleClose = () => {
    clearSensitiveFields();
    setError('');
    setSuccess(false);
    setNeedsReauth(false);
    setReauthSent(false);
    setLoading(false);
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');

    if (!currentPassword) {
      setError('Debes ingresar tu contraseña actual.');
      return;
    }
    if (!requirementsMet) {
      setError('Tu nueva contraseña no cumple todos los requisitos.');
      return;
    }
    if (!passwordsMatch) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);

    try {
      const attributes: { password: string; current_password: string; nonce?: string } = {
        password: newPassword,
        current_password: currentPassword,
      };
      if (needsReauth && nonce) attributes.nonce = nonce;

      const { error: updateError } = await supabase.auth.updateUser(attributes);

      if (updateError) {
        const isReauthError =
          typeof updateError.message === 'string' &&
          /reauthenticate|re-authenticat/i.test(updateError.message);

        if (isReauthError && !needsReauth) {
          setNeedsReauth(true);
          const { error: reauthError } = await supabase.auth.reauthenticate();

          if (reauthError) {
            setError('No se pudo enviar el código de verificación. Inténtalo de nuevo.');
          } else {
            setReauthSent(true);
            setError('');
          }
          return;
        }

        setError('No se pudo actualizar la contraseña. Inténtalo de nuevo.');
        return;
      }

      setSuccess(true);
      clearSensitiveFields();
      setNeedsReauth(false);
      setReauthSent(false);
      setTimeout(handleClose, 2000);
    } catch {
      setError('Ocurrió un error inesperado. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={handleClose} title="Cambiar contraseña" className="max-w-lg">
      {success ? (
        <div className="py-8 text-center" role="status" aria-live="polite">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-700" aria-hidden="true" />
          </div>
          <p className="mt-4 text-af-h4 text-academy-text">Contraseña actualizada correctamente</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading || undefined}>
          <PasswordInput
            id="change-current-password"
            label="Contraseña actual"
            value={currentPassword}
            onChange={setCurrentPassword}
            visible={showCurrent}
            onToggle={() => setShowCurrent((visible) => !visible)}
            autoComplete="current-password"
          />

          <PasswordInput
            id="change-new-password"
            label="Nueva contraseña"
            value={newPassword}
            onChange={setNewPassword}
            visible={showNew}
            onToggle={() => setShowNew((visible) => !visible)}
            autoComplete="new-password"
            minLength={10}
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
            id="change-confirm-password"
            label="Confirmar nueva contraseña"
            value={confirmPassword}
            onChange={setConfirmPassword}
            visible={showConfirm}
            onToggle={() => setShowConfirm((visible) => !visible)}
            autoComplete="new-password"
            minLength={10}
            describedBy={confirmPassword.length > 0 ? 'change-password-match' : undefined}
            invalid={confirmPassword.length > 0 && !passwordsMatch}
          />

          {confirmPassword.length > 0 && (
            <p id="change-password-match" className={`flex items-center gap-2 text-af-body-sm ${passwordsMatch ? 'text-green-800' : 'text-academy-danger'}`}>
              {passwordsMatch ? <Check className="h-4 w-4" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}
              {passwordsMatch ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
            </p>
          )}

          {needsReauth && reauthSent && (
            <div className="space-y-4 rounded-af-md border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3 text-blue-950">
                <Mail className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p className="text-af-body-sm">Enviamos un código de verificación a tu correo.</p>
              </div>
              <Input
                id="change-password-nonce"
                type="text"
                label="Código de 6 dígitos"
                value={nonce}
                onChange={(event) => setNonce(event.target.value)}
                placeholder="000000"
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className="text-center text-lg tracking-[0.3em]"
              />
            </div>
          )}

          {error && <Alert variant="error" role="alert">{error}</Alert>}

          <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!canSubmit}>
            {loading ? 'Procesando…' : needsReauth ? 'Verificar y cambiar' : 'Cambiar contraseña'}
          </Button>
        </form>
      )}
    </Modal>
  );
}

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: 'current-password' | 'new-password';
  minLength?: number;
  describedBy?: string;
  invalid?: boolean;
}

function PasswordInput({ id, label, value, onChange, visible, onToggle, autoComplete, minLength, describedBy, invalid }: PasswordInputProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-af-label text-academy-text">{label}</label>
      <div className="relative">
        <Lock className="pointer-events-none absolute inset-y-0 left-3 my-auto h-5 w-5 text-academy-text-muted" aria-hidden="true" />
        <input id={id} type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-touch w-full rounded-af-md border border-academy-border bg-academy-surface py-2 pl-10 pr-12 text-academy-text shadow-sm placeholder:text-academy-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary" placeholder="••••••••" required minLength={minLength} autoComplete={autoComplete} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
        <button type="button" onClick={onToggle} className="absolute inset-y-0 right-0 flex min-h-touch min-w-touch items-center justify-center rounded-af-md text-academy-text-muted hover:text-academy-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
          {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
