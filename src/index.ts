#!/usr/bin/env node
// Load .env as the very first thing so every downstream module sees the values.
import './lib/env.js';
import { createRequire } from 'module';
import { Command } from 'commander';
import updateNotifier from 'update-notifier';
import { runActivate } from './commands/activate.js';
import { runDashboard } from './commands/dashboard.js';
import { runDoctor } from './commands/doctor.js';
import { runInit } from './commands/init.js';
import { runPlay } from './commands/play.js';
import { runUninstall } from './commands/uninstall.js';
import { exitClean, fail } from './lib/ui.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { name: string; version: string };
const INTERNAL_EVENT_ENV = 'PUSHPOP_INTERNAL_EVENT';

function isInternalEvent(value: string | undefined): value is 'commit' | 'push' {
  return value === 'commit' || value === 'push';
}

function canLaunchDashboard(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

async function runInternalPlayback(): Promise<void> {
  if (process.argv.length !== 2) {
    return;
  }

  const internalEvent = process.env[INTERNAL_EVENT_ENV];
  if (!isInternalEvent(internalEvent)) {
    return;
  }

  try {
    await runPlay(internalEvent);
  } catch {
    // Hook playback must stay silent and never block git.
  }

  process.exit(0);
}

async function main(): Promise<void> {
  await runInternalPlayback();

  if (process.env.NO_UPDATE_NOTIFIER !== '1') {
    updateNotifier({ pkg }).notify({ defer: true });
  }

  const program = new Command();

  program
    .name('pushpop')
    .description('Producer-style audio tags for your git commits and pushes')
    .version(pkg.version, '-v, --version');

  program
    .command('init')
    .description('First-time setup: install global git hooks')
    .action(() => runInit());

  program
    .command('activate <key>')
    .description('Activate a Polar license key to unlock pro (unlimited uploads)')
    .action((key: string) => runActivate(key));

  program
    .command('doctor')
    .description('Print environment and hook diagnostics for troubleshooting')
    .action(() => runDoctor());

  program
    .command('uninstall')
    .description('Remove hooks and restore your git config')
    .action(async () => runUninstall());

  if (process.argv.length === 2) {
    if (!canLaunchDashboard()) {
      fail('The pushpop dashboard requires an interactive TTY with ANSI/Unicode support.');
      process.exit(1);
    }

    try {
      await runDashboard();
      exitClean(0);
    } catch {
      exitClean(1);
    }
  }

  await program.parseAsync().catch(() => process.exit(1));
}

main().catch(() => process.exit(1));
