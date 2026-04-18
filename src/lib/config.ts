import Conf from 'conf';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface SoundRef {
  type: 'custom' | 'builtin';
  name: string;
  file: string;
}

export interface Assignments {
  commit?: SoundRef;
  push?: SoundRef;
}

export interface PushpopConfig {
  pro: boolean;
  licenseKey?: string;
  licenseActivationId?: string;
  activatedAt?: string;
  lastValidatedAt?: string;
  assignments: Assignments;
  volume?: number;
  lifetimeCustomUploads?: number;
}

export const DEFAULT_VOLUME = 70;
export const PUSHPOP_DIR = path.join(os.homedir(), '.pushpop');
export const CONFIG_PATH = path.join(PUSHPOP_DIR, 'config.json');
export const CUSTOM_DIR = path.join(PUSHPOP_DIR, 'custom');
export const HOOKS_DIR = path.join(PUSHPOP_DIR, 'hooks');
export const LEGACY_CONFIG_PATH = getLegacyConfigPath();

const DEFAULT_CONFIG: PushpopConfig = {
  pro: false,
  assignments: {},
  volume: DEFAULT_VOLUME,
  lifetimeCustomUploads: 0,
};

const conf = new Conf<PushpopConfig>({
  cwd: PUSHPOP_DIR,
  configName: 'config',
  clearInvalidConfig: true,
  defaults: DEFAULT_CONFIG,
});

migrateLegacyConfigIfNeeded();
seedLifetimeCustomUploadsIfNeeded();

function getLegacyConfigPath(): string {
  const legacyProjectName = 'pushpop-nodejs';

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Preferences', legacyProjectName, 'config.json');
  }

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, legacyProjectName, 'Config', 'config.json');
  }

  const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(configHome, legacyProjectName, 'config.json');
}

function normalizeVolume(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isSoundRef(value: unknown): value is SoundRef {
  if (!value || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;
  return (
    (record.type === 'custom' || record.type === 'builtin')
    && typeof record.name === 'string'
    && typeof record.file === 'string'
  );
}

function normalizeAssignments(value: unknown): Assignments {
  if (!value || typeof value !== 'object') return {};

  const record = value as Record<string, unknown>;
  const assignments: Assignments = {};

  if (isSoundRef(record.commit)) assignments.commit = record.commit;
  if (isSoundRef(record.push)) assignments.push = record.push;

  return assignments;
}

function readLegacyConfig(): Partial<PushpopConfig> | null {
  if (!fs.existsSync(LEGACY_CONFIG_PATH)) return null;

  try {
    const raw = fs.readFileSync(LEGACY_CONFIG_PATH, 'utf8');
    return JSON.parse(raw) as Partial<PushpopConfig>;
  } catch {
    return null;
  }
}

function migrateLegacyConfigIfNeeded(): void {
  if (fs.existsSync(CONFIG_PATH)) return;

  const legacy = readLegacyConfig();
  if (!legacy) return;

  const assignments = normalizeAssignments(legacy.assignments);
  const volume = normalizeVolume(legacy.volume);
  const migrated: Partial<PushpopConfig> = {};

  if (assignments.commit || assignments.push) {
    migrated.assignments = assignments;
  }

  if (volume !== undefined) {
    migrated.volume = volume;
  }

  if (Object.keys(migrated).length > 0) {
    conf.set(migrated);
  }

  deleteLegacyConfigFile();
}

function seedLifetimeCustomUploadsIfNeeded(): void {
  if (conf.has('lifetimeCustomUploads')) return;

  const currentCustomSounds = getCustomSoundFiles().length;
  if (currentCustomSounds > 0) {
    conf.set('lifetimeCustomUploads', currentCustomSounds);
  }
}

export function deleteLegacyConfigFile(): void {
  try {
    fs.rmSync(LEGACY_CONFIG_PATH, { force: true });
  } catch {
    // Ignore cleanup failures; uninstall handles this best-effort as well.
  }
}

export function getConfig(): PushpopConfig {
  const storedVolume = normalizeVolume(conf.get('volume'));
  const storedLifetime = conf.get('lifetimeCustomUploads');

  return {
    pro: conf.get('pro') === true,
    licenseKey: conf.get('licenseKey'),
    licenseActivationId: conf.get('licenseActivationId'),
    activatedAt: conf.get('activatedAt'),
    lastValidatedAt: conf.get('lastValidatedAt'),
    assignments: normalizeAssignments(conf.get('assignments')),
    volume: storedVolume ?? DEFAULT_VOLUME,
    lifetimeCustomUploads:
      typeof storedLifetime === 'number' && Number.isFinite(storedLifetime)
        ? Math.max(0, Math.floor(storedLifetime))
        : 0,
  };
}

export function getVolume(): number {
  return getConfig().volume ?? DEFAULT_VOLUME;
}

export function setConfig(updates: Partial<PushpopConfig>): void {
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      conf.delete(key as keyof PushpopConfig);
    } else {
      conf.set(key as keyof PushpopConfig, value);
    }
  }
}

export function getLifetimeCustomUploads(): number {
  return getConfig().lifetimeCustomUploads ?? 0;
}

export function incrementLifetimeCustomUploads(): number {
  const nextValue = getLifetimeCustomUploads() + 1;
  conf.set('lifetimeCustomUploads', nextValue);
  return nextValue;
}

export function clearAssignmentsForCustomFile(fileName: string): void {
  const { assignments } = getConfig();
  let changed = false;
  const nextAssignments: Assignments = { ...assignments };

  if (assignments.commit?.type === 'custom' && assignments.commit.file === fileName) {
    nextAssignments.commit = undefined;
    changed = true;
  }

  if (assignments.push?.type === 'custom' && assignments.push.file === fileName) {
    nextAssignments.push = undefined;
    changed = true;
  }

  if (changed) {
    setConfig({ assignments: nextAssignments });
  }
}

export function getCustomSoundFiles(): string[] {
  if (!fs.existsSync(CUSTOM_DIR)) return [];
  return fs
    .readdirSync(CUSTOM_DIR)
    .filter((fileName) => /\.(mp3|wav|m4a)$/i.test(fileName))
    .sort();
}

export function ensureDirs(): void {
  try {
    fs.mkdirSync(CUSTOM_DIR, { recursive: true });
    fs.mkdirSync(HOOKS_DIR, { recursive: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not create ~/.pushpop directory. Check permissions.\n  ${message}`);
  }
}
