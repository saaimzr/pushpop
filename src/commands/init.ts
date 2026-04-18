import * as fs from 'fs';
import { ensureDirs, PUSHPOP_DIR, HOOKS_DIR } from '../lib/config.js';
import { installHooks, setGlobalHooksPath } from '../lib/hooks.js';
import { ok, fail } from '../lib/ui.js';

export function runInit(): void {
  const alreadyExists = fs.existsSync(PUSHPOP_DIR);

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
    ok('pushpop updated — hooks reinstalled');
    ok(`Hooks directory: ${HOOKS_DIR}`);
    return;
  }

  console.log('');
  ok(`Created ${PUSHPOP_DIR}`);
  ok(`Installed hooks to ${HOOKS_DIR}`);
  ok('Set git config --global core.hooksPath');
  console.log('');
  console.log('  pushpop is ready. Run pushpop to set up your first sound.');
  console.log('');
}
