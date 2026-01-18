import { useEffect, useState, useCallback } from 'react';
import { useTimelineStore } from '@/stores/timelineStore';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { useHistoryStore } from '@/stores/historyStore';
import { VideoReference } from '@/types/video';
import { Transition } from '@/types/transition';
import { AudioReference, AudioLayer } from '@/types/audio';
import {
  createAddVideoCommand,
  createRemoveVideoCommand,
  createMoveVideoCommand,
  createTrimVideoCommand,
  createAddAudioCommand,
  createRemoveAudioCommand,
  createMoveAudioCommand,
  createTrimAudioCommand,
  createToggleMuteCommand,
  createToggleClipMuteCommand,
  createBatchDeleteCommand,
  createBatchPasteCommand,
} from '@/lib/commands';
import { useSelectionStore } from '@/stores/selectionStore';
import { useClipboardStore, ClipboardClip } from '@/stores/clipboardStore';

export function useTimeline() {
  const { clips, transitions, setClips, setTransitions } = useTimelineStore();
  const {
    audioLayers,
    activeLayerId,
    setAudioClips,
    setActiveLayer,
    cleanupEmptyLayers,
    getAllAudioClips,
  } = useAudioTimelineStore();
  const { execute } = useHistoryStore();
  const [isLoading, setIsLoading] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      const response = await fetch('/api/session');
      if (response.ok) {
        const data = await response.json();
        const videoData = data.session_video as VideoReference[];
        const audioData = data.session_audio as AudioReference[] | AudioLayer[];
        const transitionData = data.session_transitions as Transition[];
        setClips(videoData ?? []);
        setAudioClips(audioData ?? []);
        setTransitions(transitionData ?? []);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  }, [setClips, setAudioClips, setTransitions]);

  // Video operations wrapped with commands
  const addVideoToTimeline = useCallback(
    (video: { id: string; url: string; duration?: number }) => {
      const clipId = crypto.randomUUID();
      const command = createAddVideoCommand({ video, clipId });
      execute(command);
    },
    [execute]
  );

  const addVideoAtTimestamp = useCallback(
    (video: { id: string; url: string; duration?: number }, timestamp: number) => {
      const clipId = crypto.randomUUID();
      const command = createAddVideoCommand({ video, clipId, timestamp });
      execute(command);
    },
    [execute]
  );

  const updateVideoTimestamp = useCallback(
    (id: string, newTime: number) => {
      const command = createMoveVideoCommand({ clipId: id, newTimestamp: newTime });
      execute(command);
    },
    [execute]
  );

  const updateClipTrim = useCallback(
    (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }) => {
      const command = createTrimVideoCommand({ clipId: id, updates });
      execute(command);
    },
    [execute]
  );

  const removeClip = useCallback(
    (id: string) => {
      const command = createRemoveVideoCommand({ clipId: id });
      execute(command);
    },
    [execute]
  );

  // Audio operations wrapped with commands
  const addAudioToTimeline = useCallback(
    (audio: { id: string; url: string; duration?: number }, layerId?: string) => {
      const store = useAudioTimelineStore.getState();
      const targetLayerId = layerId ?? store.activeLayerId ?? store.audioLayers[0]?.id;
      if (!targetLayerId) return;

      const clipId = crypto.randomUUID();
      const command = createAddAudioCommand({ audio, clipId, layerId: targetLayerId });
      execute(command);
    },
    [execute]
  );

  const addAudioAtTimestamp = useCallback(
    (audio: { id: string; url: string; duration?: number }, timestamp: number, layerId?: string) => {
      const store = useAudioTimelineStore.getState();
      const targetLayerId = layerId ?? store.activeLayerId ?? store.audioLayers[0]?.id;
      if (!targetLayerId) return;

      const clipId = crypto.randomUUID();
      const command = createAddAudioCommand({ audio, clipId, layerId: targetLayerId, timestamp });
      execute(command);
    },
    [execute]
  );

  const updateAudioTimestamp = useCallback(
    (id: string, newTime: number, layerId?: string, newDepth?: number) => {
      console.log('[useTimeline] updateAudioTimestamp called', { id, newTime, layerId, newDepth });
      const store = useAudioTimelineStore.getState();
      let targetLayerId = layerId;
      if (!targetLayerId) {
        const layer = store.audioLayers.find((l) => l.clips.some((c) => c.id === id));
        targetLayerId = layer?.id;
      }
      if (!targetLayerId) {
        console.log('[useTimeline] updateAudioTimestamp - no target layer found!');
        return;
      }

      console.log('[useTimeline] creating MoveAudioCommand', { clipId: id, layerId: targetLayerId, newTimestamp: newTime, newDepth });
      const command = createMoveAudioCommand({
        clipId: id,
        layerId: targetLayerId,
        newTimestamp: newTime,
        newDepth,
      });
      console.log('[useTimeline] executing command');
      execute(command);
    },
    [execute]
  );

  const updateAudioClipTrim = useCallback(
    (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }, layerId?: string) => {
      const store = useAudioTimelineStore.getState();
      let targetLayerId = layerId;
      if (!targetLayerId) {
        const layer = store.audioLayers.find((l) => l.clips.some((c) => c.id === id));
        targetLayerId = layer?.id;
      }
      if (!targetLayerId) return;

      const command = createTrimAudioCommand({ clipId: id, layerId: targetLayerId, updates });
      execute(command);
    },
    [execute]
  );

  const removeAudioClip = useCallback(
    (id: string, layerId?: string) => {
      const store = useAudioTimelineStore.getState();
      let targetLayerId = layerId;
      if (!targetLayerId) {
        const layer = store.audioLayers.find((l) => l.clips.some((c) => c.id === id));
        targetLayerId = layer?.id;
      }
      if (!targetLayerId) return;

      const command = createRemoveAudioCommand({ clipId: id, layerId: targetLayerId });
      execute(command);
    },
    [execute]
  );

  // Layer operations - deprecated in single track mode (no-ops)
  const addLayer = useCallback(() => {
    // No-op: Single audio track mode - cannot add layers
  }, []);

  const removeLayer = useCallback((_layerId: string) => {
    // No-op: Single audio track mode - cannot remove the only layer
  }, []);

  const toggleLayerMute = useCallback(
    (layerId: string) => {
      const command = createToggleMuteCommand({ layerId });
      execute(command);
    },
    [execute]
  );

  const toggleClipMute = useCallback(
    (clipId: string, layerId?: string) => {
      const store = useAudioTimelineStore.getState();
      let targetLayerId = layerId;
      if (!targetLayerId) {
        const layer = store.audioLayers.find((l) => l.clips.some((c) => c.id === clipId));
        targetLayerId = layer?.id;
      }
      if (!targetLayerId) return;

      const command = createToggleClipMuteCommand({ clipId, layerId: targetLayerId });
      execute(command);
    },
    [execute]
  );

  const renameLayer = useCallback(
    (_layerId: string, _name: string) => {
      // No-op: Single audio track mode - track is always named "Audio"
    },
    []
  );

  // === Silent update methods - visual only, no history ===
  // These are used during drag operations to provide visual feedback
  // without creating a history entry on every mouse move

  const updateVideoTimestampSilent = useCallback((id: string, newTime: number) => {
    const store = useTimelineStore.getState();
    useTimelineStore.setState({
      clips: store.clips.map((c) =>
        c.id === id ? { ...c, timestamp: Math.max(0, newTime) } : c
      ),
    });
  }, []);

  const updateAudioTimestampSilent = useCallback((id: string, newTime: number, layerId: string, newDepth?: number) => {
    const store = useAudioTimelineStore.getState();
    useAudioTimelineStore.setState({
      audioLayers: store.audioLayers.map((l) =>
        l.id === layerId
          ? {
              ...l,
              clips: l.clips.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      timestamp: Math.max(0, newTime),
                      ...(newDepth !== undefined ? { depth: newDepth } : {}),
                    }
                  : c
              ),
            }
          : l
      ),
    });
  }, []);

  const updateClipTrimSilent = useCallback((id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }) => {
    const store = useTimelineStore.getState();
    useTimelineStore.setState({
      clips: store.clips.map((c) =>
        c.id === id
          ? {
              ...c,
              trimStart: updates.trimStart ?? c.trimStart,
              trimEnd: updates.trimEnd ?? c.trimEnd,
              timestamp: updates.timestamp ?? c.timestamp,
            }
          : c
      ),
    });
  }, []);

  const updateAudioClipTrimSilent = useCallback((id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }, layerId: string) => {
    const store = useAudioTimelineStore.getState();
    useAudioTimelineStore.setState({
      audioLayers: store.audioLayers.map((l) =>
        l.id === layerId
          ? {
              ...l,
              clips: l.clips.map((c) =>
                c.id === id
                  ? {
                      ...c,
                      trimStart: updates.trimStart ?? c.trimStart,
                      trimEnd: updates.trimEnd ?? c.trimEnd,
                      timestamp: updates.timestamp ?? c.timestamp,
                    }
                  : c
              ),
            }
          : l
      ),
    });
  }, []);

  // === Commit methods - create single history entry with explicit initial/final state ===
  // These are called on mouseup to create a single undo entry for the entire drag operation

  const commitVideoMove = useCallback((id: string, initialTimestamp: number, finalTimestamp: number) => {
    if (initialTimestamp === finalTimestamp) return;
    const command = createMoveVideoCommand({ clipId: id, newTimestamp: finalTimestamp, originalTimestamp: initialTimestamp });
    execute(command);
  }, [execute]);

  const commitAudioMove = useCallback((id: string, layerId: string, initialTimestamp: number, finalTimestamp: number, initialDepth?: number, finalDepth?: number) => {
    if (initialTimestamp === finalTimestamp && initialDepth === finalDepth) return;
    const command = createMoveAudioCommand({
      clipId: id,
      layerId,
      newTimestamp: finalTimestamp,
      newDepth: finalDepth,
      originalTimestamp: initialTimestamp,
      originalDepth: initialDepth,
    });
    execute(command);
  }, [execute]);

  const commitVideoTrim = useCallback((
    id: string,
    initialState: { trimStart: number; trimEnd: number; timestamp: number },
    finalState: { trimStart?: number; trimEnd?: number; timestamp?: number }
  ) => {
    // Check if anything actually changed
    const trimStartChanged = finalState.trimStart !== undefined && finalState.trimStart !== initialState.trimStart;
    const trimEndChanged = finalState.trimEnd !== undefined && finalState.trimEnd !== initialState.trimEnd;
    const timestampChanged = finalState.timestamp !== undefined && finalState.timestamp !== initialState.timestamp;
    if (!trimStartChanged && !trimEndChanged && !timestampChanged) return;

    const command = createTrimVideoCommand({ clipId: id, updates: finalState, originalValues: initialState });
    execute(command);
  }, [execute]);

  const commitAudioTrim = useCallback((
    id: string,
    layerId: string,
    initialState: { trimStart: number; trimEnd: number; timestamp: number },
    finalState: { trimStart?: number; trimEnd?: number; timestamp?: number }
  ) => {
    // Check if anything actually changed
    const trimStartChanged = finalState.trimStart !== undefined && finalState.trimStart !== initialState.trimStart;
    const trimEndChanged = finalState.trimEnd !== undefined && finalState.trimEnd !== initialState.trimEnd;
    const timestampChanged = finalState.timestamp !== undefined && finalState.timestamp !== initialState.timestamp;
    if (!trimStartChanged && !trimEndChanged && !timestampChanged) return;

    const command = createTrimAudioCommand({ clipId: id, layerId, updates: finalState, originalValues: initialState });
    execute(command);
  }, [execute]);

  // Batch delete selected clips
  const batchDeleteSelected = useCallback(() => {
    const { selectedClips, clearSelection } = useSelectionStore.getState();
    if (selectedClips.length === 0) return;

    const videoClipIds = selectedClips
      .filter((c) => c.type === 'video')
      .map((c) => c.id);

    const audioClips = selectedClips
      .filter((c) => c.type === 'audio')
      .map((c) => ({ id: c.id, layerId: c.layerId! }));

    try {
      const command = createBatchDeleteCommand({ videoClipIds, audioClips });
      execute(command);
      clearSelection();
    } catch (error) {
      console.warn('Batch delete failed:', error);
    }
  }, [execute]);

  // Copy selected clips to clipboard
  const copySelectedToClipboard = useCallback(() => {
    const { selectedClips } = useSelectionStore.getState();
    if (selectedClips.length === 0) return;

    const videoStore = useTimelineStore.getState();
    const audioStore = useAudioTimelineStore.getState();

    // Find minimum timestamp to calculate relative offsets
    let minTimestamp = Infinity;

    for (const selected of selectedClips) {
      if (selected.type === 'video') {
        const clip = videoStore.clips.find((c) => c.id === selected.id);
        if (clip && clip.timestamp < minTimestamp) {
          minTimestamp = clip.timestamp;
        }
      } else if (selected.type === 'audio') {
        const layer = audioStore.audioLayers.find((l) => l.id === selected.layerId);
        const clip = layer?.clips.find((c) => c.id === selected.id);
        if (clip && clip.timestamp < minTimestamp) {
          minTimestamp = clip.timestamp;
        }
      }
    }

    if (minTimestamp === Infinity) return;

    // Build clipboard clips with relative offsets
    const clipboardClips: ClipboardClip[] = [];

    for (const selected of selectedClips) {
      if (selected.type === 'video') {
        const clip = videoStore.clips.find((c) => c.id === selected.id);
        if (clip) {
          clipboardClips.push({
            type: 'video',
            url: clip.url,
            duration: clip.duration,
            trimStart: clip.trimStart,
            trimEnd: clip.trimEnd,
            relativeOffset: clip.timestamp - minTimestamp,
            sourceId: clip.videoId,
          });
        }
      } else if (selected.type === 'audio') {
        const layer = audioStore.audioLayers.find((l) => l.id === selected.layerId);
        const clip = layer?.clips.find((c) => c.id === selected.id);
        if (clip) {
          clipboardClips.push({
            type: 'audio',
            url: clip.url,
            duration: clip.duration,
            trimStart: clip.trimStart,
            trimEnd: clip.trimEnd,
            relativeOffset: clip.timestamp - minTimestamp,
            layerId: selected.layerId,
            sourceId: clip.audioId,
          });
        }
      }
    }

    if (clipboardClips.length > 0) {
      useClipboardStore.getState().copy(clipboardClips);
    }
  }, []);

  // Paste from clipboard at playhead position
  const pasteFromClipboard = useCallback(
    (playheadPosition: number) => {
      const { hasContent } = useClipboardStore.getState();
      if (!hasContent()) return;

      try {
        const command = createBatchPasteCommand({ playheadPosition });
        execute(command);
      } catch (error) {
        console.warn('Paste failed:', error);
      }
    },
    [execute]
  );

  useEffect(() => {
    loadSession().finally(() => setIsLoading(false));
  }, [loadSession]);

  // Refetch timeline from server (useful after server-side modifications)
  const refetch = useCallback(async () => {
    await loadSession();
  }, [loadSession]);

  return {
    clips,
    transitions,
    isLoading,
    addVideoToTimeline,
    addVideoAtTimestamp,
    updateVideoTimestamp,
    updateClipTrim,
    removeClip,
    // Audio handlers
    audioLayers,
    activeLayerId,
    addAudioToTimeline,
    addAudioAtTimestamp,
    updateAudioTimestamp,
    updateAudioClipTrim,
    removeAudioClip,
    toggleClipMute,
    // Layer management
    addLayer,
    removeLayer,
    setActiveLayer,
    toggleLayerMute,
    renameLayer,
    cleanupEmptyLayers,
    // Helper
    getAllAudioClips,
    // Batch operations
    batchDeleteSelected,
    copySelectedToClipboard,
    pasteFromClipboard,
    // Refetch
    refetch,
    // Silent update methods (no history - visual only during drag)
    updateVideoTimestampSilent,
    updateAudioTimestampSilent,
    updateClipTrimSilent,
    updateAudioClipTrimSilent,
    // Commit methods (single history entry for entire drag operation)
    commitVideoMove,
    commitAudioMove,
    commitVideoTrim,
    commitAudioTrim,
  };
}
