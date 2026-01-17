'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Preview } from './Preview';
import { ChatAgent } from './ChatAgent';
import { Timeline } from './Timeline';
import { useTimeline } from '@/hooks/useTimeline';
import { useAutoSave } from '@/hooks/useAutoSave';
import { useBehaviorAgent } from '@/hooks/useBehaviorAgent';
import { Loader2 } from 'lucide-react';

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
        <ChatAgent clips={clips} audioClips={audioClips} />
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
    </div>
  );
}
