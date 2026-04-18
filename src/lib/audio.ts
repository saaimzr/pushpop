import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync, spawn, spawnSync } from 'child_process';
import { parseFile } from 'music-metadata';
import { SoundRef, getVolume, DEFAULT_VOLUME } from './config.js';
import { resolveBuiltinPath, resolveCustomPath } from './sounds.js';

export type PlaybackBackend =
  | 'afplay'
  | 'mshta-wmp'
  | 'ffplay'
  | 'powershell'
  | 'paplay'
  | 'aplay'
  | 'mpg123'
  | 'none';
export type PlaybackMode = 'background' | 'preview';
export interface PlaybackResult {
  started: boolean;
  backend: PlaybackBackend;
}

interface PlaybackOptions {
  mode?: PlaybackMode;
  durationSec?: number;
}

const NO_PLAYBACK: PlaybackResult = { started: false, backend: 'none' };
const AUDIO_DEBUG_ENV = 'PUSHPOP_DEBUG_AUDIO';
const FALLBACK_PLAYBACK_WINDOW_MS = 7000;
const PLAYBACK_BUFFER_MS = 1500;
const BLOCKING_TIMEOUT_BUFFER_MS = 1500;
const MIN_PLAYBACK_WINDOW_MS = 1000;
const durationCache = new Map<string, number | null>();

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

function currentVolume(): number {
  try {
    return getVolume();
  } catch {
    return DEFAULT_VOLUME;
  }
}

