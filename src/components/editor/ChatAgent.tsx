'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Send, X } from 'lucide-react';
import { VideoReference } from '@/types/video';
import { AudioMetadata } from '@/types/audio';
import { useChatAgent } from '@/hooks/useChatAgent';
import { ToolOptionsSelector } from '@/components/chat/ToolOptionsSelector';

interface ChatAgentProps {
  clips: VideoReference[];
  audioClips: VideoReference[];
  onAudioCreated?: (audio: AudioMetadata) => void;
  onTimelineChanged?: () => void;
  isOpen: boolean;
  width: number;
  onToggle: () => void;
  onWidthChange: (width: number) => void;
}

const LOADING_MESSAGES = [
  "Ohana means family",
  "Stitching things together",
  "Getting creative",
  "Making something beautiful",
  "Experiment 626 processing",
  "No one gets left behind",
  "Working on it",
];

function LoadingIndicator() {
  const [message] = useState(() =>
    LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)]
  );

  return (
    <div className="flex items-center gap-2 py-2">
      <img
        src="/stitch.gif"
        alt="Loading..."
        className="w-12 h-12 object-contain"
      />
      <span className="text-gray-400 text-sm">{message}</span>
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

const MIN_WIDTH = 280;
const MAX_WIDTH = 600;

export function ChatAgent({ clips, audioClips, onAudioCreated, onTimelineChanged, isOpen, width, onToggle, onWidthChange }: ChatAgentProps) {
  const {
    messages,
    input,
    setInput,
    isSending,
    sendMessage,
    selectToolOption,
    cancelToolOptions,
    hasPendingSelection,
  } = useChatAgent(
    clips,
    audioClips,
    onAudioCreated,
    onTimelineChanged
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, isSending]);

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = window.innerWidth - e.clientX;
      const clampedWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth));
      onWidthChange(clampedWidth);
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        setIsResizing(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onWidthChange]);

  // Handle animation state for open/close
  useEffect(() => {
    if (!isOpen) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Don't render when fully closed and animation is done
  if (!isOpen && !isAnimating) {
    return null;
  }

  return (
    <div
      className={`fixed right-0 top-[53px] bottom-0 border-l border-gray-700 bg-black flex flex-col overflow-hidden z-40 ${
        !isResizing ? 'transition-[width] duration-300 ease-in-out' : ''
      }`}
      style={{ width: isOpen ? width : 0 }}
    >
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-sky-500/50 z-10"
        onMouseDown={handleMouseDown}
      />
      <div className="px-3 py-2 border-b border-gray-700 text-sm text-gray-300 flex justify-between items-center">
        <span>Lilo Agent</span>
        <button
          onClick={onToggle}
          className="p-1 hover:bg-gray-700 rounded transition-colors"
          aria-label="Close chat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-sm"
      >
        {messages.map((message, index) =>
          message.role === 'user' ? (
            <div key={`${message.role}-${index}`} className="flex justify-end">
              <div className="bg-sky-600/40 text-sky-100 rounded-2xl px-3 py-2 max-w-[80%] break-words">
                {message.content}
              </div>
            </div>
          ) : message.role === 'tool_options' && message.toolOptions ? (
            <div key={`${message.role}-${index}`} className="flex items-start gap-2">
              <img
                src="/stitch_icon.jpeg"
                alt="Stitch"
                className="w-6 h-6 rounded-full object-cover flex-shrink-0"
              />
              <div className="max-w-[90%]">
                <ToolOptionsSelector
                  toolOptions={message.toolOptions}
                  onSelect={selectToolOption}
                  onCancel={cancelToolOptions}
                  disabled={isSending}
                />
              </div>
            </div>
          ) : (
            <div key={`${message.role}-${index}`} className="flex items-start gap-2">
              <img
                src="/stitch_icon.jpeg"
                alt="Stitch"
                className="w-6 h-6 rounded-full object-cover flex-shrink-0"
              />
              <div className="relative max-w-[80%]">
                <div
                  className="absolute top-2 w-0 h-0"
                  style={{
                    left: '-6px',
                    borderTop: '6px solid transparent',
                    borderBottom: '6px solid transparent',
                    borderRight: '10px solid rgb(31, 41, 55)',
                  }}
                />
                <div className="bg-gray-800 text-gray-200 rounded-2xl px-3 py-2 break-words">
                  {message.content}
                </div>
              </div>
            </div>
          )
        )}
        {isSending && <LoadingIndicator />}
      </div>
      <div className="p-2 border-t border-gray-700 flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !hasPendingSelection) sendMessage();
          }}
          placeholder={hasPendingSelection ? "Select an option above..." : "Ask about your timeline..."}
          disabled={hasPendingSelection}
          className="flex-1 bg-gray-800 text-gray-100 text-sm px-2 py-1 rounded-md border border-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={sendMessage}
          disabled={isSending || hasPendingSelection}
          className="p-2 rounded-md bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
