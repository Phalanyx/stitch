'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { VideoReference } from '@/types/video';
import { AudioMetadata } from '@/types/audio';
import { useChatAgent } from '@/hooks/useChatAgent';

interface ChatAgentProps {
  clips: VideoReference[];
  audioClips: VideoReference[];
  onAudioCreated?: (audio: AudioMetadata) => void;
  onTimelineChanged?: () => void;
}

const LOADING_VERBS = [
  'Thinking',
  'Cooking',
  'Embellishing',
  'Caramelizing',
  'Crafting',
  'Polishing',
  'Refining',
  'Weaving',
  'Orchestrating',
  'Synthesizing',
];

function LoadingIndicator() {
  const [currentVerb, setCurrentVerb] = useState(0);
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const verbInterval = setInterval(() => {
      setCurrentVerb((prev) => (prev + 1) % LOADING_VERBS.length);
    }, 2000);

    const dotInterval = setInterval(() => {
      setDotCount((prev) => (prev % 3) + 1);
    }, 500);

    return () => {
      clearInterval(verbInterval);
      clearInterval(dotInterval);
    };
  }, []);

  return (
    <div className="bg-gray-800 text-gray-200 rounded-md px-2 py-1">
      <span className="inline-flex items-center min-w-[140px]">
        {LOADING_VERBS[currentVerb]}
        <span className="inline-block w-6 text-left">
          {'.'.repeat(dotCount)}
        </span>
      </span>
    </div>
  );
}

export function ChatAgent({ clips, audioClips, onAudioCreated, onTimelineChanged }: ChatAgentProps) {
  const { messages, input, setInput, isSending, sendMessage } = useChatAgent(
    clips,
    audioClips,
    onAudioCreated,
    onTimelineChanged
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, isSending]);

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
                ? 'bg-slate-600/40 text-slate-100 rounded-md px-2 py-1 self-end'
                : 'bg-gray-800 text-gray-200 rounded-md px-2 py-1'
            }
          >
            {message.content}
          </div>
        ))}
        {isSending && <LoadingIndicator />}
      </div>
      <div className="p-2 border-t border-gray-700 flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') sendMessage();
          }}
          placeholder="Ask about your timeline..."
          className="flex-1 bg-gray-800 text-gray-100 text-sm px-2 py-1 rounded-md border border-gray-700 focus:outline-none focus:ring-2 focus:ring-slate-500"
        />
        <button
          onClick={sendMessage}
          disabled={isSending}
          className="p-2 rounded-md bg-slate-600 hover:bg-slate-500 text-white disabled:opacity-50"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
