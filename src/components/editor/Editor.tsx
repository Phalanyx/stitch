'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Preview } from './Preview';
import { ChatAgent } from './ChatAgent';
import { Timeline } from './Timeline';
import { useTimeline } from '@/hooks/useTimeline';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useBehaviorAgent } from '@/hooks/useBehaviorAgent';
import { useVideoExport } from '@/hooks/useVideoExport';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { ExportProgressModal } from '@/components/ui/ExportProgressModal';
import { Loader2, Download, Undo2, Redo2 } from 'lucide-react';

import { AudioMetadata } from '@/types/audio';

// Helper to extract video duration from URL
const getVideoDuration = (url: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = video.duration;
      if (isFinite(duration) && !isNaN(duration)) {
        resolve(duration);
      } else {
        reject(new Error('Invalid duration'));
      }
    };
    video.onerror = () => reject(new Error('Failed to load video metadata'));
    video.src = url;
  });
};

// Helper to extract audio duration from URL
const getAudioDuration = (url: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      if (isFinite(duration) && !isNaN(duration)) {
        resolve(duration);
      } else {
        reject(new Error('Invalid duration'));
      }
    };
    audio.onerror = () => reject(new Error('Failed to load audio metadata'));
    audio.src = url;
  });
};

export function Editor() {
  const {
    clips,
    isLoading,
    addVideoToTimeline,
    addVideoAtTimestamp,
    updateVideoTimestamp,
    updateClipTrim,
    removeClip,
    // Audio handlers
    audioLayers,
    addAudioToTimeline,
    addAudioAtTimestamp,
    updateAudioTimestamp,
    updateAudioClipTrim,
    removeAudioClip,
    toggleClipMute,
    // Layer management (single track mode - only mute toggle needed)
    toggleLayerMute,
    // Batch operations
    batchDeleteSelected,
    copySelectedToClipboard,
    pasteFromClipboard,
    // Refetch for server-side timeline modifications
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
  } = useTimeline();

  // Enable auto-save
  useAutoSave();

  // Playback state lifted from Preview (moved up so we can use currentTimeRef)
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const isSeekingRef = useRef(false);
  const currentTimeRef = useRef(currentTime);
  
  // Update ref in effect to avoid side effects during render
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // Paste handler that uses current playhead position
  const handlePaste = useCallback(() => {
    pasteFromClipboard(currentTimeRef.current);
  }, [pasteFromClipboard]);

  // Undo/Redo with keyboard shortcuts for copy/paste/delete
  const { undo, redo, canUndo, canRedo } = useUndoRedo({
    onBatchDelete: batchDeleteSelected,
    onCopy: copySelectedToClipboard,
    onPaste: handlePaste,
  });

  // Video export
  const { exportToFile, isExporting, progress, error, reset } = useVideoExport();

  // State for audio created by the chat agent
  const [agentCreatedAudio, setAgentCreatedAudio] = useState<AudioMetadata | null>(null);

  const handleAudioCreated = useCallback((audio: AudioMetadata) => {
    setAgentCreatedAudio(audio);
  }, []);

  const handleNewAudioHandled = useCallback(() => {
    setAgentCreatedAudio(null);
  }, []);

  const handleSeek = useCallback((time: number) => {
    // Always update the timeline state first
    setCurrentTime(time);

    // Mark that we're seeking to prevent video timeupdate from overriding
    isSeekingRef.current = true;

    // Find the active clip for this time
    const sortedClips = [...clips].sort((a, b) => a.timestamp - b.timestamp);
    const activeClip = sortedClips.find(clip => {
      const clipStart = clip.timestamp;
      const visibleDuration = clip.duration - (clip.trimStart || 0) - (clip.trimEnd || 0);
      const clipEnd = clipStart + visibleDuration;
      return time >= clipStart && time < clipEnd;
    });

    if (videoRef.current && activeClip) {
      // Convert global timeline time to clip-relative video time
      // The video file position = trimStart + (time offset within visible clip)
      const clipRelativeTime = time - activeClip.timestamp + (activeClip.trimStart || 0);
      videoRef.current.currentTime = clipRelativeTime;
    }

    // Reset seeking flag after a short delay to allow video timeupdate to be ignored
    // Note: This timeout should match isTransitioningRef timeout in Preview.tsx (150ms)
    setTimeout(() => {
      isSeekingRef.current = false;
    }, 150);
  }, [clips]);

  const handleTimeUpdate = useCallback((time: number) => {
    // Don't override manual seeks with video's clamped time
    if (isSeekingRef.current) return;
    setCurrentTime(time);
  }, []);

  // Combined handler to add video and its linked audio track together
  const handleAddVideoWithAudio = useCallback(async (video: { id: string; url: string; duration?: number; audio?: { id: string; url: string; duration: number | null } }) => {
    let duration = video.duration;
    // Extract duration if not provided
    if (!duration) {
      try {
        duration = await getVideoDuration(video.url);
      } catch (error) {
        console.error('Failed to extract video duration:', error);
      }
    }
    const videoWithDuration = { ...video, duration };
    addVideoToTimeline(videoWithDuration);
    // Add linked audio if available
    if (video.audio) {
      let audioDuration = video.audio.duration ?? undefined;
      if (!audioDuration) {
        try {
          audioDuration = await getAudioDuration(video.audio.url);
        } catch (error) {
          console.error('Failed to extract audio duration:', error);
        }
      }
      addAudioToTimeline({
        id: video.audio.id,
        url: video.audio.url,
        duration: audioDuration,
      });
    }
  }, [addVideoToTimeline, addAudioToTimeline]);

  // Drop handlers for Timeline
  const handleDropVideo = useCallback(async (video: { id: string; url: string; duration?: number; timestamp: number }) => {
    let duration = video.duration;
    // Extract duration if not provided
    if (!duration) {
      try {
        duration = await getVideoDuration(video.url);
      } catch (error) {
        console.error('Failed to extract video duration:', error);
      }
    }
    const videoWithDuration = { ...video, duration };
    addVideoAtTimestamp(videoWithDuration, video.timestamp);
    // Note: Linked audio is added by Timeline.tsx via onDropAudio callback
  }, [addVideoAtTimestamp]);

  const handleDropAudio = useCallback(async (audio: { id: string; url: string; duration?: number; timestamp: number }, layerId: string) => {
    let duration = audio.duration;
    // Extract duration if not provided
    if (!duration) {
      try {
        duration = await getAudioDuration(audio.url);
      } catch (error) {
        console.error('Failed to extract audio duration:', error);
      }
    }
    addAudioAtTimestamp({ ...audio, duration }, audio.timestamp, layerId);
  }, [addAudioAtTimestamp]);

  const handleExport = useCallback(async () => {
    if (clips.length === 0) {
      alert('No clips to export. Please add at least one video clip to the timeline.');
      return;
    }

    // Derive audioClips from audioLayers
    const audioClips = audioLayers.flatMap(layer => layer.clips);

    try {
      await exportToFile(clips, audioClips);
    } catch (err) {
      console.error('Export failed:', err);
      // Error is already handled by the hook and shown in the modal
    }
  }, [clips, audioLayers, exportToFile]);

  const handleCloseExportModal = useCallback(() => {
    reset();
  }, [reset]);

  // Derive audioClips from audioLayers for ChatAgent/agents
  const audioClips = audioLayers.flatMap((layer) => layer.clips);
  const { runAgent } = useBehaviorAgent(clips, audioClips);
  const lastSentCount = useRef<number | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (lastSentCount.current === clips.length) return;
    lastSentCount.current = clips.length;

    const now = Date.now();
    // Behavioral agent test only; not used for production outputs.
    const events = [
      { type: 'editor_opened', ts: now - 1000 },
      ...clips.map((clip, index) => ({
        type: 'clip_added',
        ts: now - 900 + index * 50,
        props: { id: clip.id },
      })),
    ];

    runAgent(events)
      .then((data) => {
        console.log('Agent output', data);
      })
      .catch((error) => {
        console.error('Agent test failed', error);
      });
  }, [clips, isLoading, runAgent]);

  if (isLoading) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Toolbar */}
      <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700 px-4 py-2 flex justify-between items-center">
        {/* Undo/Redo Buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 disabled:text-gray-600 disabled:hover:bg-transparent disabled:cursor-not-allowed rounded transition-colors"
            title="Undo (Cmd+Z)"
          >
            <Undo2 className="w-5 h-5" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-2 text-gray-300 hover:text-white hover:bg-gray-700 disabled:text-gray-600 disabled:hover:bg-transparent disabled:cursor-not-allowed rounded transition-colors"
            title="Redo (Cmd+Shift+Z)"
          >
            <Redo2 className="w-5 h-5" />
          </button>
        </div>

        {/* Export Button */}
        <button
          onClick={handleExport}
          disabled={isExporting || clips.length === 0}
          className="flex items-center gap-2 px-3 h-7 bg-slate-600 hover:bg-slate-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm transition-colors"
          title={clips.length === 0 ? 'Add clips to timeline to export' : 'Export video'}
        >
          <Download className="w-3.5 h-3.5" />
          <span>{isExporting ? 'Exporting...' : 'Export'}</span>
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          onAddToTimeline={handleAddVideoWithAudio}
          onAddAudioToTimeline={addAudioToTimeline}
          newAudio={agentCreatedAudio}
          onNewAudioHandled={handleNewAudioHandled}
        />
        <Preview
          clips={clips}
          audioLayers={audioLayers}
          videoRef={videoRef}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          currentTime={currentTime}
          onTimeUpdate={handleTimeUpdate}
          onSeek={handleSeek}
          onDropVideo={handleAddVideoWithAudio}
          isSeekingRef={isSeekingRef}
        />
        <ChatAgent
          clips={clips}
          audioClips={audioClips}
          onAudioCreated={handleAudioCreated}
          onTimelineChanged={refetch}
        />
      </div>
      <Timeline
        clips={clips}
        audioLayers={audioLayers}
        onUpdateTimestamp={updateVideoTimestamp}
        onUpdateTrim={updateClipTrim}
        onRemove={removeClip}
        onUpdateAudioTimestamp={updateAudioTimestamp}
        onUpdateAudioTrim={updateAudioClipTrim}
        onRemoveAudio={removeAudioClip}
        onToggleClipMute={toggleClipMute}
        onDropVideo={handleDropVideo}
        onDropAudio={handleDropAudio}
        onToggleLayerMute={toggleLayerMute}
        currentTime={currentTime}
        onSeek={handleSeek}
        onUpdateTimestampSilent={updateVideoTimestampSilent}
        onUpdateTrimSilent={updateClipTrimSilent}
        onUpdateAudioTimestampSilent={updateAudioTimestampSilent}
        onUpdateAudioTrimSilent={updateAudioClipTrimSilent}
        onCommitVideoMove={commitVideoMove}
        onCommitAudioMove={commitAudioMove}
        onCommitVideoTrim={commitVideoTrim}
        onCommitAudioTrim={commitAudioTrim}
      />

      {/* Export Progress Modal */}
      <ExportProgressModal
        progress={progress}
        isOpen={isExporting || (progress !== null && (progress.stage === 'complete' || progress.stage === 'error'))}
        onClose={handleCloseExportModal}
      />
    </div>
  );
}
