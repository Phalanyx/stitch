import { callGeminiText, parseJsonFromText } from '@/lib/ai/gemini';
import { textToSpeechAndSave } from '@/lib/elevenlabs';
import { getVideoMetadataForUser } from '@/lib/tools/videoMetadata';
import { JsonValue, ToolRegistry } from './types';

const errorResponse = (message: string): Record<string, JsonValue> => ({
  status: 'error',
  changed: false,
  error: message,
});

export function createToolRegistry(): ToolRegistry {
  return {
    getVideoMetadata: async (args, context) => {
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
    suggestTimelineTips: async (_args, context) => {
      const aiText = await callGeminiText(
        [
          'You are a product assistant for a video editor.',
          'Return JSON only: {"message":"..."}',
          `Behavior phase: ${context.behavior.phase}.`,
          `Event counts: ${JSON.stringify(context.behavior.eventCounts)}.`,
          'Give one concise tip to help the user edit their timeline.',
        ].join('\n')
      );

      const aiResult = parseJsonFromText<{ message?: string }>(aiText);
      if (!aiResult?.message) {
        return errorResponse('AI response missing message.');
      }

      return {
        status: 'ok',
        changed: false,
        output: {
          message: aiResult.message,
          phase: context.behavior.phase,
        },
      } as Record<string, JsonValue>;
    },
    surfaceExportHelp: async (_args, context) => {
      const failures = context.behavior.eventCounts.export_failed ?? 0;
      const aiText = await callGeminiText(
        [
          'You are an export helper for a video editor.',
          'Return JSON only: {"message":"..."}',
          `Behavior phase: ${context.behavior.phase}.`,
          `Event counts: ${JSON.stringify(context.behavior.eventCounts)}.`,
          'Provide one actionable suggestion for successful export.',
        ].join('\n')
      );

      const aiResult = parseJsonFromText<{ message?: string }>(aiText);
      if (!aiResult?.message) {
        return errorResponse('AI response missing message.');
      }

      return {
        status: 'ok',
        changed: false,
        output: {
          failures,
          message: aiResult.message,
        },
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
          output: audio,
        } as Record<string, JsonValue>;
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error.message : 'Failed to generate audio.'
        );
      }
    },
  };
}
