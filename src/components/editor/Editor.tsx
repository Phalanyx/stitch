'use client';

import { useRef, useState, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { Preview } from './Preview';
import { Timeline } from './Timeline';
import { useTimeline } from '@/hooks/useTimeline';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useVideoExport } from '@/hooks/useVideoExport';
import { ExportProgressModal } from '@/components/ui/ExportProgressModal';
import { Loader2, Download } from 'lucide-react';

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
    audioClips,
    addAudioToTimeline,
    addAudioAtTimestamp,
    updateAudioTimestamp,
    updateAudioClipTrim,
    removeAudioClip,
  } = useTimeline();

  // Enable auto-save
  useAutoSave();

  // Video export
  const { exportToFile, isExporting, progress, error, reset } = useVideoExport();

  // Playback state lifted from Preview
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const isSeekingRef = useRef(false);

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
    setTimeout(() => {
      isSeekingRef.current = false;
    }, 100);
  }, [clips]);

  const handleTimeUpdate = useCallback((time: number) => {
    // Don't override manual seeks with video's clamped time
    if (isSeekingRef.current) return;
    setCurrentTime(time);
  }, []);

  // Combined handler to add video and its audio track together
  const handleAddVideoWithAudio = useCallback(async (video: { id: string; url: string; duration?: number }) => {
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
    // Also add the video's audio to the audio track
    addAudioToTimeline(videoWithDuration);
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
    // Also add the video's audio at the same timestamp
    addAudioAtTimestamp(videoWithDuration, video.timestamp);
  }, [addVideoAtTimestamp, addAudioAtTimestamp]);

  const handleDropAudio = useCallback(async (audio: { id: string; url: string; duration?: number; timestamp: number }) => {
    let duration = audio.duration;
    // Extract duration if not provided
    if (!duration) {
      try {
        duration = await getAudioDuration(audio.url);
      } catch (error) {
        console.error('Failed to extract audio duration:', error);
      }
    }
    addAudioAtTimestamp({ ...audio, duration }, audio.timestamp);
  }, [addAudioAtTimestamp]);

  const handleExport = useCallback(async () => {
    if (clips.length === 0) {
      alert('No clips to export. Please add at least one video clip to the timeline.');
      return;
    }

    try {
      await exportToFile(clips, audioClips);
    } catch (err) {
      console.error('Export failed:', err);
      // Error is already handled by the hook and shown in the modal
    }
  }, [clips, audioClips, exportToFile]);

  const handleCloseExportModal = useCallback(() => {
    reset();
  }, [reset]);

  if (isLoading) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Export Button */}
      <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700 px-4 py-2 flex justify-end">
        <button
          onClick={handleExport}
          disabled={isExporting || clips.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          title={clips.length === 0 ? 'Add clips to timeline to export' : 'Export video'}
        >
          <Download className="w-4 h-4" />
          <span>{isExporting ? 'Exporting...' : 'Export Video'}</span>
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <Sidebar onAddToTimeline={handleAddVideoWithAudio} onAddAudioToTimeline={addAudioToTimeline} />
        <Preview
          clips={clips}
          audioClips={audioClips}
          videoRef={videoRef}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          currentTime={currentTime}
          onTimeUpdate={handleTimeUpdate}
          onSeek={handleSeek}
          onDropVideo={handleAddVideoWithAudio}
          isSeekingRef={isSeekingRef}
        />
      </div>
      <Timeline
        clips={clips}
        audioClips={audioClips}
        onUpdateTimestamp={updateVideoTimestamp}
        onUpdateTrim={updateClipTrim}
        onRemove={removeClip}
        onUpdateAudioTimestamp={updateAudioTimestamp}
        onUpdateAudioTrim={updateAudioClipTrim}
        onRemoveAudio={removeAudioClip}
        onDropVideo={handleDropVideo}
        onDropAudio={handleDropAudio}
        currentTime={currentTime}
        onSeek={handleSeek}
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
