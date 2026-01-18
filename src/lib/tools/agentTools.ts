import { VideoReference } from '@/types/video';
import { AudioMetadata } from '@/types/audio';
import { JsonValue } from '@/lib/agents/behaviorAgent/types';

export const TOOL_DEFINITIONS = [
  // Read-only tools
  { name: 'summarize_timeline', description: 'Get timeline summary: clip count, total duration, time span.' },
  { name: 'list_clips', description: 'List clips ON the timeline. Returns clipId (needed for remove/move), timestamp, duration. CALL THIS FIRST to delete or move clips.' },
  { name: 'list_audio', description: 'List audio clips on timeline with clipId, timestamp, duration.' },
  { name: 'list_uploaded_videos', description: 'List available source videos. Returns videoId (needed for add_video), name. CALL THIS to find videos to add.' },
  { name: 'search_videos', description: 'Search indexed videos using natural language. Args: {query, searchOptions?: ["visual"|"audio"|"transcription"], limit?: number}. Returns clips with videoId, start, end, rank. Use start/end as trimStart/trimEnd in add_video.' },

  // Video modification tools
  { name: 'add_video', description: 'Add a video TO the timeline. Args: {videoId, timestamp?, trimStart?, trimEnd?}. For search results: pass start as trimStart, end as trimEnd to add just that clip segment.' },
  { name: 'remove_video', description: 'Remove a clip FROM the timeline. Args: {clipId (from list_clips)}. Call list_clips first to get clipId.' },
  { name: 'move_video', description: 'Move a clip to new position. Args: {clipId (from list_clips), timestamp}.' },
  { name: 'create_transition', description: 'Generate a smooth transition between two adjacent timeline clips. Args: {precedingPosition, succeedingPosition} (1-based positions from list_clips), plus optional prompt?, durationSeconds?. Call list_clips first to see clip positions.' },

  // Audio tools
  { name: 'create_audio_from_text', description: 'Generate speech audio from text with exact duration. Args: {text, targetDuration (required, seconds)}. Audio will be stretched or truncated to match targetDuration.' },
  { name: 'add_audio', description: 'Add audio to timeline. Args: {audioId, timestamp?}.' },
  { name: 'remove_audio', description: 'Remove audio from timeline. Args: {clipId}.' },

  // Agent tools
  { name: 'suggest_next_action', description: 'Suggest the next action for the user. Args: {phase: string}.' },
  { name: 'analyze_preferences', description: 'Analyze conversation history to extract user preferences (likes/dislikes) and save to profile. No args needed.' },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]['name'];

// Metadata for tools that have natural language parameters that benefit from variations
export const NL_TOOL_PARAMS: Record<string, { paramName: string; description: string }> = {
  search_videos: { paramName: 'query', description: 'Search query for finding video clips' },
  create_transition: { paramName: 'prompt', description: 'Style description for the transition' },
  create_audio_from_text: { paramName: 'text', description: 'Text to convert to speech' },
};

export function hasNLParameter(toolName: string): boolean {
  return toolName in NL_TOOL_PARAMS;
}

export function getNLParamInfo(toolName: string): { paramName: string; description: string } | null {
  return NL_TOOL_PARAMS[toolName] ?? null;
}

export type AgentToolContext = {
  clips: VideoReference[];
  audioClips: VideoReference[];
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

export type AgentToolOutput = {
  status: 'ok' | 'error';
  changed: boolean;
  output?: JsonValue;
  error?: string;
};

export type AgentToolRegistry = Record<
  ToolName,
  (args: Record<string, JsonValue>, context: AgentToolContext) => Promise<AgentToolOutput>
>;

const errorOutput = (message: string): AgentToolOutput => ({
  status: 'error',
  changed: false,
  error: message,
});

export function summarizeTimeline(clips: VideoReference[]) {
  if (clips.length === 0) {
    return 'No clips on the timeline yet.';
  }
  const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0);
  const earliest = Math.min(...clips.map((clip) => clip.timestamp));
  const latest = Math.max(...clips.map((clip) => clip.timestamp + clip.duration));
  return `Timeline has ${clips.length} clip(s), total duration ${totalDuration.toFixed(
    1
  )}s, spanning ${earliest.toFixed(1)}s to ${latest.toFixed(1)}s.`;
}

async function modifyTimeline(operation: string, params: Record<string, JsonValue>): Promise<AgentToolOutput> {
  console.log('[AgentTools] modifyTimeline called:', operation, params);
  const response = await fetch('/api/session/modify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, ...params }),
  });
  const data = (await response.json()) as {
    success: boolean;
    message?: string;
    error?: string;
  };
  if (!response.ok || !data.success) {
    return { status: 'error', changed: false, error: data.error || 'Failed to modify timeline.' };
  }
  return { status: 'ok', changed: true, output: data.message || 'Timeline modified successfully.' };
}

