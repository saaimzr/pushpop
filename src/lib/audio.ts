import * as fs from 'fs';
import { execFileSync, spawn, spawnSync } from 'child_process';
import { SoundRef } from './config.js';
import { resolveBuiltinPath, resolveCustomPath } from './sounds.js';

export type PlaybackBackend = 'afplay' | 'mshta-wmp' | 'ffplay' | 'powershell' | 'none';
export interface PlaybackResult {
  started: boolean;
  backend: PlaybackBackend;
}

const NO_PLAYBACK: PlaybackResult = { started: false, backend: 'none' };

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

function spawnDetached(command: string, args: string[]): boolean {
  try {
    spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    return true;
  } catch {
    return false;
  }
}

function isCommandAvailable(command: string, probeArgs: string[] = ['-version']): boolean {
  try {
    const result = spawnSync(command, probeArgs, {
      stdio: 'ignore',
      windowsHide: true,
    });
    return !result.error;
  } catch {
    return false;
  }
}

function playMacOS(filePath: string): PlaybackResult {
  return spawnDetached('afplay', [filePath])
    ? { started: true, backend: 'afplay' }
    : NO_PLAYBACK;
}

function buildMshtaScript(filePath: string): string {
  const escapedPath = filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return [
    'javascript:try{',
    "var player=new ActiveXObject('WMPlayer.OCX.7');",
    'player.settings.volume=100;',
    `player.URL='${escapedPath}';`,
    'player.controls.play();',
    'setTimeout(function(){close();},4000);',
    '}catch(e){close();}',
  ].join('');
}

function playWindowsMshta(filePath: string): PlaybackResult {
  return spawnDetached('mshta.exe', [buildMshtaScript(filePath)])
    ? { started: true, backend: 'mshta-wmp' }
    : NO_PLAYBACK;
}

function playWindowsFfplay(filePath: string): PlaybackResult {
  if (!isCommandAvailable('ffplay.exe')) {
    return NO_PLAYBACK;
  }

  return spawnDetached('ffplay.exe', ['-nodisp', '-autoexit', '-loglevel', 'quiet', filePath])
    ? { started: true, backend: 'ffplay' }
    : NO_PLAYBACK;
}

function playWindowsPowershell(filePath: string): PlaybackResult {
  const escaped = filePath.replace(/'/g, "''");
  const script = [
    `$wmp = New-Object -ComObject WMPlayer.OCX.7;`,
    `$wmp.settings.autoStart = $false;`,
    `$wmp.settings.volume = 100;`,
    `$wmp.URL = '${escaped}';`,
    `Start-Sleep -Milliseconds 200;`,
    `$wmp.controls.play();`,
    `Start-Sleep -Seconds 4;`,
  ].join(' ');

  return spawnDetached('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script])
    ? { started: true, backend: 'powershell' }
    : NO_PLAYBACK;
}

function playWindows(filePath: string): PlaybackResult {
  const backends = [
    () => playWindowsMshta(filePath),
    () => playWindowsFfplay(filePath),
    () => playWindowsPowershell(filePath),
  ];

  for (const attempt of backends) {
    const result = attempt();
    if (result.started) {
      return result;
    }
  }

  return NO_PLAYBACK;
}

export function playSound(ref: SoundRef): PlaybackResult {
  const filePath = resolveSoundPath(ref);
  if (!filePath) return NO_PLAYBACK;
  return playFilePath(filePath);
}

export function playFilePath(filePath: string): PlaybackResult {
  const platform = process.platform;
  if (platform === 'darwin') {
    return playMacOS(filePath);
  }

  if (platform === 'win32') {
    return playWindows(filePath);
  }

  return NO_PLAYBACK;
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
