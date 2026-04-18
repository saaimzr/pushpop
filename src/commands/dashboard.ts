import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { confirm, input, select } from '@inquirer/prompts';
import { getConfig, setConfig, getCustomUploadCount } from '../lib/config.js';
import { getAllGenres, getCustomSounds, getSoundsForGenre } from '../lib/sounds.js';
import { playSound, resolveSoundPath } from '../lib/audio.js';
import {
  FREE_TIER_LIMIT,
  LEMONSQUEEZY_URL,
  PRICE,
  hasUnlimitedUploads,
  isDevUploadLimitBypassed,
  isPro,
} from '../lib/license.js';
import { banner, statusPanel, ok, purple, white, dim } from '../lib/ui.js';
import { runUpload } from './upload.js';
import { runActivate } from './activate.js';
import { runUninstall } from './uninstall.js';
import type { SoundRef } from '../lib/config.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };
const PROMPT_CONTEXT = { clearPromptOnDone: true } as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStatusLines(): { label: string; value: string }[] {
  const { assignments } = getConfig();
  const uploadCount = getCustomUploadCount();

  const lines: { label: string; value: string }[] = [
    {
      label: 'commit',
      value: assignments.commit ? `♪  ${assignments.commit.name}` : '(none set)',
    },
    {
      label: 'push',
      value: assignments.push ? `♪  ${assignments.push.name}` : '(none set)',
    },
  ];

  if (isDevUploadLimitBypassed()) {
    lines.push({ label: 'uploads', value: 'dev bypass active' });
  } else if (!isPro()) {
    lines.push({
      label: 'uploads',
      value: `${uploadCount}/${FREE_TIER_LIMIT} custom slots used`,
    });
  } else {
    lines.push({ label: 'license', value: 'pro  ◆  unlimited uploads' });
  }

  return lines;
}

function printHeader(extraLines: string[] = []): void {
  console.clear();
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
  if (isDevUploadLimitBypassed()) {
    return [`  ${purple('◆')}  ${white('Dev mode — upload cap bypass active')}`];
  }

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
  items: { ref: SoundRef; label: string }[],
  event: 'commit' | 'push'
): Promise<'selected' | 'back'> {
  const choices = [
    ...items.map((item) => ({ name: `  ${white(item.label)}`, value: item.ref as SoundRef | null })),
    { name: `${purple('←')}  Back`, value: null },
  ];

  while (true) {
    let chosen: SoundRef | null;
    try {
      printHeader();
      chosen = await select(
        {
          message: white('Choose a sound:'),
          choices,
          pageSize: 10,
        },
        PROMPT_CONTEXT,
      );
    } catch {
      return 'back';
    }

    if (!chosen) return 'back';

    const filePath = resolveSoundPath(chosen);
    let previewLine = `  ${dim('(audio file not found)')}`;

    if (filePath) {
      const playback = playSound(chosen, { mode: 'preview' });
      previewLine = playback.started
        ? `  ${purple('♪')}  Played: ${white(chosen.name)} ${dim(`(${playback.backend})`)}`
        : `  ${purple('⚠')}  Preview unavailable on this system`;
    }

    let useIt: boolean;
    try {
      printHeader([previewLine]);
      useIt = await confirm(
        {
          message: white(`Use "${chosen.name}" for ${purple(event)}?`),
          default: true,
        },
        PROMPT_CONTEXT,
      );
    } catch {
      continue;
    }

    if (!useIt) continue;

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

    let genreId: string;
    try {
      printHeader();
      genreId = await select(
        {
          message: white(`Choose a sound source for ${purple(event)}:`),
          choices: genreChoices,
          pageSize: 12,
        },
        PROMPT_CONTEXT,
      );
    } catch {
      return;
    }

    if (genreId === '__back__') return;

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
        label: `${sound.name}  ${dim(`(${sound.durationSec}s)`)}`,
      }));
    }

    const outcome = await pickFromList(soundItems, event);
    if (outcome === 'selected') return;
  }
}

async function addCustomSound(): Promise<void> {
  while (true) {
    const uploadCount = getCustomUploadCount();

    if (!hasUnlimitedUploads() && uploadCount >= FREE_TIER_LIMIT) {
      printHeader([
        `  ${purple('⚠')}  ${white(`Custom upload limit reached (${uploadCount}/${FREE_TIER_LIMIT} slots)`)}`,
        `  ${dim('Unlock unlimited for')} ${purple(PRICE)} ${dim('→')} ${dim(LEMONSQUEEZY_URL)}`,
        `  ${dim('Then run:')} ${purple('pushpop activate <key>')}`,
      ]);
      await sleep(2500);
      return;
    }

    type UploadMethod = 'browse' | 'manual' | 'back';
    let method: UploadMethod;
    try {
      printHeader(getAddCustomLines());
      method = await select(
        {
          message: white('How do you want to add a sound?'),
          choices: [
            { name: `${purple('⊞')}  Browse files (open file picker)`, value: 'browse' as const },
            { name: `${purple('⌨')}  Enter file path manually`, value: 'manual' as const },
            { name: `${purple('←')}  Back`, value: 'back' as const },
          ],
        },
        PROMPT_CONTEXT,
      );
    } catch {
      return;
    }

    if (method === 'back') return;

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
      try {
        printHeader(getAddCustomLines());
        filePath = await input(
          {
            message: white('Path to your audio file (.mp3 / .wav / .m4a):'),
            validate: (value) => value.trim().length > 0 || 'Please enter a file path',
          },
          PROMPT_CONTEXT,
        );
        filePath = filePath.trim();
      } catch {
        return;
      }
    }

    if (!filePath) continue;

    const success = await runUpload(filePath, {});
    if (success) {
      await sleep(1200);
      return;
    }

    let retry: boolean;
    try {
      printHeader();
      retry = await confirm(
        {
          message: white('Try again?'),
          default: true,
        },
        PROMPT_CONTEXT,
      );
    } catch {
      return;
    }

    if (!retry) return;
  }
}

async function activateLicense(): Promise<void> {
  while (true) {
    let key: string;
    try {
      printHeader();
      key = await input(
        {
          message: white('Enter your Lemon Squeezy license key:'),
          validate: (value) => value.trim().length >= 8 || 'Key too short',
        },
        PROMPT_CONTEXT,
      );
    } catch {
      return;
    }

    try {
      await runActivate(key.trim(), { exitOnError: false });
      await sleep(1500);
      return;
    } catch {
      await sleep(800);
    }
  }
}

export async function runDashboard(): Promise<void> {
  while (true) {
    type MenuChoice = 'commit' | 'push' | 'upload' | 'activate' | 'uninstall' | 'exit';

    let choice: MenuChoice;
    try {
      printHeader();
      choice = await select(
        {
          message: white('What do you want to do?'),
          choices: [
            { name: `${purple('▸')}  Set commit sound`, value: 'commit' as const },
            { name: `${purple('▸')}  Set push sound`, value: 'push' as const },
            { name: `${purple('⊕')}  Add custom sound`, value: 'upload' as const },
            { name: `${purple('⌿')}  Activate license`, value: 'activate' as const },
            { name: `${purple('⊗')}  Uninstall`, value: 'uninstall' as const },
            { name: `${purple('✕')}  Exit`, value: 'exit' as const },
          ],
          pageSize: 8,
        },
        PROMPT_CONTEXT,
      );
    } catch {
      break;
    }

    if (choice === 'exit') break;

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

    if (choice === 'uninstall') {
      await runUninstall();
      break;
    }
  }

  console.log('');
}
