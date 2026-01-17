'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Send } from 'lucide-react';
import { VideoReference } from '@/types/video';
import { TimelineAction } from '@/types/actions';
import { useTimelineStore } from '@/stores/timelineStore';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

interface ChatAgentProps {
  clips: VideoReference[];
  audioClips: VideoReference[];
}

type ChatResponseData = {
  message?: string;
  error?: string;
  action?: TimelineAction;
  toolUsed?: string;
};

export function ChatAgent({ clips, audioClips }: ChatAgentProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Ask me about your timeline, clips, or what to do next. I can also add videos and audio to your timeline.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Get store actions
  const addVideoAtTimestamp = useTimelineStore((state) => state.addVideoAtTimestamp);
  const updateVideoTimestamp = useTimelineStore((state) => state.updateVideoTimestamp);
  const updateClipTrim = useTimelineStore((state) => state.updateClipTrim);
  const removeClip = useTimelineStore((state) => state.removeClip);

  const addAudioAtTimestamp = useAudioTimelineStore((state) => state.addAudioAtTimestamp);
  const updateAudioTimestamp = useAudioTimelineStore((state) => state.updateAudioTimestamp);
  const updateAudioClipTrim = useAudioTimelineStore((state) => state.updateAudioClipTrim);
  const removeAudioClip = useAudioTimelineStore((state) => state.removeAudioClip);

  // Execute timeline actions from the API response
  const executeAction = useCallback((action: TimelineAction) => {
    switch (action.type) {
      case 'ADD_VIDEO_CLIP':
        addVideoAtTimestamp(
          {
            id: action.payload.videoId,
            url: action.payload.url,
            duration: action.payload.duration,
          },
          action.payload.timestamp
        );
        break;

      case 'MOVE_CLIP':
        updateVideoTimestamp(action.payload.clipId, action.payload.timestamp);
        break;

      case 'TRIM_CLIP':
        updateClipTrim(action.payload.clipId, {
          trimStart: action.payload.trimStart,
          trimEnd: action.payload.trimEnd,
          timestamp: action.payload.timestamp,
        });
        break;

      case 'REMOVE_CLIP':
        removeClip(action.payload.clipId);
        break;

      case 'ADD_AUDIO_CLIP':
        addAudioAtTimestamp(
          {
            id: action.payload.audioId,
            url: action.payload.url,
            duration: action.payload.duration,
          },
          action.payload.timestamp
        );
        break;

      case 'MOVE_AUDIO_CLIP':
        updateAudioTimestamp(action.payload.clipId, action.payload.timestamp);
        break;

      case 'TRIM_AUDIO_CLIP':
        updateAudioClipTrim(action.payload.clipId, {
          trimStart: action.payload.trimStart,
          trimEnd: action.payload.trimEnd,
          timestamp: action.payload.timestamp,
        });
        break;

      case 'REMOVE_AUDIO_CLIP':
        removeAudioClip(action.payload.clipId);
        break;
    }
  }, [
    addVideoAtTimestamp,
    updateVideoTimestamp,
    updateClipTrim,
    removeClip,
    addAudioAtTimestamp,
    updateAudioTimestamp,
    updateAudioClipTrim,
    removeAudioClip,
  ]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setIsSending(true);

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          context: { clips, audioClips },
        }),
      });
      const data = (await response.json()) as ChatResponseData;
      if (!response.ok) {
        throw new Error(data.error || 'Request failed');
      }

      // Execute action if present
      if (data.action) {
        executeAction(data.action);
      }

      setMessages((current) => [
        ...current,
        { role: 'assistant', content: data.message ?? 'No response.' },
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
  };

  return (
    <div className="w-72 border-l border-gray-700 bg-gray-900 flex flex-col">
      <div className="px-3 py-2 border-b border-gray-700 text-sm text-gray-300">
        Chat Agent
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm"
      >
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={
              message.role === 'user'
                ? 'bg-blue-600/40 text-blue-100 rounded-md px-2 py-1 self-end'
                : 'bg-gray-800 text-gray-200 rounded-md px-2 py-1'
            }
          >
            {message.content}
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-gray-700 flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleSend();
          }}
          placeholder="Ask about your timeline..."
          className="flex-1 bg-gray-800 text-gray-100 text-sm px-2 py-1 rounded-md border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSend}
          disabled={isSending}
          className="p-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
