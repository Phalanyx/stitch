import { summarizeTimeline } from '@/lib/tools/agentTools';
import { listUploadedVideosForUser } from '@/lib/tools/videoMetadata';
import { textToSpeechAndSave } from '@/lib/elevenlabs';
import { JsonValue, ToolRegistry } from './types';

const errorResponse = (message: string): Record<string, JsonValue> => ({
  status: 'error',
  changed: false,
  error: message,
});

export function createToolRegistry(): ToolRegistry {
  return {
    // Read-only tools
    summarize_timeline: async (_args, context) => {
      const clips = context.clips ?? [];
      return {
        status: 'ok',
        changed: false,
        output: summarizeTimeline(clips),
      } as Record<string, JsonValue>;
    },

    list_clips: async (_args, context) => {
      const clips = (context.clips ?? []).map((clip) => ({
        clipId: clip.id,
        videoId: clip.videoId ?? clip.id,
        timestamp: clip.timestamp,
        duration: clip.duration,
      }));
      return {
        status: 'ok',
        changed: false,
        output: clips,
      } as Record<string, JsonValue>;
    },

    list_audio: async (_args, context) => {
      const audioClips = (context.audioClips ?? []).map((clip) => ({
        clipId: clip.id,
        timestamp: clip.timestamp,
        duration: clip.duration,
      }));
      return {
        status: 'ok',
        changed: false,
        output: audioClips,
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

    // Video modification tools (server-side - not yet implemented)
    add_video: async (_args) => {
      return errorResponse('Server-side add_video not implemented. Use client-side API.');
    },

    remove_video: async (_args) => {
      return errorResponse('Server-side remove_video not implemented. Use client-side API.');
    },

    move_video: async (_args) => {
      return errorResponse('Server-side move_video not implemented. Use client-side API.');
    },

    // Audio tools
    create_audio_from_text: async (args, context) => {
      const text = String(args.text ?? '');
      if (!text) {
        return errorResponse('Missing text to convert to speech.');
      }
      if (text.length > 5000) {
        return errorResponse('Text exceeds maximum length of 5000 characters.');
      }
      const targetDuration = args.targetDuration !== undefined ? Number(args.targetDuration) : undefined;
      if (targetDuration === undefined || targetDuration <= 0) {
        return errorResponse('Missing or invalid targetDuration (must be positive number in seconds).');
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
          targetDuration,
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

    add_audio: async (_args) => {
      return errorResponse('Server-side add_audio not implemented. Use client-side API.');
    },

    remove_audio: async (_args) => {
      return errorResponse('Server-side remove_audio not implemented. Use client-side API.');
    },
  };
}
