import { createRequire } from 'module';
import { select, input, confirm } from '@inquirer/prompts';
import { getConfig, setConfig, getCustomUploadCount, CUSTOM_DIR } from '../lib/config.js';
import { getAllGenres, getCustomSounds, getSoundsForGenre } from '../lib/sounds.js';
import { playSound, resolveSoundPath } from '../lib/audio.js';
import { isPro, FREE_TIER_LIMIT, LEMONSQUEEZY_URL, PRICE } from '../lib/license.js';
import { banner, statusPanel, ok, warn, purple, white, dim } from '../lib/ui.js';
import { runUpload } from './upload.js';
import { runActivate } from './activate.js';
import { runUninstall } from './uninstall.js';
import type { SoundRef } from '../lib/config.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

// ─── helpers ────────────────────────────────────────────────────────────────

function printHeader(): void {
  console.clear();
  console.log('');
  console.log(banner(version));
  console.log('');

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

  console.log(statusPanel(lines));
  console.log('');
}

// ─── sound picker ───────────────────────────────────────────────────────────

async function pickSound(event: 'commit' | 'push'): Promise<void> {
  const genres = getAllGenres();
  const customSounds = getCustomSounds();
  const pro = isPro();
  const uploadCount = getCustomUploadCount();

  // Build genre choices
  const genreChoices: { name: string; value: string }[] = [];

  if (customSounds.length > 0) {
    genreChoices.push({ name: `${purple('◎')}  My uploads (${customSounds.length})`, value: '__custom__' });
    genreChoices.push({ name: dim('─────────────────'), value: '__sep__' });
  }

  for (const g of genres) {
    const count = g.sounds.length;
    const suffix = count === 0 ? dim(' (coming soon)') : '';
    genreChoices.push({
      name: `${purple(g.symbol)}  ${white(g.label)}${suffix}`,
      value: g.id,
    });
  }

  genreChoices.push({ name: dim('─────────────────'), value: '__sep__' });
  genreChoices.push({ name: `${purple('←')}  Back`, value: '__back__' });

  printHeader();

  let genreId: string;
  try {
    genreId = await select({
      message: white(`Choose a sound source for ${purple(event)}:`),
      choices: genreChoices.filter((c) => c.value !== '__sep__'),
      pageSize: 12,
    });
  } catch {
    return; // Ctrl+C → back to main menu
  }

  if (genreId === '__back__') return;

  // Custom sounds branch
  if (genreId === '__custom__') {
    await pickFromList(customSounds.map((s) => ({ ref: { type: 'custom' as const, name: s.name, file: s.file }, label: s.name })), event);
    return;
  }

  // Genre branch
  const sounds = getSoundsForGenre(genreId);
  if (sounds.length === 0) {
    console.log(`\n  ${purple('○')}  No sounds in this pack yet — check back soon.\n`);
    await new Promise((r) => setTimeout(r, 1800));
    return;
  }

  const soundItems = sounds.map((s) => ({
    ref: { type: 'builtin' as const, name: s.name, file: s.file },
    label: `${s.name}  ${dim(`(${s.durationSec}s)`)}`,
  }));

  await pickFromList(soundItems, event);
}

async function pickFromList(
  items: { ref: SoundRef; label: string }[],
  event: 'commit' | 'push'
): Promise<void> {
  const choices = [
    ...items.map((item) => ({ name: `  ${white(item.label)}`, value: item.ref })),
    { name: `${purple('←')}  Back`, value: null as unknown as SoundRef },
  ];

  let chosen: SoundRef | null;
  try {
    chosen = await select({
      message: white('Choose a sound:'),
      choices,
      pageSize: 10,
    });
  } catch {
    return;
  }

  if (!chosen) return;

  // Play it
  const filePath = resolveSoundPath(chosen);
  if (filePath) {
    console.log(`\n  ${purple('♪')}  Playing: ${white(chosen.name)}\n`);
    playSound(chosen);
  } else {
    console.log(`\n  ${dim('(audio file not found — will work once sounds are added)')}\n`);
  }

  // Confirm
  let useIt: boolean;
  try {
    useIt = await confirm({ message: white(`Use "${chosen.name}" for ${purple(event)}?`), default: true });
  } catch {
    return;
  }

  if (!useIt) return;

  const { assignments } = getConfig();
  assignments[event] = chosen;
  setConfig({ assignments });
  ok(`"${chosen.name}" set for ${event}`);
  await new Promise((r) => setTimeout(r, 1000));
}

// ─── add custom sound ────────────────────────────────────────────────────────

async function addCustomSound(): Promise<void> {
  const pro = isPro();
  const uploadCount = getCustomUploadCount();

  if (!pro && uploadCount >= FREE_TIER_LIMIT) {
    console.log('');
    warn(`Custom upload limit reached (${uploadCount}/${FREE_TIER_LIMIT} slots)`);
    console.log(`\n  ${dim('Unlock unlimited for')} ${purple(PRICE)} ${dim('→')} ${dim(LEMONSQUEEZY_URL)}`);
    console.log(`  ${dim('Then run:')} ${purple('pushpop activate <key>')}\n`);
    await new Promise((r) => setTimeout(r, 2500));
    return;
  }

  let filePath: string;
  try {
    filePath = await input({
      message: white('Path to your audio file (.mp3 / .wav / .m4a):'),
      validate: (v) => v.trim().length > 0 || 'Please enter a file path',
    });
  } catch {
    return;
  }

  await runUpload(filePath.trim(), {});
  await new Promise((r) => setTimeout(r, 1200));
}

// ─── activate ───────────────────────────────────────────────────────────────

async function activateLicense(): Promise<void> {
  let key: string;
  try {
    key = await input({
      message: white('Enter your Lemon Squeezy license key:'),
      validate: (v) => v.trim().length >= 8 || 'Key too short',
    });
  } catch {
    return;
  }

  await runActivate(key.trim());
  await new Promise((r) => setTimeout(r, 1500));
}

// ─── main dashboard loop ─────────────────────────────────────────────────────

export async function runDashboard(): Promise<void> {
  while (true) {
    printHeader();

    type MenuChoice = 'commit' | 'push' | 'upload' | 'activate' | 'uninstall' | 'exit';

    const choices: { name: string; value: MenuChoice }[] = [
      { name: `${purple('▸')}  Set commit sound`, value: 'commit' },
      { name: `${purple('▸')}  Set push sound`, value: 'push' },
      { name: `${purple('⊕')}  Add custom sound`, value: 'upload' },
      { name: `${purple('⌿')}  Activate license`, value: 'activate' },
      { name: `${purple('⊗')}  Uninstall`, value: 'uninstall' },
      { name: `${purple('✕')}  Exit`, value: 'exit' },
    ];

    let choice: MenuChoice;
    try {
      choice = await select({
        message: white('What do you want to do?'),
        choices,
        pageSize: 8,
      });
    } catch {
      break; // Ctrl+C
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
