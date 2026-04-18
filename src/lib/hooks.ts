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

// Requires git 2.29+. $1=1 means the working tree was also updated (checkout/merge),
// so $1 != 1 means this is a pure staging operation (git add / git rm / git reset HEAD).
const POST_INDEX_CHANGE_HOOK = `#!/bin/sh
# pushpop: play add sound on git add (git 2.29+ only)
# $1=1 means a checkout also updated the working tree — skip those.
if [ "\${1}" != "1" ] && [ "\${npm_command}" != "version" ]; then
  pushpop play --event add 2>/dev/null || true
fi
`;

export function installHooks(): void {
  const postCommitPath = path.join(HOOKS_DIR, 'post-commit');
  const prePushPath = path.join(HOOKS_DIR, 'pre-push');
  const postIndexChangePath = path.join(HOOKS_DIR, 'post-index-change');

  fs.writeFileSync(postCommitPath, POST_COMMIT_HOOK, { mode: 0o755 });
  fs.writeFileSync(prePushPath, PRE_PUSH_HOOK, { mode: 0o755 });
  fs.writeFileSync(postIndexChangePath, POST_INDEX_CHANGE_HOOK, { mode: 0o755 });
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
  const postIndexChangePath = path.join(HOOKS_DIR, 'post-index-change');
  [postCommitPath, prePushPath, postIndexChangePath].forEach((p) => {
    if (fs.existsSync(p)) fs.rmSync(p);
  });
}
