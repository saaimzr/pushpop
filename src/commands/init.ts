import * as fs from 'fs';
import { ensureDirs, PUSHPOP_DIR, HOOKS_DIR } from '../lib/config.js';
import { installHooks, setGlobalHooksPath } from '../lib/hooks.js';
import { ok } from '../lib/ui.js';

export function runInit(): void {
  const alreadyExists = fs.existsSync(PUSHPOP_DIR);

  ensureDirs();
  installHooks();
  setGlobalHooksPath();

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
