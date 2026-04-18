import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { HOOKS_DIR } from './config.js';

const POST_COMMIT_HOOK = `#!/bin/sh
# pushpop: play commit sound, then chain to project hook
pushpop play --event commit 2>/dev/null || true

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
pushpop play --event push 2>/dev/null || true

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
}

export function setGlobalHooksPath(): void {
  execSync(`git config --global core.hooksPath "${HOOKS_DIR.replace(/\\/g, '/')}"`, {
    stdio: 'pipe',
  });
}

export function unsetGlobalHooksPath(): void {
  try {
    execSync('git config --global --unset core.hooksPath', { stdio: 'pipe' });
  } catch {
    // already unset, that's fine
  }
}

export function removeHooks(): void {
  const postCommitPath = path.join(HOOKS_DIR, 'post-commit');
  const prePushPath = path.join(HOOKS_DIR, 'pre-push');
  [postCommitPath, prePushPath].forEach((p) => {
    if (fs.existsSync(p)) fs.rmSync(p);
  });
}
