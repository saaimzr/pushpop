import fetch from 'node-fetch';
import * as os from 'os';
import { getConfig, setConfig } from './config.js';
import { normalizeWrappedInput } from './input.js';

const POLAR_ACTIVATE_URL = 'https://api.polar.sh/v1/customer-portal/license-keys/activate';
export const POLAR_ORGANIZATION_ID = 'b3ed864a-0edc-4390-b3ed-c191848843e5';
export const POLAR_CHECKOUT_URL = 'https://buy.polar.sh/polar_cl_1tD9WmV9vx3FrAiTVfKNMDXcQvtLemfYhdzqH37KkAS';
export const FEEDBACK_EMAIL = 'saaim.raad3@gmail.com';
export const PRICE = '$1.49 USD';

export const FREE_TIER_LIMIT = 2;

interface PolarActivationResponse {
  id: string;
  label?: string;
  license_key?: {
    id?: string;
    key?: string;
    display_key?: string;
    status?: string;
    last_validated_at?: string | null;
    expires_at?: string | null;
  };
}

function getPolarErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;

  if (typeof record.detail === 'string') {
    return record.detail;
  }

  if (typeof record.error === 'string') {
    return record.error;
  }

  if (Array.isArray(record.detail)) {
    const messages = record.detail
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;

        const detailRecord = entry as Record<string, unknown>;
        return typeof detailRecord.msg === 'string' ? detailRecord.msg : null;
      })
      .filter((message): message is string => Boolean(message));

    if (messages.length > 0) {
      return messages.join('; ');
    }
  }

  return null;
}

export async function validateAndActivateLicense(key: string): Promise<void> {
  const trimmedKey = normalizeWrappedInput(key);

  if (!trimmedKey || trimmedKey.length < 8) {
    throw new Error('Invalid license key format');
  }

  let payload: unknown;

  try {
    const response = await fetch(POLAR_ACTIVATE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: trimmedKey,
        organization_id: POLAR_ORGANIZATION_ID,
        label: os.hostname(),
      }),
    });

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(
        getPolarErrorMessage(payload)
        ?? 'License key is invalid or has already reached its activation limit.',
      );
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name !== 'FetchError') {
      throw error;
    }

    throw new Error('Network error validating license. Check your internet connection.');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('License server returned an unexpected response. Try again.');
  }

  const data = payload as PolarActivationResponse;

  if (typeof data.id !== 'string' || data.id.length === 0) {
    throw new Error('License server returned an unexpected response. Try again.');
  }

  if (data.license_key?.status && data.license_key.status !== 'granted') {
    throw new Error('License key is not active.');
  }

  const nowIso = new Date().toISOString();
  setConfig({
    pro: true,
    licenseKey: trimmedKey,
    licenseActivationId: data.id,
    activatedAt: nowIso,
    lastValidatedAt:
      typeof data.license_key?.last_validated_at === 'string'
        ? data.license_key.last_validated_at
        : nowIso,
  });
}

export function isPro(): boolean {
  return getConfig().pro === true;
}
