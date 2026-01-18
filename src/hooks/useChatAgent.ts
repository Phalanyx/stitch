import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runChatOrchestrator, ToolOptionsPreview } from '@/lib/agents/client/chatOrchestrator';
import { VideoReference } from '@/types/video';
import { AudioMetadata } from '@/types/audio';
import { ToolCall } from '@/lib/agents/client/types';

export type ToolOptionsData = ToolOptionsPreview;

export type ChatMessage = {
  role: 'user' | 'assistant' | 'tool_options';
  content: string;
  toolOptions?: ToolOptionsData;
};

type PendingSelection = {
  toolCall: ToolCall;
  pendingPlan: ToolCall[];
  originalMessage: string;
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

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: 'user', content: trimmed },
    ];
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

      if (result.isPaused && result.toolOptionsPreview) {
        // Store pending selection state
        setPendingSelection({
          toolCall: result.toolOptionsPreview.pendingToolCall,
          pendingPlan: result.toolOptionsPreview.pendingPlan,
          originalMessage: trimmed,
        });

        // Add tool_options message for the UI
        setMessages((current) => [
          ...current,
          {
            role: 'tool_options',
            content: `Choose a ${result.toolOptionsPreview!.paramName} option:`,
            toolOptions: result.toolOptionsPreview,
          },
        ]);
      } else {
        setMessages((current) => [
          ...current,
          { role: 'assistant', content: result.response || 'Unable to generate a response.' },
        ]);
      }
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
  }, [audioRef, clipsRef, input, isSending, knownClipIds, messages, showToolOptionsPreview]);

  const selectToolOption = useCallback(async (selectedValue: string) => {
    if (!pendingSelection || isSending) return;
    setIsSending(true);

    // Remove the tool_options message and add an assistant message showing selection
    setMessages((current) => {
      const filtered = current.filter((m) => m.role !== 'tool_options');
      return [
        ...filtered,
        { role: 'assistant', content: `Using: "${selectedValue}"` },
      ];
    });

    // Filter to only user/assistant messages for conversation context
    const conversationMessages = messages
      .filter((m): m is { role: 'user' | 'assistant'; content: string } =>
        m.role === 'user' || m.role === 'assistant'
      );

    try {
      const result = await runChatOrchestrator({
        message: pendingSelection.originalMessage,
        knownClipIds,
        context: {
          clips: clipsRef.current,
          audioClips: audioRef.current,
        },
        onAudioCreated: onAudioCreatedRef.current,
        onTimelineChanged: onTimelineChangedRef.current,
        conversation: conversationMessages,
        resumeWithSelection: {
          toolCall: pendingSelection.toolCall,
          selectedValue,
          pendingPlan: pendingSelection.pendingPlan,
        },
      });

      setMessages((current) => [
        ...current,
        { role: 'assistant', content: result.response || 'Done!' },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content:
            error instanceof Error ? error.message : 'Failed to execute tool.',
        },
      ]);
    } finally {
      setPendingSelection(null);
      setIsSending(false);
    }
  }, [clipsRef, audioRef, isSending, knownClipIds, messages, pendingSelection]);

  const cancelToolOptions = useCallback(() => {
    // Remove the tool_options message
    setMessages((current) => current.filter((m) => m.role !== 'tool_options'));
    setPendingSelection(null);
  }, []);

  const hasPendingSelection = pendingSelection !== null;

  return {
    messages,
    input,
    setInput,
    isSending,
    sendMessage,
    selectToolOption,
    cancelToolOptions,
    hasPendingSelection,
    showToolOptionsPreview,
    setShowToolOptionsPreview,
  };
}
