import { getConfig } from '../lib/config.js';
import { playSound } from '../lib/audio.js';

type Event = 'commit' | 'push';

export function runPlay(event: Event): void {
  const { assignments } = getConfig();
  const soundRef = assignments[event];

  if (soundRef) {
    playSound(soundRef, { mode: 'background' });
  }
  // Silent if no sound configured; never break git workflow.
}
