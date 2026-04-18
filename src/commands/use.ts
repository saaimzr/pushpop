import { getConfig, setConfig, getCustomSoundFiles } from '../lib/config.js';
import { getAllGenres, getSoundsForGenre } from '../lib/sounds.js';
import { ok, fail } from '../lib/ui.js';
import type { SoundRef } from '../lib/config.js';

type Event = 'commit' | 'push' | 'both';

export function runUse(soundName: string, opts: { on: Event }): void {
  const event = opts.on ?? 'both';

  // Search custom sounds first
  const customFiles = getCustomSoundFiles();
  const customMatch = customFiles.find(
    (f) => f === soundName || f.replace(/\.(mp3|wav|m4a)$/i, '') === soundName
  );

  let ref: SoundRef | null = null;

  if (customMatch) {
    ref = { type: 'custom', name: customMatch.replace(/\.(mp3|wav|m4a)$/i, ''), file: customMatch };
  } else {
    // Search built-in sounds
    for (const genre of getAllGenres()) {
      const sound = getSoundsForGenre(genre.id).find(
        (s) => s.id === soundName || s.name.toLowerCase() === soundName.toLowerCase()
      );
      if (sound) {
        ref = { type: 'builtin', name: sound.name, file: sound.file };
        break;
      }
    }
  }

  if (!ref) {
    fail(`Sound "${soundName}" not found. Run pushpop to browse available sounds.`);
    process.exit(1);
  }

  const { assignments } = getConfig();

  if (event === 'commit' || event === 'both') assignments.commit = ref;
  if (event === 'push' || event === 'both') assignments.push = ref;

  setConfig({ assignments });

  const events = event === 'both' ? 'commit + push' : event;
  ok(`"${ref.name}" will now play on ${events}`);
}
