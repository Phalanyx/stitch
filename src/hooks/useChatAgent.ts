import { useCallback, useMemo, useRef, useState } from 'react';
import { runChatOrchestrator } from '@/lib/agents/client/chatOrchestrator';
import { JsonValue } from '@/lib/agents/behaviorAgent/types';
import { VideoReference } from '@/types/video';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export function useChatAgent(clips: VideoReference[], audioClips: VideoReference[]) {
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
  const metadataCacheRef = useRef(new Map<string, JsonValue>());
  clipsRef.current = clips;
  audioRef.current = audioClips;

  const knownClipIds = useMemo(
    () => clips.map((clip) => clip.videoId ?? clip.id),
    [clips]
  );

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);

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
        metadataCache: metadataCacheRef.current,
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
