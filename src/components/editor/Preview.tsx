'use client';

import { useState, useRef, useEffect, RefObject } from 'react';
import { Play, Pause } from 'lucide-react';
import { VideoReference } from '@/types/video';
import { AudioReference } from '@/types/audio';

interface PreviewProps {
  clips: VideoReference[];
  audioClips: AudioReference[];
  videoRef: RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onSeek: (time: number) => void;
  onDropVideo?: (video: { id: string; url: string; duration?: number }) => void;
  isSeekingRef: RefObject<boolean>;
}

export function Preview({ clips, audioClips, videoRef, isPlaying, setIsPlaying, currentTime, onTimeUpdate, onSeek, onDropVideo, isSeekingRef }: PreviewProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const prevActiveClipIdRef = useRef<string | null>(null);
  const isTransitioningRef = useRef(false);
  const pendingTransitionRef = useRef<{
    clipId: string;
    targetTime: number;
    shouldPlay: boolean;
  } | null>(null);

  const sortedClips = [...clips].sort((a, b) => a.timestamp - b.timestamp);

  // Create/update audio elements for each audio clip
  useEffect(() => {
    audioClips.forEach(clip => {
      if (!audioRefs.current.has(clip.id)) {
        const audio = new Audio(clip.url);
        audioRefs.current.set(clip.id, audio);
      }
    });
    // Cleanup removed clips
    audioRefs.current.forEach((audio, id) => {
      if (!audioClips.find(c => c.id === id)) {
        audio.pause();
        audioRefs.current.delete(id);
      }
    });
  }, [audioClips]);

  // Sync audio with timeline
  useEffect(() => {
    audioClips.forEach(clip => {
      const audio = audioRefs.current.get(clip.id);
      if (!audio) return;

      const clipStart = clip.timestamp;
      const trimStart = clip.trimStart || 0;
      const visibleDuration = clip.duration - trimStart - (clip.trimEnd || 0);
      const clipEnd = clipStart + visibleDuration;

      if (currentTime >= clipStart && currentTime <= clipEnd) {
        // Audio should be playing at this time
        const audioTime = currentTime - clipStart + trimStart;
        // Use tighter sync threshold near clip boundaries
        const progressInClip = (currentTime - clipStart) / visibleDuration;
        const isNearBoundary = progressInClip < 0.1 || progressInClip > 0.9;
        const syncThreshold = isNearBoundary ? 0.05 : 0.3;
        if (Math.abs(audio.currentTime - audioTime) > syncThreshold) {
          audio.currentTime = audioTime;
        }
        if (isPlaying && audio.paused) {
          audio.play().catch(() => {
            // Ignore autoplay errors
          });
        }
        if (!isPlaying && !audio.paused) {
          audio.pause();
        }
      } else {
        // Audio should not be playing
        if (!audio.paused) {
          audio.pause();
        }
      }
    });
  }, [currentTime, isPlaying, audioClips]);

  // Cleanup all audio on unmount
  useEffect(() => {
    const refs = audioRefs.current;
    return () => {
      refs.forEach(audio => {
        audio.pause();
      });
      refs.clear();
    };
  }, []);

  // Find the clip that contains the current scrubber time
  // Use < for clipEnd for consistency with Editor.tsx boundary checks
  let activeClip = sortedClips.find(clip => {
    const clipStart = clip.timestamp;
    const visibleDuration = clip.duration - (clip.trimStart || 0) - (clip.trimEnd || 0);
    const clipEnd = clipStart + visibleDuration;
    return currentTime >= clipStart && currentTime < clipEnd;
  });

  // Fallback: if no clip found (e.g., currentTime exactly at boundary between clips),
  // find the next clip that starts at or after currentTime
  if (!activeClip && sortedClips.length > 0) {
    activeClip = sortedClips.find(clip => clip.timestamp >= currentTime) || sortedClips[sortedClips.length - 1];
  }

  // Sync video currentTime when clip changes
  // Note: currentTime is intentionally NOT in dependencies - we only want this to run
  // when the active clip ID changes, not every frame. The closure captures currentTime
  // at the moment of clip change, which is the correct behavior.
  useEffect(() => {
    if (!activeClip || !videoRef.current) {
      prevActiveClipIdRef.current = null;
      return;
    }

    if (prevActiveClipIdRef.current === activeClip.id) {
      return;
    }

    console.log('[Clip] Active clip changed:', {
      from: prevActiveClipIdRef.current?.slice(0, 8),
      to: activeClip.id.slice(0, 8),
      currentTime,
      clipTimestamp: activeClip.timestamp,
      isPlaying
    });
    prevActiveClipIdRef.current = activeClip.id;

    // Set pending transition - will be handled by onCanPlay
    const trimStart = activeClip.trimStart || 0;
    const timeWithinClip = currentTime - activeClip.timestamp;
    const videoTime = trimStart + timeWithinClip;
    const maxVideoTime = activeClip.duration - (activeClip.trimEnd || 0);

    pendingTransitionRef.current = {
      clipId: activeClip.id,
      targetTime: Math.max(trimStart, Math.min(videoTime, maxVideoTime)),
      shouldPlay: isPlaying
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClip?.id, isPlaying]);

  const handlePlayPause = () => {
    if (!videoRef.current || !activeClip) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleVideoEnded = () => {
    console.log('[Clip] Video ended event fired');

    // Skip if already transitioning (handleTimeUpdate already handled it)
    if (isTransitioningRef.current) {
      console.log('[Clip] Already transitioning, skipping onEnded');
      return;
    }

    isTransitioningRef.current = true;
    const currentIndex = sortedClips.findIndex(c => c.id === activeClip?.id);

    console.log('[Clip] handleVideoEnded:', {
      clipId: activeClip?.id.slice(0, 8),
      currentIndex,
      totalClips: sortedClips.length
    });

    if (currentIndex >= 0 && currentIndex < sortedClips.length - 1) {
      const nextClip = sortedClips[currentIndex + 1];
      console.log('[Clip] onEnded: transitioning to next clip:', nextClip.id.slice(0, 8));
      onSeek(nextClip.timestamp);
      // Don't call play() here - the useEffect will handle it after loadedmetadata
    } else {
      console.log('[Clip] onEnded: end of timeline, resetting');
      setIsPlaying(false);
      onSeek(0);
    }

    setTimeout(() => {
      isTransitioningRef.current = false;
    }, 150);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current || !activeClip) return;

    // Skip during seeking
    if (isSeekingRef.current) {
      console.log('[Clip] Skipping timeupdate during seek');
      return;
    }

    // Skip during transition
    if (isTransitioningRef.current) {
      console.log('[Clip] Skipping timeupdate during transition');
      return;
    }

    const trimStart = activeClip.trimStart || 0;
    const trimEnd = activeClip.trimEnd || 0;
    const visibleDuration = activeClip.duration - trimStart - trimEnd;
    const clipEnd = activeClip.timestamp + visibleDuration;
    const globalTime = activeClip.timestamp + (videoRef.current.currentTime - trimStart);

    console.log('[Clip] timeupdate:', {
      clipId: activeClip.id.slice(0, 8),
      videoTime: videoRef.current.currentTime.toFixed(3),
      globalTime: globalTime.toFixed(3),
      clipEnd: clipEnd.toFixed(3),
      remaining: (clipEnd - globalTime).toFixed(3)
    });

    // Check if we've reached the visible clip end (small threshold to trigger slightly early)
    if (globalTime >= clipEnd - 0.05) {
      isTransitioningRef.current = true;

      const currentIndex = sortedClips.findIndex(c => c.id === activeClip.id);
      console.log('[Clip] Reached clip end:', {
        clipId: activeClip.id.slice(0, 8),
        currentIndex,
        totalClips: sortedClips.length
      });

      if (currentIndex >= 0 && currentIndex < sortedClips.length - 1) {
        const nextClip = sortedClips[currentIndex + 1];
        console.log('[Clip] Transitioning to next clip:', {
          nextClipId: nextClip.id.slice(0, 8),
          nextTimestamp: nextClip.timestamp
        });
        onSeek(nextClip.timestamp);
        // Don't call play() here - the useEffect will handle it after loadedmetadata
      } else {
        console.log('[Clip] End of timeline, resetting to 0');
        setIsPlaying(false);
        videoRef.current?.pause();
        onSeek(0);
      }

      // Reset transition flag after seek delay
      setTimeout(() => {
        isTransitioningRef.current = false;
        console.log('[Clip] Transition complete');
      }, 150);
      return;
    }

    onTimeUpdate(globalTime);
  };

  const handleCanPlay = () => {
    if (!videoRef.current || !pendingTransitionRef.current) return;

    const pending = pendingTransitionRef.current;
    // Only handle if this is for the current clip
    if (pending.clipId !== activeClip?.id) return;

    console.log('[Clip] canplay fired, handling pending transition');
    videoRef.current.currentTime = pending.targetTime;

    if (pending.shouldPlay) {
      console.log('[Clip] Calling play() after canplay');
      videoRef.current.play().catch((e) => console.log('[Clip] play() error:', e));
    }

    pendingTransitionRef.current = null;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'video' && onDropVideo) {
        onDropVideo({
          id: data.id,
          url: data.url,
          duration: data.duration,
        });
      }
    } catch (err) {
      console.error('Failed to parse drop data:', err);
    }
  };

  return (
    <div
      className={`flex-1 bg-black flex flex-col overflow-hidden transition-all ${
        isDraggingOver ? 'ring-2 ring-blue-500 ring-inset bg-blue-500/10' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Video Area */}
      <div className="flex-1 min-h-0 flex items-center justify-center">
        {activeClip ? (
          <video
            ref={videoRef}
            src={activeClip.url}
            className="max-h-full max-w-full"
            muted
            onEnded={handleVideoEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
            onCanPlay={handleCanPlay}
          />
        ) : clips.length > 0 ? null : (
          <div className="text-gray-500">No clips in timeline</div>
        )}
      </div>

      {/* Controls Area */}
      <div className="flex-shrink-0 pb-4 px-4">
        {/* Play Button */}
        <div className="flex justify-center gap-2">
          <button
            onClick={handlePlayPause}
            disabled={!activeClip}
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
    </div>
  );
}
