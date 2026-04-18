// Detached helper to run `npm uninstall -g pushpopper` after the current
// process exits. Needed because a running executable cannot delete itself on
// Windows (the OS keeps file handles open). Pattern: write a tiny shell script
// to tmpdir, spawn it detached with stdio ignored, unref so the parent can
// exit cleanly, and the helper sleeps briefly before running npm uninstall.
//
// If spawning fails for any reason (npm not on PATH, permissions, unusual npm
// prefix with nvm/fnm/volta), return `{ spawned: false, manualCommand }` so
// the caller can print the manual command as a fallback. The user is never
// left confused.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';

const PACKAGE_NAME = 'pushpopper';
const MANUAL_COMMAND = `npm uninstall -g ${PACKAGE_NAME}`;

export interface SelfUninstallResult {
  spawned: boolean;
  manualCommand: string;
}

function buildWindowsScript(): string {
  // `timeout /t 2 /nobreak >nul` pauses ~2s so the pushpop process exits and
  // releases its binary handle before npm tries to overwrite/delete it.
  // `del "%~f0"` at the end lets the helper script self-delete after running.
  return [
    '@echo off',
    'timeout /t 2 /nobreak >nul',
    `call npm uninstall -g ${PACKAGE_NAME} >nul 2>&1`,
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

export function scheduleSelfUninstall(): SelfUninstallResult {
  const result: SelfUninstallResult = { spawned: false, manualCommand: MANUAL_COMMAND };

  try {
    const isWindows = process.platform === 'win32';
    const ext = isWindows ? '.cmd' : '.sh';
    const scriptPath = path.join(os.tmpdir(), `pushpop-uninstall-${Date.now()}${ext}`);
    const contents = isWindows ? buildWindowsScript() : buildPosixScript();

    fs.writeFileSync(scriptPath, contents, { encoding: 'utf8' });
    if (!isWindows) {
      try {
        fs.chmodSync(scriptPath, 0o755);
      } catch {
        // non-fatal; sh will still execute via explicit `sh <path>` fallback
      }
    }

    // On Windows, spawning a .cmd must go through cmd.exe.
    // On POSIX, spawn the script directly (shebang takes over) — or sh as a
    // fallback if chmod failed.
    const child = isWindows
      ? spawn('cmd.exe', ['/c', 'start', '""', '/min', scriptPath], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        })
      : spawn('sh', [scriptPath], { detached: true, stdio: 'ignore' });

    child.on('error', () => {
      // Best-effort; we already know we've returned a result by now.
    });
    child.unref();
    result.spawned = true;
  } catch {
    result.spawned = false;
  }

  return result;
}
