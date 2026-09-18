import { useCallback, useState } from 'react';
import { Calendar, Check, Circle, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  allRequirementsMet,
  REQUIREMENT_LABELS,
  usePasswordChecks,
  type PasswordChecks,
} from '../lib/passwordValidation';
import { supabase } from '../lib/supabase';
import { Alert, Button, Input, Modal } from './ui';
import { Turnstile } from './Turnstile';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GENERIC_SIGN_IN_ERROR = 'Correo o contraseña incorrectos.';
const GENERIC_SIGN_UP_ERROR =
  'No pudimos completar el registro en este momento. Inténtalo de nuevo en unos minutos.';
const GENERIC_RESET_ERROR =
  'No pudimos procesar la solicitud en este momento. Inténtalo de nuevo en unos minutos.';
// Respuestas idénticas exista o no la cuenta, para no revelar qué correos están registrados.
const NEUTRAL_RESET_MESSAGE =
  'Si ese correo tiene una cuenta, te enviamos instrucciones para restablecer tu contraseña.';
const NEUTRAL_SIGN_UP_MESSAGE =
  'Revisa tu correo para continuar. Si ya tenías una cuenta con ese correo, inicia sesión.';

function PasswordChecklist({ checks }: { checks: PasswordChecks }) {
  return (
    <div className="space-y-2 rounded-af-md border border-academy-border bg-academy-subtle p-4">
      <p className="text-af-label text-academy-text">Tu contraseña debe contener:</p>
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Requisitos de contraseña">
        {REQUIREMENT_LABELS.map(({ key, label }) => {
          const met = checks[key];
          return (
            <li key={key} className="flex items-center gap-2 text-af-body-sm">
              {met ? (
                <Check className="h-4 w-4 shrink-0 text-green-700" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-academy-text-muted" aria-hidden="true" />
              )}
              <span className={met ? 'text-green-800' : 'text-academy-text-muted'}>
                <span className="sr-only">{met ? 'Cumplido: ' : 'Pendiente: '}</span>
                {label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);
  const [captchaError, setCaptchaError] = useState(false);
  const { signIn, signUp } = useAuth();

  const hasSiteKey = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);
  const captchaValid = hasSiteKey && captchaToken.length > 0 && !captchaError;
  const passwordChecks = usePasswordChecks(password);
  const requirementsMet = allRequirementsMet(passwordChecks);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const resetCaptcha = useCallback(() => {
    setCaptchaToken('');
    setCaptchaError(false);
    setCaptchaResetSignal((s) => s + 1);
  }, []);

  const handleCaptchaToken = useCallback((token: string) => {
    setCaptchaToken(token);
    if (token) setCaptchaError(false);
  }, []);

  const handleCaptchaError = useCallback(() => setCaptchaError(true), []);
  const handleCaptchaExpire = useCallback(() => setCaptchaError(true), []);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setFirstName('');
    setLastName('');
    setBirthDate('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setError('');
    setSuccessMessage('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    if (!captchaValid) {
      setError('Debes completar el CAPTCHA para continuar.');
      return;
    }

    if (!isLogin && !isForgotPassword) {
      if (!birthDate) {
        setError('Debes ingresar tu fecha de nacimiento.');
        return;
      }
      if (new Date(birthDate) > new Date()) {
        setError('La fecha de nacimiento no puede ser futura.');
        return;
      }
      if (!requirementsMet) {
        setError('Tu contraseña no cumple todos los requisitos.');
        return;
      }
      if (!passwordsMatch) {
        setError('Las contraseñas no coinciden.');
        return;
      }
    }

    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      if (isForgotPassword) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}?reset-password=true`,
          captchaToken,
        });

        if (error) {
          console.error('Error al solicitar el restablecimiento:', error);
          setError(GENERIC_RESET_ERROR);
        } else {
          setSuccessMessage(NEUTRAL_RESET_MESSAGE);
          setEmail('');
        }
      } else if (isLogin) {
        const { error } = await signIn(email, password, { captchaToken });
        if (error) {
          console.error('Error al iniciar sesión:', error);
          setError(GENERIC_SIGN_IN_ERROR);
        } else {
          onClose();
          resetForm();
        }
      } else {
        const { user: createdUser, session: createdSession, error } = await signUp(
          email,
          password,
          { firstName, lastName, birthDate },
          { captchaToken },
        );

        if (error) {
          console.error('Error al crear la cuenta:', error);
          const alreadyRegistered =
            typeof error.message === 'string' &&
            /already\s*registered|already\s*exists|user\s*exists/i.test(error.message);

          if (alreadyRegistered) {
            setSuccessMessage(NEUTRAL_SIGN_UP_MESSAGE);
            setPassword('');
            setConfirmPassword('');
          } else {
            setError(GENERIC_SIGN_UP_ERROR);
          }
        } else if (createdUser && createdSession) {
          onClose();
          resetForm();
        } else {
          setSuccessMessage(NEUTRAL_SIGN_UP_MESSAGE);
          setPassword('');
          setConfirmPassword('');
        }
      }
    } catch {
      setError('Ocurrió un error inesperado');
    } finally {
      setLoading(false);
      resetCaptcha();
    }
  };

  const title = isForgotPassword ? 'Recuperar contraseña' : isLogin ? 'Iniciar sesión' : 'Crear cuenta';
  const submitLabel = isForgotPassword
    ? 'Enviar instrucciones'
    : isLogin
      ? 'Iniciar sesión'
      : 'Crear cuenta';

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={title}
      ariaLabel="Autenticación"
      className={isLogin || isForgotPassword ? 'max-w-md' : 'max-w-2xl'}
    >
      <form onSubmit={handleSubmit} className="space-y-5" aria-busy={loading || undefined}>
        {isForgotPassword && (
          <p className="text-af-body text-academy-text-muted">
            Ingresa tu correo y te enviaremos instrucciones para restablecer tu contraseña.
          </p>
        )}

        {!isLogin && !isForgotPassword && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="auth-first-name" type="text" label="Nombre" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Juan" autoComplete="given-name" leadingIcon={<User className="h-5 w-5" />} required />
            <Input id="auth-last-name" type="text" label="Apellido" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Pérez" autoComplete="family-name" leadingIcon={<User className="h-5 w-5" />} required />
            <div className="sm:col-span-2">
              <Input id="auth-birth-date" type="date" label="Fecha de nacimiento" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} max={new Date().toISOString().split('T')[0]} leadingIcon={<Calendar className="h-5 w-5" />} required />
            </div>
          </div>
        )}

        <Input id="auth-email" type="email" label="Correo electrónico" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@email.com" autoComplete="email" leadingIcon={<Mail className="h-5 w-5" />} required />

        {!isForgotPassword && (
          <div>
            <label htmlFor="auth-password" className="mb-1.5 block text-af-label text-academy-text">Contraseña</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute inset-y-0 left-3 my-auto h-5 w-5 text-academy-text-muted" aria-hidden="true" />
              <input id="auth-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-touch w-full rounded-af-md border border-academy-border bg-academy-surface py-2 pl-10 pr-12 text-academy-text shadow-sm placeholder:text-academy-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary" placeholder="••••••••" required minLength={isLogin ? 6 : 10} autoComplete={isLogin ? 'current-password' : 'new-password'} />
              <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute inset-y-0 right-0 flex min-h-touch min-w-touch items-center justify-center rounded-af-md text-academy-text-muted hover:text-academy-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
          </div>
        )}

        {!isLogin && !isForgotPassword && (
          <>
            <PasswordChecklist checks={passwordChecks} />
            <div>
              <label htmlFor="auth-confirm-password" className="mb-1.5 block text-af-label text-academy-text">Confirmar contraseña</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute inset-y-0 left-3 my-auto h-5 w-5 text-academy-text-muted" aria-hidden="true" />
                <input id="auth-confirm-password" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="min-h-touch w-full rounded-af-md border border-academy-border bg-academy-surface py-2 pl-10 pr-12 text-academy-text shadow-sm placeholder:text-academy-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary" placeholder="••••••••" required minLength={10} autoComplete="new-password" aria-invalid={confirmPassword.length > 0 && !passwordsMatch ? true : undefined} aria-describedby={confirmPassword.length > 0 ? 'auth-password-match' : undefined} />
                <button type="button" onClick={() => setShowConfirmPassword((visible) => !visible)} className="absolute inset-y-0 right-0 flex min-h-touch min-w-touch items-center justify-center rounded-af-md text-academy-text-muted hover:text-academy-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary" aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                </button>
              </div>
              {confirmPassword.length > 0 && (
                <p id="auth-password-match" className={`mt-1.5 flex items-center gap-2 text-af-body-sm ${passwordsMatch ? 'text-green-800' : 'text-academy-danger'}`}>
                  {passwordsMatch ? <Check className="h-4 w-4" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}
                  {passwordsMatch ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'}
                </p>
              )}
            </div>
          </>
        )}

        {isLogin && !isForgotPassword && (
          <div className="text-right">
            <button type="button" onClick={() => { setIsForgotPassword(true); setError(''); setSuccessMessage(''); }} className="min-h-touch rounded-af-sm px-2 text-af-label text-academy-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-academy-primary">¿Olvidaste tu contraseña?</button>
          </div>
        )}

        <div className="max-w-full overflow-x-auto rounded-af-md">
          <Turnstile onToken={handleCaptchaToken} onError={handleCaptchaError} onExpire={handleCaptchaExpire} resetSignal={captchaResetSignal} />
        </div>

        {error && <Alert variant="error" role="alert">{error}</Alert>}
        {successMessage && <Alert variant="success" role="status" aria-live="polite">{successMessage}</Alert>}

        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!captchaValid || (!isLogin && !isForgotPassword && (!requirementsMet || !passwordsMatch))}>
          {loading ? 'Procesando…' : submitLabel}
        </Button>
      </form>

      <div className="mt-6 border-t border-academy-border pt-5 text-center">
        {isForgotPassword ? (
          <Button variant="ghost" onClick={() => { setIsForgotPassword(false); setIsLogin(true); resetForm(); resetCaptcha(); }}>Volver a iniciar sesión</Button>
        ) : (
          <Button variant="ghost" onClick={() => { setIsLogin((login) => !login); setIsForgotPassword(false); resetForm(); resetCaptcha(); }}>
            {isLogin ? '¿No tienes cuenta? Crear cuenta' : '¿Ya tienes cuenta? Inicia sesión'}
          </Button>
        )}
      </div>
    </Modal>
  );
}
