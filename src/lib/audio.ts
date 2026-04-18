import * as fs from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import { SoundRef } from './config.js';
import { resolveBuiltinPath, resolveCustomPath } from './sounds.js';

export function resolveSoundPath(ref: SoundRef): string | null {
  const fullPath = ref.type === 'builtin'
    ? resolveBuiltinPath(ref.file)
    : resolveCustomPath(ref.file);

  try {
    fs.accessSync(fullPath);
    return fullPath;
  } catch {
    return null;
  }
}

function playMacOS(filePath: string): void {
  execFileSync('afplay', [filePath], { stdio: 'ignore' });
}

function playWindows(filePath: string): void {
  const normalized = filePath.replace(/\\/g, '/');
  const script = [
    'Add-Type -AssemblyName presentationCore;',
    '$p = New-Object system.windows.media.mediaplayer;',
    `$p.open([uri]"file:///${normalized}");`,
    '$p.Play();',
    'Start-Sleep -Milliseconds 4000;',
  ].join(' ');
  spawnSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
}

export function playSound(ref: SoundRef): void {
  const filePath = resolveSoundPath(ref);
  if (!filePath) return;
  playFilePath(filePath);
}

export function playFilePath(filePath: string): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    playMacOS(filePath);
  } else if (platform === 'win32') {
    playWindows(filePath);
  }
  // linux: v1.1
}

export function isFfmpegAvailable(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function truncateAudio(inputPath: string, outputPath: string, durationSec: number): void {
  execFileSync(
    'ffmpeg',
    ['-i', inputPath, '-t', String(durationSec), '-y', outputPath],
    { stdio: 'pipe' }
  );
}
