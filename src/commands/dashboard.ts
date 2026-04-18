import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { input } from '@inquirer/prompts';
import { getConfig, setConfig, getCustomUploadCount } from '../lib/config.js';
import { getAllGenres, getCustomSounds, getSoundsForGenre } from '../lib/sounds.js';
import { playSound, resolveSoundPath } from '../lib/audio.js';
import { isPro, FREE_TIER_LIMIT, LEMONSQUEEZY_URL, PRICE } from '../lib/license.js';
import { banner, statusPanel, ok, clearScreen, purple, white, dim } from '../lib/ui.js';
import { navSelect, NAV_BACK } from '../lib/nav-select.js';
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
  const pro = isPro();
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

  if (!pro) {
    lines.push({
      label: 'uploads',
      value: `${uploadCount}/${FREE_TIER_LIMIT} custom slots used`,
    });
  } else {
    lines.push({ label: 'license', value: 'pro  ◆  unlimited uploads' });
  }

  return lines;
}

function renderScreen(...body: string[]): void {
  clearScreen();
  console.log('');
  console.log(banner(version));
  console.log('');
  console.log(statusPanel(getStatusLines()));
  console.log('');

  for (const section of body) {
    console.log(section);
    console.log('');
  }
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
    // User cancelled or dialog not available.
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
      renderScreen();
      const result = await navSelect({
        message: white('Choose a sound:'),
        choices,
        pageSize: 10,
      });
      if (result === NAV_BACK) return 'back';
      chosen = result;
    } catch {
      return 'back';
    }

    if (!chosen) return 'back';

    const filePath = resolveSoundPath(chosen);
    if (filePath) {
      renderScreen(`  ${purple('♪')}  Playing: ${white(chosen.name)}`);
      playSound(chosen);
    } else {
      renderScreen(`  ${dim('(audio file not found)')}`);
    }

    let useIt: boolean | typeof NAV_BACK;
    try {
      useIt = await navSelect({
        message: white(`Use "${chosen.name}" for ${purple(event)}?`),
        choices: [
          { name: white('Yes — assign it'), value: true as boolean },
          { name: white('No — keep browsing'), value: false as boolean },
        ],
      });
    } catch {
      continue;
    }

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

  while (true) {
    let genreId: string;
    try {
      renderScreen();
      const result = await navSelect({
        message: white(`Choose a sound source for ${purple(event)}:`),
        choices: genreChoices,
        pageSize: 12,
      });
      if (result === NAV_BACK) return;
      genreId = result;
    } catch {
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
        renderScreen(`  ${purple('○')}  No sounds in this pack yet — check back soon.`);
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
  const pro = isPro();

  while (true) {
    const uploadCount = getCustomUploadCount();

    if (pro) {
      renderScreen(`  ${purple('◆')}  ${white('Pro — unlimited custom uploads')}`);
    } else if (uploadCount >= FREE_TIER_LIMIT) {
      renderScreen(
        `  ${purple('⚠')}  ${white(`Custom upload limit reached (${uploadCount}/${FREE_TIER_LIMIT} slots)`)}`,
        `  ${dim('Unlock unlimited for')} ${purple(PRICE)} ${dim('→')} ${dim(LEMONSQUEEZY_URL)}`,
        `  ${dim('Then run:')} ${purple('pushpop activate <key>')}`,
      );
      await sleep(2500);
      return;
    } else {
      renderScreen(`  ${dim(`Custom uploads: ${uploadCount}/${FREE_TIER_LIMIT} slots used`)}`);
    }

    type UploadMethod = 'browse' | 'manual' | 'back';
    let method: UploadMethod | typeof NAV_BACK;
    try {
      method = await navSelect<UploadMethod>({
        message: white('How do you want to add a sound?'),
        choices: [
          { name: `${purple('⊞')}  Browse files (open file picker)`, value: 'browse' },
          { name: `${purple('⌨')}  Enter file path manually`, value: 'manual' },
          { name: `${purple('←')}  Back`, value: 'back' },
        ],
      });
    } catch {
      return;
    }

    if (method === NAV_BACK || method === 'back') return;

    let filePath: string | null = null;

    if (method === 'browse') {
      renderScreen(`  ${dim('Opening file picker...')}`);
      filePath = openFilePicker();
      if (!filePath) {
        renderScreen(`  ${dim('No file selected.')}`);
        await sleep(800);
        continue;
      }
    }

    if (method === 'manual') {
      try {
        renderScreen();
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

    let retry: boolean | typeof NAV_BACK;
    try {
      renderScreen();
      retry = await navSelect({
        message: white('What would you like to do?'),
        choices: [
          { name: white('Try again'), value: true as boolean },
          { name: white('Go back to main menu'), value: false as boolean },
        ],
      });
    } catch {
      return;
    }

    if (retry === NAV_BACK || retry === false) return;
  }
}

async function activateLicense(): Promise<void> {
  while (true) {
    type ActivateChoice = 'enter' | 'back';
    let choice: ActivateChoice | typeof NAV_BACK;
    try {
      renderScreen();
      choice = await navSelect<ActivateChoice>({
        message: white('License activation'),
        choices: [
          { name: `${purple('⌿')}  Enter license key`, value: 'enter' },
          { name: `${purple('←')}  Back`, value: 'back' },
        ],
      });
    } catch {
      return;
    }

    if (choice === NAV_BACK || choice === 'back') return;

    let key: string;
    try {
      renderScreen();
      key = await input(
        {
          message: white('Enter your Lemon Squeezy license key:'),
          validate: (value) => value.trim().length >= 8 || 'Key too short',
        },
        PROMPT_CONTEXT,
      );
    } catch {
      continue;
    }

    try {
      await runActivate(key.trim());
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

    const choices: { name: string; value: MenuChoice }[] = [
      { name: `${purple('▸')}  Set commit sound`, value: 'commit' },
      { name: `${purple('▸')}  Set push sound`, value: 'push' },
      { name: `${purple('⊕')}  Add custom sound`, value: 'upload' },
      { name: `${purple('⌿')}  Activate license`, value: 'activate' },
      { name: `${purple('⊗')}  Uninstall`, value: 'uninstall' },
      { name: `${purple('✕')}  Exit`, value: 'exit' },
    ];

    let choice: MenuChoice | typeof NAV_BACK;
    try {
      renderScreen();
      choice = await navSelect({
        message: white('What do you want to do?'),
        choices,
        pageSize: 8,
      });
    } catch {
      break;
    }

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

    if (choice === 'uninstall') {
      await runUninstall();
      break;
    }
  }

  console.log('');
}
