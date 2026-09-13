import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { KeyRound, Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  getAdminMfaGateDecision,
  getAdminMfaStatus,
  type AdminMfaStatus,
} from '../lib/adminMfa';

interface AdminMfaGateProps {
  authLoading: boolean;
  isAdmin: boolean;
  userId: string | null;
  children: ReactNode;
}

interface TotpEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

function verificationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('expired') ? 'Código expirado' : 'Código inválido';
}

export function AdminMfaGate({ authLoading, isAdmin, userId, children }: AdminMfaGateProps) {
  const [status, setStatus] = useState<AdminMfaStatus | null>(null);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshMfaStatus = useCallback(async () => {
    if (!isAdmin || !userId) {
      setStatus(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      setStatus(await getAdminMfaStatus(supabase.auth.mfa));
    } catch {
      setStatus(null);
      setError('No se pudo verificar el estado de seguridad. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, userId]);

  useEffect(() => {
    void refreshMfaStatus();
  }, [refreshMfaStatus]);

  const handleEnroll = async () => {
    setSubmitting(true);
    setError('');

    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: 'Academy Flow',
      });

      if (enrollError || !data || data.type !== 'totp') {
        setError('No se pudo configurar la verificación en dos pasos. Inténtalo de nuevo.');
        return;
      }

      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch {
      setError('No se pudo configurar la verificación en dos pasos. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (factorId: string) => {
    const normalizedCode = code.trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      setError('Código inválido');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError || !challenge) {
        setError(verificationErrorMessage(challengeError));
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: normalizedCode,
      });

      if (verifyError) {
        setError(verificationErrorMessage(verifyError));
        return;
      }

      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        setError('No se pudo actualizar la sesión verificada. Inténtalo de nuevo.');
        return;
      }

      const nextStatus = await getAdminMfaStatus(supabase.auth.mfa);
      if (nextStatus.currentLevel !== 'aal2') {
        setError('No se pudo actualizar la sesión verificada. Inténtalo de nuevo.');
      } else {
        setStatus(nextStatus);
        setEnrollment(null);
        setCode('');
        setNotice('Sesión verificada');
      }
    } catch {
      setError('No se pudo actualizar la sesión verificada. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || (isAdmin && loading)) {
    return (
      <div className="min-h-64 flex items-center justify-center">
        <Loader2 size={40} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (!isAdmin || !userId) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <ShieldAlert size={64} className="mx-auto text-red-500 mb-4" />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Acceso restringido</h1>
        <p className="text-gray-600">Esta sección solo está disponible para administradores.</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <ShieldAlert size={56} className="mx-auto text-yellow-500 mb-4" />
        <p className="text-gray-700 mb-5">{error || 'No se pudo verificar el estado de seguridad.'}</p>
        <button
          type="button"
          onClick={() => void refreshMfaStatus()}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const decision = getAdminMfaGateDecision(isAdmin, status);
  if (decision === 'allowed') {
    return (
      <>
        {notice && (
          <div className="max-w-7xl mx-auto px-4 pt-6 text-sm font-medium text-green-700">
            {notice}
          </div>
        )}
        {children}
      </>
    );
  }

  const factorId = enrollment?.factorId ?? status.verifiedTotpFactor?.id ?? null;

  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <div className="bg-white border rounded-2xl shadow-sm p-6 sm:p-8">
        <KeyRound size={48} className="text-blue-600 mb-5" />
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {decision === 'enroll'
            ? 'Configura la verificación en dos pasos'
            : 'Verifica tu identidad'}
        </h1>
        <p className="text-gray-600 mb-6">
          {decision === 'enroll'
            ? 'Para proteger las acciones administrativas, vincula una aplicación de autenticación.'
            : 'Ingresa el código de tu aplicación de autenticación para abrir el panel administrativo.'}
        </p>

        {decision === 'enroll' && !enrollment && (
          <button
            type="button"
            onClick={() => void handleEnroll()}
            disabled={submitting}
            className="w-full bg-blue-600 text-white px-5 py-3 rounded-lg disabled:opacity-50"
          >
            {submitting ? 'Preparando…' : 'Configurar autenticador'}
          </button>
        )}

        {enrollment && (
          <div className="space-y-4 mb-6">
            <img
              src={enrollment.qrCode}
              alt="Código QR para configurar el autenticador"
              className="w-56 h-56 mx-auto border rounded-lg p-2"
            />
            <div>
              <p className="text-sm text-gray-600 mb-1">Clave de configuración manual</p>
              <code className="block break-all rounded-lg bg-gray-100 p-3 text-sm" aria-label="Clave TOTP">
                {enrollment.secret}
              </code>
            </div>
          </div>
        )}

        {factorId && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleVerify(factorId);
            }}
            className="space-y-4"
          >
            <label className="block">
              <span className="block text-sm font-medium text-gray-700 mb-1">Código de 6 dígitos</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="w-full border rounded-lg px-4 py-3 tracking-[0.35em] text-center"
              />
            </label>
            <button
              type="submit"
              disabled={submitting || code.length !== 6}
              className="w-full bg-blue-600 text-white px-5 py-3 rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Verificando…' : 'Verificar'}
            </button>
          </form>
        )}

        {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}
      </div>
    </div>
  );
}
