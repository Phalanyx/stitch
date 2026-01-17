import { callGeminiText } from '@/lib/ai/gemini';
import { ToolRegistry } from './types';

export function createToolRegistry(): ToolRegistry {
  return {
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
  };
}