function isValidDurationSec(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

async function getAudioDurationSec(filePath: string): Promise<number | null> {
  if (durationCache.has(filePath)) {
    return durationCache.get(filePath) ?? null;
  }

  try {
    const metadata = await parseFile(filePath, { duration: true });
    const durationSec = isValidDurationSec(metadata.format.duration) ? metadata.format.duration : null;
    durationCache.set(filePath, durationSec);
    return durationSec;
  } catch {
    durationCache.set(filePath, null);
    return null;
  }
}

async function resolvePlaybackWindowMs(filePath: string, durationSec?: number): Promise<number> {
  const resolvedDurationSec = isValidDurationSec(durationSec)
    ? durationSec
    : await getAudioDurationSec(filePath);

  if (!isValidDurationSec(resolvedDurationSec)) {
    return FALLBACK_PLAYBACK_WINDOW_MS;
  }

  return Math.max(MIN_PLAYBACK_WINDOW_MS, Math.ceil(resolvedDurationSec * 1000) + PLAYBACK_BUFFER_MS);
}

function getBlockingTimeoutMs(playbackWindowMs: number): number {
  return playbackWindowMs + BLOCKING_TIMEOUT_BUFFER_MS;
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

function runDetachedNoHide(command: string, args: string[]): boolean {
  try {
    spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      // No windowsHide — wscript //B is already invisible by design.
      // windowsHide sets CREATE_NO_WINDOW which breaks COM initialization for GUI hosts.
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
    return !result.error && result.status === 0;
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

function playMacOS(filePath: string, mode: PlaybackMode, blockingTimeoutMs: number): PlaybackResult {
  // afplay -v takes 0.0–1.0. Map 0–100 linearly; cap at 1.0.
  const afVol = Math.max(0, Math.min(1, currentVolume() / 100)).toFixed(3);
  return runCommand('afplay', ['-v', afVol, filePath], mode, blockingTimeoutMs)
    ? { started: true, backend: 'afplay' }
    : NO_PLAYBACK;
}

function buildVbsScript(filePath: string, volume: number, playbackWindowMs: number): string {
  const escaped = filePath.replace(/"/g, '""');
  return [
    'Dim oPlayer',
    'Set oPlayer = CreateObject("WMPlayer.OCX.7")',
    'oPlayer.settings.autoStart = False',
    `oPlayer.settings.volume = ${volume}`,
    `oPlayer.URL = "${escaped}"`,
    'oPlayer.controls.play()',
    `WScript.Sleep ${playbackWindowMs}`,
    'oPlayer.controls.stop()',
    'Set oPlayer = Nothing',
    'CreateObject("Scripting.FileSystemObject").DeleteFile WScript.ScriptFullName',
  ].join('\r\n');
}

function playWindowsWscript(
  filePath: string,
  mode: PlaybackMode,
  playbackWindowMs: number,
  blockingTimeoutMs: number,
): PlaybackResult {
  const tmpFile = path.join(os.tmpdir(), `pushpop-${Date.now()}.vbs`);
  try {
    fs.writeFileSync(tmpFile, buildVbsScript(filePath, currentVolume(), playbackWindowMs), 'utf8');
  } catch {
    return NO_PLAYBACK;
  }
  const ok = mode === 'preview'
    ? runBlocking('wscript.exe', ['//B', '//Nologo', tmpFile], blockingTimeoutMs)
    : runDetachedNoHide('wscript.exe', ['//B', '//Nologo', tmpFile]);
  return ok ? { started: true, backend: 'mshta-wmp' } : NO_PLAYBACK;
}

function playWindowsFfplay(filePath: string, mode: PlaybackMode, blockingTimeoutMs: number): PlaybackResult {
  if (!isCommandAvailable('ffplay.exe')) {
    return NO_PLAYBACK;
  }

  const vol = String(currentVolume());
  return runCommand(
    'ffplay.exe',
    ['-nodisp', '-autoexit', '-loglevel', 'quiet', '-volume', vol, filePath],
    mode,
    blockingTimeoutMs,
  )
    ? { started: true, backend: 'ffplay' }
    : NO_PLAYBACK;
}

function playWindowsPowershell(
  filePath: string,
  mode: PlaybackMode,
  playbackWindowMs: number,
  blockingTimeoutMs: number,
): PlaybackResult {
  const escaped = filePath.replace(/'/g, "''");
  const vol = currentVolume();
  const script = [
    `$wmp = New-Object -ComObject WMPlayer.OCX.7;`,
    `$wmp.settings.autoStart = $false;`,
    `$wmp.settings.volume = ${vol};`,
    `$wmp.URL = '${escaped}';`,
    `Start-Sleep -Milliseconds 200;`,
    `$wmp.controls.play();`,
    `Start-Sleep -Milliseconds ${playbackWindowMs};`,
    `$wmp.controls.stop();`,
  ].join(' ');

  return runCommand(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    mode,
    blockingTimeoutMs,
  )
    ? { started: true, backend: 'powershell' }
    : NO_PLAYBACK;
}

function playWindows(
  filePath: string,
  mode: PlaybackMode,
  playbackWindowMs: number,
  blockingTimeoutMs: number,
): PlaybackResult {
  // wscript + Windows Media Player COM is present on every modern Windows install;
  // ffplay is only available if the user installed ffmpeg separately.
  // PowerShell COM is a last-resort fallback for environments where both above
  // fail (e.g. Windows Defender quarantining the transient .vbs script).
  const backends = [
    () => playWindowsWscript(filePath, mode, playbackWindowMs, blockingTimeoutMs),
    () => playWindowsFfplay(filePath, mode, blockingTimeoutMs),
    () => playWindowsPowershell(filePath, mode, playbackWindowMs, blockingTimeoutMs),
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

// --- Linux ---

function playLinuxPaplay(filePath: string, mode: PlaybackMode, blockingTimeoutMs: number): PlaybackResult {
  if (!isCommandAvailable('paplay', ['--version'])) return NO_PLAYBACK;
  // paplay --volume expects 0–65536 (0x10000 = 100%). Remap linearly.
  const paVol = String(Math.max(0, Math.min(65536, Math.round(currentVolume() * 655.36))));
  return runCommand('paplay', [`--volume=${paVol}`, filePath], mode, blockingTimeoutMs)
    ? { started: true, backend: 'paplay' }
    : NO_PLAYBACK;
}

function playLinuxFfplay(filePath: string, mode: PlaybackMode, blockingTimeoutMs: number): PlaybackResult {
  if (!isCommandAvailable('ffplay', ['-version'])) return NO_PLAYBACK;
  const vol = String(currentVolume());
  return runCommand(
    'ffplay',
    ['-nodisp', '-autoexit', '-loglevel', 'quiet', '-volume', vol, filePath],
    mode,
    blockingTimeoutMs,
  )
    ? { started: true, backend: 'ffplay' }
    : NO_PLAYBACK;
}

function playLinuxAplay(filePath: string, mode: PlaybackMode, blockingTimeoutMs: number): PlaybackResult {
  if (!isCommandAvailable('aplay', ['--version'])) return NO_PLAYBACK;
  // aplay has no clean volume flag. Plays at source volume. Documented caveat.
  // aplay handles WAV natively; for mp3/m4a it will fail — we rely on earlier
  // backends to pick those up. This entry still exists as a safety net for
  // WAV-only ALSA-only boxes.
  return runCommand('aplay', ['-q', filePath], mode, blockingTimeoutMs)
    ? { started: true, backend: 'aplay' }
    : NO_PLAYBACK;
}

function playLinuxMpg123(filePath: string, mode: PlaybackMode, blockingTimeoutMs: number): PlaybackResult {
  if (!isCommandAvailable('mpg123', ['--version'])) return NO_PLAYBACK;
  // mpg123 -f takes scaling 0–32768 (0x8000 = 100%, the default). Remap.
  const scale = String(Math.max(0, Math.min(32768, Math.round(currentVolume() * 327.68))));
  return runCommand('mpg123', ['-q', '-f', scale, filePath], mode, blockingTimeoutMs)
    ? { started: true, backend: 'mpg123' }
    : NO_PLAYBACK;
}

function playLinux(filePath: string, mode: PlaybackMode, blockingTimeoutMs: number): PlaybackResult {
  const backends = [
    () => playLinuxPaplay(filePath, mode, blockingTimeoutMs),
    () => playLinuxFfplay(filePath, mode, blockingTimeoutMs),
    () => playLinuxAplay(filePath, mode, blockingTimeoutMs),
    () => playLinuxMpg123(filePath, mode, blockingTimeoutMs),
  ];

  for (const attempt of backends) {
    const result = attempt();
    debugAudio(`linux mode=${mode} backend=${result.backend} started=${String(result.started)}`);
    if (result.started) {
      return result;
    }
  }

  return NO_PLAYBACK;
}

export function detectAvailablePlaybackBackend(): PlaybackBackend {
  if (process.platform === 'darwin') {
    return isCommandAvailable('afplay', ['-h']) ? 'afplay' : 'none';
  }

  if (process.platform === 'win32') {
    if (isCommandAvailable('wscript.exe', ['//?'])) return 'mshta-wmp';
    if (isCommandAvailable('ffplay.exe')) return 'ffplay';
    if (
      isCommandAvailable('powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$PSVersionTable.PSVersion.ToString()',
      ])
    ) {
      return 'powershell';
    }
    return 'none';
  }

  if (process.platform === 'linux') {
    if (isCommandAvailable('paplay', ['--version'])) return 'paplay';
    if (isCommandAvailable('ffplay', ['-version'])) return 'ffplay';
    if (isCommandAvailable('aplay', ['--version'])) return 'aplay';
    if (isCommandAvailable('mpg123', ['--version'])) return 'mpg123';
    return 'none';
  }

  return 'none';
}

export async function playSound(ref: SoundRef, options: PlaybackOptions = {}): Promise<PlaybackResult> {
  const filePath = resolveSoundPath(ref);
  if (!filePath) return NO_PLAYBACK;
  return playFilePath(filePath, options);
}

export async function playFilePath(filePath: string, options: PlaybackOptions = {}): Promise<PlaybackResult> {
  const mode = options.mode ?? 'background';
  const platform = process.platform;
  const playbackWindowMs = await resolvePlaybackWindowMs(filePath, options.durationSec);
  const blockingTimeoutMs = getBlockingTimeoutMs(playbackWindowMs);

  if (platform === 'darwin') {
    return playMacOS(filePath, mode, blockingTimeoutMs);
  }

  if (platform === 'win32') {
    return playWindows(filePath, mode, playbackWindowMs, blockingTimeoutMs);
  }

  if (platform === 'linux') {
    return playLinux(filePath, mode, blockingTimeoutMs);
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
