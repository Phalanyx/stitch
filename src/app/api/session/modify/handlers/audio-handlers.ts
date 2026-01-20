import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AudioReference, AudioLayer } from '@/types/audio';
import {
  TimelineClip,
  findNearestValidPosition,
  findAvailableDepth,
} from '@/lib/timeline-validation';
import { errorResponse } from '@/lib/api-response';
import {
  ModifyRequest,
  OperationContext,
  SessionState,
  HandlerResult,
} from './types';

/**
 * Handle add_audio operation.
 */
export async function handleAddAudio(
  state: SessionState,
  body: ModifyRequest,
  context: OperationContext
): Promise<HandlerResult | NextResponse> {
  const { audioId, timestamp, layerId, depth } = body;

  if (!audioId) {
    return errorResponse('Missing audioId for add_audio operation');
  }

  // Validate audio exists and belongs to user
  const audio = await prisma.audio.findFirst({
    where: { id: audioId, userId: context.user.id },
  });

  if (!audio) {
    return errorResponse(`Audio ${audioId} not found`);
  }

  let sessionAudio = [...state.sessionAudio];

  // Find or create target layer
  let targetLayerIndex = layerId
    ? sessionAudio.findIndex((l) => l.id === layerId)
    : 0;

  if (targetLayerIndex === -1) {
    // Create new layer if specified layer doesn't exist
    const newLayer: AudioLayer = {
      id: layerId || crypto.randomUUID(),
      name: `Audio ${sessionAudio.length + 1}`,
      clips: [],
      muted: false,
    };
    sessionAudio = [...sessionAudio, newLayer];
    targetLayerIndex = sessionAudio.length - 1;
  }

  // Ensure at least one layer exists
  if (sessionAudio.length === 0) {
    sessionAudio = [{
      id: 'default',
      name: 'Audio 1',
      clips: [],
      muted: false,
    }];
    targetLayerIndex = 0;
  }

  const clipId = crypto.randomUUID();
  const duration = audio.duration ?? 5;
  const layerClips = sessionAudio[targetLayerIndex].clips;

  // Determine initial timestamp
  let newTimestamp: number;
  if (timestamp !== undefined) {
    newTimestamp = Math.max(0, timestamp);
  } else {
    const lastClip = layerClips[layerClips.length - 1];
    newTimestamp = lastClip
      ? lastClip.timestamp + (lastClip.duration - (lastClip.trimStart ?? 0) - (lastClip.trimEnd ?? 0))
      : 0;
  }

  // Determine depth: explicit or auto-assign based on initial timestamp
  let finalDepth = depth !== undefined
    ? depth
    : findAvailableDepth(layerClips as TimelineClip[], newTimestamp, duration);

  const newClip: AudioReference = {
    id: clipId,
    audioId: audio.id,
    url: audio.url,
    timestamp: newTimestamp,
    duration,
    depth: finalDepth,
  };

  // Validate position at assigned depth
  const validTimestamp = findNearestValidPosition(
    layerClips as TimelineClip[],
    newClip as TimelineClip
  );

  // If position changed and depth wasn't explicitly set, recalculate depth for new position
  if (validTimestamp !== newTimestamp && depth === undefined) {
    finalDepth = findAvailableDepth(layerClips as TimelineClip[], validTimestamp, duration);
  }

  newClip.timestamp = validTimestamp;
  newClip.depth = finalDepth;

  sessionAudio = sessionAudio.map((layer, i) =>
    i === targetLayerIndex
      ? { ...layer, clips: [...layer.clips, newClip] }
      : layer
  );

  return {
    message: `Added audio at ${validTimestamp.toFixed(1)}s, depth ${finalDepth}`,
    sessionVideo: state.sessionVideo,
    sessionAudio,
  };
}

/**
 * Handle remove_audio operation.
 */
export async function handleRemoveAudio(
  state: SessionState,
  body: ModifyRequest
): Promise<HandlerResult | NextResponse> {
  const { clipId } = body;

  if (!clipId) {
    return errorResponse('Missing clipId for remove_audio operation');
  }

  let found = false;
  const sessionAudio = state.sessionAudio.map((layer) => {
    const clipIndex = layer.clips.findIndex(
      (c) => c.id === clipId || c.audioId === clipId
    );
    if (clipIndex !== -1) {
      found = true;
      return {
        ...layer,
        clips: layer.clips.filter((_, i) => i !== clipIndex),
      };
    }
    return layer;
  });

  if (!found) {
    return errorResponse(`Audio clip ${clipId} not found on timeline`);
  }

  return {
    message: 'Removed audio clip from timeline',
    sessionVideo: state.sessionVideo,
    sessionAudio,
  };
}

/**
 * Handle move_audio operation.
 */
