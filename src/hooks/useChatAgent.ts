import { useCallback, useMemo, useRef, useState } from 'react';
import { parseJsonFromText } from '@/lib/ai/gemini';
import {
  findClip,
  summarizeTimeline,
  suggestNextAction,
} from '@/lib/tools/chatTools';
import { VideoReference } from '@/types/video';
import { AudioMetadata } from '@/types/audio';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ToolDecision = {
  tool:
    | 'summarize_timeline'
    | 'list_clips'
    | 'find_clip'
    | 'suggest_next_action'
    | 'get_video_metadata'
    | 'list_uploaded_videos'
    | 'create_audio_from_text'
    | 'none';
  args?: Record<string, string>;
};

type ToolPlan = ToolDecision[];

type ToolStatus = {
  tool: string;
  status: 'ok' | 'error';
  changed: boolean;
  output: unknown;
};

type SatisfactionCheck = {
  satisfied: boolean;
  response?: string;
};

const TOOL_DESCRIPTIONS = [
  {
    name: 'summarize_timeline',
    description: 'Summarize the timeline length, total duration, and span.',
  },
  {
    name: 'list_clips',
    description: 'List timeline clips with id/videoId, timestamps, durations, plus metadata if available.',
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
  {
    name: 'list_uploaded_videos',
    description: 'List the user uploaded videos with fileName and summary.',
  },
  {
    name: 'create_audio_from_text',
    description: 'Generate speech audio from text using AI voice synthesis. Use this when the user wants to create narration, voiceover, or any spoken audio from text. Args: {text: "the text to speak"}.',
  },
];

async function callChatLlm(prompt: string): Promise<string> {
  const response = await fetch('/api/chat-llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  const data = (await response.json()) as { text?: string; error?: string };
  if (!response.ok) {
    throw new Error(data.error || 'Chat LLM request failed');
  }
  if (!data.text) {
    throw new Error('Empty model response');
  }
  return data.text;
}

async function getVideoMetadata(videoId: string) {
  const response = await fetch(`/api/videos/${videoId}/metadata`);
  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    return data.error || `Failed to fetch metadata for ${videoId}.`;
  }
  return data;
}

async function listUploadedVideos() {
  const response = await fetch('/api/videos');
  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    return data.error || 'Failed to fetch uploaded videos.';
  }
  return data;
}

