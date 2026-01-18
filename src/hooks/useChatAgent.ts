import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runChatOrchestrator, ToolOptionsPreview } from '@/lib/agents/client/chatOrchestrator';
import { VideoReference } from '@/types/video';
import { AudioMetadata } from '@/types/audio';
import { ToolCall } from '@/lib/agents/client/types';

export type ToolOptionsData = ToolOptionsPreview;

export type ChatMessage = {
  role: 'user' | 'assistant' | 'tool_options';
  content: string;
  feedback?: 'like' | 'dislike';
  toolOptions?: ToolOptionsData;
};

type PendingSelection = {
  toolCall: ToolCall;
  pendingPlan: ToolCall[];
  originalMessage: string;
};

function generateId(): string {
  return crypto.randomUUID();
}

export function useChatAgent(
  clips: VideoReference[],
  audioClips: VideoReference[],
  onAudioCreated?: (audio: AudioMetadata) => void,
  onTimelineChanged?: () => void
) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: generateId(),
      role: 'assistant',
      content: 'Ask me about your timeline, clips, or what to do next.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showToolOptionsPreview, setShowToolOptionsPreview] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);

  const clipsRef = useRef(clips);
  const audioRef = useRef(audioClips);
  const onAudioCreatedRef = useRef(onAudioCreated);
  const onTimelineChangedRef = useRef(onTimelineChanged);
  clipsRef.current = clips;
  audioRef.current = audioClips;
  onAudioCreatedRef.current = onAudioCreated;
  onTimelineChangedRef.current = onTimelineChanged;

  // Fetch the tool options preview setting on mount
  useEffect(() => {
    fetch('/api/preferences')
      .then((res) => res.json())
      .then((data) => {
        if (data.showToolOptionsPreview !== undefined) {
          setShowToolOptionsPreview(data.showToolOptionsPreview);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch preferences:', err);
      });
  }, []);

  const knownClipIds = useMemo(
    () => clips.map((clip) => clip.videoId ?? clip.id),
    [clips]
  );

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
    };
    const nextMessages: ChatMessage[] = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');

    // Filter out tool_options messages for conversation context
    const conversationMessages = nextMessages
      .filter((m): m is { role: 'user' | 'assistant'; content: string } =>
        m.role === 'user' || m.role === 'assistant'
      );

    try {
      const result = await runChatOrchestrator({
        message: trimmed,
        knownClipIds,
        context: {
          clips: clipsRef.current,
          audioClips: audioRef.current,
        },
        onAudioCreated: onAudioCreatedRef.current,
        onTimelineChanged: onTimelineChangedRef.current,
        conversation: conversationMessages,
        showToolOptionsPreview,
      });
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: response || 'Unable to generate a response.' },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: generateId(),
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
