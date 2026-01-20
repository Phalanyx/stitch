import { VideoReference } from '@/types/video';
import { AudioLayer, AudioReference } from '@/types/audio';
import { NextResponse } from 'next/server';

/**
 * Request body for modify operations.
 */
export interface ModifyRequest {
  operation: string;
  videoId?: string;
  audioId?: string;
  clipId?: string;
  timestamp?: number;
  trimStart?: number;
  trimEnd?: number;
  layerId?: string;
  depth?: number;
}

/**
 * Context passed to operation handlers.
 */
export interface OperationContext {
  user: { id: string };
}

/**
 * State that handlers can read and modify.
 */
export interface SessionState {
  sessionVideo: VideoReference[];
  sessionAudio: AudioLayer[];
}

/**
 * Result of a successful handler execution.
 */
export interface HandlerResult {
  message: string;
  sessionVideo: VideoReference[];
  sessionAudio: AudioLayer[];
}

/**
 * Handler function signature.
 */
export type OperationHandler = (
  state: SessionState,
  body: ModifyRequest,
  context: OperationContext
) => Promise<HandlerResult | NextResponse>;

/**
 * Create an AudioReference from audio data.
 */
export function createAudioReference(
  audio: { id: string; url: string; duration: number | null },
  clipId: string,
  timestamp: number,
  options?: { trimStart?: number; trimEnd?: number }
): AudioReference {
  const ref: AudioReference = {
    id: clipId,
    audioId: audio.id,
    url: audio.url,
    timestamp,
    duration: audio.duration ?? 5,
  };

  if (options?.trimStart !== undefined) {
    ref.trimStart = options.trimStart;
  }
  if (options?.trimEnd !== undefined) {
    ref.trimEnd = options.trimEnd;
  }

  return ref;
}
