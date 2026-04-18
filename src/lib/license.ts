import fetch from 'node-fetch';
import { getConfig, setConfig } from './config.js';

const LS_ACTIVATE_URL = 'https://api.lemonsqueezy.com/v1/licenses/activate';
export const LEMONSQUEEZY_URL = 'https://pushpop.lemonsqueezy.com/buy/YOUR_PRODUCT_ID'; // set before publishing
export const PRICE = '$1.29 USD';

export const FREE_TIER_LIMIT = 2; // custom uploads only; built-ins are unlimited
const DEV_UPLOAD_BYPASS_ENV = 'PUSHPOP_DEV_BYPASS_UPLOAD_LIMIT';

interface LemonSqueezyResponse {
  activated: boolean;
  error: string | null;
  license_key?: {
    status: string;
    key: string;
  };
  instance?: {
    id: string;
    name: string;
  };
}

export async function validateAndActivateLicense(key: string): Promise<void> {
  const trimmedKey = key.trim();

  if (!trimmedKey || trimmedKey.length < 8) {
    throw new Error('Invalid license key format');
  }

  let data: LemonSqueezyResponse;

  try {
    const res = await fetch(LS_ACTIVATE_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        license_key: trimmedKey,
        instance_name: 'pushpop-cli',
      }),
    });

    if (!res.ok && res.status !== 400) {
      throw new Error('Could not reach the license server. Check your internet connection.');
    }

    try {
      data = (await res.json()) as LemonSqueezyResponse;
    } catch {
      throw new Error('License server returned an unexpected response. Try again.');
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes('license server')) throw e;
    throw new Error('Network error validating license. Check your internet connection.');
  }

  if (!data.activated) {
    throw new Error(data.error ?? 'License key is invalid or has already reached its activation limit.');
  }

  setConfig({
    pro: true,
    licenseKey: trimmedKey,
    licenseInstanceId: data.instance?.id,
    activatedAt: new Date().toISOString(),
  });
}

export function isPro(): boolean {
  return getConfig().pro === true;
}

// DEV ONLY: remove before release.
export function isDevUploadLimitBypassed(): boolean {
  return process.env[DEV_UPLOAD_BYPASS_ENV] === '1';
}

export function hasUnlimitedUploads(): boolean {
  return isPro() || isDevUploadLimitBypassed();
}
