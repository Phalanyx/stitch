import { VideoReference } from '@/types/video';
import { AudioReference } from './types';
import { formatToolDocs, formatExamples } from './toolDefinitions';

/**
 * Format video clips for prompt context
 */
export function formatVideoClips(clips: VideoReference[]): string {
  if (clips.length === 0) {
    return 'No video clips on timeline.';
  }

  return (
    'Video clips on timeline:\n' +
    clips
      .map((c, i) => {
        const visibleDuration = c.duration - (c.trimStart || 0) - (c.trimEnd || 0);
        return `  #${i + 1} id="${c.id}" name="${c.videoId || 'unknown'}" at ${c.timestamp.toFixed(1)}s (${visibleDuration.toFixed(1)}s visible)`;
      })
      .join('\n')
  );
}

/**
 * Format audio clips for prompt context
 */
export function formatAudioClips(audioClips: AudioReference[]): string {
  if (audioClips.length === 0) {
    return 'No audio clips on timeline.';
  }

  return (
    'Audio clips on timeline:\n' +
    audioClips
      .map((c, i) => {
        const visibleDuration = c.duration - (c.trimStart || 0) - (c.trimEnd || 0);
        return `  #${i + 1} id="${c.id}" at ${c.timestamp.toFixed(1)}s (${visibleDuration.toFixed(1)}s visible)`;
      })
      .join('\n')
  );
}

/**
 * Build the tool decision prompt with examples and context
 */
export function buildDecisionPrompt(
  userMessage: string,
  clips: VideoReference[],
  audioClips: AudioReference[]
): string {
  return `You are a tool-selection assistant for a video editor.
Your job is to select the right tool and extract the correct arguments from the user's message.

AVAILABLE TOOLS:
${formatToolDocs()}
- none: General conversation - no specific tool needed

CURRENT TIMELINE STATE:
${formatVideoClips(clips)}
${formatAudioClips(audioClips)}

EXAMPLES:
${formatExamples()}

CRITICAL RULES:
1. Return ONLY valid JSON: {"tool":"tool_name","args":{...}}
2. For video names, use "videoName" key (not "name" or "video")
3. For audio names, use "audioName" key (not "name" or "audio")
4. Extract the ACTUAL value from the user's message - never use placeholders like "<video_name>"
5. If the user mentions a specific name like "image_to_video_2", use that exact name
6. If no timestamp is specified for adding media, omit the timestamp to append at end
7. When unsure which tool to use, prefer "none" for safety

USER MESSAGE: ${userMessage}

JSON:`;
}

/**
 * Build a conversational response prompt
 */
export function buildConversationPrompt(userMessage: string): string {
  return `You are a helpful assistant for a video editor.
The user's message doesn't require a specific tool.
Answer their question in 1-3 sentences.

User message: ${userMessage}`;
}
