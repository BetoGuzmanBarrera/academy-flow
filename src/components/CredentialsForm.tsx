import { useState, useEffect } from 'react';
import { Lock, Mail, User } from 'lucide-react';
import type { Service, Category } from '../lib/database.types';

interface CredentialsFormProps {
  service: Service;
  category: Category;
  onSubmit: (credentials: CredentialData) => void;
}

export interface CredentialData {
  serviceId: string;
  platformEmail?: string;
  platformPassword?: string;
  aleksAccount?: string;
  additionalInfo?: string;
}

export function CredentialsForm({ service, category, onSubmit }: CredentialsFormProps) {
  const [platformEmail, setPlatformEmail] = useState('');
  const [platformPassword, setPlatformPassword] = useState('');
  const [aleksAccount, setAleksAccount] = useState('');
  const [additionalInfo, setAdditionalInfo] = useState('');

  const isAleks = category.name.includes('ALEKS');
  const isCambridge = category.name === 'CAMBRIDGE ONE';
  const isCoursera = category.name === 'Coursera Excel';
  const isNationalGeographic = category.name === 'National Geographic Learning';

  const isValid = () => {
    if (isAleks) {
      return aleksAccount.trim().length > 0;
    }
    if (isCambridge || isCoursera || isNationalGeographic) {
      return platformEmail.trim().length > 0 && platformPassword.trim().length > 0;
    }
    return true;
  };

  useEffect(() => {
    if (isValid()) {
      onSubmit({
        serviceId: service.id,
        platformEmail: platformEmail || undefined,
        platformPassword: platformPassword || undefined,
        aleksAccount: aleksAccount || undefined,
        additionalInfo: additionalInfo || undefined,
      });
    }
  }, [platformEmail, platformPassword, aleksAccount, additionalInfo]);

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-4">
      <div className="flex items-start space-x-2 mb-4">
        <div className="bg-blue-100 rounded-full p-2">
          <Lock className="text-blue-600" size={16} />
        </div>
        <div>
          <h4 className="font-semibold text-gray-900 text-sm">{service.name}</h4>
          <p className="text-xs text-gray-600">Información de acceso requerida</p>
        </div>
      </div>

      {isAleks && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cuenta de ALEKS
          </label>
          <div className="relative">
            <User
              size={18}
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={aleksAccount}
              onChange={(e) => setAleksAccount(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="tu_usuario_aleks"
              required
            />
          </div>
        </div>
      )}

      {(isCambridge || isCoursera || isNationalGeographic) && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {isCambridge && 'Correo de Cambridge One'}
              {isCoursera && 'Correo de Coursera o Blackboard'}
              {isNationalGeographic && 'Correo de la Plataforma'}
            </label>
            <div className="relative">
              <Mail
                size={18}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              />
              <input
                type="email"
                value={platformEmail}
                onChange={(e) => setPlatformEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="tu@email.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contraseña
            </label>
            <div className="relative">
              <Lock
                size={18}
                className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              />
              <input
                type="password"
                value={platformPassword}
                onChange={(e) => setPlatformPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••••••"
                required
              />
            </div>
          </div>
        </>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Información Adicional (Opcional)
        </label>
        <textarea
          value={additionalInfo}
          onChange={(e) => setAdditionalInfo(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Cualquier detalle adicional que debamos saber..."
          rows={2}
        />
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-800">
          <strong>Nota:</strong> Esta información es necesaria para completar tu servicio.
          Toda tu información está protegida y será utilizada únicamente para prestarte el servicio solicitado.
        </p>
      </div>

      {isValid() && (
        <div className="flex items-center space-x-2 text-green-600">
          <div className="rounded-full bg-green-100 p-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <span className="text-sm font-medium">Información completa</span>
        </div>
      )}
    </div>
  );
}
