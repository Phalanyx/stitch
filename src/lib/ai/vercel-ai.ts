import { generateText, tool, ModelMessage, ToolResultPart } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { VideoReference } from '@/types/video';
import { TimelineAction } from '@/types/actions';
import {
  AudioReference,
  ToolResult,
} from '@/lib/agents/shared/types';
import {
  summarizeTimeline,
  listClips,
  findClip,
  suggestNextAction,
  listVideos,
  getVideo,
  listAudio,
  getAudio,
  addVideoToTimeline,
  modifyVideoClip,
  addAudioToTimeline,
  modifyAudioClip,
} from '@/lib/agents/shared/toolExecutors';
import {
  formatVideoClips,
  formatAudioClips,
} from '@/lib/agents/shared/promptBuilder';

// Initialize Google AI provider
const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// Zod schemas for tool parameters
const listVideosSchema = z.object({});

const getVideoSchema = z.object({
  name: z.string().describe('Video name to search for'),
});

const listAudioSchema = z.object({});

const getAudioSchema = z.object({
  name: z.string().describe('Audio name to search for'),
});

const addVideoToTimelineSchema = z.object({
  videoName: z.string().optional().describe('Video name to search for'),
  videoId: z.string().optional().describe('Video ID (if known)'),
  timestamp: z.number().optional().describe('Position in seconds (omit to append at end)'),
});

const modifyVideoClipSchema = z.object({
  action: z.enum(['move', 'trim', 'remove']).describe('Action to perform'),
  clipId: z.string().describe('ID of the clip to modify'),
  timestamp: z.number().optional().describe('New position in seconds (for move)'),
  trimStart: z.number().optional().describe('Seconds to trim from start'),
  trimEnd: z.number().optional().describe('Seconds to trim from end'),
});

const addAudioToTimelineSchema = z.object({
  audioName: z.string().optional().describe('Audio name to search for'),
  audioId: z.string().optional().describe('Audio ID (if known)'),
  timestamp: z.number().optional().describe('Position in seconds (omit to append at end)'),
});

const modifyAudioClipSchema = z.object({
  action: z.enum(['move', 'trim', 'remove']).describe('Action to perform'),
  clipId: z.string().describe('ID of the audio clip to modify'),
  timestamp: z.number().optional().describe('New position in seconds (for move)'),
  trimStart: z.number().optional().describe('Seconds to trim from start'),
  trimEnd: z.number().optional().describe('Seconds to trim from end'),
});

const summarizeTimelineSchema = z.object({});

const listClipsSchema = z.object({});

const findClipSchema = z.object({
  id: z.string().describe('Clip ID to find'),
});

const suggestNextActionSchema = z.object({});

// Context for tool execution
interface ToolContext {
  userId: string;
  clips: VideoReference[];
  audioClips: AudioReference[];
}

// Result from chat with tools
export interface ChatWithToolsResult {
  message: string;
  toolUsed: string;
  action?: TimelineAction;
}

