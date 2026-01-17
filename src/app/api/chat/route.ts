import { NextRequest, NextResponse } from 'next/server';
import { callGeminiText, parseJsonFromText } from '@/lib/ai/gemini';
import { createClient } from '@/lib/supabase/server';
import { getVideoMetadataForUser } from '@/lib/tools/videoMetadata';
import { VideoReference } from '@/types/video';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatContext = {
  clips?: VideoReference[];
  audioClips?: VideoReference[];
};

type ChatRequest = {
  messages: ChatMessage[];
  context?: ChatContext;
};

type ToolDecision = {
  tool:
    | 'summarize_timeline'
    | 'list_clips'
    | 'find_clip'
    | 'suggest_next_action'
    | 'get_video_metadata'
    | 'none';
  args?: Record<string, string>;
};

const TOOL_DESCRIPTIONS = [
  {
    name: 'summarize_timeline',
    description: 'Summarize the timeline length, total duration, and span.',
  },
  {
    name: 'list_clips',
    description: 'List timeline clips with id/videoId and start timestamps.',
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
    description: 'Fetch full metadata for a video by videoId (fileName, summary, duration, status, url).',
  },
];

function summarizeTimeline(clips: VideoReference[]) {
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

function listClips(clips: VideoReference[]) {
  if (clips.length === 0) {
    return 'No clips available.';
  }
  return clips
    .map((clip, index) => `#${index + 1} ${clip.videoId ?? clip.id} @ ${clip.timestamp.toFixed(1)}s`)
    .join('\n');
}

function findClip(clips: VideoReference[], id: string) {
  const clip = clips.find((item) => item.id === id || item.videoId === id);
  if (!clip) return `No clip found with id ${id}.`;
  return `Clip ${clip.videoId ?? clip.id} starts at ${clip.timestamp.toFixed(1)}s and lasts ${clip.duration.toFixed(1)}s.`;
}

function suggestNextAction(clips: VideoReference[], audioClips: VideoReference[]) {
  if (clips.length === 0) {
    return 'Start by adding a video clip from the media library.';
  }
  if (audioClips.length === 0) {
    return 'Consider adding background audio to match your timeline.';
  }
  return 'Preview the timeline and fine-tune clip timing.';
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequest;
    if (!Array.isArray(body?.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'messages must be provided' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clips = body.context?.clips ?? [];
    const audioClips = body.context?.audioClips ?? [];
    const lastUser = body.messages[body.messages.length - 1]?.content ?? '';
    const toolResults: Array<{ tool: string; output: unknown }> = [];

    for (let step = 0; step < 3; step += 1) {
      const decisionText = await callGeminiText(
        [
          'You are a chat agent for a video editor.',
          'Decide if a tool is needed to answer the user.',
          'Return JSON only: {"tool":"summarize_timeline|list_clips|find_clip|suggest_next_action|get_video_metadata|none","args":{...}}.',
          `Tools: ${JSON.stringify(TOOL_DESCRIPTIONS)}`,
          `User message: ${lastUser}`,
          `Known clip ids: ${clips.map((clip) => clip.videoId ?? clip.id).join(', ') || 'none'}`,
          `Tool results so far: ${JSON.stringify(toolResults)}`,
          'Use find_clip with args {"id":"..."} when the user references a clip id.',
          'Use get_video_metadata with args {"videoId":"..."} for a clip video id.',
        ].join('\n')
      );

      const decision = parseJsonFromText<ToolDecision>(decisionText) ?? { tool: 'none' };
      if (decision.tool === 'none') break;

      if (decision.tool === 'summarize_timeline') {
        toolResults.push({ tool: decision.tool, output: summarizeTimeline(clips) });
      } else if (decision.tool === 'list_clips') {
        toolResults.push({ tool: decision.tool, output: listClips(clips) });
      } else if (decision.tool === 'find_clip') {
        const id = decision.args?.id ?? '';
        toolResults.push({ tool: decision.tool, output: id ? findClip(clips, id) : 'Missing clip id.' });
      } else if (decision.tool === 'suggest_next_action') {
        toolResults.push({ tool: decision.tool, output: suggestNextAction(clips, audioClips) });
      } else if (decision.tool === 'get_video_metadata') {
        const videoId = decision.args?.videoId ?? '';
        if (!videoId) {
          toolResults.push({ tool: decision.tool, output: 'Missing videoId.' });
        } else {
          const metadata = await getVideoMetadataForUser(videoId, user.id);
          toolResults.push({
            tool: decision.tool,
            output: metadata ?? `No video metadata found for id ${videoId}.`,
          });
        }
      }
    }

    if (toolResults.length > 0) {
      const responseText = await callGeminiText(
        [
          'You are a helpful assistant for a video editor.',
          `User message: ${lastUser}`,
          `Tool results: ${JSON.stringify(toolResults)}`,
          'Answer in 1-3 sentences, using tool results when relevant.',
        ].join('\n')
      );

      return NextResponse.json({
        message: responseText ?? 'Unable to generate a response.',
        toolUsed: toolResults.map((result) => result.tool),
      });
    }

    const responseText = await callGeminiText(
      [
        'You are a helpful assistant for a video editor.',
        `User message: ${lastUser}`,
        'Answer in 1-3 sentences.',
      ].join('\n')
    );

    return NextResponse.json({
      message: responseText ?? 'Unable to generate a response.',
      toolUsed: 'none',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
