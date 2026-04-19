import * as fs from 'fs';
import * as path from 'path';
import { ensureDirs, PUSHPOP_DIR, HOOKS_DIR } from '../lib/config.js';
import { getHooksPathDiagnostics, installHooks, setGlobalHooksPath } from '../lib/hooks.js';
import { ok, fail, warn, dim } from '../lib/ui.js';

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
        // ignore unreadable package.json files
      }
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

function printRepoHookWarning(): void {
  const huskyRoot = detectHusky(process.cwd());
  const hooksPath = getHooksPathDiagnostics(process.cwd());
  const hasRepoLocalHooksPath = Boolean(hooksPath.repoRoot && hooksPath.localHooksPath);

  if (!huskyRoot && !hasRepoLocalHooksPath) {
    return;
  }

  console.log('');
  if (huskyRoot) {
    warn(`Husky detected near ${huskyRoot}`);
  }

  if (hasRepoLocalHooksPath && hooksPath.repoRoot) {
    warn(`Repo-local core.hooksPath detected in ${hooksPath.repoRoot}: ${hooksPath.localHooksPath}`);
  }

  console.log(
    `  ${dim('pushpop init only configures the global hooksPath. Repo-local hook setups may bypass it.')}`
  );

  if (hooksPath.overridesGlobal) {
    console.log(
      `  ${dim('This repo appears to override the global hooksPath, so pushpop may stay silent here.')}`
    );
  }
}

export function runInit(): void {
  const alreadyExists = fs.existsSync(PUSHPOP_DIR);

  if (process.platform === 'linux') {
    warn('Linux playback remains best-effort, but this release only officially supports Windows and macOS.');
  }

  try {
    ensureDirs();
  } catch (e: unknown) {
    fail(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  try {
    installHooks();
  } catch (e: unknown) {
    fail(`Failed to install hooks: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  try {
    setGlobalHooksPath();
  } catch (e: unknown) {
    fail(`Failed to set git config: ${e instanceof Error ? e.message : String(e)}\n  Is git installed?`);
    process.exit(1);
  }

  if (alreadyExists) {
    ok('pushpop updated - hooks reinstalled');
    ok(`Hooks directory: ${HOOKS_DIR}`);
    printRepoHookWarning();
    return;
  }

  console.log('');
  ok(`Created ${PUSHPOP_DIR}`);
  ok(`Installed hooks to ${HOOKS_DIR}`);
  ok('Set git config --global core.hooksPath');
  printRepoHookWarning();
  console.log('');
  console.log('  pushpop is ready. Run pushpop to set up your first sound.');
  console.log('');
}
