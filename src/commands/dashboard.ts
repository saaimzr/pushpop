import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { getConfig, setConfig, getCustomUploadCount, getVolume, HOOKS_DIR, DEFAULT_VOLUME } from '../lib/config.js';
import { getAllGenres, getCustomSounds, getSoundsForGenre } from '../lib/sounds.js';
import { playSound, resolveSoundPath } from '../lib/audio.js';
import {
  FEEDBACK_EMAIL,
  FREE_TIER_LIMIT,
  LEMONSQUEEZY_URL,
  PRICE,
  isPro,
} from '../lib/license.js';
import {
  animatePreview,
  banner,
  clearScreen,
  enterAltScreen,
  statusPanel,
  ok,
  purple,
  white,
  dim,
  warn as warnUi,
} from '../lib/ui.js';
import { navSelect, navInput, NAV_BACK } from '../lib/nav-select.js';
import { runUpload } from './upload.js';
import { runActivate } from './activate.js';
import { runUninstall } from './uninstall.js';
import type { SoundRef } from '../lib/config.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatAssignment(ref: SoundRef | undefined): string {
  if (!ref) return '(none set)';
  const resolved = resolveSoundPath(ref);
  if (!resolved) return `♪  ${ref.name}  ${'(file missing)'}`;
  return `♪  ${ref.name}`;
}

function getStatusLines(): { label: string; value: string }[] {
  const { assignments } = getConfig();
  const uploadCount = getCustomUploadCount();
  const volume = getVolume();

  const lines: { label: string; value: string }[] = [
    { label: 'commit', value: formatAssignment(assignments.commit) },
    { label: 'push', value: formatAssignment(assignments.push) },
    { label: 'volume', value: `${volume}%` },
  ];

  if (!isPro()) {
    lines.push({
      label: 'uploads',
      value: `${uploadCount}/${FREE_TIER_LIMIT} custom slots used`,
    });
  } else {
    lines.push({ label: 'license', value: 'pro  ◆  unlimited uploads' });
  }

  return lines;
}

function getFrame(extraLines: string[] = []): string {
  const parts = ['\n' + banner(version) + '\n', statusPanel(getStatusLines())];
  if (extraLines.length > 0) parts.push('', ...extraLines);
  return parts.join('\n');
}

