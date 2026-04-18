// Loads `.env` at process start. Silently no-ops if `.env` is absent — which is
// the expected state on every end-user machine, since `.env*` files are never
// published in the npm tarball (package.json `files` restricts publish to
// `dist/` + `assets/`).
//
// Import this module from `src/index.ts` BEFORE any module that reads
// `process.env`, so env values are available on first access.

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

function findEnvFile(): string | null {
  // When installed globally the CLI runs from somewhere under the npm global
  // prefix (e.g. `.../node_modules/pushpopper/dist/index.js`), and there will
  // never be a `.env` there. During local dev (`npm run dev`, `ts-node`, or
  // running from a clone) the file lives at the repo root, two levels above
  // this file. Only look there — no cwd-based lookup, which would cause
  // pushpop to accidentally read a user's project `.env`.
  try {
    const here = fileURLToPath(import.meta.url);
    const repoRoot = path.resolve(path.dirname(here), '..', '..');
    const candidate = path.join(repoRoot, '.env');
    return fs.existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

const envPath = findEnvFile();
if (envPath) {
  dotenvConfig({ path: envPath });
}
