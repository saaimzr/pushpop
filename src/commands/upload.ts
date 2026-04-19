import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ora from 'ora';
import {
  CUSTOM_DIR,
  ensureDirs,
  getLifetimeCustomUploads,
  incrementLifetimeCustomUploads,
} from '../lib/config.js';
import { normalizeWrappedInput } from '../lib/input.js';
import { playFilePath, isFfmpegAvailable, truncateAudio } from '../lib/audio.js';
import { navSelect, NAV_BACK } from '../lib/nav-select.js';
import { getAudioInfo, MAX_DURATION_SEC } from '../lib/validate.js';
import { FREE_TIER_LIMIT, isPro } from '../lib/license.js';
import { dim, fail, ok, purple, showPaywall, warn, warnColor, white } from '../lib/ui.js';

interface PreparedUpload {
  preparedPath: string;
  wasTruncated: boolean;
  finalDurationSec: number;
  cleanupPath?: string;
}

function buildUploadFrame(
  tagName: string,
  sourceDurationSec: number,
  finalDurationSec: number,
  wasTruncated: boolean,
  feedbackLine?: string,
): string {
  const lines = [
    `  ${white(`Ready to save "${tagName}"`)}`,
    `  ${dim(`Note: Custom tags are limited to ${MAX_DURATION_SEC.toFixed(1)} seconds. Longer files will be automatically truncated.`)}`,
    `  ${dim(`Source length: ${sourceDurationSec.toFixed(1)}s`)}`,
    wasTruncated
      ? `  ${white(`Final tag: first ${MAX_DURATION_SEC.toFixed(1)}s will be saved`)}` 
      : `  ${dim(`Final tag length: ${finalDurationSec.toFixed(1)}s`)}`,
  ];

  if (feedbackLine) {
    lines.push('', feedbackLine);
  }

  return [''].concat(lines).join('\n');
}

async function prepareUpload(normalizedPath: string, info: Awaited<ReturnType<typeof getAudioInfo>>): Promise<PreparedUpload> {
  if (info.durationSec <= MAX_DURATION_SEC) {
    return {
      preparedPath: normalizedPath,
      wasTruncated: false,
      finalDurationSec: info.durationSec,
    };
  }

  if (!isFfmpegAvailable()) {
    throw new Error(
      `File is ${info.durationSec.toFixed(1)}s (max ${MAX_DURATION_SEC}s). Install ffmpeg to enable auto-truncation, or trim the file manually.`,
    );
  }

  const tempPath = path.join(os.tmpdir(), `pushpop-${Date.now()}${info.ext}`);
  truncateAudio(normalizedPath, tempPath, MAX_DURATION_SEC);

  return {
    preparedPath: tempPath,
    wasTruncated: true,
    finalDurationSec: MAX_DURATION_SEC,
    cleanupPath: tempPath,
  };
}

async function confirmUpload(
  tagName: string,
  preparedUpload: PreparedUpload,
  sourceDurationSec: number,
): Promise<boolean> {
  let feedbackLine: string | undefined;

  while (true) {
    const action = await navSelect<'preview' | 'save' | 'cancel'>({
      frame: buildUploadFrame(
        tagName,
        sourceDurationSec,
        preparedUpload.finalDurationSec,
        preparedUpload.wasTruncated,
        feedbackLine,
      ),
      message: white('Choose an action:'),
      choices: [
        { name: `${purple('♫')}  Play preview`, value: 'preview' },
        { name: `${purple('✓')}  Confirm and save`, value: 'save' },
        { name: `${purple('✕')}  Cancel`, value: 'cancel' },
      ],
    });

    if (action === NAV_BACK || action === 'cancel') {
      return false;
    }

    if (action === 'preview') {
      const playback = await playFilePath(preparedUpload.preparedPath, {
        mode: 'preview',
        durationSec: preparedUpload.finalDurationSec,
      });
      feedbackLine = playback.started
        ? `  ${purple('♫')}  ${white('Preview played.')}`
        : `  ${warnColor('Preview unavailable on this system')}`;
      continue;
    }

    return true;
  }
}

export async function runUpload(filePath: string, opts: { name?: string }): Promise<boolean> {
  const normalized = normalizeWrappedInput(filePath);

  if (!fs.existsSync(normalized)) {
    fail(`File not found: ${normalized}`);
    return false;
  }

  ensureDirs();

  const pro = isPro();
  const lifetimeUploads = getLifetimeCustomUploads();

  if (!pro && lifetimeUploads >= FREE_TIER_LIMIT) {
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

  let preparedUpload: PreparedUpload;
  try {
    preparedUpload = await prepareUpload(normalized, info);
  } catch (error: unknown) {
    spinner.warn(error instanceof Error ? error.message : String(error));
    return false;
  }

  if (preparedUpload.wasTruncated) {
    spinner.succeed(`File was ${info.durationSec.toFixed(1)}s and will be saved as a ${MAX_DURATION_SEC.toFixed(1)}s tag`);
  } else {
    spinner.succeed(`Audio validated (${info.durationSec.toFixed(1)}s)`);
  }

  try {
    const confirmed = await confirmUpload(tagName, preparedUpload, info.durationSec);
    if (!confirmed) {
      warn('Upload cancelled.');
      return false;
    }

    fs.copyFileSync(preparedUpload.preparedPath, destPath);
    ok(`Saved as "${tagName}" -> ${destPath}`);

    if (!pro) {
      const newCount = incrementLifetimeCustomUploads();
      const remaining = Math.max(0, FREE_TIER_LIMIT - newCount);

      if (remaining > 0) {
        console.log(`\n  Custom uploads: ${newCount}/${FREE_TIER_LIMIT} slots used (${remaining} remaining)`);
      } else {
        warn(`All ${FREE_TIER_LIMIT} custom slots used. Next upload requires pro unlock.`);
      }
    }

    return true;
  } catch (error: unknown) {
    fail(error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    if (preparedUpload.cleanupPath && fs.existsSync(preparedUpload.cleanupPath)) {
      fs.unlinkSync(preparedUpload.cleanupPath);
    }
  }
}
