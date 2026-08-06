import { useEffect, useRef, useState } from 'react';

interface TurnstileProps {
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: (errorCode: string) => void;
  resetSignal?: number;
}

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: (errorCode: string) => void;
  theme?: 'light' | 'dark' | 'auto';
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SCRIPT_ID = 'cf-turnstile-script';

let scriptLoadPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar el script de Turnstile')));
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error('No se pudo cargar el script de Turnstile'));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export function Turnstile({ onToken, onExpire, onError, resetSignal }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'expired'>('loading');
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!siteKey) {
      setStatus('error');
      setErrorCode('missing_site_key');
      onTokenRef.current('');
      return;
    }

    let cancelled = false;
    setStatus('loading');

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;

        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (token: string) => {
            console.info('Turnstile verification completed');
            setStatus('ready');
            setErrorCode(null);
            onTokenRef.current(token);
          },
          'expired-callback': () => {
            setStatus('expired');
            onTokenRef.current('');
            onExpireRef.current?.();
          },
          'error-callback': (errCode: string) => {
            console.error('Turnstile error code:', errCode);
            setErrorCode(errCode);
            setStatus('error');
            onTokenRef.current('');
            onErrorRef.current?.(errCode);
          },
          theme: 'light',
        });
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
          onTokenRef.current('');
        }
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  const firstResetRef = useRef(true);
  useEffect(() => {
    if (firstResetRef.current) {
      firstResetRef.current = false;
      return;
    }
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
      setStatus('loading');
      setErrorCode(null);
      onTokenRef.current('');
    }
  }, [resetSignal]);

  if (!siteKey) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
        CAPTCHA no configurado. Falta la variable VITE_TURNSTILE_SITE_KEY.
      </div>
    );
  }

  return (
    <div>
      <div ref={containerRef} className="min-h-[65px]" />
      {status === 'loading' && (
        <p className="text-xs text-gray-500 mt-1">Cargando CAPTCHA…</p>
      )}
      {status === 'expired' && (
        <p className="text-xs text-amber-600 mt-1">
          El CAPTCHA expiró. Complétalo de nuevo.
        </p>
      )}
      {status === 'error' && (
        <p className="text-xs text-red-600 mt-1">
          No se pudo cargar el CAPTCHA (código: {errorCode ?? 'desconocido'}). Recarga la página e inténtalo de nuevo.
        </p>
      )}
    </div>
  );
}
