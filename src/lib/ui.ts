import chalk from 'chalk';
import figlet from 'figlet';
import boxen from 'boxen';
import { LEMONSQUEEZY_URL, PRICE } from './license.js';

const P = chalk.hex('#9B59B6');   // purple brand color
const W = chalk.white;
const DIM = chalk.dim;
//testt

export const purple = P;
export const white = W;
export const dim = DIM;

export function clearScreen(): void {
  process.stdout.write('\x1B[2J\x1B[0;0H');
}

export function banner(version: string): string {
  const title = figlet.textSync('pushpop', { font: 'Small', horizontalLayout: 'default' });
  const mascot = [
    '♫ ♪ ♬ ♫ ♪ ♬ ♫ ♪ ♬ ♫ ♪ ♬ ♫ ♪',
    '♪    ╭─────────────╮      ♪',
    '♫   ▐██▌  ◕ ‿ ◕  ▐██▌    ♫',
    '♪                          ♪',
    '♪ ♫ ♬ ♪ ♫ ♬ ♪ ♫ ♬ ♪ ♫ ♬ ♪ ♫',
  ].join('\n');

  return [
    P(title),
    P(`                         v${version}`),
    '',
    P(mascot),
  ].join('\n');
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

export function showPaywall(context: 'inline' | 'box' = 'box'): void {
  if (context === 'inline') {
    console.log('');
    console.log(`  ${P('⚠')}  ${W('Custom upload limit reached (2/2)')}`);
    console.log(`  ${DIM('Unlock unlimited for')} ${P(PRICE)} ${DIM('→')} ${DIM(LEMONSQUEEZY_URL)}`);
    console.log(`  ${DIM('Then run:')} ${P('pushpop activate <key>')}`);
    console.log('');
    return;
  }

  console.log('');
  console.log(
    boxen(
      [
        `${W('Custom upload limit reached')} ${DIM('(2/2 slots used)')}`,
        '',
        `${W('Unlock unlimited uploads for')} ${P(PRICE)}`,
        `${DIM(LEMONSQUEEZY_URL)}`,
        '',
        `${DIM('Then run:')} ${P('pushpop activate <your-license-key>')}`,
      ].join('\n'),
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: '#9B59B6',
        title: P('pushpop pro'),
        titleAlignment: 'center',
      }
    )
  );
}
