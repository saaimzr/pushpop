import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import ora from 'ora';
import { CUSTOM_DIR, getCustomUploadCount, ensureDirs } from '../lib/config.js';
import { getAudioInfo, MAX_DURATION_SEC } from '../lib/validate.js';
import { isFfmpegAvailable, truncateAudio } from '../lib/audio.js';
import { FREE_TIER_LIMIT, isPro } from '../lib/license.js';
import { ok, warn, fail, showPaywall } from '../lib/ui.js';

// Returns true on success, false on any failure (never calls process.exit; caller decides)
export async function runUpload(filePath: string, opts: { name?: string }): Promise<boolean> {
  const normalized = filePath.replace(/^["']+|["']+$/g, '').trim();

  if (!fs.existsSync(normalized)) {
    fail(`File not found: ${normalized}`);
    return false;
  }

  ensureDirs();

  const uploadCount = getCustomUploadCount();
  const pro = isPro();

  if (!pro && uploadCount >= FREE_TIER_LIMIT) {
    showPaywall('box');
    return false;
  }

  const spinner = ora({ text: 'Reading audio file...', color: 'magenta' }).start();

  let info: Awaited<ReturnType<typeof getAudioInfo>>;
  try {
    info = await getAudioInfo(normalized);
  } catch (error: unknown) {
    spinner.fail(error instanceof Error ? error.message : String(error));
    return false;
  }

  const tagName = opts.name
    ? opts.name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
    : path.basename(normalized, info.ext);

  const destPath = path.join(CUSTOM_DIR, `${tagName}${info.ext}`);

  let srcPath = normalized;

  if (info.durationSec > MAX_DURATION_SEC) {
    if (!isFfmpegAvailable()) {
      spinner.warn(
        `File is ${info.durationSec.toFixed(1)}s (max ${MAX_DURATION_SEC}s). Install ffmpeg to enable auto-truncation, or trim the file manually.`,
      );
      return false;
    }

    spinner.text = `Truncating to first ${MAX_DURATION_SEC}s...`;
    const tmpPath = path.join(os.tmpdir(), `pushpop-${Date.now()}${info.ext}`);
    try {
      truncateAudio(normalized, tmpPath, MAX_DURATION_SEC);
      srcPath = tmpPath;
      spinner.succeed(`File was ${info.durationSec.toFixed(1)}s — truncated to first ${MAX_DURATION_SEC}s`);
    } catch {
      spinner.fail(`ffmpeg truncation failed. Try trimming the file manually to ${MAX_DURATION_SEC} seconds.`);
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      return false;
    }
  } else {
    spinner.succeed(`Audio validated (${info.durationSec.toFixed(1)}s)`);
  }

  try {
    fs.copyFileSync(srcPath, destPath);
  } finally {
    if (srcPath !== normalized && fs.existsSync(srcPath)) {
      fs.unlinkSync(srcPath);
    }
  }

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

  return true;
}
