'use client';

import { useRef, useState, useEffect } from 'react';

interface VideoScrubberProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isPlaying: boolean;
  totalDuration?: number;
  currentTimelineTime?: number;
  onSeek?: (time: number) => void;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) {
    return '0:00';
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function VideoScrubber({
  videoRef,
  isPlaying,
  totalDuration: externalDuration,
  currentTimelineTime: externalTime,
  onSeek,
}: VideoScrubberProps) {
  const scrubberRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Use external timeline values if provided, otherwise fall back to video element
  const useTimeline = externalDuration !== undefined && externalTime !== undefined;
  const displayTime = useTimeline ? externalTime : currentTime;
  const displayDuration = useTimeline ? externalDuration : duration;

  // Handle metadata loaded to get duration (for non-timeline mode)
  useEffect(() => {
    if (useTimeline) return; // Skip if using timeline mode

    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      const dur = video.duration;
      if (isFinite(dur) && !isNaN(dur)) {
        setDuration(dur);
      }
    };

    const handleTimeUpdate = () => {
      if (!isDragging) {
        setCurrentTime(video.currentTime);
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);

    // Set duration if already loaded
    if (video.readyState >= 1) {
      handleLoadedMetadata();
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [videoRef, isDragging, useTimeline]);

  // Use RAF for smooth updates during playback (non-timeline mode)
  useEffect(() => {
    if (useTimeline) return; // Skip if using timeline mode

    const video = videoRef.current;
    if (!video || !isPlaying || isDragging) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const updateTime = () => {
      setCurrentTime(video.currentTime);
      rafRef.current = requestAnimationFrame(updateTime);
    };

    rafRef.current = requestAnimationFrame(updateTime);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [videoRef, isPlaying, isDragging, useTimeline]);

  // Reset when video source changes (non-timeline mode)
  useEffect(() => {
    if (useTimeline) return; // Skip if using timeline mode

    const video = videoRef.current;
    if (!video) return;

    const handleSourceChange = () => {
      setCurrentTime(0);
      setDuration(0);
    };

    video.addEventListener('loadstart', handleSourceChange);

    return () => {
      video.removeEventListener('loadstart', handleSourceChange);
    };
  }, [videoRef, useTimeline]);

  const seekToPosition = (clientX: number) => {
    const scrubber = scrubberRef.current;
    if (!scrubber || displayDuration === 0) return;

    const rect = scrubber.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = percentage * displayDuration;

    if (useTimeline && onSeek) {
      // Timeline mode: use callback
      onSeek(newTime);
    } else {
      // Video mode: seek video directly
      const video = videoRef.current;
      if (video) {
        video.currentTime = newTime;
        setCurrentTime(newTime);
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (displayDuration === 0) return;

    e.preventDefault();
    setIsDragging(true);
    seekToPosition(e.clientX);

    const handleMouseMove = (e: MouseEvent) => {
      seekToPosition(e.clientX);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!isDragging) {
      seekToPosition(e.clientX);
    }
  };

  const progress = displayDuration > 0 ? (displayTime / displayDuration) * 100 : 0;

  return (
    <div className="w-full max-w-2xl px-8">
      <div className="flex items-center gap-3">
        <span className="text-white text-sm font-mono min-w-[40px]">
          {formatTime(displayTime)}
        </span>

        <div className="flex-1 relative">
          <div
            ref={scrubberRef}
            className={`h-2 bg-gray-700 rounded-full relative ${
              isDragging ? 'cursor-grabbing' : 'cursor-pointer'
            }`}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
          >
            {/* Progress fill */}
            <div
              className="absolute top-0 left-0 h-full bg-slate-500 rounded-full transition-none"
              style={{ width: `${progress}%` }}
            />

            {/* Playhead */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-slate-500 rounded-full border-2 border-white shadow-lg"
              style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
            />
          </div>
        </div>

        <span className="text-gray-400 text-sm font-mono min-w-[40px]">
          {formatTime(displayDuration)}
        </span>
      </div>
    </div>
  );
}
