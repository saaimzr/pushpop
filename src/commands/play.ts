import { getConfig } from '../lib/config.js';
import { playSound, resolveSoundPath } from '../lib/audio.js';

type Event = 'commit' | 'push';

export function runPlay(event: Event): void {
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

  playSound(soundRef, { mode: 'background' });
  // Silent if no sound configured; never break git workflow.
}
