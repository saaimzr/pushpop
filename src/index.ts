#!/usr/bin/env node
import { createRequire } from 'module';
import { Command } from 'commander';
import { runDashboard } from './commands/dashboard.js';
import { runInit } from './commands/init.js';
import { runUpload } from './commands/upload.js';
import { runUse } from './commands/use.js';
import { runActivate } from './commands/activate.js';
import { runPlay } from './commands/play.js';
import { runUninstall } from './commands/uninstall.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('pushpop')
  .description('Producer-style audio tags for your git commits and pushes')
  .version(version, '-v, --version');

program
  .command('init')
  .description('First-time setup: install global git hooks')
  .action(() => runInit());

program
  .command('upload <file>')
  .description('Upload an audio file as a custom sound (≤3s; longer files are auto-truncated)')
  .option('-n, --name <name>', 'Custom sound name (defaults to filename)')
  .action(async (file: string, opts: { name?: string }) => {
    const success = await runUpload(file, opts);
    if (!success) process.exit(1);
  });

program
  .command('use <sound>')
  .description('Assign a sound to a git event (power user shortcut)')
  .option('--on <event>', 'Event to assign to: commit, push, or both', 'both')
  .action((sound: string, opts: { on: 'commit' | 'push' | 'both' }) => runUse(sound, opts));

program
  .command('activate <key>')
  .description('Activate a Lemon Squeezy license key to unlock pro (unlimited uploads)')
  .action((key: string) => runActivate(key));

program
  .command('play')
  .description('Play the sound for an event (called internally by git hooks)')
  .option('--event <event>', 'Event type: commit or push', 'commit')
  .action((opts: { event: 'commit' | 'push' }) => runPlay(opts.event));

program
  .command('uninstall')
  .description('Remove hooks and restore your git config')
  .action(async () => runUninstall());

// Default: interactive dashboard
if (process.argv.length === 2) {
  runDashboard().catch(() => process.exit(0));
} else {
  program.parseAsync().catch(() => process.exit(1));
}
