import chalk from 'chalk';
import figlet from 'figlet';
import boxen from 'boxen';
import { LEMONSQUEEZY_URL, PRICE } from './license.js';

const P = chalk.hex('#9B59B6');   // purple brand color
const W = chalk.white;
const DIM = chalk.dim;

export const purple = P;
export const white = W;
export const dim = DIM;

// \x1B[2J clears the visible viewport; \x1B[3J also clears scrollback so repeated
// redraws don't accumulate in the terminal's history.
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
let cachedBannerVersion: string | null = null;

export function banner(version: string): string {
  if (cachedBanner !== null && cachedBannerVersion === version) {
    return cachedBanner;
  }

  const title = figlet.textSync('pushpop', { font: 'Small', horizontalLayout: 'default' });
  const mascot = [
    '♫ ♪ ♬ ♫ ♪ ♬ ♫ ♪ ♬ ♫ ♪ ♬ ♫ ♪',
    '♪    ╭─────────────╮      ♪',
    '♫   ▐██▌  ◕ ‿ ◕  ▐██▌    ♫',
    '♪                          ♪',
    '♪ ♫ ♬ ♪ ♫ ♬ ♪ ♫ ♬ ♪ ♫ ♬ ♪ ♫',
  ].join('\n');

  cachedBanner = [
    P(title),
    P(`                         v${version}`),
    '',
    P(mascot),
  ].join('\n');
  cachedBannerVersion = version;
  return cachedBanner;
}

export function statusPanel(lines: { label: string; value: string }[]): string {
  const rows = lines
    .map(({ label, value }) => `  ${DIM(label.padEnd(10))} ${W(value)}`)
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

function isPlaceholderLsUrl(url: string): boolean {
  return url.includes('YOUR_PRODUCT_ID');
}

export function showPaywall(context: 'inline' | 'box' = 'box'): void {
  const urlReady = !isPlaceholderLsUrl(LEMONSQUEEZY_URL);

  if (context === 'inline') {
    console.log('');
    console.log(`  ${P('⚠')}  ${W('Custom upload limit reached (2/2)')}`);
    if (urlReady) {
      console.log(`  ${DIM('Unlock unlimited for')} ${P(PRICE)} ${DIM('→')} ${DIM(LEMONSQUEEZY_URL)}`);
      console.log(`  ${DIM('Then run:')} ${P('pushpop activate <key>')}`);
    } else {
      console.log(`  ${DIM('Pro upgrade link coming soon — check back shortly.')}`);
    }
    console.log('');
    return;
  }

  const boxBody = urlReady
    ? [
        `${W('Custom upload limit reached')} ${DIM('(2/2 slots used)')}`,
        '',
        `${W('Unlock unlimited uploads for')} ${P(PRICE)}`,
        `${DIM(LEMONSQUEEZY_URL)}`,
        '',
        `${DIM('Then run:')} ${P('pushpop activate <your-license-key>')}`,
      ].join('\n')
    : [
        `${W('Custom upload limit reached')} ${DIM('(2/2 slots used)')}`,
        '',
        `${W('Pro upgrade link coming soon.')}`,
        `${DIM('Until then, back up existing uploads and check for a new release.')}`,
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
