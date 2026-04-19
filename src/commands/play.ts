import * as fs from 'fs';
import * as path from 'path';
import { PUSHPOP_DIR, getConfig } from '../lib/config.js';
import { playSound, resolveSoundPath } from '../lib/audio.js';

type Event = 'commit' | 'push';
const DEBOUNCE_WINDOW_MS = 2000;

function markerPathFor(event: Event): string {
  return path.join(PUSHPOP_DIR, `.last-play-${event}`);
}

function shouldDebounce(event: Event): boolean {
  try {
    const ageMs = Date.now() - fs.statSync(markerPathFor(event)).mtimeMs;
    return ageMs >= 0 && ageMs < DEBOUNCE_WINDOW_MS;
  } catch {
    return false;
  }
}

function recordPlaybackAttempt(event: Event): void {
  try {
    fs.mkdirSync(PUSHPOP_DIR, { recursive: true });
    const markerPath = markerPathFor(event);
    fs.closeSync(fs.openSync(markerPath, 'a'));
    const now = new Date();
    fs.utimesSync(markerPath, now, now);
  } catch {
    // Ignore debounce bookkeeping failures; audio should still try to play.
  }
}

export async function runPlay(event: Event): Promise<void> {
  const { assignments } = getConfig();
  const soundRef = assignments[event];

  if (!soundRef) {
    return;
  }

  const resolved = resolveSoundPath(soundRef);
  if (!resolved) {
    if (process.env.PUSHPOP_DEBUG_AUDIO === '1') {
      console.error(`[pushpop audio] ${event} assignment missing file: ${soundRef.name}`);
    }
    return;
  }

  if (shouldDebounce(event)) {
    return;
  }

  recordPlaybackAttempt(event);
  await playSound(soundRef, { mode: 'background' });
  // Silent if no sound configured; never break git workflow.
}
