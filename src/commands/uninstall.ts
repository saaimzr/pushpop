import * as fs from 'fs';
import * as readline from 'readline';
import { deleteLegacyConfigFile, LEGACY_CONFIG_PATH, PUSHPOP_DIR } from '../lib/config.js';
import { removeHooks, unsetGlobalHooksPath } from '../lib/hooks.js';
import { scheduleSelfUninstall } from '../lib/self-uninstall.js';
import { dim, exitClean, purple, white } from '../lib/ui.js';

export interface UninstallStep {
  label: string;
  status: 'success' | 'warning' | 'info';
}

export interface UninstallResult {
  steps: UninstallStep[];
  spawned: boolean;
  manualCommand: string;
}

function confirm(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('error', () => {
      rl.close();
      resolve(false);
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

function printStep(step: UninstallStep): void {
  const symbol = step.status === 'success' ? purple('✓') : dim(step.status === 'warning' ? '!' : '•');
  console.log(`  ${step.label.padEnd(32)} ${symbol}`);
}

export function performUninstall(): UninstallResult {
  const steps: UninstallStep[] = [];

  try {
    removeHooks();
    steps.push({ label: 'Removing hooks...', status: 'success' });
  } catch {
    steps.push({ label: 'Could not remove hooks.', status: 'warning' });
  }

  try {
    unsetGlobalHooksPath();
    steps.push({ label: 'Restoring core.hooksPath...', status: 'success' });
  } catch {
    steps.push({ label: 'Could not restore core.hooksPath.', status: 'warning' });
  }

  if (fs.existsSync(PUSHPOP_DIR)) {
    try {
      fs.rmSync(PUSHPOP_DIR, { recursive: true, force: true });
      steps.push({ label: `Clearing ${PUSHPOP_DIR}...`, status: 'success' });
    } catch {
      steps.push({ label: `Could not delete ${PUSHPOP_DIR}.`, status: 'warning' });
    }
  }

  if (fs.existsSync(LEGACY_CONFIG_PATH)) {
    deleteLegacyConfigFile();
    steps.push({ label: 'Clearing legacy config...', status: 'success' });
  }

  const { spawned, manualCommand } = scheduleSelfUninstall();
  if (spawned) {
    steps.push({ label: 'Removing the CLI binary...', status: 'info' });
  }

  return { steps, spawned, manualCommand };
}

export async function runUninstall(): Promise<void> {
  const confirmed = await confirm('Remove pushpop hooks, config, and the CLI itself? (y/N) ');

  if (!confirmed) {
    console.log('  Aborted.');
    return;
  }

  console.log('');
  console.log(`   ${purple('♪')}    ${white('Goodbye from pushpop')}`);
  console.log(`         ${dim('Thanks for shipping with us.')}`);
  console.log('');

  const result = performUninstall();
  result.steps.forEach(printStep);

  if (result.spawned) {
    console.log('');
    console.log(`  ${dim('The pushpop command will disappear from your PATH in a moment.')}`);
  } else {
    console.log('');
    console.log(`  ${purple('♪')}  ${white('Almost done - one manual step:')}`);
    console.log(`  ${dim('Run this to remove the pushpop binary from your system:')}`);
    console.log(`    ${purple(result.manualCommand)}`);
  }

  console.log('');
  exitClean(0);
}
