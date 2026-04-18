import * as fs from 'fs';
import { execFileSync, spawn } from 'child_process';
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
  spawn('afplay', [filePath], { detached: true, stdio: 'ignore' }).unref();
}

function playWindows(filePath: string): void {
  // Use WMPlayer COM object — works headless without a WPF dispatcher
  const escaped = filePath.replace(/'/g, "''"); // escape single quotes for PowerShell
  const script = [
    `$wmp = New-Object -ComObject WMPlayer.OCX.7;`,
    `$wmp.settings.autoStart = $false;`,
    `$wmp.settings.volume = 100;`,
    `$wmp.URL = '${escaped}';`,
    `Start-Sleep -Milliseconds 200;`,
    `$wmp.controls.play();`,
    `Start-Sleep -Seconds 4;`,
  ].join(' ');
  spawn(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    { detached: true, stdio: 'ignore' }
  ).unref();
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
  } else {
    console.warn('[pushpop] Audio playback is not supported on this platform (macOS and Windows only).');
  }
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
