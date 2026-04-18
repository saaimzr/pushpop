import * as fs from 'fs';
import * as readline from 'readline';
import { PUSHPOP_DIR } from '../lib/config.js';
import { unsetGlobalHooksPath, removeHooks } from '../lib/hooks.js';
import { scheduleSelfUninstall } from '../lib/self-uninstall.js';
import { purple, white, dim, exitClean, exitAltScreen } from '../lib/ui.js';

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

function check(label: string): void {
  console.log(`  ${label.padEnd(32)} ${purple('✓')}`);
}

export async function runUninstall(): Promise<void> {
  const yes = await confirm('Remove pushpop hooks, config, and the CLI itself? (y/N) ');

  if (!yes) {
    console.log('  Aborted.');
    return;
  }

  // Leave the alt screen so the goodbye block stays in the user's terminal
  // scrollback after pushpop exits. If the dashboard didn't open alt screen
  // (e.g. `pushpop uninstall` invoked directly from CLI), this is a no-op.
  exitAltScreen();

  console.log('');
  console.log(`   ${purple('♪')}    ${white('Goodbye from pushpop')}`);
  console.log(`         ${dim('Thanks for shipping with us.')}`);
  console.log('');

  try {
    unsetGlobalHooksPath();
    check('Restoring core.hooksPath…');
  } catch {
    console.log(`  ${dim('Could not restore core.hooksPath (already unset?)')}`);
  }

  try {
    removeHooks();
    check('Removing hook scripts…');
  } catch {
    console.log(`  ${dim('Could not remove hook scripts.')}`);
  }

  if (fs.existsSync(PUSHPOP_DIR)) {
    try {
      fs.rmSync(PUSHPOP_DIR, { recursive: true, force: true });
      check(`Clearing ${PUSHPOP_DIR}…`);
    } catch {
      console.log(`  ${dim(`Could not delete ${PUSHPOP_DIR}.`)}`);
    }
  }

  const { spawned, manualCommand } = scheduleSelfUninstall();
  if (spawned) {
    console.log(`  ${'Removing the CLI binary…'.padEnd(32)} ${dim('(running in background)')}`);
    console.log('');
    console.log(`  ${dim('The pushpop command will disappear from your PATH in a moment.')}`);
  } else {
    console.log('');
    console.log(`  ${purple('♪')}  ${white('Almost done — one manual step:')}`);
    console.log(`  ${dim('Run this to remove the pushpop binary from your system:')}`);
    console.log(`    ${purple(manualCommand)}`);
  }
  console.log('');

  // Flush output and exit cleanly so the detached helper can proceed.
  exitClean(0);
}
