import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CUSTOM_DIR } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_SOUNDS_DIR = path.join(__dirname, '../../assets/sounds');
const MANIFEST_PATH = path.join(ASSETS_SOUNDS_DIR, 'index.json');

export interface Sound {
  id: string;
  name: string;
  file: string;        // relative to assets/sounds/
  durationSec: number;
}

export interface Genre {
  id: string;
  label: string;
  symbol: string;
  sounds: Sound[];
}

interface Manifest {
  version: string;
  genres: Genre[];
}

function loadManifest(): Manifest {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf-8');
    return JSON.parse(raw) as Manifest;
  } catch {
    return { version: '1', genres: [] };
  }
}

export function getAllGenres(): Genre[] {
  return loadManifest().genres;
}

export function getSoundsForGenre(genreId: string): Sound[] {
  const genre = loadManifest().genres.find((g) => g.id === genreId);
  return genre?.sounds ?? [];
}

export function resolveBuiltinPath(file: string): string {
  return path.join(ASSETS_SOUNDS_DIR, file);
}

export function resolveCustomPath(filename: string): string {
  return path.join(CUSTOM_DIR, filename);
}

export function getCustomSounds(): Sound[] {
  if (!fs.existsSync(CUSTOM_DIR)) return [];
  return fs
    .readdirSync(CUSTOM_DIR)
    .filter((f) => /\.(mp3|wav|m4a)$/i.test(f))
    .sort()
    .map((f) => ({
      id: `custom:${f}`,
      name: f.replace(/\.(mp3|wav|m4a)$/i, ''),
      file: f,
      durationSec: 0,  // not pre-computed for custom sounds
    }));
}
