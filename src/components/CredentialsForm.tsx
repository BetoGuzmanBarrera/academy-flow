import { useState, useEffect } from 'react';
import { Lock, Mail, User, Eye, EyeOff, Info } from 'lucide-react';
import type { Service, Category } from '../lib/database.types';
export type {
  CredentialData,
  AccessMethod,
} from '../lib/credentialTypes';
import {
  type CredentialData,
  type AccessMethod,
  normalizePlatformName,
  isAleksPlatform,
  isCourseraPlatform,
  isCambridgePlatform,
  isFrenchPlatform,
  platformNeedsSelector,
} from '../lib/credentialTypes';

interface CredentialsFormProps {
  service: Service;
  category: Category;
  onSubmit: (credentials: CredentialData) => void;
}

export function CredentialsForm({ service, category, onSubmit }: CredentialsFormProps) {
  const normalized = normalizePlatformName(category.name);
  const needsSelector = platformNeedsSelector(normalized);
  const isAleks = isAleksPlatform(normalized);
  const isCoursera = isCourseraPlatform(normalized);
  const isCambridge = isCambridgePlatform(normalized);
  const isFrench = isFrenchPlatform(normalized);

  const [accessMethod, setAccessMethod] = useState<AccessMethod>(
    isAleks ? 'aleks' : isCoursera ? 'coursera' : 'aleks',
  );
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (needsSelector) {
      setUsername('');
      setEmail('');
      setPassword('');
    }
  }, [accessMethod, needsSelector]);

  const isValid = () => {
    if (isAleks) {
      if (accessMethod === 'aleks') {
        return username.trim().length > 0 && password.length > 0;
      }
      if (accessMethod === 'uvm_safekey') {
        return email.trim().length > 0 && password.length > 0;
      }
      return false;
    }
    if (isCoursera) {
      if (accessMethod === 'coursera') {
        return email.trim().length > 0 && password.length > 0;
      }
      if (accessMethod === 'uvm_safekey') {
        return email.trim().length > 0 && password.length > 0;
      }
      return false;
    }
    if (isCambridge) {
      return email.trim().length > 0 && password.length > 0;
    }
    if (isFrench) {
      return username.trim().length > 0 && password.length > 0;
    }
    return false;
  };

  useEffect(() => {
    if (isValid()) {
      const data: CredentialData = {
        serviceId: service.id,
        platform: normalized,
        accessMethod: needsSelector ? accessMethod : undefined,
        username: username || undefined,
        email: email || undefined,
        password: password || undefined,
        additionalInfo: additionalInfo || undefined,
      };
      onSubmit(data);
    }
  }, [username, email, password, additionalInfo, accessMethod]);

  const inputClass =
    'w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const textInputClass =
    'w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
      <div className="flex items-start space-x-2 pb-3 border-b border-gray-100">
        <div className="bg-blue-100 rounded-full p-2 shrink-0">
          <Lock className="text-blue-600" size={16} />
        </div>
        <div>
          <h4 className="font-semibold text-gray-900 text-sm">{service.name}</h4>
          <p className="text-xs text-gray-600">Información de acceso requerida</p>
        </div>
      </div>

      {needsSelector && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Método de acceso
          </label>
          <div className="space-y-2">
            {isAleks && (
              <>
                <label
                  className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition ${
                    accessMethod === 'aleks'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name={`method-${service.id}`}
                    value="aleks"
                    checked={accessMethod === 'aleks'}
                    onChange={() => setAccessMethod('aleks')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <User size={18} className="text-gray-500" />
                  <span className="text-sm font-medium text-gray-900">Cuenta ALEKS</span>
                </label>
                <label
                  className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition ${
                    accessMethod === 'uvm_safekey'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name={`method-${service.id}`}
                    value="uvm_safekey"
                    checked={accessMethod === 'uvm_safekey'}
                    onChange={() => setAccessMethod('uvm_safekey')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <Mail size={18} className="text-gray-500" />
                  <span className="text-sm font-medium text-gray-900">UVM / SafeKey</span>
                </label>
              </>
            )}
            {isCoursera && (
              <>
                <label
                  className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition ${
                    accessMethod === 'uvm_safekey'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name={`method-${service.id}`}
                    value="uvm_safekey"
                    checked={accessMethod === 'uvm_safekey'}
                    onChange={() => setAccessMethod('uvm_safekey')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <Mail size={18} className="text-gray-500" />
                  <span className="text-sm font-medium text-gray-900">UVM / SafeKey</span>
                </label>
                <label
                  className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition ${
                    accessMethod === 'coursera'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name={`method-${service.id}`}
                    value="coursera"
                    checked={accessMethod === 'coursera'}
                    onChange={() => setAccessMethod('coursera')}
                    className="w-4 h-4 text-blue-600"
                  />
                  <Mail size={18} className="text-gray-500" />
                  <span className="text-sm font-medium text-gray-900">Cuenta Coursera</span>
                </label>
              </>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {isAleks && accessMethod === 'aleks' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de usuario
            </label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
                placeholder="tu_usuario_aleks"
                autoComplete="username"
                required
              />
            </div>
          </div>
        )}

        {isAleks && accessMethod === 'uvm_safekey' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Correo institucional
              </label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="tu@uvm.edu.mx"
                  autoComplete="email"
                  required
                />
              </div>
            </div>
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <Info size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800">
                Si SafeKey solicita una verificación adicional, el código o aprobación se
                solicitará únicamente cuando sea necesario. No se almacena en Academy Flow.
              </p>
            </div>
          </>
        )}

        {isCoursera && accessMethod === 'uvm_safekey' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Correo institucional
            </label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="tu@uvm.edu.mx"
                autoComplete="email"
                required
              />
            </div>
          </div>
        )}

        {isCoursera && accessMethod === 'coursera' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="tu@email.com"
                autoComplete="email"
                required
              />
            </div>
          </div>
        )}

        {isCambridge && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Correo electrónico
            </label>
            <div className="relative">
              <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="tu@email.com"
                autoComplete="email"
                required
              />
            </div>
          </div>
        )}

        {isFrench && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Usuario
            </label>
            <div className="relative">
              <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
                placeholder="tu_usuario"
                autoComplete="username"
                required
              />
            </div>
          </div>
        )}

        {(isAleks || isCoursera || isCambridge || isFrench) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contraseña
            </label>
            <div className="relative">
              <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Información adicional (opcional)
        </label>
        <textarea
          value={additionalInfo}
          onChange={(e) => setAdditionalInfo(e.target.value)}
          className={textInputClass}
          placeholder="Cualquier detalle adicional que debamos saber..."
          rows={2}
        />
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-800">
          <strong>Nota:</strong> Esta información es necesaria para completar tu servicio.
          Toda tu información está protegida y será utilizada únicamente para prestarte el
          servicio solicitado.
        </p>
      </div>

      {isValid() && (
        <div className="flex items-center space-x-2 text-green-600">
          <div className="rounded-full bg-green-100 p-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <span className="text-sm font-medium">Información completa</span>
        </div>
      )}
    </div>
  );
}
