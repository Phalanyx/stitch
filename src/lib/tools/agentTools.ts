import { VideoReference } from '@/types/video';
import { AudioMetadata } from '@/types/audio';
import { JsonValue } from '@/lib/agents/behaviorAgent/types';

export const TOOL_DEFINITIONS = [
  {
    name: 'summarize_timeline',
    description: 'Summarize the timeline length, total duration, and span.',
  },
  {
    name: 'list_clips',
    description:
      'List timeline clips with id/videoId, timestamps, durations, plus metadata if available.',
  },
  {
    name: 'find_clip',
    description: 'Find a specific clip by id/videoId and return its timing details.',
  },
  {
    name: 'suggest_next_action',
    description: 'Suggest the next editing action based on clips and audio clips.',
  },
  {
    name: 'get_video_metadata',
    description:
      'Fetch full metadata for a video by videoId (fileName, summary, duration, status, url).',
  },
  {
    name: 'list_uploaded_videos',
    description: 'List the user uploaded videos with fileName and summary.',
  },
  {
    name: 'create_audio_from_text',
    description:
      'Generate speech audio from text using AI voice synthesis. Use this when the user wants to create narration, voiceover, or any spoken audio from text. Args: {text: "the text to speak"}.',
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]['name'];

export type AgentToolContext = {
  clips: VideoReference[];
  audioClips: VideoReference[];
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

export function findClip(clips: VideoReference[], id: string) {
  const clip = clips.find((item) => item.id === id || item.videoId === id);
  if (!clip) return `No clip found with id ${id}.`;
  return `Clip ${clip.videoId ?? clip.id} starts at ${clip.timestamp.toFixed(
    1
  )}s and lasts ${clip.duration.toFixed(1)}s.`;
}

export function suggestNextAction(clips: VideoReference[], audioClips: VideoReference[]) {
  if (clips.length === 0) {
    return 'Start by adding a video clip from the media library.';
  }
  if (audioClips.length === 0) {
    return 'Consider adding background audio to match your timeline.';
  }
  return 'Preview the timeline and fine-tune clip timing.';
}

export async function getVideoMetadata(videoId: string): Promise<JsonValue> {
  const response = await fetch(`/api/videos/${videoId}/metadata`);
  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    return data.error || `Failed to fetch metadata for ${videoId}.`;
  }
  return data as JsonValue;
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
  metadataCache?: Map<string, JsonValue>;
  onAudioCreated?: (audio: AudioMetadata) => void;
}): AgentToolRegistry {
  const metadataCache = options?.metadataCache ?? new Map<string, JsonValue>();
  const onAudioCreated = options?.onAudioCreated;

  const fetchMetadata = async (videoId: string): Promise<JsonValue> => {
    if (metadataCache.has(videoId)) {
      return metadataCache.get(videoId) as JsonValue;
    }
    const data = await getVideoMetadata(videoId);
    metadataCache.set(videoId, data);
    return data;
  };

  const isFailureResponse = (value: JsonValue): value is string =>
    typeof value === 'string' && value.toLowerCase().includes('failed');

  return {
    summarize_timeline: async (_args, context) => ({
      status: 'ok',
      changed: false,
      output: summarizeTimeline(context.clips),
    }),
    list_clips: async (_args, context) => {
      const enriched = await Promise.all(
        context.clips.map(async (clip, index) => {
          const videoId = clip.videoId ?? clip.id;
          const metadata = await fetchMetadata(videoId);
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
      };
    },
    find_clip: async (args, context) => {
      const id = String(args.id ?? '');
      if (!id) {
        return errorOutput('Missing clip id.');
      }
      return {
        status: 'ok',
        changed: false,
        output: {
          details: findClip(context.clips, id),
          metadata: await fetchMetadata(id),
        },
      };
    },
    suggest_next_action: async (_args, context) => ({
      status: 'ok',
      changed: false,
      output: suggestNextAction(context.clips, context.audioClips),
    }),
    get_video_metadata: async (args) => {
      const videoId = String(args.videoId ?? '');
      if (!videoId) {
        return errorOutput('Missing videoId.');
      }
      const metadata = await fetchMetadata(videoId);
      if (isFailureResponse(metadata)) {
        return errorOutput(metadata);
      }
      return {
        status: 'ok',
        changed: false,
        output: metadata,
      };
    },
    list_uploaded_videos: async () => {
      const videos = await listUploadedVideos();
      if (isFailureResponse(videos)) {
        return errorOutput(videos);
      }
      return {
        status: 'ok',
        changed: false,
        output: videos,
      };
    },
    create_audio_from_text: async (args) => {
      const text = String(args.text ?? '');
      if (!text) {
        return errorOutput('Missing text argument.');
      }
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
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
  };
}
