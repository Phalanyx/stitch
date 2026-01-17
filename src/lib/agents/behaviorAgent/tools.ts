import { callGeminiText } from '@/lib/ai/gemini';
import { ToolRegistry, JsonValue } from './types';
import {
  executeTool,
  ToolResult as SharedToolResult,
} from '@/lib/agents/shared';

export function createToolRegistry(): ToolRegistry {
  return {
    // Original behavior agent tools
    suggestTimelineTips: async (_args, context) => {
      const added = context.behavior.eventCounts.clip_added ?? 0;
      const moved = context.behavior.eventCounts.clip_moved ?? 0;
      const tip =
        added === 0
          ? 'Try adding a clip from the media library to start building your timeline.'
          : moved === 0
          ? 'Tip: drag clips to reposition them on the timeline.'
          : 'Tip: use preview to check pacing after edits.';

      const aiText = await callGeminiText(
        [
          'You are a product assistant for a video editor.',
          `Behavior phase: ${context.behavior.phase}.`,
          `Event counts: ${JSON.stringify(context.behavior.eventCounts)}.`,
          'Give one concise tip to help the user edit their timeline.',
        ].join('\n')
      );

      return {
        message: aiText ?? tip,
        phase: context.behavior.phase,
      };
    },

    analyzePlaybackFriction: async (_args, context) => {
      const seeks = context.behavior.eventCounts.preview_seek ?? 0;
      const pauses = context.behavior.eventCounts.preview_pause ?? 0;
      const frictionScore = Math.min(1, (seeks + pauses) / 10);

      const aiText = await callGeminiText(
        [
          'You are an analytics assistant.',
          `Behavior phase: ${context.behavior.phase}.`,
          `Event counts: ${JSON.stringify(context.behavior.eventCounts)}.`,
          'Summarize playback friction in one sentence.',
        ].join('\n')
      );

      return {
        frictionScore,
        insight:
          aiText ??
          (frictionScore > 0.6
            ? 'User is scrubbing/pausing frequently; consider suggesting timeline adjustments.'
            : 'Playback looks smooth; no intervention needed.'),
      };
    },

    surfaceExportHelp: async (_args, context) => {
      const failures = context.behavior.eventCounts.export_failed ?? 0;
      const aiText = await callGeminiText(
        [
          'You are an export helper for a video editor.',
          `Behavior phase: ${context.behavior.phase}.`,
          `Event counts: ${JSON.stringify(context.behavior.eventCounts)}.`,
          'Provide one actionable suggestion for successful export.',
        ].join('\n')
      );

      return {
        failures,
        message:
          aiText ??
          (failures > 0
            ? 'Export failed recently. Suggest checking file format or trying a shorter clip.'
            : 'Export in progress. Consider showing a progress indicator.'),
      };
    },

    // Shared timeline tools - wrapper functions that use shared executors
    list_videos: async (_args, context) => {
      if (!context.userId) {
        return { error: 'User ID required for library access' };
      }
      const result = await executeTool(
        { tool: 'list_videos' },
        context.userId,
        context.clips ?? [],
        context.audioClips ?? []
      );
      return convertResult(result);
    },

    get_video: async (args, context) => {
      if (!context.userId) {
        return { error: 'User ID required for library access' };
      }
      const result = await executeTool(
        { tool: 'get_video', args: args as Record<string, unknown> },
        context.userId,
        context.clips ?? [],
        context.audioClips ?? []
      );
      return convertResult(result);
    },

    list_audio: async (_args, context) => {
      if (!context.userId) {
        return { error: 'User ID required for library access' };
      }
      const result = await executeTool(
        { tool: 'list_audio' },
        context.userId,
        context.clips ?? [],
        context.audioClips ?? []
      );
      return convertResult(result);
    },

    get_audio: async (args, context) => {
      if (!context.userId) {
        return { error: 'User ID required for library access' };
      }
      const result = await executeTool(
        { tool: 'get_audio', args: args as Record<string, unknown> },
        context.userId,
        context.clips ?? [],
        context.audioClips ?? []
      );
      return convertResult(result);
    },

    add_video_to_timeline: async (args, context) => {
      if (!context.userId) {
        return { error: 'User ID required for timeline modification' };
      }
      const result = await executeTool(
        { tool: 'add_video_to_timeline', args: args as Record<string, unknown> },
        context.userId,
        context.clips ?? [],
        context.audioClips ?? []
      );
      return convertResult(result);
    },

    modify_video_clip: async (args, context) => {
      const result = await executeTool(
        { tool: 'modify_video_clip', args: args as Record<string, unknown> },
        context.userId ?? '',
        context.clips ?? [],
        context.audioClips ?? []
      );
      return convertResult(result);
    },

    add_audio_to_timeline: async (args, context) => {
      if (!context.userId) {
        return { error: 'User ID required for timeline modification' };
      }
      const result = await executeTool(
        { tool: 'add_audio_to_timeline', args: args as Record<string, unknown> },
        context.userId,
        context.clips ?? [],
        context.audioClips ?? []
      );
      return convertResult(result);
    },

    modify_audio_clip: async (args, context) => {
      const result = await executeTool(
        { tool: 'modify_audio_clip', args: args as Record<string, unknown> },
        context.userId ?? '',
        context.clips ?? [],
        context.audioClips ?? []
      );
      return convertResult(result);
    },

    summarize_timeline: async (_args, context) => {
      const result = await executeTool(
        { tool: 'summarize_timeline' },
        context.userId ?? '',
        context.clips ?? [],
        context.audioClips ?? []
      );
      return convertResult(result);
    },

    list_clips: async (_args, context) => {
      const result = await executeTool(
        { tool: 'list_clips' },
        context.userId ?? '',
        context.clips ?? [],
        context.audioClips ?? []
      );
      return convertResult(result);
    },

    suggest_next_action: async (_args, context) => {
      const result = await executeTool(
        { tool: 'suggest_next_action' },
        context.userId ?? '',
        context.clips ?? [],
        context.audioClips ?? []
      );
      return convertResult(result);
    },
  };
}

/**
 * Convert shared tool result to behavior agent JsonValue format
 */
function convertResult(result: SharedToolResult): JsonValue {
  if (result.success) {
    const output: Record<string, JsonValue> = {
      message: result.data,
    };
    if (result.action) {
      // Include action details in a serializable format
      output.action = {
        type: result.action.type,
        payload: result.action.payload as unknown as JsonValue,
      };
    }
    return output;
  }
  return { error: result.error };
}
