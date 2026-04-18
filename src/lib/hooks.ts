import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { HOOKS_DIR } from './config.js';

const POST_COMMIT_HOOK = `#!/bin/sh
# pushpop: play commit sound, then chain to project hook
# Skip sounds triggered by npm version (npm_command=version is set in child processes)
if [ "\${npm_command}" != "version" ]; then
  pushpop play --event commit 2>/dev/null || true
fi

GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)
if [ -n "$GIT_DIR" ]; then
  PROJECT_HOOK="$GIT_DIR/hooks/post-commit"
  if [ -f "$PROJECT_HOOK" ] && [ -x "$PROJECT_HOOK" ]; then
    exec "$PROJECT_HOOK" "$@"
  fi
fi
`;

const PRE_PUSH_HOOK = `#!/bin/sh
# pushpop: play push sound, then chain to project hook
if [ "\${npm_command}" != "version" ]; then
  pushpop play --event push 2>/dev/null || true
fi

GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)
if [ -n "$GIT_DIR" ]; then
  PROJECT_HOOK="$GIT_DIR/hooks/pre-push"
  if [ -f "$PROJECT_HOOK" ] && [ -x "$PROJECT_HOOK" ]; then
    exec "$PROJECT_HOOK" "$@"
  fi
fi
`;

export function installHooks(): void {
  const postCommitPath = path.join(HOOKS_DIR, 'post-commit');
  const prePushPath = path.join(HOOKS_DIR, 'pre-push');

  fs.writeFileSync(postCommitPath, POST_COMMIT_HOOK, { mode: 0o755 });
  fs.writeFileSync(prePushPath, PRE_PUSH_HOOK, { mode: 0o755 });

  // Clean up legacy post-index-change hook from older pushpop versions.
  // It fired on both `git add` and `git commit`, which caused the add sound
  // to replay during commits. The feature has been dropped.
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
  // Preserve whatever the user had set previously so `uninstall` can restore it.
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
  [postCommitPath, prePushPath, legacyPostIndexChange].forEach((p) => {
    if (fs.existsSync(p)) fs.rmSync(p);
  });
}

