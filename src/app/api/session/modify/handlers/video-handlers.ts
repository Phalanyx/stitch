import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { VideoReference } from '@/types/video';
import { AudioReference } from '@/types/audio';
import {
  TimelineClip,
  findNearestValidPosition,
} from '@/lib/timeline-validation';
import { errorResponse } from '@/lib/api-response';
import {
  ModifyRequest,
  OperationContext,
  SessionState,
  HandlerResult,
} from './types';

/**
 * Handle add_video operation.
 */
export async function handleAddVideo(
  state: SessionState,
  body: ModifyRequest,
  context: OperationContext
): Promise<HandlerResult | NextResponse> {
  const { videoId, timestamp, trimStart, trimEnd } = body;

  if (!videoId) {
    return errorResponse('Missing videoId for add_video operation');
  }

  // Check if videoId is a UUID or TwelveLabs ID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(videoId);

  const video = await prisma.video.findFirst({
    where: {
      userId: context.user.id,
      ...(isUuid ? { id: videoId } : { twelveLabsId: videoId }),
    },
    include: { audio: true },
  });

  if (!video) {
    return errorResponse(`Video ${videoId} not found`);
  }

  if (!video.duration) {
    return errorResponse('Video duration not available. Please re-upload the video.');
  }

  const clipId = crypto.randomUUID();
  const fullDuration = video.duration;

  // Only apply trim values when explicitly provided (from search results)
  const hasTrim = trimStart !== undefined || trimEnd !== undefined;
  let clipTrimStart = 0;
  let clipTrimEnd = 0;
  let effectiveDuration = fullDuration;

  if (hasTrim) {
    clipTrimStart = trimStart ?? 0;
    clipTrimEnd = trimEnd !== undefined ? (fullDuration - trimEnd) : 0;
    effectiveDuration = fullDuration - clipTrimStart - clipTrimEnd;

    if (effectiveDuration <= 0) {
      return errorResponse('Invalid trim values: resulting clip duration would be <= 0');
    }
  }

  // Create new clip
  const newClip: VideoReference = {
    id: clipId,
    videoId: video.id,
    url: video.url,
    timestamp: 0,
    duration: fullDuration,
    ...(hasTrim && { trimStart: clipTrimStart, trimEnd: clipTrimEnd }),
  };

  // Determine position on timeline
  if (timestamp !== undefined) {
    newClip.timestamp = Math.max(0, timestamp);
  } else {
    const lastClip = state.sessionVideo[state.sessionVideo.length - 1];
    newClip.timestamp = lastClip
      ? lastClip.timestamp + (lastClip.duration - (lastClip.trimStart ?? 0) - (lastClip.trimEnd ?? 0))
      : 0;
  }

  // Find valid position (avoiding overlaps)
  const validTimestamp = findNearestValidPosition(
    state.sessionVideo as TimelineClip[],
    newClip as TimelineClip
  );
  newClip.timestamp = validTimestamp;

  const sessionVideo = [...state.sessionVideo, newClip];
  let sessionAudio = [...state.sessionAudio];
  let message: string;

  // Also add associated audio if it exists
  if (video.audio) {
    // Ensure at least one audio layer exists
    if (sessionAudio.length === 0) {
      sessionAudio = [{
        id: 'default',
        name: 'Audio 1',
        clips: [],
        muted: false,
      }];
    }

    const audioClipId = crypto.randomUUID();
    const audioFullDuration = video.audio.duration ?? fullDuration;

    // Only apply trim to audio when video has trim values
    let audioTrimStart = 0;
    let audioTrimEnd = 0;
    if (hasTrim) {
      audioTrimStart = clipTrimStart;
      audioTrimEnd = trimEnd !== undefined ? (audioFullDuration - trimEnd) : 0;
    }

    const newAudioClip: AudioReference = {
      id: audioClipId,
      audioId: video.audio.id,
      url: video.audio.url,
      timestamp: validTimestamp, // Same timestamp as video
      duration: audioFullDuration,
      ...(hasTrim && { trimStart: audioTrimStart, trimEnd: audioTrimEnd }),
    };

    // Find valid position for audio (avoiding overlaps in audio layer)
    const layerClips = sessionAudio[0].clips;
    const validAudioTimestamp = findNearestValidPosition(
      layerClips as TimelineClip[],
      newAudioClip as TimelineClip
    );
    newAudioClip.timestamp = validAudioTimestamp;

    // Add to first audio layer
    sessionAudio = sessionAudio.map((layer, i) =>
      i === 0
        ? { ...layer, clips: [...layer.clips, newAudioClip] }
        : layer
    );

    message = `Added video at ${validTimestamp.toFixed(1)}s and audio at ${validAudioTimestamp.toFixed(1)}s (clip: ${effectiveDuration.toFixed(1)}s)`;
  } else {
    message = `Added video to timeline at ${validTimestamp.toFixed(1)}s (clip: ${effectiveDuration.toFixed(1)}s)`;
  }

  return { message, sessionVideo, sessionAudio };
}