export async function listUploadedVideos(): Promise<JsonValue> {
  const response = await fetch('/api/videos');
  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    return data.error || 'Failed to fetch uploaded videos.';
  }
  return data as JsonValue;
}

export function createClientToolRegistry(options?: {
  onAudioCreated?: (audio: AudioMetadata) => void;
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): AgentToolRegistry {
  const onAudioCreated = options?.onAudioCreated;
  const conversation = options?.conversation;

  const isFailureResponse = (value: JsonValue): value is string =>
    typeof value === 'string' && value.toLowerCase().includes('failed');

  return {
    // Read-only tools
    summarize_timeline: async (_args, context) => ({
      status: 'ok',
      changed: false,
      output: summarizeTimeline(context.clips),
    }),

    list_clips: async (_args, context) => {
      const clips = context.clips.map((clip, index) => ({
        index: index + 1,
        clipId: clip.id,
        videoId: clip.videoId ?? clip.id,
        timestamp: clip.timestamp,
        duration: clip.duration,
      }));
      return { status: 'ok', changed: false, output: clips };
    },

    list_audio: async (_args, context) => {
      const audioClips = context.audioClips.map((clip) => ({
        clipId: clip.id,
        timestamp: clip.timestamp,
        duration: clip.duration,
      }));
      return { status: 'ok', changed: false, output: audioClips };
    },

    list_uploaded_videos: async () => {
      const videos = await listUploadedVideos();
      if (isFailureResponse(videos)) {
        return errorOutput(videos);
      }
      return { status: 'ok', changed: false, output: videos };
    },

    search_videos: async (args) => {
      const query = String(args.query ?? '');
      if (!query) {
        return errorOutput('Missing query argument.');
      }

      const searchOptions = args.searchOptions as string[] | undefined;
      const limit = args.limit !== undefined ? Number(args.limit) : undefined;

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, searchOptions, limit }),
      });

      const data = (await response.json()) as {
        results?: Array<{
          videoId: string;
          rank: number;
          start: number;
          end: number;
          thumbnailUrl?: string;
        }>;
        error?: string;
      };

      if (!response.ok) {
        return errorOutput(data.error || 'Failed to search videos.');
      }

      return {
        status: 'ok',
        changed: false,
        output: {
          query,
          matchCount: data.results?.length ?? 0,
          clips: data.results ?? [],
        },
      };
    },

    // Video modification tools
    add_video: async (args) => {
      const videoId = String(args.videoId ?? '');
      if (!videoId) {
        return errorOutput('Missing videoId argument.');
      }
      const params: Record<string, JsonValue> = { videoId };
      if (args.timestamp !== undefined) params.timestamp = Number(args.timestamp);
      if (args.trimStart !== undefined) params.trimStart = Number(args.trimStart);
      if (args.trimEnd !== undefined) params.trimEnd = Number(args.trimEnd);
      return modifyTimeline('add_video', params);
    },

    remove_video: async (args) => {
      console.log('[AgentTools] remove_video called with args:', args);
      const clipId = String(args.clipId ?? '');
      if (!clipId) {
        return errorOutput('Missing clipId argument.');
      }
      return modifyTimeline('remove_clip', { clipId });
    },

    move_video: async (args) => {
      const clipId = String(args.clipId ?? '');
      const timestamp = Number(args.timestamp ?? 0);
      if (!clipId) {
        return errorOutput('Missing clipId argument.');
      }
      return modifyTimeline('move_clip', { clipId, timestamp });
    },

    create_transition: async (args, context) => {
      const precedingPosition = Number(args.precedingPosition ?? 0);
      const succeedingPosition = Number(args.succeedingPosition ?? 0);
      if (!precedingPosition || !succeedingPosition) {
        return errorOutput('Missing precedingPosition or succeedingPosition.');
      }

      // Sort clips by timestamp for consistent position mapping
      const sortedClips = [...context.clips].sort((a, b) => a.timestamp - b.timestamp);

      // Validate positions are within range
      if (precedingPosition < 1 || precedingPosition > sortedClips.length) {
        return errorOutput(`precedingPosition ${precedingPosition} is out of range (1-${sortedClips.length}).`);
      }
      if (succeedingPosition < 1 || succeedingPosition > sortedClips.length) {
        return errorOutput(`succeedingPosition ${succeedingPosition} is out of range (1-${sortedClips.length}).`);
      }

      // Validate positions are adjacent (consecutive)
      if (succeedingPosition !== precedingPosition + 1) {
        return errorOutput(`Positions must be adjacent. Got ${precedingPosition} and ${succeedingPosition}, expected consecutive positions.`);
      }

      // Look up clips by position (1-based to 0-based index)
      const preceding = sortedClips[precedingPosition - 1];
      const succeeding = sortedClips[succeedingPosition - 1];

      if (!preceding.url || !succeeding.url) {
        return errorOutput('Missing clip URLs for transition generation.');
      }

      const precedingTrimStart = preceding.trimStart ?? 0;
      const precedingTrimEnd = preceding.trimEnd ?? 0;
      const precedingVisible = Math.max(
        preceding.duration - precedingTrimStart - precedingTrimEnd,
        0
      );
      const insertTimestamp = preceding.timestamp + precedingVisible;

      const succeedingTrimStart = succeeding.trimStart ?? 0;

      const response = await fetch('/api/transitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          precedingUrl: preceding.url,
          succeedingUrl: succeeding.url,
          precedingTrimEnd,
          succeedingTrimStart,
          prompt: args.prompt,
          durationSeconds: args.durationSeconds,
        }),
      });

      const data = (await response.json()) as {
        videoId?: string;
        url?: string;
        duration?: number;
        error?: string;
      };

      if (!response.ok || !data.videoId) {
        return errorOutput(data.error || 'Failed to generate transition.');
      }

      const addResult = await modifyTimeline('add_video', {
        videoId: data.videoId,
        timestamp: insertTimestamp,
      });
      if (addResult.status === 'error') {
        return addResult;
      }

      const shiftBy = Number(data.duration ?? 0);
      if (shiftBy > 0) {
        const moveResult = await modifyTimeline('move_clip', {
          clipId: succeeding.id,
          timestamp: succeeding.timestamp + shiftBy,
        });
        if (moveResult.status === 'error') {
          return moveResult;
        }
      }

      return {
        status: 'ok',
        changed: true,
        output: {
          transitionVideoId: data.videoId,
          transitionUrl: data.url ?? null,
          transitionDuration: data.duration ?? null,
          insertedAt: insertTimestamp,
          shiftedSucceedingTo: shiftBy > 0 ? succeeding.timestamp + shiftBy : null,
        },
      };
    },

    // Audio tools
    create_audio_from_text: async (args) => {
      const text = String(args.text ?? '');
      if (!text) {
        return errorOutput('Missing text argument.');
      }
      const targetDuration = args.targetDuration !== undefined ? Number(args.targetDuration) : undefined;
      if (targetDuration === undefined || targetDuration <= 0) {
        return errorOutput('Missing or invalid targetDuration argument (must be positive number in seconds).');
      }
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, targetDuration }),
      });
      const data = (await response.json()) as {
        audio?: AudioMetadata;
        error?: string;
      };
      if (!response.ok) {
        return errorOutput(data.error || 'Failed to generate audio.');
      }
      if (data.audio && onAudioCreated) {
        onAudioCreated(data.audio);
      }
      return {
        status: 'ok',
        changed: true,
        output: (data.audio ?? null) as JsonValue,
      };
    },

    add_audio: async (args) => {
      const audioId = String(args.audioId ?? '');
      if (!audioId) {
        return errorOutput('Missing audioId argument.');
      }
      const params: Record<string, JsonValue> = { audioId };
      if (args.timestamp !== undefined) params.timestamp = Number(args.timestamp);
      return modifyTimeline('add_audio', params);
    },

    remove_audio: async (args) => {
      const clipId = String(args.clipId ?? '');
      if (!clipId) {
        return errorOutput('Missing clipId argument.');
      }
      return modifyTimeline('remove_audio', { clipId });
    },

    // Agent tools
    suggest_next_action: async (args) => {
      const phase = String(args.phase ?? 'unknown');
      return {
        status: 'ok',
        changed: false,
        output: `Suggested next action for phase "${phase}": Review timeline or search for more clips.`,
      };
    },

    analyze_preferences: async () => {
      if (!conversation || conversation.length === 0) {
        return errorOutput('No conversation history available to analyze.');
      }

      try {
        const response = await fetch('/api/preferences/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation }),
        });

        const data = (await response.json()) as {
          success?: boolean;
          updated?: boolean;
          newLikes?: string[];
          newDislikes?: string[];
          userLikes?: string;
          userDislikes?: string;
          error?: string;
        };

        if (!response.ok) {
          return errorOutput(data.error || 'Failed to analyze preferences.');
        }

        if (data.updated) {
          return {
            status: 'ok',
            changed: true,
            output: {
              message: 'Preferences updated successfully.',
              newLikes: data.newLikes || [],
              newDislikes: data.newDislikes || [],
            },
          };
        }

        return {
          status: 'ok',
          changed: false,
          output: 'No new preferences found in the conversation.',
        };
      } catch (error) {
        console.error('[AgentTools] analyze_preferences error:', error);
        return errorOutput('Failed to analyze preferences.');
      }
    },
  };
}