// Create tools with context
function createTools(context: ToolContext) {
  const { userId, clips, audioClips } = context;

  return {
    list_videos: tool({
      description: "List all videos in user's media library",
      parameters: listVideosSchema,
      execute: async () => {
        const result = await listVideos(userId);
        return result;
      },
    }),

    get_video: tool({
      description: 'Find video by name in media library',
      parameters: getVideoSchema,
      execute: async ({ name }) => {
        const result = await getVideo(userId, { name });
        return result;
      },
    }),

    list_audio: tool({
      description: "List all audio files in user's media library",
      parameters: listAudioSchema,
      execute: async () => {
        const result = await listAudio(userId);
        return result;
      },
    }),

    get_audio: tool({
      description: 'Find audio by name in media library',
      parameters: getAudioSchema,
      execute: async ({ name }) => {
        const result = await getAudio(userId, { name });
        return result;
      },
    }),

    add_video_to_timeline: tool({
      description: 'Add a video from the library to the timeline',
      parameters: addVideoToTimelineSchema,
      execute: async ({ videoName, videoId, timestamp }) => {
        const result = await addVideoToTimeline(userId, clips, {
          videoName,
          videoId,
          timestamp,
        });
        return result;
      },
    }),

    modify_video_clip: tool({
      description: 'Move, trim, or remove a video clip on the timeline',
      parameters: modifyVideoClipSchema,
      execute: async ({ action, clipId, timestamp, trimStart, trimEnd }) => {
        const result = modifyVideoClip(clips, {
          action,
          clipId,
          timestamp,
          trimStart,
          trimEnd,
        });
        return result;
      },
    }),

    add_audio_to_timeline: tool({
      description: 'Add an audio file from the library to the audio track',
      parameters: addAudioToTimelineSchema,
      execute: async ({ audioName, audioId, timestamp }) => {
        const result = await addAudioToTimeline(userId, audioClips, {
          audioName,
          audioId,
          timestamp,
        });
        return result;
      },
    }),

    modify_audio_clip: tool({
      description: 'Move, trim, or remove an audio clip on the audio track',
      parameters: modifyAudioClipSchema,
      execute: async ({ action, clipId, timestamp, trimStart, trimEnd }) => {
        const result = modifyAudioClip(audioClips, {
          action,
          clipId,
          timestamp,
          trimStart,
          trimEnd,
        });
        return result;
      },
    }),

    summarize_timeline: tool({
      description: 'Get an overview of the current timeline state',
      parameters: summarizeTimelineSchema,
      execute: async () => {
        const result = summarizeTimeline(clips);
        return result;
      },
    }),

    list_clips: tool({
      description: 'List all clips currently on the timeline',
      parameters: listClipsSchema,
      execute: async () => {
        const result = listClips(clips);
        return result;
      },
    }),

    find_clip: tool({
      description: 'Find a specific clip by ID on the timeline',
      parameters: findClipSchema,
      execute: async ({ id }) => {
        const result = findClip(clips, { id });
        return result;
      },
    }),

    suggest_next_action: tool({
      description: 'Get a suggestion for what to do next based on timeline state',
      parameters: suggestNextActionSchema,
      execute: async () => {
        const result = suggestNextAction(clips, audioClips);
        return result;
      },
    }),
  };
}

// System prompt for the AI
function buildSystemPrompt(clips: VideoReference[], audioClips: AudioReference[]): string {
  return `You are a helpful AI assistant for a video editor application.

Your role is to help users manage their video timeline by:
- Adding videos and audio from their media library to the timeline
- Moving, trimming, or removing clips on the timeline
- Providing information about the current timeline state
- Suggesting next actions

CURRENT TIMELINE STATE:
${formatVideoClips(clips)}
${formatAudioClips(audioClips)}

IMPORTANT GUIDELINES:
1. Use the provided tools to perform actions. Do not make up tool names or capabilities.
2. When adding media, use "videoName" or "audioName" to search by name.
3. When the user refers to media ambiguously (e.g., "it", "the video", "that clip"), use context from the conversation to determine what they mean.
4. If you're unsure what media the user is referring to, ask for clarification.
5. Provide brief, helpful responses that confirm what action was taken.
6. If a tool execution fails, explain the error and suggest how to fix it.`;
}

// Main function to chat with tools
export async function chatWithTools(
  messages: ModelMessage[],
  context: ToolContext
): Promise<ChatWithToolsResult> {
  const { clips, audioClips } = context;
  const tools = createTools(context);
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';

  // Add system message with timeline context
  const systemPrompt = buildSystemPrompt(clips, audioClips);

  const result = await generateText({
    model: google(model),
    system: systemPrompt,
    messages,
    tools,
    maxSteps: 5, // Allow multiple tool calls in sequence
  });

  // Extract the tool result and action if a tool was called
  let toolUsed = 'none';
  let action: TimelineAction | undefined;

  // Check tool results from all steps
  for (const step of result.steps) {
    if (step.toolResults && step.toolResults.length > 0) {
      for (const toolResult of step.toolResults) {
        const resultPart = toolResult as ToolResultPart;
        toolUsed = resultPart.toolName;

        // Extract action from tool result if present
        const toolResultData = resultPart.result as ToolResult | undefined;
        if (toolResultData && 'action' in toolResultData && toolResultData.action) {
          action = toolResultData.action;
        }
      }
    }
  }

  return {
    message: result.text || 'I completed the action.',
    toolUsed,
    action,
  };
}
