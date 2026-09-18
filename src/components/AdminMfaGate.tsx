import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { KeyRound, Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Alert, Badge, Button, Card, CardContent, Input } from './ui';
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
      <div className="flex min-h-[28rem] items-center justify-center px-4" role="status" aria-live="polite">
        <div className="text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-academy-primary">
            <Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />
          </span>
          <p className="mt-4 font-medium text-academy-text">Verificando seguridad…</p>
        </div>
      </div>
    );
  }

  if (!isAdmin || !userId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20">
        <Card>
          <CardContent className="py-12 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-academy-danger">
              <ShieldAlert className="h-8 w-8" aria-hidden="true" />
            </span>
            <Badge variant="danger" className="mt-5">Área administrativa</Badge>
            <h1 className="mt-4 text-af-h1 text-academy-text">Acceso restringido</h1>
            <p className="mt-3 text-academy-text-muted">
              Esta sección solo está disponible para administradores.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20">
        <Card>
          <CardContent className="space-y-5 py-10 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-700">
              <ShieldAlert className="h-7 w-7" aria-hidden="true" />
            </span>
            <Alert variant="warning" role="alert">
              {error || 'No se pudo verificar el estado de seguridad.'}
            </Alert>
            <Button onClick={() => void refreshMfaStatus()}>Reintentar</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const decision = getAdminMfaGateDecision(isAdmin, status);
  if (decision === 'allowed') {
    return (
      <>
        {notice && (
          <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
            <Alert variant="success" role="status">{notice}</Alert>
          </div>
        )}
        {children}
      </>
    );
  }

  const factorId = enrollment?.factorId ?? status.verifiedTotpFactor?.id ?? null;

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <Card>
        <CardContent className="p-6 sm:p-8">
          <span className="flex h-14 w-14 items-center justify-center rounded-af-lg bg-blue-50 text-academy-primary">
            <KeyRound className="h-7 w-7" aria-hidden="true" />
          </span>
          <Badge variant="primary" className="mt-5">Verificación administrativa</Badge>
          <h1 className="mt-4 text-af-h2 text-academy-text">
            {decision === 'enroll'
              ? 'Configura la verificación en dos pasos'
              : 'Verifica tu identidad'}
          </h1>
          <p className="mt-3 text-academy-text-muted">
            {decision === 'enroll'
              ? 'Para proteger las acciones administrativas, vincula una aplicación de autenticación.'
              : 'Ingresa el código de tu aplicación de autenticación para abrir el panel administrativo.'}
          </p>

          {decision === 'enroll' && !enrollment && (
            <Button
              className="mt-6 w-full"
              size="lg"
              onClick={() => void handleEnroll()}
              loading={submitting}
            >
              {submitting ? 'Preparando…' : 'Configurar autenticador'}
            </Button>
          )}

          {enrollment && (
            <div className="my-6 space-y-4 rounded-af-lg border border-academy-border bg-academy-subtle p-4">
              <img
                src={enrollment.qrCode}
                alt="Código QR para configurar el autenticador"
                className="mx-auto h-56 w-56 rounded-af-md border border-academy-border bg-white p-2"
              />
              <div>
                <p className="mb-1 text-af-label text-academy-text-muted">Clave de configuración manual</p>
                <code className="block break-all rounded-af-md bg-white p-3 text-sm" aria-label="Clave TOTP">
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
              className="mt-6 space-y-4"
            >
              <Input
                label="Código de 6 dígitos"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                className="text-center tracking-[0.35em]"
              />
              <Button
                type="submit"
                size="lg"
                loading={submitting}
                disabled={code.length !== 6}
                className="w-full"
              >
                {submitting ? 'Verificando…' : 'Verificar'}
              </Button>
            </form>
          )}

          {error && <Alert className="mt-4" variant="error" role="alert">{error}</Alert>}
        </CardContent>
      </Card>
    </div>
  );
}
