import * as fs from 'fs';
import * as readline from 'readline';
import { PUSHPOP_DIR } from '../lib/config.js';
import { unsetGlobalHooksPath, removeHooks } from '../lib/hooks.js';
import { ok, warn } from '../lib/ui.js';

function confirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('error', () => { rl.close(); resolve(false); });
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
  ok('Restored previous core.hooksPath in global git config');

  removeHooks();
  ok('Removed hook scripts');

  if (fs.existsSync(PUSHPOP_DIR)) {
    fs.rmSync(PUSHPOP_DIR, { recursive: true, force: true });
    ok(`Removed ${PUSHPOP_DIR}`);
  }

  console.log('\n  pushpop has been deactivated. Your git workflow is restored.');
  console.log('  Custom audio files in ~/.pushpop/custom were deleted — back up first if you want them.\n');
  console.log('  The pushpop command is still installed globally. To remove it entirely, run:');
  console.log('    npm uninstall -g pushpopper\n');
  warn('If you run `pushpop` again without uninstalling the npm package, it will prompt you to re-run setup.');
}
