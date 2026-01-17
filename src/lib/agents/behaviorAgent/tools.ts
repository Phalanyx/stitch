import { findClip, summarizeTimeline, suggestNextAction } from '@/lib/tools/agentTools';
import { getVideoMetadataForUser, listUploadedVideosForUser } from '@/lib/tools/videoMetadata';
import { textToSpeechAndSave } from '@/lib/elevenlabs';
import { JsonValue, ToolRegistry } from './types';

const errorResponse = (message: string): Record<string, JsonValue> => ({
  status: 'error',
  changed: false,
  error: message,
});

export function createToolRegistry(): ToolRegistry {
  return {
    summarize_timeline: async (_args, context) => {
      const clips = context.clips ?? [];
      return {
        status: 'ok',
        changed: false,
        output: summarizeTimeline(clips),
      } as Record<string, JsonValue>;
    },
    list_clips: async (_args, context) => {
      const clips = context.clips ?? [];
      const userId = context.userId;
      const enriched = await Promise.all(
        clips.map(async (clip, index) => {
          const videoId = clip.videoId ?? clip.id;
          const metadata = userId
            ? await getVideoMetadataForUser(videoId, userId)
            : null;
          return {
            index: index + 1,
            videoId,
            timestamp: clip.timestamp,
            duration: clip.duration,
            metadata,
          };
        })
      );
      return {
        status: 'ok',
        changed: false,
        output: enriched,
      } as Record<string, JsonValue>;
    },
    find_clip: async (args, context) => {
      const id = String(args.id ?? '');
      if (!id) {
        return errorResponse('Missing clip id.');
      }
      const metadata =
        context.userId ? await getVideoMetadataForUser(id, context.userId) : null;
      return {
        status: 'ok',
        changed: false,
        output: {
          details: findClip(context.clips ?? [], id),
          metadata,
        },
      } as Record<string, JsonValue>;
    },
    suggest_next_action: async (_args, context) => {
      return {
        status: 'ok',
        changed: false,
        output: suggestNextAction(context.clips ?? [], context.audioClips ?? []),
      } as Record<string, JsonValue>;
    },
    get_video_metadata: async (args, context) => {
      const videoId = String(args.videoId ?? '');
      if (!videoId) {
        return errorResponse('Missing videoId.');
      }
      if (!context.userId) {
        return errorResponse('Missing user context.');
      }
      const metadata = await getVideoMetadataForUser(videoId, context.userId);
      if (!metadata) {
        return errorResponse(`No video metadata found for id ${videoId}.`);
      }
      return {
        status: 'ok',
        changed: false,
        output: metadata,
      } as Record<string, JsonValue>;
    },
    list_uploaded_videos: async (_args, context) => {
      if (!context.userId) {
        return errorResponse('Missing user context.');
      }
      const videos = await listUploadedVideosForUser(context.userId);
      return {
        status: 'ok',
        changed: false,
        output: videos,
      } as Record<string, JsonValue>;
    },
    createAudioFromText: async (args, context) => {
      const text = String(args.text ?? '');
      if (!text) {
        return errorResponse('Missing text to convert to speech.');
      }
      if (text.length > 5000) {
        return errorResponse('Text exceeds maximum length of 5000 characters.');
      }
      if (!context.userId) {
        return errorResponse('Missing user context.');
      }

      const voiceId = args.voiceId ? String(args.voiceId) : undefined;
      const fileName = args.fileName ? String(args.fileName) : undefined;

      try {
        const audio = await textToSpeechAndSave(context.userId, text, {
          voiceId,
          fileName,
        });

        return {
          status: 'ok',
          changed: true,
          output: {
            ...audio,
            createdAt: audio.createdAt.toISOString(),
          },
        } as Record<string, JsonValue>;
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error.message : 'Failed to generate audio.'
        );
      }
    },
  };
}
