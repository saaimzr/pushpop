import * as fs from 'fs';
import { execFileSync, spawn, spawnSync } from 'child_process';
import { SoundRef } from './config.js';
import { resolveBuiltinPath, resolveCustomPath } from './sounds.js';

export type PlaybackBackend = 'afplay' | 'mshta-wmp' | 'ffplay' | 'powershell' | 'none';
export type PlaybackMode = 'background' | 'preview';
export interface PlaybackResult {
  started: boolean;
  backend: PlaybackBackend;
}

interface PlaybackOptions {
  mode?: PlaybackMode;
}

const NO_PLAYBACK: PlaybackResult = { started: false, backend: 'none' };
const AUDIO_DEBUG_ENV = 'PUSHPOP_DEBUG_AUDIO';

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

function runDetached(command: string, args: string[]): boolean {
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

function runBlocking(command: string, args: string[], timeoutMs = 7000): boolean {
  try {
    const result = spawnSync(command, args, {
      stdio: 'ignore',
      windowsHide: true,
      timeout: timeoutMs,
    });
    return !result.error;
  } catch {
    return false;
  }
}

function runCommand(command: string, args: string[], mode: PlaybackMode, timeoutMs?: number): boolean {
  return mode === 'preview'
    ? runBlocking(command, args, timeoutMs)
    : runDetached(command, args);
}

function debugAudio(message: string): void {
  if (process.env[AUDIO_DEBUG_ENV] === '1') {
    console.error(`[pushpop audio] ${message}`);
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

function playMacOS(filePath: string, mode: PlaybackMode): PlaybackResult {
  return runCommand('afplay', [filePath], mode, 7000)
    ? { started: true, backend: 'afplay' }
    : NO_PLAYBACK;
}

function buildMshtaScript(filePath: string): string {
  const escapedPath = filePath.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return [
    'javascript:try{',
    'window.moveTo(-32000,-32000);window.resizeTo(0,0);',
    "window.player=new ActiveXObject('WMPlayer.OCX.7');",
    'window.player.settings.autoStart=false;',
    'window.player.settings.volume=100;',
    `window.player.URL='${escapedPath}';`,
    'window.player.controls.play();',
    'setTimeout(function(){try{window.player.controls.stop();}catch(e){} close();},4000);',
    '}catch(e){close();}',
  ].join('');
}

function playWindowsMshta(filePath: string, mode: PlaybackMode): PlaybackResult {
  return runCommand('mshta.exe', [buildMshtaScript(filePath)], mode, 6000)
    ? { started: true, backend: 'mshta-wmp' }
    : NO_PLAYBACK;
}

function playWindowsFfplay(filePath: string, mode: PlaybackMode): PlaybackResult {
  if (!isCommandAvailable('ffplay.exe')) {
    return NO_PLAYBACK;
  }

  return runCommand('ffplay.exe', ['-nodisp', '-autoexit', '-loglevel', 'quiet', filePath], mode, 7000)
    ? { started: true, backend: 'ffplay' }
    : NO_PLAYBACK;
}

function playWindowsPowershell(filePath: string, mode: PlaybackMode): PlaybackResult {
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

  return runCommand(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    mode,
    6000,
  )
    ? { started: true, backend: 'powershell' }
    : NO_PLAYBACK;
}

function playWindows(filePath: string, mode: PlaybackMode): PlaybackResult {
  const backends = mode === 'preview'
    ? [
        () => playWindowsFfplay(filePath, mode),
        () => playWindowsMshta(filePath, mode),
        () => playWindowsPowershell(filePath, mode),
      ]
    : [
        () => playWindowsMshta(filePath, mode),
        () => playWindowsFfplay(filePath, mode),
        () => playWindowsPowershell(filePath, mode),
      ];

  for (const attempt of backends) {
    const result = attempt();
    debugAudio(`windows mode=${mode} backend=${result.backend} started=${String(result.started)}`);
    if (result.started) {
      return result;
    }
  }

  return NO_PLAYBACK;
}

export function playSound(ref: SoundRef, options: PlaybackOptions = {}): PlaybackResult {
  const filePath = resolveSoundPath(ref);
  if (!filePath) return NO_PLAYBACK;
  return playFilePath(filePath, options);
}

export function playFilePath(filePath: string, options: PlaybackOptions = {}): PlaybackResult {
  const mode = options.mode ?? 'background';
  const platform = process.platform;

  if (platform === 'darwin') {
    return playMacOS(filePath, mode);
  }

  if (platform === 'win32') {
    return playWindows(filePath, mode);
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