// Used for non-interactive status screens (before sleep() calls).
function printHeader(extraLines: string[] = []): void {
  clearScreen();
  console.log('');
  console.log(banner(version));
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
    return [`  ${purple('◆')}  ${white('Pro — unlimited custom uploads')}`];
  }

  return [`  ${dim(`Custom uploads: ${getCustomUploadCount()}/${FREE_TIER_LIMIT} slots used`)}`];
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
    { name: `${purple('←')}  Back`, value: null },
  ];

  while (true) {
    const chosen = await navSelect({
      frame: getFrame(),
      message: white('Choose a sound:'),
      choices,
      pageSize: 10,
    });

    if (chosen === NAV_BACK || chosen === null) return 'back';

    const chosenItem = items.find((it) => it.ref === chosen);
    const filePath = resolveSoundPath(chosen);
    let previewLine = `  ${dim('(audio file not found)')}`;

    if (filePath) {
      // Background mode so spawn returns immediately and we can animate
      // music-note frames while the sound plays.
      const playback = playSound(chosen, { mode: 'background' });
      if (playback.started) {
        clearScreen();
        console.log(getFrame([`  ${purple('♪')}  ${white(`Now playing: ${chosen.name}`)}`]));
        const durationMs = ((chosenItem?.durationSec ?? 3) + 0.5) * 1000;
        await animatePreview(durationMs);
        previewLine = `  ${purple('♪')}  Played: ${white(chosen.name)}`;
      } else {
        previewLine = `  ${purple('⚠')}  Preview unavailable on this system`;
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
    assignments[event] = chosen;
    setConfig({ assignments });
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

    // Allow clearing the current assignment. Only shown if one is actually set,
    // so the list stays clean for first-time users.
    const currentlySet = getConfig().assignments[event];
    if (currentlySet) {
      genreChoices.push({
        name: `${purple('⊘')}  ${white('No sound (remove assignment)')}`,
        value: '__remove__',
      });
    }

    if (customSounds.length > 0) {
      genreChoices.push({ name: `${purple('◎')}  My uploads (${customSounds.length})`, value: '__custom__' });
    }

    for (const genre of genres) {
      const suffix = genre.sounds.length === 0 ? dim(' (coming soon)') : '';
      genreChoices.push({
        name: `${purple(genre.symbol)}  ${white(genre.label)}${suffix}`,
        value: genre.id,
      });
    }

    genreChoices.push({ name: `${purple('←')}  Back`, value: '__back__' });

    const genreId = await navSelect({
      frame: getFrame(),
      message: white(`Choose a sound source for ${purple(event)}:`),
      choices: genreChoices,
      pageSize: 12,
    });

    if (genreId === NAV_BACK || genreId === '__back__') return;

    if (genreId === '__remove__') {
      const { assignments } = getConfig();
      const next = { ...assignments };
      delete next[event];
      setConfig({ assignments: next });
      ok(`Removed ${event} sound`);
      await sleep(900);
      return;
    }

    let soundItems: { ref: SoundRef; label: string }[];

    if (genreId === '__custom__') {
      soundItems = customSounds.map((sound) => ({
        ref: { type: 'custom' as const, name: sound.name, file: sound.file },
        label: sound.name,
      }));
    } else {
      const sounds = getSoundsForGenre(genreId);
      if (sounds.length === 0) {
        printHeader([`  ${purple('○')}  No sounds in this pack yet — check back soon.`]);
        await sleep(1800);
        continue;
      }

      soundItems = sounds.map((sound) => ({
        ref: { type: 'builtin' as const, name: sound.name, file: sound.file },
        label: sound.name,
        durationSec: sound.durationSec,
      }));
    }

    const outcome = await pickFromList(soundItems, event);
    if (outcome === 'selected') return;
  }
}

async function addCustomSound(): Promise<void> {
  while (true) {
    const uploadCount = getCustomUploadCount();

    if (!isPro() && uploadCount >= FREE_TIER_LIMIT) {
      const urlReady = !LEMONSQUEEZY_URL.includes('YOUR_PRODUCT_ID');
      const paywallLines = urlReady
        ? [
            `  ${purple('⚠')}  ${white(`Custom upload limit reached (${uploadCount}/${FREE_TIER_LIMIT} slots)`)}`,
            `  ${dim('Unlock unlimited for')} ${purple(PRICE)} ${dim('→')} ${dim(LEMONSQUEEZY_URL)}`,
            `  ${dim('Then run:')} ${purple('pushpop activate <key>')}`,
          ]
        : [
            `  ${purple('⚠')}  ${white(`Custom upload limit reached (${uploadCount}/${FREE_TIER_LIMIT} slots)`)}`,
            `  ${dim('Pro upgrade link coming soon — check back shortly.')}`,
          ];
      printHeader(paywallLines);
      await sleep(2500);
      return;
    }

    type UploadMethod = 'browse' | 'manual' | 'back';

    const method = await navSelect<UploadMethod>({
      frame: getFrame(getAddCustomLines()),
      message: white('How do you want to add a sound?'),
      choices: [
        { name: `${purple('⊞')}  Browse files (open file picker)`, value: 'browse' },
        { name: `${purple('⌨')}  Enter file path manually`, value: 'manual' },
        { name: `${purple('←')}  Back`, value: 'back' },
      ],
    });

    if (method === NAV_BACK || method === 'back') return;

    let filePath: string | null = null;

    if (method === 'browse') {
      printHeader([...getAddCustomLines(), `  ${dim('Opening file picker...')}`]);
      filePath = openFilePicker();
      if (!filePath) {
        printHeader([...getAddCustomLines(), `  ${dim('No file selected.')}`]);
        await sleep(800);
        continue;
      }
    }

    if (method === 'manual') {
      const result = await navInput({
        frame: getFrame(getAddCustomLines()),
        message: white('Path to your audio file (.mp3 / .wav / .m4a):'),
        validate: (value) => value.trim().length > 0 || 'Please enter a file path',
      });
      if (result === NAV_BACK) return;
      filePath = result.trim();
    }

    if (!filePath) continue;

    const success = await runUpload(filePath, {});
    if (success) {
      await sleep(1200);
      return;
    }

    const retry = await navSelect({
      frame: getFrame(),
      message: white('Upload failed. Try again?'),
      choices: [
        { name: white('Yes'), value: true as boolean },
        { name: white('No'), value: false as boolean },
      ],
    });

    if (retry === NAV_BACK || retry === false) return;
  }
}

async function shareFeedback(): Promise<void> {
  // Plain email display — no browser launch, no form URL. Users can copy the
  // address from their terminal. Wait for any key so the user controls when
  // to return to the dashboard.
  const bodyLines = [
    `  ${purple('♡')}  ${white('Share feedback')}`,
    '',
    `        ${purple(FEEDBACK_EMAIL)}`,
    '',
    `  ${dim('Bug reports, feature requests, producer-tag suggestions — all welcome.')}`,
  ];

  await navSelect({
    frame: getFrame(bodyLines),
    message: white('Press Enter to return.'),
    choices: [{ name: `${purple('←')}  Back`, value: 'back' as const }],
  });
}

async function activateLicense(): Promise<void> {
  while (true) {
    const result = await navInput({
      frame: getFrame(),
      message: white('Enter your Lemon Squeezy license key:'),
      validate: (value) => value.trim().length >= 8 || 'Key too short',
    });

    if (result === NAV_BACK) return;

    try {
      await runActivate(result.trim(), { exitOnError: false });
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
      `  ${purple('⚠')}  ${white('pushpop is not set up on this machine yet.')}`,
      `  ${dim('Hooks are missing — sounds will not play on git commit/push.')}`,
    ]),
    message: white('Run setup now?'),
    choices: [
      { name: `${purple('▸')}  Run setup (pushpop init)`, value: 'init' },
      { name: `${purple('✕')}  Exit`, value: 'exit' },
    ],
  });
  if (choice === NAV_BACK) return 'exit';
  return choice;
}

