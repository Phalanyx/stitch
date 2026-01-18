import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { runChatOrchestrator, ToolOptionsPreview } from '@/lib/agents/client/chatOrchestrator';
import { VideoReference } from '@/types/video';
import { AudioMetadata } from '@/types/audio';
import { ToolCall } from '@/lib/agents/client/types';
import { useHistoryAgent } from './useHistoryAgent';
import { useTimelineStore } from '@/stores/timelineStore';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { useHistoryStore } from '@/stores/historyStore';
import { createLLMBatchCommand } from '@/lib/commands';

export type ToolOptionsData = ToolOptionsPreview;

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool_options';
  content: string;
  feedback?: 'like' | 'dislike';
  toolOptions?: ToolOptionsData;
};

type PendingSelection = {
  toolCall: ToolCall;
  pendingPlan: ToolCall[];
  originalMessage: string;
  toolName: string;
  paramName: string;
  originalIntent: string;
};

function generateId(): string {
  return crypto.randomUUID();
}

export function useChatAgent(
  clips: VideoReference[],
  audioClips: VideoReference[],
  onAudioCreated?: (audio: AudioMetadata) => void,
  onTimelineChanged?: () => void | Promise<void>
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

  useEffect(() => {
    fetch('/api/preferences')
      .then((res) => res.json())
      .then((data) => {
        if (data.showToolOptionsPreview !== undefined) {
          setShowToolOptionsPreview(data.showToolOptionsPreview);
        }
      })
      .catch(() => {});
  }, []);

  const knownClipIds = useMemo(
    () => clips.map((clip) => clip.videoId ?? clip.id),
    [clips]
  );

  const handleEditTracked = useCallback(async (original: string, edited: string) => {
    if (!pendingSelection) return;

    await fetch('/api/tool-edits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolName: pendingSelection.toolName,
        paramName: pendingSelection.paramName,
        originalValue: original,
        editedValue: edited,
        userContext: pendingSelection.originalIntent,
      }),
    });
  }, [pendingSelection]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
    };

    setMessages((current) => [...current, userMessage]);
    setInput('');

    const conversationMessages = [...messages, userMessage]
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const patternNotifications = consumeNotifications();

    // Capture state BEFORE LLM execution (deep copy)
    const beforeClips = JSON.parse(JSON.stringify(useTimelineStore.getState().clips));
    const beforeAudioLayers = JSON.parse(JSON.stringify(useAudioTimelineStore.getState().audioLayers));

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

      // After orchestrator completes (refetch awaited inside), capture AFTER state
      const afterClips = useTimelineStore.getState().clips;
      const afterAudioLayers = useAudioTimelineStore.getState().audioLayers;

      // Check if timeline changed
      const clipsChanged = JSON.stringify(beforeClips) !== JSON.stringify(afterClips);
      const audioChanged = JSON.stringify(beforeAudioLayers) !== JSON.stringify(afterAudioLayers);

      if (clipsChanged || audioChanged) {
        const batchCommand = createLLMBatchCommand({
          description: `AI: ${trimmed.slice(0, 40)}${trimmed.length > 40 ? '...' : ''}`,
          beforeClips,
          afterClips: JSON.parse(JSON.stringify(afterClips)),
          beforeAudioLayers,
          afterAudioLayers: JSON.parse(JSON.stringify(afterAudioLayers)),
        });
        useHistoryStore.getState().addWithoutExecute(batchCommand);
      }

      if (result.isPaused && result.toolOptionsPreview) {
        setPendingSelection({
          toolCall: result.toolOptionsPreview.pendingToolCall,
          pendingPlan: result.toolOptionsPreview.pendingPlan,
          originalMessage: trimmed,
          toolName: result.toolOptionsPreview.toolName,
          paramName: result.toolOptionsPreview.paramName,
          originalIntent: result.toolOptionsPreview.originalIntent,
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
      } else {
        const assistantContent = result.response || 'Unable to generate a response.';
        setMessages((current) => [
          ...current,
          {
            id: generateId(),
            role: 'assistant',
            content: assistantContent,
          },
        ]);

        // Trigger background preference analysis (fire-and-forget)
        const fullConversation = [
          ...conversationMessages,
          { role: 'assistant' as const, content: assistantContent },
        ];
        fetch('/api/preferences/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation: fullConversation }),
        }).catch((err) => console.error('Preference analysis failed:', err));
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: generateId(),
          role: 'assistant',
          content: error instanceof Error ? error.message : 'Failed to reach chat agent.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }, [
    input,
    isSending,
    messages,
    knownClipIds,
    showToolOptionsPreview,
    consumeNotifications,
  ]);

  const selectToolOption = useCallback(async (selectedValue: string) => {
    if (!pendingSelection || isSending) return;

    setIsSending(true);
    setMessages((current) => current.filter((m) => m.role !== 'tool_options'));

    const conversationMessages = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // Capture state BEFORE LLM execution (deep copy)
    const beforeClips = JSON.parse(JSON.stringify(useTimelineStore.getState().clips));
    const beforeAudioLayers = JSON.parse(JSON.stringify(useAudioTimelineStore.getState().audioLayers));

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

      // After orchestrator completes (refetch awaited inside), capture AFTER state
      const afterClips = useTimelineStore.getState().clips;
      const afterAudioLayers = useAudioTimelineStore.getState().audioLayers;

      // Check if timeline changed
      const clipsChanged = JSON.stringify(beforeClips) !== JSON.stringify(afterClips);
      const audioChanged = JSON.stringify(beforeAudioLayers) !== JSON.stringify(afterAudioLayers);

      if (clipsChanged || audioChanged) {
        const batchCommand = createLLMBatchCommand({
          description: `AI: ${pendingSelection.originalMessage.slice(0, 40)}${pendingSelection.originalMessage.length > 40 ? '...' : ''}`,
          beforeClips,
          afterClips: JSON.parse(JSON.stringify(afterClips)),
          beforeAudioLayers,
          afterAudioLayers: JSON.parse(JSON.stringify(afterAudioLayers)),
        });
        useHistoryStore.getState().addWithoutExecute(batchCommand);
      }

      const assistantContent = result.response || 'Unable to generate a response.';
      setMessages((current) => [
        ...current,
        {
          id: generateId(),
          role: 'assistant',
          content: assistantContent,
        },
      ]);

      // Trigger background preference analysis (fire-and-forget)
      const fullConversation = [
        ...conversationMessages,
        { role: 'assistant' as const, content: assistantContent },
      ];
      fetch('/api/preferences/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation: fullConversation }),
      }).catch((err) => console.error('Preference analysis failed:', err));
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
  }, [pendingSelection, isSending, messages, knownClipIds]);

  const cancelToolOptions = useCallback(() => {
    setMessages((current) => current.filter((m) => m.role !== 'tool_options'));
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
      current.map((m) => (m.id === messageId ? { ...m, feedback } : m))
    );
  }, []);

  return {
    messages,
    input,
    setInput,
    isSending,
    sendMessage,
    selectToolOption,
    cancelToolOptions,
    hasPendingSelection: pendingSelection !== null,
    markMessageFeedback,
    historyAnalysis,
    isAnalyzingHistory,
    analyzeHistory,
    handleEditTracked,
  };
}
