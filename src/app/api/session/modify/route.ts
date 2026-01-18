import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import {
  validateTrack,
  TimelineClip,
  findNearestValidPosition,
} from '@/lib/timeline-validation';
import { VideoReference } from '@/types/video';
import { AudioReference, AudioLayer } from '@/types/audio';

type ModifyRequest = {
  operation: string;
  videoId?: string;
  audioId?: string;
  clipId?: string;
  timestamp?: number;
  trimStart?: number;
  trimEnd?: number;
  layerId?: string;
};

function errorResponse(message: string, status = 400) {
  console.error(message);
  return NextResponse.json({ success: false, error: message }, { status });
}

// POST: Modify timeline (add, remove, move, trim clips)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return errorResponse('Unauthorized', 401);
  }

  const body = (await request.json()) as ModifyRequest;
  const { operation } = body;

  if (!operation) {
    return errorResponse('Missing operation');
  }

  // Fetch current session
  let profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { sessionVideo: true, sessionAudio: true },
  });

  if (!profile) {
    profile = await prisma.profile.create({
      data: {
        id: user.id,
        sessionVideo: [],
        sessionAudio: [],
      },
      select: { sessionVideo: true, sessionAudio: true },
    });
  }

  let sessionVideo = (profile.sessionVideo ?? []) as VideoReference[];
  let sessionAudio = (profile.sessionAudio ?? []) as AudioLayer[];

  // Ensure sessionAudio is in the new layer format
  if (sessionAudio.length > 0 && !('clips' in sessionAudio[0])) {
    // Convert old format to new format
    sessionAudio = [{
      id: 'default',
      name: 'Audio 1',
      clips: sessionAudio as unknown as AudioReference[],
      muted: false,
    }];
  }

  let message = '';

  try {
    // Video operations
    if (operation === 'add_video') {
      const { videoId, timestamp } = body;
      if (!videoId) {
        return errorResponse('Missing videoId for add_video operation');
      }

      // Validate video exists and belongs to user
      const video = await prisma.video.findFirst({
        where: { id: videoId, userId: user.id },
      });
      if (!video) {
        return errorResponse(`Video ${videoId} not found`);
      }

      // Generate a unique clip ID
      const clipId = crypto.randomUUID();
      const duration = video.duration ?? 5;

      // Create new clip
      const newClip: VideoReference = {
        id: clipId,
        videoId: video.id,
        url: video.url,
        timestamp: 0,
        duration,
      };

      // Determine position
      if (timestamp !== undefined) {
        newClip.timestamp = Math.max(0, timestamp);
      } else {
        // Add at end of timeline
        const lastClip = sessionVideo[sessionVideo.length - 1];
        newClip.timestamp = lastClip
          ? lastClip.timestamp + (lastClip.duration - (lastClip.trimStart ?? 0) - (lastClip.trimEnd ?? 0))
          : 0;
      }

      // Find valid position (avoiding overlaps)
      const validTimestamp = findNearestValidPosition(
        sessionVideo as TimelineClip[],
        newClip as TimelineClip
      );
      newClip.timestamp = validTimestamp;

      sessionVideo = [...sessionVideo, newClip];
      message = `Added video to timeline at ${validTimestamp.toFixed(1)}s`;
    }

    else if (operation === 'remove_clip') {
      const { clipId } = body;
      if (!clipId) {
        return errorResponse('Missing clipId for remove_clip operation');
      }

      const clipIndex = sessionVideo.findIndex(
        (c) => c.id === clipId || c.videoId === clipId
      );
      if (clipIndex === -1) {
        return errorResponse(`Clip ${clipId} not found on timeline`);
      }

      sessionVideo = sessionVideo.filter((_, i) => i !== clipIndex);
      message = `Removed clip from timeline`;
    }

    else if (operation === 'move_clip') {
      const { clipId, timestamp } = body;
      if (!clipId) {
        return errorResponse('Missing clipId for move_clip operation');
      }
      if (timestamp === undefined || timestamp < 0) {
        return errorResponse('Invalid or missing timestamp for move_clip operation');
      }

      const clipIndex = sessionVideo.findIndex(
        (c) => c.id === clipId || c.videoId === clipId
      );
      if (clipIndex === -1) {
        return errorResponse(`Clip ${clipId} not found on timeline`);
      }

      const clip = sessionVideo[clipIndex];
      const testClip: TimelineClip = {
        id: clip.id,
        timestamp,
        duration: clip.duration,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
      };

      // Find valid position
      const validTimestamp = findNearestValidPosition(
        sessionVideo as TimelineClip[],
        testClip,
        clip.id
      );

      sessionVideo = sessionVideo.map((c, i) =>
        i === clipIndex ? { ...c, timestamp: validTimestamp } : c
      );
      message = `Moved clip to ${validTimestamp.toFixed(1)}s`;
    }

    else if (operation === 'trim_clip') {
      const { clipId, trimStart, trimEnd } = body;
      if (!clipId) {
        return errorResponse('Missing clipId for trim_clip operation');
      }
      if (trimStart === undefined && trimEnd === undefined) {
        return errorResponse('At least one of trimStart or trimEnd required');
      }

      const clipIndex = sessionVideo.findIndex(
        (c) => c.id === clipId || c.videoId === clipId
      );
      if (clipIndex === -1) {
        return errorResponse(`Clip ${clipId} not found on timeline`);
      }

      const clip = sessionVideo[clipIndex];
      const updates: Partial<VideoReference> = {};
      if (trimStart !== undefined) updates.trimStart = Math.max(0, trimStart);
      if (trimEnd !== undefined) updates.trimEnd = Math.max(0, trimEnd);

      sessionVideo = sessionVideo.map((c, i) =>
        i === clipIndex ? { ...c, ...updates } : c
      );
      message = `Trimmed clip`;
    }

    // Audio operations
    else if (operation === 'add_audio') {
      const { audioId, timestamp, layerId } = body;
      if (!audioId) {
        return errorResponse('Missing audioId for add_audio operation');
      }

      // Validate audio exists and belongs to user
      const audio = await prisma.audio.findFirst({
        where: { id: audioId, userId: user.id },
      });
      if (!audio) {
        return errorResponse(`Audio ${audioId} not found`);
      }

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

      const newClip: AudioReference = {
        id: clipId,
        audioId: audio.id,
        url: audio.url,
        timestamp: 0,
        duration,
      };

      // Determine position
      const layerClips = sessionAudio[targetLayerIndex].clips;
      if (timestamp !== undefined) {
        newClip.timestamp = Math.max(0, timestamp);
      } else {
        const lastClip = layerClips[layerClips.length - 1];
        newClip.timestamp = lastClip
          ? lastClip.timestamp + (lastClip.duration - (lastClip.trimStart ?? 0) - (lastClip.trimEnd ?? 0))
          : 0;
      }

      // Find valid position
      const validTimestamp = findNearestValidPosition(
        layerClips as TimelineClip[],
        newClip as TimelineClip
      );
      newClip.timestamp = validTimestamp;

      sessionAudio = sessionAudio.map((layer, i) =>
        i === targetLayerIndex
          ? { ...layer, clips: [...layer.clips, newClip] }
          : layer
      );
      message = `Added audio to timeline at ${validTimestamp.toFixed(1)}s`;
    }

    else if (operation === 'remove_audio') {
      const { clipId } = body;
      if (!clipId) {
        return errorResponse('Missing clipId for remove_audio operation');
      }

      let found = false;
      sessionAudio = sessionAudio.map((layer) => {
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
      message = `Removed audio clip from timeline`;
    }

    else if (operation === 'move_audio') {
      const { clipId, timestamp } = body;
      if (!clipId) {
        return errorResponse('Missing clipId for move_audio operation');
      }
      if (timestamp === undefined || timestamp < 0) {
        return errorResponse('Invalid or missing timestamp for move_audio operation');
      }

      let found = false;
      sessionAudio = sessionAudio.map((layer) => {
        const clipIndex = layer.clips.findIndex(
          (c) => c.id === clipId || c.audioId === clipId
        );
        if (clipIndex !== -1) {
          found = true;
          const clip = layer.clips[clipIndex];
          const testClip: TimelineClip = {
            id: clip.id,
            timestamp,
            duration: clip.duration,
            trimStart: clip.trimStart,
            trimEnd: clip.trimEnd,
          };

          const validTimestamp = findNearestValidPosition(
            layer.clips as TimelineClip[],
            testClip,
            clip.id
          );

          return {
            ...layer,
            clips: layer.clips.map((c, i) =>
              i === clipIndex ? { ...c, timestamp: validTimestamp } : c
            ),
          };
        }
        return layer;
      });

      if (!found) {
        return errorResponse(`Audio clip ${clipId} not found on timeline`);
      }
      message = `Moved audio clip`;
    }

    else if (operation === 'trim_audio') {
      const { clipId, trimStart, trimEnd } = body;
      if (!clipId) {
        return errorResponse('Missing clipId for trim_audio operation');
      }
      if (trimStart === undefined && trimEnd === undefined) {
        return errorResponse('At least one of trimStart or trimEnd required');
      }

      let found = false;
      sessionAudio = sessionAudio.map((layer) => {
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
      message = `Trimmed audio clip`;
    }

    else {
      return errorResponse(`Unknown operation: ${operation}`);
    }

    // Remove operations cannot create overlaps - skip validation
    const isRemoveOp = operation === 'remove_clip' || operation === 'remove_audio';

    if (!isRemoveOp) {
      // Only validate video track for video-modifying operations
      const videoOps = ['add_video', 'move_clip', 'trim_clip'];
      if (videoOps.includes(operation)) {
        const videoViolations = validateTrack(sessionVideo as TimelineClip[]);
        if (videoViolations.length > 0) {
          return errorResponse('Operation would cause overlapping video clips');
        }
      }

      // Only validate audio tracks for audio-modifying operations
      const audioOps = ['add_audio', 'move_audio', 'trim_audio'];
      if (audioOps.includes(operation)) {
        for (const layer of sessionAudio) {
          const audioViolations = validateTrack(layer.clips as TimelineClip[]);
          if (audioViolations.length > 0) {
            return errorResponse('Operation would cause overlapping audio clips');
          }
        }
      }
    }

    // Save updated session
    await prisma.profile.update({
      where: { id: user.id },
      data: {
        sessionVideo: sessionVideo,
        sessionAudio: sessionAudio,
      },
    });

    return NextResponse.json({
      success: true,
      message,
      changed: true,
    });
  } catch (error) {
    console.error('Timeline modification error:', error);
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to modify timeline',
      500
    );
  }
}
