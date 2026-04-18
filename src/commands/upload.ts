import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import ora from 'ora';
import { CUSTOM_DIR, getCustomUploadCount, ensureDirs } from '../lib/config.js';
import { getAudioInfo, MAX_DURATION_SEC } from '../lib/validate.js';
import { isFfmpegAvailable, truncateAudio } from '../lib/audio.js';
import { isPro, FREE_TIER_LIMIT } from '../lib/license.js';
import { ok, warn, fail, showPaywall } from '../lib/ui.js';

export async function runUpload(filePath: string, opts: { name?: string }): Promise<void> {
  if (!fs.existsSync(filePath)) {
    fail(`File not found: ${filePath}`);
    process.exit(1);
  }

  ensureDirs();

  const uploadCount = getCustomUploadCount();
  const pro = isPro();

  if (!pro && uploadCount >= FREE_TIER_LIMIT) {
    showPaywall('box');
    process.exit(1);
  }

  const spinner = ora({ text: 'Reading audio file...', color: 'magenta' }).start();

  let info: Awaited<ReturnType<typeof getAudioInfo>>;
  try {
    info = await getAudioInfo(filePath);
  } catch (e: unknown) {
    spinner.fail((e as Error).message);
    process.exit(1);
  }

  const tagName = opts.name
    ? opts.name.replace(/[^a-z0-9_-]/gi, '-').toLowerCase()
    : path.basename(filePath, info.ext);

  const destPath = path.join(CUSTOM_DIR, `${tagName}${info.ext}`);

  let srcPath = filePath;

  if (info.durationSec > MAX_DURATION_SEC) {
    if (!isFfmpegAvailable()) {
      spinner.warn(
        `File is ${info.durationSec.toFixed(1)}s (max ${MAX_DURATION_SEC}s). Install ffmpeg to enable auto-truncation, or trim the file manually.`
      );
      process.exit(1);
    }

    spinner.text = `Truncating to first ${MAX_DURATION_SEC}s...`;
    const tmpPath = path.join(os.tmpdir(), `pushpop-${Date.now()}${info.ext}`);
    try {
      truncateAudio(filePath, tmpPath, MAX_DURATION_SEC);
      srcPath = tmpPath;
    } catch {
      spinner.fail('ffmpeg truncation failed. Try trimming the file manually to ≤3 seconds.');
      process.exit(1);
    }

    spinner.succeed(
      `File was ${info.durationSec.toFixed(1)}s — truncated to first ${MAX_DURATION_SEC}s`
    );
  } else {
    spinner.succeed(`Audio validated (${info.durationSec.toFixed(1)}s)`);
  }

  fs.copyFileSync(srcPath, destPath);
  ok(`Saved as "${tagName}" → ${destPath}`);

  const newCount = getCustomUploadCount();
  if (!pro) {
    const remaining = FREE_TIER_LIMIT - newCount;
    if (remaining > 0) {
      console.log(`\n  Custom uploads: ${newCount}/${FREE_TIER_LIMIT} slots used (${remaining} remaining)`);
    } else {
      warn(`All ${FREE_TIER_LIMIT} custom slots used. Next upload requires pro unlock.`);
    }
  }

  console.log(`\n  Run pushpop to assign it to commit or push.`);
}
