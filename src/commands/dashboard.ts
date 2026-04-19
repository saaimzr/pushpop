import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import {
  clearAssignmentsForCustomFile,
  CUSTOM_DIR,
  getConfig,
  getLifetimeCustomUploads,
  getVolume,
  HOOKS_DIR,
  setConfig,
} from '../lib/config.js';
import { getAllGenres, getCustomSounds, getSoundsForGenre } from '../lib/sounds.js';
import { playSound, resolveSoundPath } from '../lib/audio.js';
import { normalizeWrappedInput } from '../lib/input.js';
import {
  FEEDBACK_EMAIL,
  FREE_TIER_LIMIT,
  POLAR_CHECKOUT_URL,
  PRICE,
  isPro,
} from '../lib/license.js';
import {
  banner,
  statusPanel,
  ok,
  purple,
  white,
  dim,
  warnColor,
} from '../lib/ui.js';
import { navSelect, navInput, NAV_BACK } from '../lib/nav-select.js';
import { runUpload } from './upload.js';
import { runActivate } from './activate.js';
import { runUninstall } from './uninstall.js';
import type { SoundRef } from '../lib/config.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };
const BACK_LABEL = `${purple('←')}  Back`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackChoice<T>(value: T): { name: string; value: T } {
  return { name: BACK_LABEL, value };
}

function hasNativeFilePicker(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin';
}

function getUploadLimitLines(lifetimeUploads: number, leadLine?: string): string[] {
  const lines: string[] = [];

  if (leadLine) {
    lines.push(`  ${warnColor(leadLine)}`, '');
  }

  lines.push(
    `  ${warnColor(`Custom upload limit reached (${lifetimeUploads}/${FREE_TIER_LIMIT} slots)`)}`,
    `  ${dim('Unlock unlimited for')} ${purple(PRICE)} ${dim('->')} ${dim(POLAR_CHECKOUT_URL)}`,
    `  ${dim('Then run:')} ${purple('pushpop activate <key>')}`,
  );

  return lines;
}

async function waitForReturn(extraLines: string[], message = white('Press Enter to return.')): Promise<void> {
  await navSelect({
    frame: getFrame(extraLines),
    message,
    choices: [getBackChoice('back' as const)],
  });
}

function formatAssignment(ref: SoundRef | undefined): string {
  if (!ref) return dim('— (not set)');

  const resolved = resolveSoundPath(ref);
  if (!resolved) return warnColor(`${ref.name} (file missing)`);

  return white(ref.name);
}

function getStatusLines(): { label: string; value: string }[] {
  const { assignments } = getConfig();
  const lifetimeUploads = getLifetimeCustomUploads();
  const volume = getVolume();

  const lines: { label: string; value: string }[] = [
    { label: 'commit', value: formatAssignment(assignments.commit) },
    { label: 'push', value: formatAssignment(assignments.push) },
    { label: 'volume', value: white(`${volume}%`) },
  ];

  if (!isPro()) {
    lines.push({
      label: 'uploads',
      value: white(`${lifetimeUploads}/${FREE_TIER_LIMIT} custom slots used`),
    });
  } else {
    lines.push({ label: 'plan', value: `${purple('[PRO]')} ${white('unlimited custom uploads')}` });
  }

  return lines;
}

function getFrame(extraLines: string[] = []): string {
  const parts = [statusPanel(getStatusLines())];
  if (extraLines.length > 0) parts.push('', ...extraLines);
  return parts.join('\n');
}

// Prints status + transient extra lines into scrollback. Does NOT reprint the
// banner — the banner is emitted once at session start and lives in scrollback
// so the user can mouse-wheel up to see it. Reprinting it here would re-create
// the historical "banner stacking" bug.
function printTransient(extraLines: string[] = []): void {
  console.log('');
  console.log(statusPanel(getStatusLines()));

  if (extraLines.length > 0) {
    console.log('');
    for (const line of extraLines) {
      console.log(line);
    }
  }

  console.log('');
}

function getAddCustomLines(): string[] {
  if (isPro()) {
    return [`  ${purple('∞')}  ${white('Pro - unlimited custom uploads')}`];
  }

  return [`  ${dim(`Custom uploads: ${getLifetimeCustomUploads()}/${FREE_TIER_LIMIT} slots used`)}`];
}

