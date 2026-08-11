import { useState, useCallback, useMemo } from 'react';
import { X, Mail, Lock, User, Calendar, Eye, EyeOff, Check, Circle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
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

interface PasswordChecks {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  special: boolean;
}

function usePasswordChecks(password: string): PasswordChecks {
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

const REQUIREMENT_LABELS: { key: keyof PasswordChecks; label: string }[] = [
  { key: 'length', label: 'Mínimo 10 caracteres' },
  { key: 'uppercase', label: 'Una letra mayúscula' },
  { key: 'lowercase', label: 'Una letra minúscula' },
  { key: 'number', label: 'Un número' },
  { key: 'special', label: 'Un carácter especial' },
];

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
  const allRequirementsMet =
    passwordChecks.length &&
    passwordChecks.uppercase &&
    passwordChecks.lowercase &&
    passwordChecks.number &&
    passwordChecks.special;

  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const resetCaptcha = useCallback(() => {
    setCaptchaToken('');
    setCaptchaError(false);
    setCaptchaResetSignal((s) => s + 1);
  }, []);

  const handleCaptchaToken = useCallback((token: string) => {
    setCaptchaToken(token);
    if (token) {
      setCaptchaError(false);
    }
  }, []);

  const handleCaptchaError = useCallback(() => {
    setCaptchaError(true);
  }, []);

  const handleCaptchaExpire = useCallback(() => {
    setCaptchaError(true);
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasSiteKey && !captchaValid) {
      setError('Debes completar el CAPTCHA para continuar.');
      return;
    }

    if (!isLogin && !isForgotPassword) {
      if (!allRequirementsMet) {
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
    } catch (err) {
      setError('Ocurrió un error inesperado');
    } finally {
      setLoading(false);
      resetCaptcha();
    }
  };

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>

      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition"
          aria-label="Cerrar"
        >
          <X size={20} />
        </button>

        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {isForgotPassword ? 'Recuperar Contraseña' : isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto px-1">
          {!isLogin && !isForgotPassword && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre
                  </label>
                  <div className="relative">
                    <User
                      size={20}
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Juan"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Apellido
                  </label>
                  <div className="relative">
                    <User
                      size={20}
                      className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Pérez"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha de Nacimiento
                </label>
                <div className="relative">
                  <Calendar
                    size={20}
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Correo Electrónico
            </label>
            <div className="relative">
              <Mail
                size={20}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="tu@email.com"
                required
              />
            </div>
          </div>

          {!isForgotPassword && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <Lock
                  size={20}
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                  required
                  minLength={isLogin ? 6 : 10}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          )}

          {!isLogin && !isForgotPassword && (
            <>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1.5">
                <p className="text-xs font-medium text-gray-600 mb-1">
                  Tu contraseña debe contener:
                </p>
                {REQUIREMENT_LABELS.map(({ key, label }) => {
                  const met = passwordChecks[key];
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-2 text-xs transition-colors duration-200"
                    >
                      {met ? (
                        <Check size={14} className="text-green-600 flex-shrink-0" />
                      ) : (
                        <Circle size={14} className="text-gray-300 flex-shrink-0" />
                      )}
                      <span className={met ? 'text-green-600' : 'text-gray-400'}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirmar Contraseña
                </label>
                <div className="relative">
                  <Lock
                    size={20}
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                    required
                    minLength={10}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((s) => !s)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                    aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {confirmPassword.length > 0 && (
                  <p
                    className={`text-xs mt-1.5 transition-colors duration-200 ${
                      passwordsMatch ? 'text-green-600' : 'text-red-500'
                    }`}
                  >
                    {passwordsMatch
                      ? 'Las contraseñas coinciden'
                      : 'Las contraseñas no coinciden'}
                  </p>
                )}
              </div>
            </>
          )}

          {isLogin && !isForgotPassword && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(true);
                  setError('');
                  setSuccessMessage('');
                }}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          <Turnstile
            onToken={handleCaptchaToken}
            onError={handleCaptchaError}
            onExpire={handleCaptchaExpire}
            resetSignal={captchaResetSignal}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {successMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={
              loading ||
              (hasSiteKey && !captchaValid) ||
              (!isLogin && !isForgotPassword && (!allRequirementsMet || !passwordsMatch))
            }
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition disabled:bg-blue-400"
          >
            {loading
              ? 'Procesando...'
              : isForgotPassword
              ? 'Enviar Instrucciones'
              : isLogin
              ? 'Iniciar Sesión'
              : 'Crear Cuenta'}
          </button>
        </form>

        <div className="mt-6 text-center space-y-2">
          {isForgotPassword ? (
            <button
              onClick={() => {
                setIsForgotPassword(false);
                setIsLogin(true);
                resetForm();
                resetCaptcha();
              }}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Volver a Iniciar Sesión
            </button>
          ) : (
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setIsForgotPassword(false);
                resetForm();
                resetCaptcha();
              }}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              {isLogin
                ? '¿No tienes cuenta? Regístrate'
                : '¿Ya tienes cuenta? Inicia sesión'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
