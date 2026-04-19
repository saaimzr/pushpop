import * as fs from 'fs';
import * as path from 'path';
import { ensureDirs, HOOKS_DIR, PUSHPOP_DIR } from '../lib/config.js';
import { getHooksPathDiagnostics, installHooks, setGlobalHooksPath } from '../lib/hooks.js';
import { dim, fail, ok, warn } from '../lib/ui.js';

export interface InitNote {
  tone: 'success' | 'warning' | 'info';
  message: string;
}

export interface InitResult {
  notes: InitNote[];
}

function detectHusky(startDir: string): string | null {
  let current = path.resolve(startDir);

  for (let depth = 0; depth < 10; depth++) {
    if (fs.existsSync(path.join(current, '.husky'))) {
      return current;
    }

    const packageJsonPath = path.join(current, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const raw = fs.readFileSync(packageJsonPath, 'utf8');
        if (raw.includes('"husky"')) {
          return current;
        }
      } catch {
        // Ignore unreadable package.json files.
      }
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

function getRepoHookNotes(startDir = process.cwd()): InitNote[] {
  const notes: InitNote[] = [];
  const huskyRoot = detectHusky(startDir);
  const hooksPath = getHooksPathDiagnostics(startDir);
  const hasRepoLocalHooksPath = Boolean(hooksPath.repoRoot && hooksPath.localHooksPath);

  if (!huskyRoot && !hasRepoLocalHooksPath) {
    return notes;
  }

  if (huskyRoot) {
    notes.push({ tone: 'warning', message: `Husky detected near ${huskyRoot}` });
  }

  if (hasRepoLocalHooksPath && hooksPath.repoRoot) {
    notes.push({
      tone: 'warning',
      message: `Repo-local core.hooksPath detected in ${hooksPath.repoRoot}: ${hooksPath.localHooksPath}`,
    });
  }

  notes.push({
    tone: 'info',
    message: 'pushpop init only configures the global hooksPath. Repo-local hook setups may bypass it.',
  });

  if (hooksPath.overridesGlobal) {
    notes.push({
      tone: 'warning',
      message: 'This repo appears to override the global hooksPath, so pushpop may stay silent here.',
    });
  }

  return notes;
}

export function performInit(startDir = process.cwd()): InitResult {
  const alreadyExists = fs.existsSync(PUSHPOP_DIR);
  const notes: InitNote[] = [];

  if (process.platform === 'linux') {
    notes.push({
      tone: 'warning',
      message: 'Linux playback remains best-effort, but this release only officially supports Windows and macOS.',
    });
  }

  try {
    ensureDirs();
  } catch (error: unknown) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }

  try {
    installHooks();
  } catch (error: unknown) {
    throw new Error(`Failed to install hooks: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    setGlobalHooksPath();
  } catch (error: unknown) {
    throw new Error(`Failed to set git config: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (alreadyExists) {
    notes.push({ tone: 'success', message: 'pushpop updated - hooks reinstalled' });
    notes.push({ tone: 'success', message: `Hooks directory: ${HOOKS_DIR}` });
  } else {
    notes.push({ tone: 'success', message: `Created ${PUSHPOP_DIR}` });
    notes.push({ tone: 'success', message: `Installed hooks to ${HOOKS_DIR}` });
    notes.push({ tone: 'success', message: 'Set git config --global core.hooksPath' });
    notes.push({ tone: 'info', message: 'pushpop is ready. Run pushpop to set up your first sound.' });
  }

  notes.push(...getRepoHookNotes(startDir));
  return { notes };
}

function printNote(note: InitNote): void {
  if (note.tone === 'success') {
    ok(note.message);
    return;
  }

  if (note.tone === 'warning') {
    warn(note.message);
    return;
  }

  console.log(`  ${dim(note.message)}`);
}

export function runInit(): void {
  try {
    const result = performInit(process.cwd());
    console.log('');
    result.notes.forEach(printNote);
    console.log('');
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message.includes('Could not create ~/.pushpop directory')) {
        fail(error.message);
      } else if (error.message.includes('git')) {
        fail(`${error.message}\n  Is git installed?`);
      } else {
        fail(error.message);
      }
    } else {
      fail(String(error));
    }
    process.exit(1);
  }
}
