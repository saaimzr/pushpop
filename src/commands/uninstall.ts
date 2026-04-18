import * as fs from 'fs';
import * as readline from 'readline';
import { PUSHPOP_DIR } from '../lib/config.js';
import { unsetGlobalHooksPath, removeHooks } from '../lib/hooks.js';
import { ok, warn } from '../lib/ui.js';

function confirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'y');
    });
  });
}

export async function runUninstall(): Promise<void> {
  const yes = await confirm('Remove pushpop hooks and global git config? (y/N) ');

  if (!yes) {
    console.log('  Aborted.');
    return;
  }

  unsetGlobalHooksPath();
  ok('Removed core.hooksPath from global git config');

  removeHooks();
  ok('Removed hook scripts');

  if (fs.existsSync(PUSHPOP_DIR)) {
    fs.rmSync(PUSHPOP_DIR, { recursive: true, force: true });
    ok(`Removed ${PUSHPOP_DIR}`);
  }

  console.log('\n  pushpop has been uninstalled. Your git workflow is restored.\n');
  warn('Your custom audio files have been deleted. Back them up first if you want to keep them.');
}
