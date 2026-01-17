'use client';

import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import { VideoReference } from '@/types/video';
import { AudioReference } from '@/types/audio';
import { VideoScrubber } from './VideoScrubber';

interface PreviewProps {
  clips: VideoReference[];
  audioClips: AudioReference[];
}

type TimelineSegment =
  | { type: 'clip'; clip: VideoReference; start: number; duration: number }
  | { type: 'gap'; start: number; duration: number };

export function Preview({ clips, audioClips }: PreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
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

    const videoTotalDuration = segments.length > 0
      ? segments[segments.length - 1].start + segments[segments.length - 1].duration
      : 0;

    // Consider audio clips for total duration
    const audioMaxEndTime = audioClips.reduce((max, clip) => {
      const endTime = clip.timestamp + clip.duration;
      return endTime > max ? endTime : max;
    }, 0);

    const totalDuration = Math.max(videoTotalDuration, audioMaxEndTime);

    return { segments, totalDuration };
  }, [clips, audioClips]);

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

  // Create/cleanup audio elements when audioClips change
  useEffect(() => {
    const audioMap = audioElementsRef.current;

    // Create audio elements for new clips
    audioClips.forEach((clip) => {
      if (!audioMap.has(clip.id)) {
        const audio = document.createElement('audio');
        audio.src = clip.url;
        audio.preload = 'auto';
        audioMap.set(clip.id, audio);
      }
    });

    // Remove audio elements for removed clips
    const currentClipIds = new Set(audioClips.map((c) => c.id));
    audioMap.forEach((audio, id) => {
      if (!currentClipIds.has(id)) {
        audio.pause();
        audio.src = '';
        audioMap.delete(id);
      }
    });

    // Cleanup on unmount
    return () => {
      audioMap.forEach((audio) => {
        audio.pause();
        audio.src = '';
      });
      audioMap.clear();
    };
  }, [audioClips]);

  // Sync audio elements with timeline time
  const syncAudio = useCallback((time: number, playing: boolean) => {
    const audioMap = audioElementsRef.current;

    audioClips.forEach((clip) => {
      const audio = audioMap.get(clip.id);
      if (!audio) return;

      const clipEnd = clip.timestamp + clip.duration;
      const isInRange = time >= clip.timestamp && time < clipEnd;

      if (isInRange) {
        const relativeTime = time - clip.timestamp;

        // Sync time if significantly out of sync
        if (Math.abs(audio.currentTime - relativeTime) > 0.1) {
          audio.currentTime = Math.max(0, relativeTime);
        }

        // Play or pause based on playing state
        if (playing && audio.paused) {
          audio.play().catch((err) => console.error('Failed to play audio:', err));
        } else if (!playing && !audio.paused) {
          audio.pause();
        }
      } else {
        // Pause audio that's not in range
        if (!audio.paused) {
          audio.pause();
        }
      }
    });
  }, [audioClips]);

  // Sync audio with timeline time and playing state
  useEffect(() => {
    syncAudio(timelineTime, isPlaying);
  }, [timelineTime, isPlaying, syncAudio]);

  const handlePlayPause = () => {
    if (timeline.segments.length === 0 && audioClips.length === 0) return;
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (time: number) => {
    const clampedTime = Math.max(0, Math.min(time, timeline.totalDuration));
    setTimelineTime(clampedTime);

    const segmentIndex = findSegmentAtTime(clampedTime);
    setCurrentSegmentIndex(segmentIndex);
  };

  const hasContent = timeline.segments.length > 0 || audioClips.length > 0;

  return (
    <div className="flex-1 bg-black flex flex-col items-center justify-center">
      {!hasContent ? (
        <div className="text-gray-500">No clips in timeline</div>
      ) : timeline.segments.length === 0 ? (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-gray-500 text-lg">Audio only</div>
        </div>
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

      {hasContent && (
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
          disabled={!hasContent}
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
