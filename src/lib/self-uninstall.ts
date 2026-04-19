import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync, spawn } from 'child_process';
//rip it killed itselffff
const PACKAGE_NAME = 'pushpopper';
const MANUAL_COMMAND = `npm uninstall -g ${PACKAGE_NAME}`;

export interface SelfUninstallResult {
  spawned: boolean;
  manualCommand: string;
}

function npmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function buildWindowsScript(): string {
  return [
    '@echo off',
    'timeout /t 2 /nobreak >nul',
    `call ${npmCommand()} uninstall -g ${PACKAGE_NAME} >nul 2>&1`,
    '(goto) 2>nul & del "%~f0"',
    '',
  ].join('\r\n');
}

function buildPosixScript(): string {
  return [
    '#!/bin/sh',
    'sleep 1.5',
    `npm uninstall -g ${PACKAGE_NAME} >/dev/null 2>&1`,
    'rm -- "$0" 2>/dev/null',
    '',
  ].join('\n');
}

function getGlobalPrefix(): string | null {
  try {
    return execFileSync(npmCommand(), ['prefix', '-g'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim() || null;
  } catch {
    return null;
  }
}

function getGlobalBin(): string | null {
  try {
    return execFileSync(npmCommand(), ['bin', '-g'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim() || null;
  } catch {
    return null;
  }
}

function isWritableDir(targetPath: string | null): boolean {
  if (!targetPath) return false;

  try {
    fs.accessSync(targetPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function canSelfUninstall(): boolean {
  const prefix = getGlobalPrefix();
  const bin = getGlobalBin();

  if (!prefix || !bin) {
    return false;
  }

  return isWritableDir(prefix) && isWritableDir(bin);
}

export function scheduleSelfUninstall(): SelfUninstallResult {
  const result: SelfUninstallResult = { spawned: false, manualCommand: MANUAL_COMMAND };

  if (!canSelfUninstall()) {
    return result;
  }

  try {
    const isWindows = process.platform === 'win32';
    const ext = isWindows ? '.cmd' : '.sh';
    const scriptPath = path.join(os.tmpdir(), `pushpop-uninstall-${Date.now()}${ext}`);
    const contents = isWindows ? buildWindowsScript() : buildPosixScript();

    fs.writeFileSync(scriptPath, contents, { encoding: 'utf8' });
    if (!isWindows) {
      fs.chmodSync(scriptPath, 0o755);
    }

    const child = isWindows
      ? spawn('cmd.exe', ['/c', 'start', '""', '/min', scriptPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      : spawn('sh', [scriptPath], {
        detached: true,
        stdio: 'ignore',
      });

    child.unref();
    result.spawned = true;
  } catch {
    result.spawned = false;
  }

  return result;
}
