import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { validateTrack, TimelineClip } from '@/lib/timeline-validation';
import { VideoReference } from '@/types/video';
import { AudioReference, AudioLayer } from '@/types/audio';
import { errorResponse } from '@/lib/api-response';
import { createLogger } from '@/lib/logger';
import {
  operationHandlers,
  videoOperations,
  audioOperations,
  removeOperations,
  ModifyRequest,
  SessionState,
  HandlerResult,
} from './handlers';

const logger = createLogger('Session Modify API');

// POST: Modify timeline (add, remove, move, trim clips)
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    logger.warn('Unauthorized request');
    return errorResponse('Unauthorized', 401);
  }

  const body = (await request.json()) as ModifyRequest;
  const { operation } = body;

  logger.info('Request received', { operation });

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

  let sessionVideo = (profile.sessionVideo ?? []) as unknown as VideoReference[];
  let sessionAudio = (profile.sessionAudio ?? []) as unknown as AudioLayer[];

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

  try {
    // Get the handler for this operation
    const handler = operationHandlers[operation];
    if (!handler) {
      return errorResponse(`Unknown operation: ${operation}`);
    }

    // Execute the handler
    const state: SessionState = { sessionVideo, sessionAudio };
    const context = { user: { id: user.id } };
    const result = await handler(state, body, context);

    // If handler returned a NextResponse (error), return it directly
    if (result instanceof NextResponse) {
      return result;
    }

    // Extract updated state from handler result
    const handlerResult = result as HandlerResult;
    sessionVideo = handlerResult.sessionVideo;
    sessionAudio = handlerResult.sessionAudio;
    const message = handlerResult.message;

    // Remove operations cannot create overlaps - skip validation
    const isRemoveOp = removeOperations.includes(operation);

    if (!isRemoveOp) {
      // Only validate video track for video-modifying operations
      if (videoOperations.includes(operation)) {
        const videoViolations = validateTrack(sessionVideo as TimelineClip[]);
        if (videoViolations.length > 0) {
          return errorResponse('Operation would cause overlapping video clips');
        }
      }

      // Only validate audio tracks for audio-modifying operations
      if (audioOperations.includes(operation)) {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sessionVideo: sessionVideo as unknown as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sessionAudio: sessionAudio as unknown as any,
      },
    });

    logger.info('Request completed', { operation, duration: Date.now() - startTime });
    return NextResponse.json({
      success: true,
      message,
      changed: true,
    });
  } catch (error) {
    logger.error('Timeline modification error', {
      operation,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(
      error instanceof Error ? error.message : 'Failed to modify timeline',
      500
    );
  }
}
