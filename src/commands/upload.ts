import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CUSTOM_DIR, ensureDirs, getLifetimeCustomUploads, incrementLifetimeCustomUploads } from '../lib/config.js';
import { playFilePath, isFfmpegAvailable, truncateAudio } from '../lib/audio.js';
import { normalizeWrappedInput } from '../lib/input.js';
import { FREE_TIER_LIMIT, isPro } from '../lib/license.js';
import { getAudioInfo, MAX_DURATION_SEC } from '../lib/validate.js';

export interface PreparedUploadSession {
  preparedPath: string;
  cleanupPath?: string;
  sourcePath: string;
  sourceDurationSec: number;
  finalDurationSec: number;
  wasTruncated: boolean;
  tagName: string;
  destinationPath: string;
}

export interface SavedUploadResult {
  destinationPath: string;
  limitReached: boolean;
  remainingUploads: number;
  uploadsUsed: number;
}

interface PreparedUpload {
  preparedPath: string;
  wasTruncated: boolean;
  finalDurationSec: number;
  cleanupPath?: string;
}

function assertUploadAllowed(): void {
  const lifetimeUploads = getLifetimeCustomUploads();

  if (!isPro() && lifetimeUploads >= FREE_TIER_LIMIT) {
    throw new Error(`Custom upload limit reached (${lifetimeUploads}/${FREE_TIER_LIMIT} slots)`);
  }
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

export async function prepareUploadSession(filePath: string, opts: { name?: string }): Promise<PreparedUploadSession> {
  const normalized = normalizeWrappedInput(filePath);

  if (!fs.existsSync(normalized)) {
    throw new Error(`File not found: ${normalized}`);
  }

  ensureDirs();
  assertUploadAllowed();

  const info = await getAudioInfo(normalized);
  const preparedUpload = await prepareUpload(normalized, info);
  const tagName = opts.name
    ? opts.name.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()
    : path.basename(normalized, info.ext);

  return {
    preparedPath: preparedUpload.preparedPath,
    cleanupPath: preparedUpload.cleanupPath,
    sourcePath: normalized,
    sourceDurationSec: info.durationSec,
    finalDurationSec: preparedUpload.finalDurationSec,
    wasTruncated: preparedUpload.wasTruncated,
    tagName,
    destinationPath: path.join(CUSTOM_DIR, `${tagName}${info.ext}`),
  };
}

export function cleanupPreparedUpload(session: PreparedUploadSession): void {
  if (session.cleanupPath && fs.existsSync(session.cleanupPath)) {
    fs.unlinkSync(session.cleanupPath);
  }
}

export async function previewPreparedUpload(session: PreparedUploadSession): Promise<boolean> {
  const playback = await playFilePath(session.preparedPath, {
    mode: 'preview',
    durationSec: session.finalDurationSec,
  });

  return playback.started;
}

export function savePreparedUpload(session: PreparedUploadSession): SavedUploadResult {
  fs.copyFileSync(session.preparedPath, session.destinationPath);

  if (isPro()) {
    return {
      destinationPath: session.destinationPath,
      limitReached: false,
      remainingUploads: Number.POSITIVE_INFINITY,
      uploadsUsed: getLifetimeCustomUploads(),
    };
  }

  const uploadsUsed = incrementLifetimeCustomUploads();
  const remainingUploads = Math.max(0, FREE_TIER_LIMIT - uploadsUsed);

  return {
    destinationPath: session.destinationPath,
    limitReached: remainingUploads === 0,
    remainingUploads,
    uploadsUsed,
  };
}
