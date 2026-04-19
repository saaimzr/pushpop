import { execFileSync } from 'child_process';
import chalk from 'chalk';
import boxen from 'boxen';
import { POLAR_CHECKOUT_URL, PRICE } from './license.js';

const P = chalk.hex('#9B59B6');   // purple brand color
const W = chalk.white;
const DIM = chalk.dim;
const WARN = chalk.hex('#F5B041');

export const purple = P;
export const white = W;
export const dim = DIM;
export const warnColor = WARN;

// Clears the visible viewport and homes the cursor. Deliberately does NOT
// emit \x1B[3J — preserving native terminal scrollback is required so the
// dashboard banner (printed once at session start) remains reachable via the
// user's mouse-wheel scroll.
export function clearScreen(): void {
  process.stdout.write('\x1B[2J\x1B[0;0H');
}

export function exitClean(code = 0): never {
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  } catch { }
  process.stdout.write('\x1B[?25h\n');
  process.exit(code);
}

let cachedBanner: string | null = null;
let cachedBannerKey: string | null = null;

const SOLID_LETTERS: Record<string, string[]> = {
  p: ['███ ', '█  █', '███ ', '█   ', '█   '],
  u: ['█  █', '█  █', '█  █', '█  █', ' ██ '],
  s: ['███ ', '█   ', ' ██ ', '  █ ', '███ '],
  h: ['█  █', '█  █', '████', '█  █', '█  █'],
  o: [' ██ ', '█  █', '█  █', '█  █', ' ██ '],
};

const SOLID_TITLE = buildSolidTitle('pushpop');

export function banner(version: string, columns?: number): string {
  const cols = columns ?? process.stdout.columns ?? 80;
  const title = resolveBannerTitle(cols);
  const cacheKey = `${version}:${title === null ? 'narrow' : 'full'}`;

  if (cachedBanner !== null && cachedBannerKey === cacheKey) {
    return cachedBanner;
  }

  if (title === null) {
    cachedBanner = P(`pushpop v${version}`);
    cachedBannerKey = cacheKey;
    return cachedBanner;
  }
  // Mascot: tiny face in a rounded “screen”, blocky earcups + headband as
  // headphones, ♩/♫/♬ clusters at the sides so notes read as coming from the
  // cups. Same fixed width per line; glyphs are single-cell in the terminals
  // we target (Windows Terminal, Terminal.app, iTerm2, VS Code).
  const mascot = [
    '♬ ♩ ♪ ♫ ♬ ♩ ♪ ♫ ♬ ♩ ♪ ♫ ♬ ♩ ♪ ♫ ♪ ♫ ♬ ♪ ♫ ♬ ',
    '♩ ♪ ♫       ╭─────────────────╮       ♫ ♪ ♩',
    '♫ ♬ ♪     ▐█▌ ╭─────────────╮ ▐█▌     ♪ ♫ ♬',
    '♪ ♩ ♫     ▐█▌      ◕ ‿ ◕      ▐█▌     ♬ ♪ ♩',
    '♫ ♬ ♪      ▝  ╰─────────────╯  ▘      ♩ ♫ ♬',
    '♩ ♪ ♫ ♬ ♪ ♫ ♬ ♩ ♫ ♬ ♩ ♪ ♬ ♫ ♪ ♩ ♬ ♪ ♫ ♬ ♩ ♫',
  ].join('\n');

  cachedBanner = [
    P(title),
    P(rightAlignVersion(version, title)),
    '',
    P(mascot),
  ].join('\n');
  cachedBannerKey = cacheKey;
  return cachedBanner;
}

function buildSolidTitle(text: string): string {
  const glyphs = text.split('').map((char) => SOLID_LETTERS[char] ?? [char, '', '', '', '']);
  return Array.from({ length: 5 }, (_, row) => glyphs.map((glyph) => glyph[row]).join(' ')).join('\n');
}

function resolveBannerTitle(columns: number): string | null {
  if (columns >= measureTextWidth(SOLID_TITLE)) {
    return SOLID_TITLE;
  }

  return null;
}

