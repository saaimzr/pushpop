import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { getConfig, HOOKS_DIR } from '../lib/config.js';
import { detectAvailablePlaybackBackend, isFfmpegAvailable, resolveSoundPath } from '../lib/audio.js';
import { resolvePushpopBinaryPath } from '../lib/hooks.js';
import { isPro } from '../lib/license.js';

function readCommandOutput(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim() || null;
  } catch {
    return null;
  }
}

function describeHook(fileName: 'post-commit' | 'pre-push'): string {
  const hookPath = path.join(HOOKS_DIR, fileName);
  if (!fs.existsSync(hookPath)) {
    return `${hookPath} (missing)`;
  }

  try {
    const stat = fs.statSync(hookPath);
    const executable = process.platform === 'win32' || Boolean(stat.mode & 0o111);
    return `${hookPath} (${executable ? 'executable' : 'not executable'})`;
  } catch {
    return `${hookPath} (unreadable)`;
  }
}

function formatAssignment(name: 'commit' | 'push'): string {
  const ref = getConfig().assignments[name];
  if (!ref) return `${name}: not set`;

  const resolved = resolveSoundPath(ref);
  if (!resolved) return `${name}: ${ref.name} (file missing)`;

  return `${name}: ${ref.name} -> ${resolved}`;
}

export function runDoctor(): void {
  const config = getConfig();
  const gitVersion = readCommandOutput('git', ['--version']) ?? 'not found';
  const nodeVersion = process.version;
  const ffmpeg = isFfmpegAvailable() ? 'available' : 'missing';
  const backend = detectAvailablePlaybackBackend();
  const binaryPath = resolvePushpopBinaryPath() ?? 'pushpop';

  const lines = [
    'pushpop doctor',
    '---------------',
    `os: ${os.platform()} ${os.release()} (${os.arch()})`,
    `node: ${nodeVersion}`,
    `git: ${gitVersion}`,
    `ffmpeg: ${ffmpeg}`,
    `audio backend: ${backend}`,
    `pushpop bin: ${binaryPath}`,
    `post-commit hook: ${describeHook('post-commit')}`,
    `pre-push hook: ${describeHook('pre-push')}`,
    formatAssignment('commit'),
    formatAssignment('push'),
    `volume: ${config.volume ?? 70}%`,
    `pro: ${isPro() ? 'yes' : 'no'}`,
    `last validated: ${config.lastValidatedAt ?? 'n/a'}`,
  ];

  console.log(lines.join('\n'));
}
