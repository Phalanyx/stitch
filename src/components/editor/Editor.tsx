'use client';

import { Sidebar } from './Sidebar';
import { Preview } from './Preview';
import { Timeline } from './Timeline';
import { useTimeline } from '@/hooks/useTimeline';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { useAutoSave } from '@/hooks/useAutoSave';
import { Loader2 } from 'lucide-react';

export function Editor() {
  const { clips, isLoading, addVideoToTimeline, addVideoAtTimestamp, updateVideoTimestamp, updateClipTrim, removeClip } =
    useTimeline();
  const { audioClips, addAudioToTimeline, addAudioAtTimestamp, updateAudioTimestamp, updateAudioClipTrim, removeAudioClip } =
    useAudioTimelineStore();

  // Combined handler that adds both video and audio clips when a video is added
  const handleAddVideoWithAudio = (video: { id: string; url: string; duration?: number }) => {
    addVideoToTimeline(video);
    // Add corresponding audio clip from the same video file
    addAudioToTimeline({
      id: video.id,
      url: video.url,
      duration: video.duration,
    });
  };

  // Drop handlers for drag and drop onto timeline
  const handleDropVideo = (video: { id: string; url: string; duration?: number; timestamp: number }) => {
    addVideoAtTimestamp(video, video.timestamp);
    // Also add audio at the same timestamp
    addAudioAtTimestamp({
      id: video.id,
      url: video.url,
      duration: video.duration,
    }, video.timestamp);
  };

  const handleDropAudio = (audio: { id: string; url: string; duration?: number; timestamp: number }) => {
    addAudioAtTimestamp(audio, audio.timestamp);
  };

  // Enable auto-save
  useAutoSave();

  if (isLoading) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          onAddToTimeline={handleAddVideoWithAudio}
          onAddAudioToTimeline={addAudioToTimeline}
        />
        <Preview clips={clips} audioClips={audioClips} />
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
      />
    </div>
  );
}
