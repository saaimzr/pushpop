import * as mm from 'music-metadata';
import * as path from 'path';

const SUPPORTED_CONTAINERS = ['MPEG', 'WAVE', 'M4A/mp42/isom', 'M4A', 'AAC'];
const SUPPORTED_EXTS = ['.mp3', '.wav', '.m4a'];
export const MAX_DURATION_SEC = 5.5;

export interface AudioInfo {
  durationSec: number;
  container: string;
  ext: string;
}

export async function getAudioInfo(filePath: string): Promise<AudioInfo> {
  const ext = path.extname(filePath).toLowerCase();

  if (!SUPPORTED_EXTS.includes(ext)) {
    throw new Error(`Unsupported file type "${ext}". Use .mp3, .wav, or .m4a`);
  }

  let meta: mm.IAudioMetadata;
  try {
    meta = await mm.parseFile(filePath);
  } catch {
    throw new Error('Could not read audio file. Make sure it is a valid .mp3, .wav, or .m4a');
  }

  const container = meta.format.container ?? '';
  const supported = SUPPORTED_CONTAINERS.some((c) =>
    container.toUpperCase().startsWith(c.toUpperCase())
  );
  if (!supported) {
    throw new Error(`File format "${container}" is not supported. Use .mp3, .wav, or .m4a`);
  }

  const durationSec = meta.format.duration ?? 0;

  return { durationSec, container, ext };
}
