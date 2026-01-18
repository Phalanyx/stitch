import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runChatOrchestrator } from '@/lib/agents/client/chatOrchestrator';
import { VideoReference } from '@/types/video';
import { AudioMetadata } from '@/types/audio';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type ChatMemory = {
  name?: string;
};

export function useChatAgent(
  clips: VideoReference[],
  audioClips: VideoReference[],
  onAudioCreated?: (audio: AudioMetadata) => void,
  onTimelineChanged?: () => void
) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Ask me about your timeline, clips, or what to do next.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [memory, setMemory] = useState<ChatMemory>({});
  const clipsRef = useRef(clips);
  const audioRef = useRef(audioClips);
  const onAudioCreatedRef = useRef(onAudioCreated);
  const onTimelineChangedRef = useRef(onTimelineChanged);
  const memoryRef = useRef<ChatMemory>({});
  clipsRef.current = clips;
  audioRef.current = audioClips;
  onAudioCreatedRef.current = onAudioCreated;
  onTimelineChangedRef.current = onTimelineChanged;

  useEffect(() => {
    try {
      const stored = localStorage.getItem('chatMemory');
      if (stored) {
        setMemory(JSON.parse(stored) as ChatMemory);
      }
    } catch {
      // Ignore malformed storage values.
    }
  }, []);

  useEffect(() => {
    memoryRef.current = memory;
    try {
      localStorage.setItem('chatMemory', JSON.stringify(memory));
    } catch {
      // Ignore storage failures (e.g. private mode).
    }
  }, [memory]);

  const knownClipIds = useMemo(
    () => clips.map((clip) => clip.videoId ?? clip.id),
    [clips]
  );

  const extractName = (text: string) => {
    const match =
      text.match(/\bmy name is\s+([A-Za-z'-]+)/i) ??
      text.match(/\bi am\s+([A-Za-z'-]+)/i) ??
      text.match(/\bi'?m\s+([A-Za-z'-]+)/i);
    return match ? match[1] : null;
  };

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);

    const name = extractName(trimmed);
    const nextMemory = name
      ? { ...memoryRef.current, name }
      : memoryRef.current;
    if (name && name !== memoryRef.current.name) {
      setMemory(nextMemory);
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: trimmed },
    ];
    setMessages(nextMessages);
    setInput('');

    try {
      const { response } = await runChatOrchestrator({
        message: trimmed,
        knownClipIds,
        context: {
          clips: clipsRef.current,
          audioClips: audioRef.current,
        },
        onAudioCreated: onAudioCreatedRef.current,
        onTimelineChanged: onTimelineChangedRef.current,
        memory: nextMemory,
      });
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: response || 'Unable to generate a response.' },
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
