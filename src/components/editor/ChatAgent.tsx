'use client';

import { useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { VideoReference } from '@/types/video';
import { useChatAgent } from '@/hooks/useChatAgent';

interface ChatAgentProps {
  clips: VideoReference[];
  audioClips: VideoReference[];
}

export function ChatAgent({ clips, audioClips }: ChatAgentProps) {
  const { messages, input, setInput, isSending, sendMessage } = useChatAgent(
    clips,
    audioClips
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

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
            if (event.key === 'Enter') sendMessage();
          }}
          placeholder="Ask about your timeline..."
          className="flex-1 bg-gray-800 text-gray-100 text-sm px-2 py-1 rounded-md border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={sendMessage}
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