export async function handleMoveAudio(
  state: SessionState,
  body: ModifyRequest
): Promise<HandlerResult | NextResponse> {
  const { clipId, timestamp, depth } = body;

  if (!clipId) {
    return errorResponse('Missing clipId for move_audio operation');
  }
  if (timestamp === undefined || timestamp < 0) {
    return errorResponse('Invalid or missing timestamp for move_audio operation');
  }

  let found = false;
  let resultMessage = 'Moved audio clip';

  const sessionAudio = state.sessionAudio.map((layer) => {
    const clipIndex = layer.clips.findIndex(
      (c) => c.id === clipId || c.audioId === clipId
    );
    if (clipIndex !== -1) {
      found = true;
      const clip = layer.clips[clipIndex];
      const currentDepth = clip.depth ?? 0;

      // Determine target depth
      const targetDepth = depth !== undefined ? depth : currentDepth;

      // Get clip's visible duration
      const clipVisibleDuration = clip.duration - (clip.trimStart ?? 0) - (clip.trimEnd ?? 0);

      // Get other clips (excluding this one)
      const otherClips = layer.clips.filter(c => c.id !== clip.id) as TimelineClip[];

      // Check for overlap at target depth at target timestamp
      const hasOverlapAtTargetDepth = otherClips.some(c => {
        if ((c.depth ?? 0) !== targetDepth) return false;
        const cStart = c.timestamp;
        const cEnd = c.timestamp + (c.duration - (c.trimStart ?? 0) - (c.trimEnd ?? 0));
        const testStart = timestamp;
        const testEnd = timestamp + clipVisibleDuration;
        // Use epsilon tolerance like rangesOverlap
        return testStart < cEnd - 0.001 && testEnd > cStart + 0.001;
      });

      if (hasOverlapAtTargetDepth && depth !== undefined) {
        // User explicitly requested this depth but it overlaps
        // Find nearest valid position at that depth
        const testClip: TimelineClip = {
          id: clip.id,
          timestamp,
          duration: clip.duration,
          trimStart: clip.trimStart,
          trimEnd: clip.trimEnd,
          depth: targetDepth,
        };

        const validTimestamp = findNearestValidPosition(
          layer.clips as TimelineClip[],
          testClip,
          clip.id
        );

        resultMessage = `Moved audio clip to ${validTimestamp.toFixed(1)}s at depth ${targetDepth} (adjusted to avoid overlap)`;

        return {
          ...layer,
          clips: layer.clips.map((c, i) =>
            i === clipIndex ? { ...c, timestamp: validTimestamp, depth: targetDepth } : c
          ),
        };
      }

      // No overlap or depth not explicitly set - proceed with validation
      const testClip: TimelineClip = {
        id: clip.id,
        timestamp,
        duration: clip.duration,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        depth: targetDepth,
      };

      const validTimestamp = findNearestValidPosition(
        layer.clips as TimelineClip[],
        testClip,
        clip.id
      );

      resultMessage = `Moved audio clip to ${validTimestamp.toFixed(1)}s at depth ${targetDepth}`;

      return {
        ...layer,
        clips: layer.clips.map((c, i) =>
          i === clipIndex ? { ...c, timestamp: validTimestamp, depth: targetDepth } : c
        ),
      };
    }
    return layer;
  });

  if (!found) {
    return errorResponse(`Audio clip ${clipId} not found on timeline`);
  }

  return {
    message: resultMessage,
    sessionVideo: state.sessionVideo,
    sessionAudio,
  };
}

/**
 * Handle trim_audio operation.
 */
export async function handleTrimAudio(
  state: SessionState,
  body: ModifyRequest
): Promise<HandlerResult | NextResponse> {
  const { clipId, trimStart, trimEnd } = body;

  if (!clipId) {
    return errorResponse('Missing clipId for trim_audio operation');
  }
  if (trimStart === undefined && trimEnd === undefined) {
    return errorResponse('At least one of trimStart or trimEnd required');
  }

  let found = false;
  const sessionAudio = state.sessionAudio.map((layer) => {
    const clipIndex = layer.clips.findIndex(
      (c) => c.id === clipId || c.audioId === clipId
    );
    if (clipIndex !== -1) {
      found = true;
      const updates: Partial<AudioReference> = {};
      if (trimStart !== undefined) updates.trimStart = Math.max(0, trimStart);
      if (trimEnd !== undefined) updates.trimEnd = Math.max(0, trimEnd);

      return {
        ...layer,
        clips: layer.clips.map((c, i) =>
          i === clipIndex ? { ...c, ...updates } : c
        ),
      };
    }
    return layer;
  });

  if (!found) {
    return errorResponse(`Audio clip ${clipId} not found on timeline`);
  }

  return {
    message: 'Trimmed audio clip',
    sessionVideo: state.sessionVideo,
    sessionAudio,
  };
}
