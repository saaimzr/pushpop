import * as fs from 'fs';
import * as path from 'path';
import { ensureDirs, PUSHPOP_DIR, HOOKS_DIR } from '../lib/config.js';
import { installHooks, setGlobalHooksPath } from '../lib/hooks.js';
import { ok, fail, warn, dim, purple } from '../lib/ui.js';

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

function printHuskyHint(): void {
  const huskyRoot = detectHusky(process.cwd());
  if (!huskyRoot) return;

  console.log('');
  warn(`Husky detected near ${huskyRoot}`);
  console.log(`  ${dim('If your repo uses Husky hooks, add pushpop to the relevant file:')}`);
  console.log(`    ${purple('pushpop play --event commit 2>/dev/null')}`);
  console.log(`  ${dim('Use `--event push` inside .husky/pre-push if you want push audio too.')}`);
}

export function runInit(): void {
  const alreadyExists = fs.existsSync(PUSHPOP_DIR);

  if (process.platform === 'linux') {
    warn('Linux playback is supported when a local audio backend is available. Headless servers stay silent.');
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
    printHuskyHint();
    return;
  }

  console.log('');
  ok(`Created ${PUSHPOP_DIR}`);
  ok(`Installed hooks to ${HOOKS_DIR}`);
  ok('Set git config --global core.hooksPath');
  printHuskyHint();
  console.log('');
  console.log('  pushpop is ready. Run pushpop to set up your first sound.');
  console.log('');
}
