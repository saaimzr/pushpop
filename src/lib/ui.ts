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

// The interactive dashboard mixes prompt-owned redraws with a few direct status
// writes, so we intentionally clear both the viewport and scrollback there.
// Preserving native scrollback in this model causes stacked banner/frame output.
export function clearScreen(): void {
  process.stdout.write('\x1B[2J\x1B[3J\x1B[0;0H');
}

let altScreenActive = false;

export function enterAltScreen(): void {
  if (altScreenActive) return;
  altScreenActive = true;
  // Switch to alternate screen buffer + hide cursor. Matches htop/vim/less behavior:
  // the user's prior terminal contents are restored on exit.
  process.stdout.write('\x1B[?1049h\x1B[?25l');
  process.on('exit', restoreTerminal);
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
  process.on('uncaughtException', handleFatal);
}

function restoreTerminal(): void {
  if (!altScreenActive) return;
  altScreenActive = false;
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  } catch {}
  process.stdout.write('\x1B[?25h\x1B[?1049l');
}

/**
 * Leave the alternate screen buffer without exiting the process. Use this
 * when the caller wants further output (e.g. an uninstall goodbye message)
 * to remain in the user's scrollback after pushpop exits.
 */
export function exitAltScreen(): void {
  restoreTerminal();
}

function handleSignal(): void {
  restoreTerminal();
  process.exit(130);
}

function handleFatal(err: unknown): void {
  restoreTerminal();
  // Re-throw so Node prints the stack after the terminal is restored.
  console.error(err);
  process.exit(1);
}

export function exitClean(code = 0): never {
  restoreTerminal();
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  } catch {}
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

export function banner(version: string): string {
  const title = resolveBannerTitle(process.stdout.columns ?? 80);
  const cacheKey = `${version}:${title === null ? 'narrow' : 'full'}`;

  if (cachedBanner !== null && cachedBannerKey === cacheKey) {
    return cachedBanner;
  }

  if (title === null) {
    cachedBanner = P(`pushpop v${version}`);
    cachedBannerKey = cacheKey;
    return cachedBanner;
  }
  // Mascot frame: each line is exactly 27 columns wide so the right-hand
  // decorations line up with the left. Musical-note glyphs (♫ ♪ ♬) render
  // as single-cell in every modern terminal we target (Windows Terminal,
  // Terminal.app, iTerm2, VS Code), so plain character counting works.
  const mascot = [
    '♫ ♪ ♬ ♫ ♪ ♬ ♫ ♪ ♬ ♫ ♪ ♬ ♫ ♪',
    '♪     ╭─────────────╮     ♪',
    '♫    ▐██▌  ◕ ‿ ◕  ▐██▌    ♫',
    '♪                         ♪',
    '♪ ♫ ♬ ♪ ♫ ♬ ♪ ♫ ♬ ♪ ♫ ♬ ♪ ♫',
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