export async function runDashboard(): Promise<void> {
  type MenuChoice = 'commit' | 'push' | 'upload' | 'activate' | 'feedback' | 'uninstall' | 'exit';

  enterAltScreen();

  if (!hooksInstalled()) {
    const answer = await promptInitMissing();
    if (answer === 'exit') return;
    // Lazy-import so we don't pull init's file writes into normal dashboard flow.
    const { runInit } = await import('./init.js');
    runInit();
    await sleep(1200);
  }

  while (true) {
    const choice = await navSelect<MenuChoice>({
      frame: getFrame(),
      message: white('What do you want to do?'),
      choices: [
        { name: `${purple('▸')}  Set commit sound`, value: 'commit' },
        { name: `${purple('▸')}  Set push sound`, value: 'push' },
        { name: `${purple('⊕')}  Add custom sound`, value: 'upload' },
        { name: `${purple('⌿')}  Activate license`, value: 'activate' },
        { name: `${purple('✎')}  Share feedback`, value: 'feedback' },
        { name: `${purple('⊗')}  Uninstall`, value: 'uninstall' },
        { name: `${purple('✕')}  Exit`, value: 'exit' },
      ],
      pageSize: 8,
    });

    if (choice === NAV_BACK || choice === 'exit') break;

    if (choice === 'commit' || choice === 'push') {
      await pickSound(choice);
      continue;
    }

    if (choice === 'upload') {
      await addCustomSound();
      continue;
    }

    if (choice === 'activate') {
      await activateLicense();
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