function openFilePicker(): string | null {
  try {
    if (process.platform === 'win32') {
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms;',
        '$d = New-Object System.Windows.Forms.OpenFileDialog;',
        '$d.Filter = "Audio files (*.mp3;*.wav;*.m4a)|*.mp3;*.wav;*.m4a";',
        '$d.Title = "Select audio file for pushpop";',
        'if ($d.ShowDialog() -eq "OK") { Write-Output $d.FileName }',
      ].join(' ');
      const result = execFileSync('powershell', ['-NoProfile', '-Command', script], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return result.trim() || null;
    }

    if (process.platform === 'darwin') {
      const result = execFileSync(
        'osascript',
        ['-e', 'POSIX path of (choose file of type {"public.audio"} with prompt "Select audio file for pushpop")'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      return result.trim() || null;
    }
  } catch {
    // User cancelled or dialog unavailable.
  }

  return null;
}

async function pickFromList(
  items: { ref: SoundRef; label: string; durationSec?: number }[],
  event: 'commit' | 'push'
): Promise<'selected' | 'back'> {
  const choices = [
    ...items.map((item) => ({ name: `  ${white(item.label)}`, value: item.ref as SoundRef | null })),
    getBackChoice(null),
  ];

  while (true) {
    const chosen = await navSelect({
      frame: getFrame(),
      message: white('Choose a sound:'),
      choices,
      pageSize: 10,
    });

    if (chosen === NAV_BACK || chosen === null) return 'back';

    const filePath = resolveSoundPath(chosen);
    let previewLine = `  ${dim('(audio file not found)')}`;

    if (filePath) {
      console.log('');
      console.log(`  ${purple('♪')}  ${white(`Now playing: ${chosen.name}`)}`);
      const playback = await playSound(chosen, { mode: 'preview' });
      if (playback.started) {
        previewLine = `  ${purple('♪')}  ${white(`Played: ${chosen.name}`)}`;
      } else {
        previewLine = `  ${warnColor('Preview unavailable on this system')}`;
      }
    }

    const useIt = await navSelect({
      frame: getFrame([previewLine]),
      message: white(`Use "${chosen.name}" for ${purple(event)}?`),
      choices: [
        { name: white('Yes'), value: true as boolean },
        { name: white('No'), value: false as boolean },
      ],
    });

    if (useIt === NAV_BACK || useIt === false) continue;

    const { assignments } = getConfig();
    setConfig({ assignments: { ...assignments, [event]: chosen } });
    ok(`"${chosen.name}" set for ${event}`);
    await sleep(900);
    return 'selected';
  }
}

async function pickSound(event: 'commit' | 'push'): Promise<void> {
  const genres = getAllGenres();
  const customSounds = getCustomSounds();

  while (true) {
    const genreChoices: { name: string; value: string }[] = [];

    if (customSounds.length > 0) {
      genreChoices.push({ name: `${purple('♫')}  My uploads (${customSounds.length})`, value: '__custom__' });
    }

    for (const genre of genres) {
      const suffix = genre.sounds.length === 0 ? dim(' (coming soon)') : '';
      genreChoices.push({
        name: `${purple(genre.symbol)}  ${white(genre.label)}${suffix}`,
        value: genre.id,
      });
    }

    genreChoices.push({
      name: `${purple('⊘')}  ${white('No sound (remove assignment)')}`,
      value: '__remove__',
    });
    genreChoices.push(getBackChoice('__back__'));

    const genreId = await navSelect({
      frame: getFrame(),
      message: white(`Choose a sound source for ${purple(event)}:`),
      choices: genreChoices,
      pageSize: 12,
    });

    if (genreId === NAV_BACK || genreId === '__back__') return;

    if (genreId === '__remove__') {
      const { assignments } = getConfig();
      setConfig({ assignments: { ...assignments, [event]: undefined } });
      ok(`Removed ${event} sound`);
      await sleep(900);
      return;
    }

    let soundItems: { ref: SoundRef; label: string; durationSec?: number }[];

    if (genreId === '__custom__') {
      soundItems = customSounds.map((sound) => ({
        ref: { type: 'custom', name: sound.name, file: sound.file },
        label: sound.name,
      }));
    } else {
      const sounds = getSoundsForGenre(genreId);
      if (sounds.length === 0) {
        printTransient([`  ${purple('○')}  No sounds in this pack yet - check back soon.`]);
        await sleep(1800);
        continue;
      }

      soundItems = sounds.map((sound) => ({
        ref: { type: 'builtin', name: sound.name, file: sound.file },
        label: sound.name,
        durationSec: sound.durationSec,
      }));
    }

    const outcome = await pickFromList(soundItems, event);
    if (outcome === 'selected') return;
  }
}

async function setVolumeLevel(): Promise<void> {
  const current = getVolume();
  const choices: { name: string; value: number | 'back' }[] = [0, 25, 50, 75, 100].map((value) => ({
    name: `${purple(value === current ? '●' : '○')}  ${white(`${value}%`)}`,
    value,
  }));
  choices.push(getBackChoice('back'));

  const choice = await navSelect<number | 'back'>({
    frame: getFrame(),
    message: white('Choose a volume level:'),
    choices,
  });

  if (choice === NAV_BACK || choice === 'back') return;

  setConfig({ volume: choice });
  ok(`Volume set to ${choice}%`);
  await sleep(900);
}

async function addCustomSound(): Promise<void> {
  while (true) {
    const lifetimeUploads = getLifetimeCustomUploads();

    if (!isPro() && lifetimeUploads >= FREE_TIER_LIMIT) {
      await waitForReturn(getUploadLimitLines(lifetimeUploads));
      return;
    }

    type UploadMethod = 'browse' | 'manual' | 'back';

    const method = await navSelect<UploadMethod>({
      frame: getFrame(getAddCustomLines()),
      message: white('How do you want to add a sound?'),
      choices: [
        ...(hasNativeFilePicker()
          ? [{ name: `${purple('📁')}  Browse files (open file picker)`, value: 'browse' as const }]
          : []),
        { name: `${purple('⌨')}  Enter file path manually`, value: 'manual' },
        getBackChoice('back'),
      ],
    });

    if (method === NAV_BACK || method === 'back') return;

    let filePath: string | null = null;

    if (method === 'browse') {
      printTransient([...getAddCustomLines(), `  ${dim('Opening file picker...')}`]);
      filePath = openFilePicker();
      if (!filePath) {
        printTransient([...getAddCustomLines(), `  ${dim('No file selected.')}`]);
        await sleep(800);
        continue;
      }
    }

    if (method === 'manual') {
      const result = await navInput({
        frame: getFrame(getAddCustomLines()),
        message: white('Path to your audio file (.mp3 / .wav / .m4a):'),
        validate: (value) => normalizeWrappedInput(value).length > 0 || 'Please enter a file path',
      });
      if (result === NAV_BACK) return;
      filePath = normalizeWrappedInput(result);
    }

    if (!filePath) continue;

    const success = await runUpload(filePath, {});
    if (success) {
      if (!isPro()) {
        const updatedLifetimeUploads = getLifetimeCustomUploads();
        if (updatedLifetimeUploads >= FREE_TIER_LIMIT) {
          await waitForReturn(
            getUploadLimitLines(
              updatedLifetimeUploads,
              `All ${FREE_TIER_LIMIT} custom slots used. Next upload requires pro unlock.`,
            ),
          );
        }
      }
      return;
    }

    const retry = await navSelect({
      frame: getFrame(),
      message: white('Upload not completed. Try again?'),
      choices: [
        { name: white('Yes'), value: true as boolean },
        { name: white('No'), value: false as boolean },
      ],
    });

    if (retry === NAV_BACK || retry === false) return;
  }
}

async function manageCustomSounds(): Promise<void> {
  while (true) {
    const customSounds = getCustomSounds();

    if (customSounds.length === 0) {
      await waitForReturn([`  ${dim('No custom sounds saved yet.')}`]);
      return;
    }

    const choice = await navSelect<string | '__back__'>({
      frame: getFrame(),
      message: white('Choose a custom sound to delete:'),
      choices: [
        ...customSounds.map((sound) => ({
          name: `  ${white(sound.name)}`,
          value: sound.file,
        })),
        getBackChoice('__back__'),
      ],
      pageSize: 10,
    });

    if (choice === NAV_BACK || choice === '__back__') return;

    const sound = customSounds.find((item) => item.file === choice);
    if (!sound) continue;

    const confirmDelete = await navSelect<boolean>({
      frame: getFrame([
        `  ${warnColor(`Delete "${sound.name}"?`)}`,
        `  ${dim('This removes the file and clears any commit/push assignment using it.')}`,
      ]),
      message: white('Confirm deletion:'),
      choices: [
        { name: white('Delete'), value: true as boolean },
        { name: white('Cancel'), value: false as boolean },
      ],
    });

    if (confirmDelete === NAV_BACK || confirmDelete === false) continue;

    try {
      const fullPath = path.join(CUSTOM_DIR, sound.file);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }

      clearAssignmentsForCustomFile(sound.file);
      ok(`Deleted "${sound.name}"`);
      await sleep(900);
    } catch (error: unknown) {
      printTransient([`  ${warnColor(error instanceof Error ? error.message : String(error))}`]);
      await sleep(1600);
    }
  }
}

async function showHelpInfo(): Promise<void> {
  await waitForReturn([
    `  ${white('pushpop plays short audio tags when you git commit and git push.')}`,
    '',
    `  ${dim('Run pushpop init once and it installs global git hooks through core.hooksPath.')}`,
    `  ${dim('After that, every repo on this machine works without per-project setup.')}`,
    `  ${dim('Use "Add custom sound" in this dashboard to upload your own audio tags.')}`,
    `  ${dim('Best in modern interactive terminals with ANSI/Unicode support.')}`,
    '',
    `  ${white('Upgrade to Pro:')} ${dim(POLAR_CHECKOUT_URL)}`,
    `  ${dim('Then run:')} ${purple('pushpop activate <key>')}`,
  ]);
}

async function shareFeedback(): Promise<void> {
  const bodyLines = [
    `  ${purple('♡')}  ${white('Share feedback')}`,
    '',
    `        ${purple(FEEDBACK_EMAIL)}`,
    '',
    `  ${dim('Bug reports, feature requests, producer-tag suggestions - all welcome.')}`,
  ];

  await navSelect({
    frame: getFrame(bodyLines),
    message: white('Press Enter to return.'),
    choices: [getBackChoice('back' as const)],
  });
}

async function activateLicense(): Promise<void> {
  while (true) {
    const result = await navInput({
      frame: getFrame(),
      message: white('Enter your Polar license key:'),
      validate: (value) => normalizeWrappedInput(value).length > 0 || 'Please enter a license key',
    });

    if (result === NAV_BACK) return;

    try {
      await runActivate(normalizeWrappedInput(result), { exitOnError: false });
      await sleep(1500);
      return;
    } catch {
      await sleep(800);
    }
  }
}

function hooksInstalled(): boolean {
  return (
    fs.existsSync(path.join(HOOKS_DIR, 'post-commit')) &&
    fs.existsSync(path.join(HOOKS_DIR, 'pre-push'))
  );
}

async function promptInitMissing(): Promise<'init' | 'exit'> {
  const choice = await navSelect<'init' | 'exit'>({
    frame: getFrame([
      `  ${warnColor('pushpop is not set up on this machine yet.')}`,
      `  ${dim('Hooks are missing - sounds will not play on git commit/push.')}`,
    ]),
    message: white('Run setup now?'),
    choices: [
      { name: `${purple('⚙')}  Run setup (pushpop init)`, value: 'init' },
      { name: `${purple('✕')}  Exit`, value: 'exit' },
    ],
  });
  if (choice === NAV_BACK) return 'exit';
  return choice;
}

export async function runDashboard(): Promise<void> {
  type MenuChoice =
    | 'commit'
    | 'push'
    | 'volume'
    | 'upload'
    | 'manage'
    | 'activate'
    | 'help'
    | 'feedback'
    | 'uninstall'
    | 'exit';

  // Print the banner exactly once, at the very top of the session, into
  // normal terminal scrollback. Subsequent prompts render below it via
  // inquirer's in-place redraw cycle, so the banner is never re-emitted —
  // this is what prevents the historical "banner stacking" bug while still
  // allowing the user's native mouse-wheel to scroll back to it.
  console.log('');
  console.log(banner(version));
  console.log('');

  if (!hooksInstalled()) {
    const answer = await promptInitMissing();
    if (answer === 'exit') return;
    const { runInit } = await import('./init.js');
    runInit();
    await sleep(1200);
  }

  while (true) {
    const choice = await navSelect<MenuChoice>({
      frame: getFrame(),
      message: white('What do you want to do?'),
      choices: [
        { name: `${purple('⚙')}  Set commit sound`, value: 'commit' },
        { name: `${purple('⚙')}  Set push sound`, value: 'push' },
        { name: `${purple('◐')}  Set volume`, value: 'volume' },
        { name: `${purple('♫')}  Add custom sound`, value: 'upload' },
        ...(isPro() ? [{ name: `${purple('⌫')}  Manage custom sounds`, value: 'manage' as const }] : []),
        { name: `${purple('◇')}  Activate license`, value: 'activate' },
        { name: `${purple('ⓘ')}  Help / Info`, value: 'help' },
        { name: `${purple('✎')}  Share feedback`, value: 'feedback' },
        { name: `${purple('⌦')}  Uninstall`, value: 'uninstall' },
        { name: `${purple('✕')}  Exit`, value: 'exit' },
      ],
      pageSize: 11,
    });

    if (choice === NAV_BACK || choice === 'exit') break;

    if (choice === 'commit' || choice === 'push') {
      await pickSound(choice);
      continue;
    }

    if (choice === 'volume') {
      await setVolumeLevel();
      continue;
    }

    if (choice === 'upload') {
      await addCustomSound();
      continue;
    }

    if (choice === 'manage') {
      await manageCustomSounds();
      continue;
    }

    if (choice === 'activate') {
      await activateLicense();
      continue;
    }

    if (choice === 'help') {
      await showHelpInfo();
      continue;
    }

    if (choice === 'feedback') {
      await shareFeedback();
      continue;
    }

    if (choice === 'uninstall') {
      await runUninstall();
      break;
    }
  }

  console.log('');
}
