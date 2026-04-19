import * as fs from 'fs';
import * as path from 'path';
import { execFileSync, execSync } from 'child_process';
import { HOOKS_DIR, PUSHPOP_DIR } from './config.js';

function readFirstLine(command: string, args: string[]): string | null {
  try {
    const output = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim();
    if (!output) return null;
    return output.split(/\r?\n/).find(Boolean) ?? null;
  } catch {
    return null;
  }
}

function quoteForSh(value: string): string | null {
  if (/[\0\r\n]/.test(value)) return null;
  return `'${value.replace(/'/g, String.raw`'"'"'`)}'`;
}

function toHookBinary(value: string): string {
  return process.platform === 'win32' ? value.replace(/\\/g, '/') : value;
}

function normalizeHooksPath(value: string, baseDir?: string): string {
  if (!baseDir) {
    return value.replace(/\\/g, '/');
  }

  if (path.isAbsolute(value)) {
    return value.replace(/\\/g, '/');
  }

  return path.resolve(baseDir, value).replace(/\\/g, '/');
}

export function getGlobalHooksPath(): string | null {
  return readFirstLine('git', ['config', '--global', '--get', 'core.hooksPath']);
}

export function resolveRepoRoot(startDir = process.cwd()): string | null {
  return readFirstLine('git', ['-C', startDir, 'rev-parse', '--show-toplevel']);
}

export function getLocalHooksPath(startDir = process.cwd()): string | null {
  const repoRoot = resolveRepoRoot(startDir);
  if (!repoRoot) return null;
  return readFirstLine('git', ['-C', repoRoot, 'config', '--local', '--get', 'core.hooksPath']);
}

export function getHooksPathDiagnostics(startDir = process.cwd()): {
  globalHooksPath: string | null;
  localHooksPath: string | null;
  repoRoot: string | null;
  overridesGlobal: boolean;
} {
  const globalHooksPath = getGlobalHooksPath();
  const repoRoot = resolveRepoRoot(startDir);
  const localHooksPath = repoRoot
    ? readFirstLine('git', ['-C', repoRoot, 'config', '--local', '--get', 'core.hooksPath'])
    : null;
  const resolvedGlobal = globalHooksPath ? normalizeHooksPath(globalHooksPath) : null;
  const resolvedLocal = repoRoot && localHooksPath
    ? normalizeHooksPath(localHooksPath, repoRoot)
    : null;

  return {
    globalHooksPath,
    localHooksPath,
    repoRoot,
    overridesGlobal: Boolean(resolvedLocal && resolvedLocal !== resolvedGlobal),
  };
}

export function resolvePushpopBinaryPath(): string | null {
  if (process.platform === 'win32') {
    const fromWhere =
      readFirstLine('where', ['pushpop.cmd']) ??
      readFirstLine('where', ['pushpop.exe']) ??
      readFirstLine('where', ['pushpop']);
    if (fromWhere && fs.existsSync(fromWhere)) {
      return path.resolve(fromWhere);
    }
  } else {
    const fromWhich = readFirstLine('which', ['pushpop']);
    if (fromWhich && fs.existsSync(fromWhich)) {
      return path.resolve(fromWhich);
    }
  }

  const argvPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
  if (argvPath && fs.existsSync(argvPath)) {
    return argvPath;
  }

  return null;
}

function buildHook(event: 'commit' | 'push', projectHookName: 'post-commit' | 'pre-push'): string {
  const resolvedBin = resolvePushpopBinaryPath();
  const quotedBin = resolvedBin ? quoteForSh(toHookBinary(resolvedBin)) : null;
  const binExpr = quotedBin ?? 'pushpop';

  return `#!/bin/sh
# pushpop: play ${event} sound, then chain to project hook
PUSHPOP_BIN=${binExpr}

GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)

if [ -z "$CI" ] && [ "\${npm_command}" != "version" ]; then
  PUSHPOP_INTERNAL_EVENT=${event} "$PUSHPOP_BIN" 2>/dev/null || true
fi

if [ -n "$GIT_DIR" ]; then
  PROJECT_HOOK="$GIT_DIR/hooks/${projectHookName}"
  if [ -f "$PROJECT_HOOK" ] && [ -x "$PROJECT_HOOK" ]; then
    exec "$PROJECT_HOOK" "$@"
  fi
fi
`;
}

export function installHooks(): void {
  const postCommitPath = path.join(HOOKS_DIR, 'post-commit');
  const prePushPath = path.join(HOOKS_DIR, 'pre-push');

  fs.writeFileSync(postCommitPath, buildHook('commit', 'post-commit'), { mode: 0o755 });
  fs.writeFileSync(prePushPath, buildHook('push', 'pre-push'), { mode: 0o755 });

  // Clean up legacy post-index-change hook from older pushpop versions.
  const legacyPostIndexChange = path.join(HOOKS_DIR, 'post-index-change');
  if (fs.existsSync(legacyPostIndexChange)) {
    try {
      fs.rmSync(legacyPostIndexChange);
    } catch {
      // best-effort cleanup
    }
  }
}

export function setGlobalHooksPath(): void {
  try {
    const prior = execSync('git config --global --get core.hooksPath', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const ourPath = HOOKS_DIR.replace(/\\/g, '/');
    if (prior && prior !== ourPath) {
      execSync(`git config --global pushpop.previousHooksPath "${prior}"`, { stdio: 'pipe' });
    }
  } catch {
    // no prior value, that's fine
  }

  execSync(`git config --global core.hooksPath "${HOOKS_DIR.replace(/\\/g, '/')}"`, {
    stdio: 'pipe',
  });
}

export function unsetGlobalHooksPath(): void {
  let prior = '';
  try {
    prior = execSync('git config --global --get pushpop.previousHooksPath', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    // no backup, that's fine
  }

  try {
    if (prior) {
      execSync(`git config --global core.hooksPath "${prior}"`, { stdio: 'pipe' });
    } else {
      execSync('git config --global --unset core.hooksPath', { stdio: 'pipe' });
    }
  } catch {
    // already unset, that's fine
  }

  try {
    execSync('git config --global --unset pushpop.previousHooksPath', { stdio: 'pipe' });
  } catch {
    // nothing to clear
  }
}

export function removeHooks(): void {
  const postCommitPath = path.join(HOOKS_DIR, 'post-commit');
  const prePushPath = path.join(HOOKS_DIR, 'pre-push');
  const legacyPostIndexChange = path.join(HOOKS_DIR, 'post-index-change');
  const markerFiles = [
    path.join(PUSHPOP_DIR, '.last-play-commit'),
    path.join(PUSHPOP_DIR, '.last-play-push'),
  ];

  [postCommitPath, prePushPath, legacyPostIndexChange, ...markerFiles].forEach((targetPath) => {
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath);
    }
  });
}
