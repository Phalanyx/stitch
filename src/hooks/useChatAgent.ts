import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runChatOrchestrator, ToolOptionsPreview } from '@/lib/agents/client/chatOrchestrator';
import { VideoReference } from '@/types/video';
import { AudioMetadata } from '@/types/audio';
import { ToolCall } from '@/lib/agents/client/types';
import { useHistoryAgent } from './useHistoryAgent';
import { PatternObservation } from '@/lib/agents/historyAgent/types';

export type ToolOptionsData = ToolOptionsPreview;

export type ChatMessage = {
  id?: string;
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

  // History agent integration
  const {
    analysis: historyAnalysis,
    isAnalyzing: isAnalyzingHistory,
    analyze: analyzeHistory,
    consumeNotifications,
  } = useHistoryAgent();

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

  const markMessageFeedback = useCallback((messageId: string | undefined, feedback: 'like' | 'dislike') => {
    if (!messageId) return;
    setMessages((current) =>
      current.map((m) => (m.id === messageId ? { ...m, feedback } : m))
    );
  }, []);

  const selectToolOption = useCallback(async (selectedValue: string) => {
    if (!pendingSelection) return;

    setIsSending(true);
    setPendingSelection(null);

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
        showToolOptionsPreview,
        resumeWithSelection: {
          toolCall: pendingSelection.toolCall,
          selectedValue,
          pendingPlan: pendingSelection.pendingPlan,
        },
      });
      setMessages((current) => [
        ...current,
        { id: generateId(), role: 'assistant', content: result.response || 'Unable to generate a response.' },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: generateId(),
          role: 'assistant',
          content: error instanceof Error ? error.message : 'Failed to complete action.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }, [pendingSelection, knownClipIds, showToolOptionsPreview]);

  const cancelToolOptions = useCallback(() => {
    setPendingSelection(null);
    // Remove the tool_options message
    setMessages((current) => current.filter((m) => m.role !== 'tool_options'));
  }, []);

  const hasPendingSelection = pendingSelection !== null;

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

    // Consume pending history notifications
    const patternNotifications = consumeNotifications();

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
        patternNotifications,
      });

      // Handle tool options preview - pause and show options to user
      if (result.isPaused && result.toolOptionsPreview) {
        setPendingSelection({
          toolCall: result.toolOptionsPreview.pendingToolCall,
          pendingPlan: result.toolOptionsPreview.pendingPlan,
          originalMessage: trimmed,
        });
        setMessages((current) => [
          ...current,
          {
            id: generateId(),
            role: 'tool_options',
            content: '',
            toolOptions: result.toolOptionsPreview,
          },
        ]);
        return;
      }

      setMessages((current) => [
        ...current,
        { id: generateId(), role: 'assistant', content: result.response || 'Unable to generate a response.' },
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
  }, [audioRef, clipsRef, input, isSending, knownClipIds, messages, showToolOptionsPreview]);

  const selectToolOption = useCallback(async (selectedValue: string) => {
    if (!pendingSelection) return;

    setIsSending(true);
    // Remove the tool_options message
    setMessages((current) => current.filter((m) => m.role !== 'tool_options'));

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
        conversation: messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        showToolOptionsPreview,
        resumeWithSelection: {
          toolCall: pendingSelection.toolCall,
          selectedValue,
          pendingPlan: pendingSelection.pendingPlan,
        },
      });

      setMessages((current) => [
        ...current,
        { id: generateId(), role: 'assistant', content: result.response || 'Unable to generate a response.' },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: generateId(),
          role: 'assistant',
          content: error instanceof Error ? error.message : 'Failed to complete selection.',
        },
      ]);
    } finally {
      setPendingSelection(null);
      setIsSending(false);
    }
  }, [pendingSelection, knownClipIds, messages, showToolOptionsPreview]);

  const cancelToolOptions = useCallback(() => {
    // Remove the tool_options message
    setMessages((current) => current.filter((m) => m.role !== 'tool_options'));
    // Add cancellation message
    setMessages((current) => [
      ...current,
      {
        id: generateId(),
        role: 'assistant',
        content: 'Action cancelled. What would you like to do instead?',
      },
    ]);
    setPendingSelection(null);
  }, []);

  const markMessageFeedback = useCallback((messageId: string, feedback: 'like' | 'dislike') => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, feedback } : message
      )
    );
  }, []);

  const hasPendingSelection = Boolean(pendingSelection);

  return {
    messages,
    input,
    setInput,
    isSending,
    sendMessage,
    selectToolOption,
    cancelToolOptions,
    hasPendingSelection,
    markMessageFeedback,
    historyAnalysis,
    isAnalyzingHistory,
    analyzeHistory,
  };
}
