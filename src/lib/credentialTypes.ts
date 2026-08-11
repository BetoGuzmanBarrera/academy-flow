export type AccessMethod = 'aleks' | 'uvm_safekey' | 'coursera';

export type PlatformKey =
  | 'ALEKS UNIVERSIDAD'
  | 'COURSERA EXCEL'
  | 'CAMBRIDGE ONE'
  | 'FRANCÉS — BIBLIO EXOS';

export interface CredentialPayload {
  platform?: string;
  accessMethod?: AccessMethod;
  username?: string;
  email?: string;
  password?: string;
  additionalInfo?: string;
}

export interface CredentialData {
  serviceId: string;
  platform?: string;
  accessMethod?: AccessMethod;
  username?: string;
  email?: string;
  password?: string;
  additionalInfo?: string;
}

export interface LegacyCredentialPayload {
  platformEmail?: string;
  platformPassword?: string;
  aleksAccount?: string;
  additionalInfo?: string;
}

export function normalizePlatformName(name: string): string {
  return name.trim().toUpperCase();
}

export function isAleksPlatform(normalizedName: string): boolean {
  return normalizedName === 'ALEKS UNIVERSIDAD' || normalizedName === 'ALEKS PREPARATORIA';
}

export function isCourseraPlatform(normalizedName: string): boolean {
  return normalizedName === 'COURSERA EXCEL';
}

export function isCambridgePlatform(normalizedName: string): boolean {
  return normalizedName === 'CAMBRIDGE ONE';
}

export function isFrenchPlatform(normalizedName: string): boolean {
  return normalizedName === 'FRANCÉS — BIBLIO EXOS';
}

export function platformNeedsSelector(normalizedName: string): boolean {
  return isAleksPlatform(normalizedName) || isCourseraPlatform(normalizedName);
}

export function buildCredentialPayload(data: CredentialData): CredentialPayload {
  const payload: CredentialPayload = {
    platform: data.platform,
    additionalInfo: data.additionalInfo?.trim() || undefined,
  };

  if (data.accessMethod) {
    payload.accessMethod = data.accessMethod;
  }

  if (data.accessMethod === 'aleks' || data.accessMethod === 'coursera') {
    if (data.accessMethod === 'aleks') {
      payload.username = data.username?.trim() || undefined;
    } else {
      payload.email = data.email?.trim().toLowerCase() || undefined;
    }
    payload.password = data.password || undefined;
  } else if (data.accessMethod === 'uvm_safekey') {
    payload.email = data.email?.trim().toLowerCase() || undefined;
    payload.password = data.password || undefined;
  } else if (!data.accessMethod) {
    if (data.username) {
      payload.username = data.username.trim() || undefined;
    }
    if (data.email) {
      payload.email = data.email.trim().toLowerCase() || undefined;
    }
    payload.password = data.password || undefined;
  }

  return payload;
}
