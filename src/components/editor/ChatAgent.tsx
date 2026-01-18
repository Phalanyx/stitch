'use client';

import { useEffect, useRef } from 'react';
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

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-1.5">
        <div 
          className="w-2 h-2 bg-gray-400 rounded-full animate-[typing_1.4s_ease-in-out_infinite]" 
          style={{ animationDelay: '0ms' }} 
        />
        <div 
          className="w-2 h-2 bg-gray-400 rounded-full animate-[typing_1.4s_ease-in-out_infinite]" 
          style={{ animationDelay: '200ms' }} 
        />
        <div 
          className="w-2 h-2 bg-gray-400 rounded-full animate-[typing_1.4s_ease-in-out_infinite]" 
          style={{ animationDelay: '400ms' }} 
        />
      </div>
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSend = () => {
    if (input.trim() && !isSending) {
      sendMessage();
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="w-72 border-l border-gray-700 bg-gray-900 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700">
        <h2 className="text-sm font-semibold text-gray-200 tracking-tight">Chat Agent</h2>
      </div>

      {/* Messages Container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-4 space-y-3"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#4B5563 #1F2937' }}
      >
        {messages.length === 0 && !isSending && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-500 text-center px-4">
              Ask me about your timeline, clips, or what to do next.
            </p>
          </div>
        )}

        {messages.map((message, index) => {
          const isUser = message.role === 'user';
          
          return (
            <div
              key={`${message.role}-${index}`}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-[fadeIn_0.2s_ease-out]`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 shadow-sm ${
                  isUser
                    ? 'bg-sky-600/40 text-sky-100 rounded-br-sm'
                    : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                }`}
                style={{
                  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
                  fontSize: '14px',
                  lineHeight: '1.4',
                  wordWrap: 'break-word',
                }}
              >
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            </div>
          );
        })}

        {isSending && (
          <div className="flex justify-start animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm">
              <TypingIndicator />
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-3 border-t border-gray-700 bg-gray-900">
        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your timeline..."
              disabled={isSending}
              className="w-full bg-gray-800 text-gray-100 text-sm px-3.5 py-2.5 rounded-2xl border border-gray-700/50 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-gray-500"
              style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
              }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={isSending || !input.trim()}
            className="flex-shrink-0 p-2.5 rounded-full bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-sky-600 transition-all duration-200 active:scale-95"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
