'use client';

import { useRef, useState, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { Preview } from './Preview';
import { Timeline } from './Timeline';
import { useTimeline } from '@/hooks/useTimeline';
import { useAutoSave } from '@/hooks/useAutoSave';
import { Loader2 } from 'lucide-react';

export function Editor() {
  const { clips, isLoading, addVideoToTimeline, updateVideoTimestamp, removeClip } =
    useTimeline();

  // Enable auto-save
  useAutoSave();

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

    // Only sync video if within a valid range
    if (videoRef.current) {
      const videoDuration = videoRef.current.duration || 0;
      if (time <= videoDuration) {
        videoRef.current.currentTime = time;
      }
    }

    // Reset seeking flag after a short delay to allow video timeupdate to be ignored
    setTimeout(() => {
      isSeekingRef.current = false;
    }, 100);
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    // Don't override manual seeks with video's clamped time
    if (isSeekingRef.current) return;
    setCurrentTime(time);
  }, []);

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
        <Sidebar onAddToTimeline={addVideoToTimeline} />
        <Preview
          clips={clips}
          videoRef={videoRef}
          isPlaying={isPlaying}
          setIsPlaying={setIsPlaying}
          currentTime={currentTime}
          onTimeUpdate={handleTimeUpdate}
        />
      </div>
      <Timeline
        clips={clips}
        onUpdateTimestamp={updateVideoTimestamp}
        onRemove={removeClip}
        currentTime={currentTime}
        onSeek={handleSeek}
      />
    </div>
  );
}