/**
 * Handle remove_clip operation.
 */
export async function handleRemoveClip(
  state: SessionState,
  body: ModifyRequest
): Promise<HandlerResult | NextResponse> {
  const { clipId } = body;

  if (!clipId) {
    return errorResponse('Missing clipId for remove_clip operation');
  }

  const clipIndex = state.sessionVideo.findIndex(
    (c) => c.id === clipId || c.videoId === clipId
  );

  if (clipIndex === -1) {
    return errorResponse(`Clip ${clipId} not found on timeline`);
  }

  const sessionVideo = state.sessionVideo.filter((_, i) => i !== clipIndex);

  return {
    message: 'Removed clip from timeline',
    sessionVideo,
    sessionAudio: state.sessionAudio,
  };
}

/**
 * Handle move_clip operation.
 */
export async function handleMoveClip(
  state: SessionState,
  body: ModifyRequest
): Promise<HandlerResult | NextResponse> {
  const { clipId, timestamp } = body;

  if (!clipId) {
    return errorResponse('Missing clipId for move_clip operation');
  }
  if (timestamp === undefined || timestamp < 0) {
    return errorResponse('Invalid or missing timestamp for move_clip operation');
  }

  const clipIndex = state.sessionVideo.findIndex(
    (c) => c.id === clipId || c.videoId === clipId
  );

  if (clipIndex === -1) {
    return errorResponse(`Clip ${clipId} not found on timeline`);
  }

  const clip = state.sessionVideo[clipIndex];
  const testClip: TimelineClip = {
    id: clip.id,
    timestamp,
    duration: clip.duration,
    trimStart: clip.trimStart,
    trimEnd: clip.trimEnd,
  };

  // Find valid position
  const validTimestamp = findNearestValidPosition(
    state.sessionVideo as TimelineClip[],
    testClip,
    clip.id
  );

  const sessionVideo = state.sessionVideo.map((c, i) =>
    i === clipIndex ? { ...c, timestamp: validTimestamp } : c
  );

  return {
    message: `Moved clip to ${validTimestamp.toFixed(1)}s`,
    sessionVideo,
    sessionAudio: state.sessionAudio,
  };
}

/**
 * Handle trim_clip operation.
 */
export async function handleTrimClip(
  state: SessionState,
  body: ModifyRequest
): Promise<HandlerResult | NextResponse> {
  const { clipId, trimStart, trimEnd } = body;

  if (!clipId) {
    return errorResponse('Missing clipId for trim_clip operation');
  }
  if (trimStart === undefined && trimEnd === undefined) {
    return errorResponse('At least one of trimStart or trimEnd required');
  }

  const clipIndex = state.sessionVideo.findIndex(
    (c) => c.id === clipId || c.videoId === clipId
  );

  if (clipIndex === -1) {
    return errorResponse(`Clip ${clipId} not found on timeline`);
  }

  const updates: Partial<VideoReference> = {};
  if (trimStart !== undefined) updates.trimStart = Math.max(0, trimStart);
  if (trimEnd !== undefined) updates.trimEnd = Math.max(0, trimEnd);

  const sessionVideo = state.sessionVideo.map((c, i) =>
    i === clipIndex ? { ...c, ...updates } : c
  );

  return {
    message: 'Trimmed clip',
    sessionVideo,
    sessionAudio: state.sessionAudio,
  };
}