function rightAlignVersion(version: string, title: string): string {
  const versionText = `v${version}`;
  const padding = Math.max(0, measureTextWidth(title) - versionText.length);
  return `${' '.repeat(padding)}${versionText}`;
}

function measureTextWidth(text: string): number {
  return text.split('\n').reduce((max, line) => Math.max(max, line.length), 0);
}

export function statusPanel(lines: { label: string; value: string }[]): string {
  const rows = lines
    .map(({ label, value }) => `  ${DIM(label.padEnd(10))} ${value}`)
    .join('\n');

  return boxen(rows, {
    padding: { top: 0, bottom: 0, left: 0, right: 1 },
    borderStyle: 'round',
    borderColor: '#9B59B6',
  });
}

export function ok(msg: string): void {
  console.log(`${P('✓')}  ${W(msg)}`);
}

export function warn(msg: string): void {
  console.log(`${P('⚠')}  ${W(msg)}`);
}

export function fail(msg: string): void {
  console.log(`${P('✗')}  ${W(msg)}`);
}

export function note(msg: string): void {
  console.log(`${P('♪')}  ${W(msg)}`);
}

/**
 * Open a URL in the user's default browser. Returns true if the launch
 * command succeeded (does not guarantee the browser actually opened).
 */
export function openUrl(url: string): boolean {
  try {
    if (process.platform === 'win32') {
      // On Windows, `start` is a cmd builtin. The empty "" is a required
      // window-title placeholder so `start` doesn't mis-parse a quoted URL.
      execFileSync('cmd', ['/c', 'start', '""', url], { stdio: 'ignore' });
    } else if (process.platform === 'darwin') {
      execFileSync('open', [url], { stdio: 'ignore' });
    } else {
      execFileSync('xdg-open', [url], { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Simple inline animation (writes with `\r` to overwrite one line).
 * Shows cycling music-note frames for `durationMs`, then erases the line.
 * Safe to call while other output is queued — only touches the current line.
 */
export async function animatePreview(durationMs: number): Promise<void> {
  const frames = [
    '♪ ♫ ♬ ♫ ♪ ♬ ♪ ♫',
    '♫ ♬ ♪ ♬ ♫ ♪ ♫ ♬',
    '♬ ♪ ♫ ♪ ♬ ♫ ♬ ♪',
    '♫ ♬ ♪ ♬ ♫ ♪ ♫ ♬',
  ];
  const start = Date.now();
  let i = 0;
  while (Date.now() - start < durationMs) {
    process.stdout.write(`\r  ${P(frames[i % frames.length])}   ${DIM('previewing…')}   `);
    await new Promise((resolve) => setTimeout(resolve, 150));
    i++;
  }
  process.stdout.write(`\r${' '.repeat(40)}\r`);
}

export function showPaywall(context: 'inline' | 'box' = 'box'): void {

  if (context === 'inline') {
    console.log('');
    console.log(`  ${P('⚠')}  ${W('Custom upload limit reached (2/2)')}`);
    console.log(`  ${DIM('Unlock unlimited for')} ${P(PRICE)} ${DIM('→')} ${DIM(POLAR_CHECKOUT_URL)}`);
    console.log(`  ${DIM('Then run:')} ${P('pushpop activate <key>')}`);
    console.log('');
    return;
  }

  const boxBody = [
    `${W('Custom upload limit reached')} ${DIM('(2/2 slots used)')}`,
    '',
    `${W('Unlock unlimited uploads for')} ${P(PRICE)}`,
    `${DIM(POLAR_CHECKOUT_URL)}`,
    '',
    `${DIM('Then run:')} ${P('pushpop activate <your-license-key>')}`,
  ].join('\n');

  console.log('');
  console.log(
    boxen(boxBody, {
      padding: 1,
      borderStyle: 'round',
      borderColor: '#9B59B6',
      title: P('pushpop pro'),
      titleAlignment: 'center',
    })
  );
}