export function useChatAgent(
  clips: VideoReference[],
  audioClips: VideoReference[],
  onAudioCreated?: (audio: AudioMetadata) => void
) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Ask me about your timeline, clips, or what to do next.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const clipsRef = useRef(clips);
  const audioRef = useRef(audioClips);
  const metadataCacheRef = useRef(new Map<string, unknown>());

  clipsRef.current = clips;
  audioRef.current = audioClips;
  const onAudioCreatedRef = useRef(onAudioCreated);
  onAudioCreatedRef.current = onAudioCreated;

  const knownClipIds = useMemo(
    () => clips.map((clip) => clip.videoId ?? clip.id),
    [clips]
  );

  const fetchMetadata = useCallback(async (videoId: string) => {
    if (metadataCacheRef.current.has(videoId)) {
      return metadataCacheRef.current.get(videoId);
    }
    const data = await getVideoMetadata(videoId);
    metadataCacheRef.current.set(videoId, data);
    return data;
  }, []);

  const runTool = useCallback(
    async (decision: ToolDecision): Promise<ToolStatus> => {
      if (decision.tool === 'summarize_timeline') {
        return {
          tool: decision.tool,
          status: 'ok',
          changed: false,
          output: summarizeTimeline(clipsRef.current),
        };
      }
      if (decision.tool === 'list_clips') {
        const enriched = await Promise.all(
          clipsRef.current.map(async (clip, index) => {
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
          tool: decision.tool,
          status: 'ok',
          changed: false,
          output: enriched,
        };
      }
      if (decision.tool === 'find_clip') {
        const id = decision.args?.id ?? '';
        return {
          tool: decision.tool,
          status: id ? 'ok' : 'error',
          changed: false,
          output: id
            ? {
                details: findClip(clipsRef.current, id),
                metadata: await fetchMetadata(id),
              }
            : 'Missing clip id.',
        };
      }
      if (decision.tool === 'suggest_next_action') {
        return {
          tool: decision.tool,
          status: 'ok',
          changed: false,
          output: suggestNextAction(clipsRef.current, audioRef.current),
        };
      }
      if (decision.tool === 'get_video_metadata') {
        const videoId = decision.args?.videoId ?? '';
        if (!videoId) {
          return {
            tool: decision.tool,
            status: 'error',
            changed: false,
            output: 'Missing videoId.',
          };
        }
        const data = await fetchMetadata(videoId);
        const isError = typeof data === 'string' && data.toLowerCase().includes('failed');
        return {
          tool: decision.tool,
          status: isError ? 'error' : 'ok',
          changed: false,
          output: data,
        };
      }
      if (decision.tool === 'list_uploaded_videos') {
        const data = await listUploadedVideos();
        const isError = typeof data === 'string' && data.toLowerCase().includes('failed');
        return {
          tool: decision.tool,
          status: isError ? 'error' : 'ok',
          changed: false,
          output: data,
        };
      }
      if (decision.tool === 'create_audio_from_text') {
        const text = decision.args?.text ?? '';
        if (!text) {
          return {
            tool: decision.tool,
            status: 'error',
            changed: false,
            output: 'Missing text argument.',
          };
        }
        try {
          const response = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });
          const data = (await response.json()) as { audio?: AudioMetadata; error?: string };
          if (!response.ok) {
            return {
              tool: decision.tool,
              status: 'error',
              changed: false,
              output: data.error || 'Failed to generate audio.',
            };
          }
          if (data.audio && onAudioCreatedRef.current) {
            onAudioCreatedRef.current(data.audio);
          }
          return {
            tool: decision.tool,
            status: 'ok',
            changed: true,
            output: data.audio,
          };
        } catch (error) {
          return {
            tool: decision.tool,
            status: 'error',
            changed: false,
            output: error instanceof Error ? error.message : 'Failed to generate audio.',
          };
        }
      }
      return {
        tool: decision.tool,
        status: 'error',
        changed: false,
        output: 'Tool not found.',
      };
    },
    [audioRef, clipsRef, fetchMetadata]
  );

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);

    const nextMessages = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');

    try {
        const planText = await callChatLlm(
          [
            'You are a planner that chooses which tools to call in order.',
            'Return JSON array only, each item: {"tool":"toolName","args":{...}}.',
            `Tools: ${JSON.stringify(TOOL_DESCRIPTIONS)}`,
            `User message: ${trimmed}`,
            `Known clip ids: ${knownClipIds.join(', ') || 'none'}`,
            'Prefer metadata-based tools when the user asks about clip content or names.',
            'Use list_uploaded_videos when the user asks about uploaded videos or library.',
            'Use create_audio_from_text with args {"text":"..."} when the user wants to create narration, voiceover, or speech audio.',
            'Pick up to 3 tool calls. Return [] if none are needed.',
            'Use find_clip with args {"id":"..."} when the user references a clip id.',
            'Use get_video_metadata with args {"videoId":"..."} for a clip video id.',
          ].join('\n')
        );

      const plan = parseJsonFromText<ToolPlan>(planText) ?? [];
      const toolResults: ToolStatus[] = [];
      let satisfied = false;
      let finalResponse = '';

      for (const call of plan) {
        if (call.tool === 'none') continue;
        const toolResult = await runTool(call);
        toolResults.push(toolResult);

        const satisfactionText = await callChatLlm(
          [
            'You are a validator that checks if the user request is satisfied.',
            'Return JSON only: {"satisfied":true|false,"response":"..."}',
            `User message: ${trimmed}`,
            `Tool results: ${JSON.stringify(toolResults)}`,
            'If satisfied, include a concise response without raw ids unless asked.',
          ].join('\n')
        );

        const satisfaction = parseJsonFromText<SatisfactionCheck>(satisfactionText);
        if (satisfaction?.satisfied) {
          satisfied = true;
          finalResponse = satisfaction.response ?? '';
          break;
        }
      }

      if (!satisfied) {
        finalResponse = await callChatLlm(
          [
            'You are a helpful assistant for a video editor.',
            `User message: ${trimmed}`,
            `Tool results: ${JSON.stringify(toolResults)}`,
            'Prefer fileName or summary over raw ids unless the user asked for ids.',
            'Answer in 1-3 sentences, using tool results when relevant.',
          ].join('\n')
        );
      }

      setMessages((current) => [
        ...current,
        { role: 'assistant', content: finalResponse || 'Unable to generate a response.' },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            error instanceof Error ? error.message : 'Failed to reach chat agent.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }, [audioRef, clipsRef, input, isSending, knownClipIds, messages]);

  return {
    messages,
    input,
    setInput,
    isSending,
    sendMessage,
  };
}
