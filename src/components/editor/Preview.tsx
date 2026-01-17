'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
import { Play, Pause } from 'lucide-react';
import { VideoReference } from '@/types/video';
import { VideoScrubber } from './VideoScrubber';

interface PreviewProps {
  clips: VideoReference[];
}

type TimelineSegment =
  | { type: 'clip'; clip: VideoReference; start: number; duration: number }
  | { type: 'gap'; start: number; duration: number };

export function Preview({ clips }: PreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineTime, setTimelineTime] = useState(0);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);

  // Build timeline structure with clips and gaps
  const timeline = useMemo(() => {
    const sortedClips = [...clips].sort((a, b) => a.timestamp - b.timestamp);
    const segments: TimelineSegment[] = [];
    let currentTime = 0;

    sortedClips.forEach(clip => {
      // Add gap if there's space before this clip
      if (clip.timestamp > currentTime) {
        segments.push({
          type: 'gap',
          start: currentTime,
          duration: clip.timestamp - currentTime,
        });
        currentTime = clip.timestamp;
      }

      // Add clip
      segments.push({
        type: 'clip',
        clip,
        start: clip.timestamp,
        duration: clip.duration,
      });

      currentTime = clip.timestamp + clip.duration;
    });

    const totalDuration = segments.length > 0
      ? segments[segments.length - 1].start + segments[segments.length - 1].duration
      : 0;

    return { segments, totalDuration };
  }, [clips]);

  const currentSegment = timeline.segments[currentSegmentIndex];

  // Find which segment contains the given timeline time
  const findSegmentAtTime = (time: number): number => {
    for (let i = 0; i < timeline.segments.length; i++) {
      const segment = timeline.segments[i];
      if (time >= segment.start && time < segment.start + segment.duration) {
        return i;
      }
    }
    return timeline.segments.length - 1;
  };

  // Handle timeline playback with RAF
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    let startTime = performance.now();
    let accumulatedTime = timelineTime;

    const updatePlayback = (currentTime: number) => {
      const deltaTime = (currentTime - startTime) / 1000; // Convert to seconds
      const newTimelineTime = accumulatedTime + deltaTime;

      if (newTimelineTime >= timeline.totalDuration) {
        // End of timeline
        setTimelineTime(0);
        setCurrentSegmentIndex(0);
        setIsPlaying(false);
        return;
      }

      setTimelineTime(newTimelineTime);

      // Update segment index if needed
      const segmentIndex = findSegmentAtTime(newTimelineTime);
      if (segmentIndex !== currentSegmentIndex) {
        setCurrentSegmentIndex(segmentIndex);
      }

      rafRef.current = requestAnimationFrame(updatePlayback);
    };

    rafRef.current = requestAnimationFrame(updatePlayback);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, timelineTime, currentSegmentIndex, timeline.totalDuration]);

  // Sync video element with current segment
  useEffect(() => {
    if (!currentSegment || currentSegment.type !== 'clip') return;

    const video = videoRef.current;
    if (!video) return;

    const clipStartInTimeline = currentSegment.start;
    const relativeTime = timelineTime - clipStartInTimeline;

    // Update video current time to match timeline position
    if (Math.abs(video.currentTime - relativeTime) > 0.1) {
      video.currentTime = Math.max(0, Math.min(relativeTime, currentSegment.duration));
    }

    // Play or pause video based on playing state
    if (isPlaying && video.paused) {
      video.play().catch(err => console.error('Failed to play video:', err));
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }
  }, [currentSegment, timelineTime, isPlaying]);

  // Reset when clips change
  useEffect(() => {
    setTimelineTime(0);
    setCurrentSegmentIndex(0);
    setIsPlaying(false);
  }, [clips]);

  const handlePlayPause = () => {
    if (timeline.segments.length === 0) return;
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (time: number) => {
    const clampedTime = Math.max(0, Math.min(time, timeline.totalDuration));
    setTimelineTime(clampedTime);

    const segmentIndex = findSegmentAtTime(clampedTime);
    setCurrentSegmentIndex(segmentIndex);
  };

  return (
    <div className="flex-1 bg-black flex flex-col items-center justify-center">
      {timeline.segments.length === 0 ? (
        <div className="text-gray-500">No clips in timeline</div>
      ) : currentSegment?.type === 'gap' ? (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-gray-500 text-lg">Gap</div>
        </div>
      ) : currentSegment?.type === 'clip' ? (
        <video
          ref={videoRef}
          src={currentSegment.clip.url}
          className="max-h-full max-w-full"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      ) : null}

      {timeline.segments.length > 0 && (
        <div className="mt-4 w-full flex justify-center">
          <VideoScrubber
            videoRef={videoRef}
            isPlaying={isPlaying}
            totalDuration={timeline.totalDuration}
            currentTimelineTime={timelineTime}
            onSeek={handleSeek}
          />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={handlePlayPause}
          disabled={timeline.segments.length === 0}
          className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 text-white" />
          ) : (
            <Play className="w-6 h-6 text-white" />
          )}
        </button>
      </div>
    </div>
  );
}
