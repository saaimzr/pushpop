import Conf from 'conf';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SoundRef {
  type: 'custom' | 'builtin';
  name: string;   // display name, e.g. "Classic Tag"
  file: string;   // custom: "my-jingle.mp3" | builtin: "rap-hiphop/classic-tag.mp3"
}

export interface Assignments {
  commit?: SoundRef;
  push?: SoundRef;
}

export interface PushpopConfig {
  pro: boolean;
  licenseKey?: string;
  licenseInstanceId?: string;
  activatedAt?: string;
  assignments: Assignments;
}

const conf = new Conf<PushpopConfig>({
  projectName: 'pushpop',
  defaults: {
    pro: false,
    assignments: {},
  },
});

export const PUSHPOP_DIR = path.join(os.homedir(), '.pushpop');
export const CUSTOM_DIR = path.join(PUSHPOP_DIR, 'custom');
export const HOOKS_DIR = path.join(PUSHPOP_DIR, 'hooks');

export function getConfig(): PushpopConfig {
  return {
    pro: conf.get('pro'),
    licenseKey: conf.get('licenseKey'),
    licenseInstanceId: conf.get('licenseInstanceId'),
    activatedAt: conf.get('activatedAt'),
    assignments: conf.get('assignments') ?? {},
  };
}

export function setConfig(updates: Partial<PushpopConfig>): void {
  for (const [key, value] of Object.entries(updates)) {
    conf.set(key as keyof PushpopConfig, value);
  }
}

export function getCustomUploadCount(): number {
  if (!fs.existsSync(CUSTOM_DIR)) return 0;
  return fs
    .readdirSync(CUSTOM_DIR)
    .filter((f) => /\.(mp3|wav|m4a)$/i.test(f))
    .length;
}

export function getCustomSoundFiles(): string[] {
  if (!fs.existsSync(CUSTOM_DIR)) return [];
  return fs
    .readdirSync(CUSTOM_DIR)
    .filter((f) => /\.(mp3|wav|m4a)$/i.test(f))
    .sort();
}

export function ensureDirs(): void {
  try {
    fs.mkdirSync(CUSTOM_DIR, { recursive: true });
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Could not create ~/.pushpop directory. Check permissions.\n  ${msg}`);
  }
}
