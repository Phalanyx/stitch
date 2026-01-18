'use client';

import { useState, useRef, useEffect, RefObject, useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { VideoReference } from '@/types/video';
import { AudioLayer } from '@/types/audio';

interface PreviewProps {
  clips: VideoReference[];
  audioLayers: AudioLayer[];
  videoRef: RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onSeek: (time: number) => void;
  onDropVideo?: (video: { id: string; url: string; duration?: number }) => void;
  isSeekingRef: RefObject<boolean>;
}

export function Preview({ clips, audioLayers, videoRef, isPlaying, setIsPlaying, currentTime, onTimeUpdate, onSeek, onDropVideo, isSeekingRef }: PreviewProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const prevActiveClipIdRef = useRef<string | null>(null);
  const isTransitioningRef = useRef(false);
  const reverseAnimationFrameRef = useRef<number | null>(null);
  const isPlayingReverseRef = useRef(false);
  const reverseGlobalTimeRef = useRef<number>(0);
  const forwardAnimationFrameRef = useRef<number | null>(null);
  const isPlayingForwardRef = useRef(false);

  const sortedClips = [...clips].sort((a, b) => a.timestamp - b.timestamp);

  // Flatten unmuted audio layers into a single array for playback
  const audioClips = useMemo(() => {
    return audioLayers
      .filter(layer => !layer.muted)
      .flatMap(layer => layer.clips);
  }, [audioLayers]);

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
    // During scrubbing, pause all audio and skip sync to prevent choppy/conflicting audio
    if (isSeekingRef.current) {
      audioClips.forEach(clip => {
        const audio = audioRefs.current.get(clip.id);
        if (audio && !audio.paused) {
          audio.pause();
        }
      });
      return;
    }

    // #NOTE: Temporarily mute audio during reverse playback until proper reverse audio is implemented
    if (isPlayingReverseRef.current) {
      audioClips.forEach(clip => {
        const audio = audioRefs.current.get(clip.id);
        if (audio && !audio.paused) {
          audio.pause();
        }
      });
      return;
    }

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

        // During smooth forward playback, skip seeking if audio is already playing
        // This prevents stuttering from constant currentTime assignments
        const isForwardPlaying = isPlayingForwardRef.current;
        const shouldSkipSeek = isForwardPlaying && isPlaying && !audio.paused;

        if (!shouldSkipSeek) {
          // Use tighter sync threshold near clip boundaries
          const progressInClip = (currentTime - clipStart) / visibleDuration;
          const isNearBoundary = progressInClip < 0.1 || progressInClip > 0.9;
          const syncThreshold = isNearBoundary ? 0.05 : 0.3;
          if (Math.abs(audio.currentTime - audioTime) > syncThreshold) {
            audio.currentTime = audioTime;
          }
        }

        if (isPlaying && audio.paused) {
          // When starting audio, sync its position first
          audio.currentTime = audioTime;
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
        // Reset to clip start for clean playback on re-entry
        audio.currentTime = trimStart;
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

  // Cleanup reverse and forward playback on unmount
  useEffect(() => {
    return () => {
      stopReversePlayback();
      stopForwardPlayback();
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
  // Uses 'canplay' event instead of 'loadedmetadata' for more reliable playback start.
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

    const trimStart = activeClip.trimStart || 0;
    const timeWithinClip = currentTime - activeClip.timestamp;
    const videoTime = trimStart + timeWithinClip;
    const maxVideoTime = activeClip.duration - (activeClip.trimEnd || 0);
    const targetTime = Math.max(trimStart, Math.min(videoTime, maxVideoTime));

    // Capture the current video element for cleanup
    const video = videoRef.current;

    const setTimeAndPlay = () => {
      if (!videoRef.current) {
        console.log('[Clip] setTimeAndPlay: videoRef is null');
        return;
      }
      // Verify we're still working with the expected clip (guard against stale closures)
      if (prevActiveClipIdRef.current !== activeClip.id) {
        console.log('[Clip] Stale setTimeAndPlay call, skipping');
        return;
      }
      console.log('[Clip] setTimeAndPlay called:', {
        readyState: videoRef.current.readyState,
        isPlaying,
        targetTime: targetTime.toFixed(3),
        clipId: activeClip.id.slice(0, 8)
      });
      videoRef.current.currentTime = targetTime;

      // Only stop reverse playback if we're not currently reversing
      // (clip change during reverse should continue reverse)
      if (!isPlayingReverseRef.current) {
        stopReversePlayback();
      }

      if (isPlaying) {
        if (isPlayingReverseRef.current) {
          // Reverse playback is handling clip transitions - don't interfere
          return;
        }
        videoRef.current.play()
          .then(() => console.log('[Clip] play() succeeded'))
          .catch((e) => console.log('[Clip] play() error:', e));
      }
    };

    // If video is ready, set time immediately; otherwise wait for canplay
    console.log('[Clip] Checking video readyState:', video.readyState);
    if (video.readyState >= 1) {
      setTimeAndPlay();
    } else {
      console.log('[Clip] Adding canplay listener');
      video.addEventListener('canplay', setTimeAndPlay, { once: true });
    }

    // Cleanup: remove event listener if effect re-runs before canplay fires
    return () => {
      video.removeEventListener('canplay', setTimeAndPlay);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClip?.id, isPlaying]);

  const stopReversePlayback = () => {
    if (reverseAnimationFrameRef.current !== null) {
      cancelAnimationFrame(reverseAnimationFrameRef.current);
      reverseAnimationFrameRef.current = null;
    }
    isPlayingReverseRef.current = false;
  };

  const stopForwardPlayback = () => {
    if (forwardAnimationFrameRef.current !== null) {
      cancelAnimationFrame(forwardAnimationFrameRef.current);
      forwardAnimationFrameRef.current = null;
    }
    isPlayingForwardRef.current = false;
  };

  const handlePause = () => {
    if (!videoRef.current || !activeClip) return;

    // Stop reverse playback if active
    stopReversePlayback();
    // Stop forward playback RAF loop if active
    stopForwardPlayback();

    videoRef.current.pause();
    setIsPlaying(false);
  };

  const handleSkipToBeginning = () => {
    const wasPlayingForward = isPlayingForwardRef.current;
    stopReversePlayback();
    stopForwardPlayback();
    onSeek(0);
    if (videoRef.current && isPlaying) {
      if (wasPlayingForward) {
        // Restart forward playback with smooth RAF loop
        startForwardPlayback();
      } else {
        videoRef.current.play();
      }
    }
  };

  const handleSkipToEnd = () => {
    if (sortedClips.length === 0) return;

    stopReversePlayback();
    stopForwardPlayback();

    const lastClip = sortedClips[sortedClips.length - 1];
    const trimStart = lastClip.trimStart || 0;
    const trimEnd = lastClip.trimEnd || 0;
    const visibleDuration = lastClip.duration - trimStart - trimEnd;
    const endTime = lastClip.timestamp + visibleDuration;

    onSeek(endTime);
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
    }
  };

  const handlePlayBackward = () => {
    if (!videoRef.current || !activeClip) return;

    // Stop any existing playback loops
    stopReversePlayback();
    stopForwardPlayback();
    
    // Ensure video is ready and can display frames
    if (videoRef.current.readyState < 2) {
      // Wait for video to be ready
      videoRef.current.addEventListener('loadeddata', () => {
        startReversePlayback();
      }, { once: true });
      return;
    }
    
    startReversePlayback();
  };

  const startReversePlayback = () => {
    if (!videoRef.current || !activeClip) return;
    
    // Ensure video is loaded and ready
    if (videoRef.current.readyState < 2) {
      // Video not ready, wait for it
      const handleLoadedData = () => {
        videoRef.current?.removeEventListener('loadeddata', handleLoadedData);
        startReversePlayback();
      };
      videoRef.current.addEventListener('loadeddata', handleLoadedData);
      return;
    }
    
    // Pause normal playback to take manual control
    videoRef.current.pause();
    videoRef.current.playbackRate = 1;
    
    // Initialize reverse playback with current global time
    reverseGlobalTimeRef.current = currentTime;
    
    // Start manual reverse playback
    isPlayingReverseRef.current = true;
    setIsPlaying(true);
    
    // Start the reverse animation loop with smooth frame updates
    // Use high-resolution timing to match forward playback speed exactly
    let lastTimestamp = performance.now();
    let lastVideoTime = videoRef.current.currentTime;
    const REVERSE_SPEED = 1.0; // Playback speed (1x normal speed in reverse, matching forward)
    // Update video element every 2 frames for smooth playback (~30fps visual updates)
    // This reduces choppiness by giving the browser time to render frames
    const VIDEO_UPDATE_INTERVAL = 2; // Update video every N frames
    let frameCount = 0;
    
    const reverseStep = () => {
      if (!videoRef.current || !isPlayingReverseRef.current) {
        stopReversePlayback();
        return;
      }

      // Stop reverse playback if user is seeking
      if (isSeekingRef.current) {
        stopReversePlayback();
        setIsPlaying(false);
        return;
      }

      // Calculate actual elapsed time with high precision
      const now = performance.now();
      let deltaTime = (now - lastTimestamp) / 1000; // Convert to seconds
      
      // Cap delta time only to prevent large jumps (e.g., if tab was inactive or browser throttled)
      // This ensures we don't skip large amounts of time, but allows normal playback speed
      deltaTime = Math.min(deltaTime, 0.1); // Cap at 100ms to prevent jumps from tab inactivity
      lastTimestamp = now;
      
      // Decrement global time at exactly the same rate as forward playback (1x speed)
      reverseGlobalTimeRef.current = Math.max(0, reverseGlobalTimeRef.current - (deltaTime * REVERSE_SPEED));
      const newGlobalTime = reverseGlobalTimeRef.current;
      
      // Find current active clip based on new global time
      const currentActiveClip = sortedClips.find(clip => {
        const clipStart = clip.timestamp;
        const visibleDuration = clip.duration - (clip.trimStart || 0) - (clip.trimEnd || 0);
        const clipEnd = clipStart + visibleDuration;
        return newGlobalTime >= clipStart && newGlobalTime < clipEnd;
      });
      
      if (!currentActiveClip) {
        // No clip found, stop at beginning
        onSeek(0);
        stopReversePlayback();
        setIsPlaying(false);
        return;
      }
      
      const trimStart = currentActiveClip.trimStart || 0;
      const trimEnd = currentActiveClip.trimEnd || 0;
      const clipStart = currentActiveClip.timestamp;
      
      // Check if we've reached the start of current clip
      if (newGlobalTime <= clipStart + 0.01) {
        const currentIndex = sortedClips.findIndex(c => c.id === currentActiveClip.id);
        
        if (currentIndex > 0) {
          // Move to previous clip
          const prevClip = sortedClips[currentIndex - 1];
          const prevTrimStart = prevClip.trimStart || 0;
          const prevTrimEnd = prevClip.trimEnd || 0;
          const prevVisibleDuration = prevClip.duration - prevTrimStart - prevTrimEnd;
          const prevClipEnd = prevClip.timestamp + prevVisibleDuration;
          
          // Update global time ref and seek to end of previous clip
          reverseGlobalTimeRef.current = prevClipEnd;
          onSeek(prevClipEnd);
          lastTimestamp = performance.now();
          frameCount = 0; // Reset frame counter on clip transition
          reverseAnimationFrameRef.current = requestAnimationFrame(reverseStep);
        } else {
          // Reached beginning of timeline
          reverseGlobalTimeRef.current = 0;
          onSeek(0);
          stopReversePlayback();
          setIsPlaying(false);
        }
        return;
      }
      
      // Calculate video element time from global time
      const timeWithinClip = newGlobalTime - clipStart;
      const videoTime = trimStart + timeWithinClip;
      const maxVideoTime = currentActiveClip.duration - trimEnd;
      const minVideoTime = trimStart;
      
      // Clamp video time to valid range
      const clampedVideoTime = Math.max(minVideoTime, Math.min(videoTime, maxVideoTime));
      
      // Update video element's currentTime at a controlled rate for smooth playback
      // Updating every frame can cause choppiness; updating every N frames is smoother
      frameCount++;
      const shouldUpdateVideo = frameCount >= VIDEO_UPDATE_INTERVAL || 
                                Math.abs(clampedVideoTime - lastVideoTime) > 0.1; // Force update on large jumps
      
      if (shouldUpdateVideo && videoRef.current.readyState >= 2) {
        try {
          // Update video element's currentTime for smooth visual playback
          // This creates the reverse playback effect by seeking backward smoothly
          videoRef.current.currentTime = clampedVideoTime;
          lastVideoTime = clampedVideoTime;
          frameCount = 0; // Reset frame counter after update
        } catch (error) {
          // Ignore errors from setting currentTime (e.g., if video is not ready)
          console.warn('Failed to set video currentTime during reverse playback:', error);
        }
      }
      
      // Always update parent component with new global time for accurate scrubber position
      // This keeps the timeline scrubber smooth even if video updates less frequently
      onTimeUpdate(newGlobalTime);
      
      // Continue reverse playback immediately to maintain smooth frame rate
      // This ensures we match forward playback's update frequency
      reverseAnimationFrameRef.current = requestAnimationFrame(reverseStep);
    };
    
    // Start the reverse playback loop
    reverseAnimationFrameRef.current = requestAnimationFrame(reverseStep);
  };

  const startForwardPlayback = () => {
    if (!videoRef.current || !activeClip) return;

    // Start native video playback
    videoRef.current.playbackRate = 1;
    videoRef.current.play();
    isPlayingForwardRef.current = true;
    setIsPlaying(true);

    // Start RAF loop to poll video.currentTime for smooth scrubber updates
    const forwardStep = () => {
      if (!videoRef.current || !isPlayingForwardRef.current) {
        stopForwardPlayback();
        return;
      }

      // Skip updates during seeking but keep loop running
      if (isSeekingRef.current) {
        forwardAnimationFrameRef.current = requestAnimationFrame(forwardStep);
        return;
      }

      // Skip update during transitions (clip changes) but keep loop running
      if (isTransitioningRef.current) {
        forwardAnimationFrameRef.current = requestAnimationFrame(forwardStep);
        return;
      }

      // Skip if video is paused but keep loop running (will resume when video plays)
      if (videoRef.current.paused) {
        forwardAnimationFrameRef.current = requestAnimationFrame(forwardStep);
        return;
      }

      // Find current active clip based on video src
      const currentActiveClip = sortedClips.find(clip => clip.id === prevActiveClipIdRef.current);
      if (!currentActiveClip) {
        forwardAnimationFrameRef.current = requestAnimationFrame(forwardStep);
        return;
      }

      const trimStart = currentActiveClip.trimStart || 0;
      const clipStart = currentActiveClip.timestamp;

      // Calculate global time from video's currentTime
      const globalTime = clipStart + (videoRef.current.currentTime - trimStart);

      // Update parent component with new global time for smooth scrubber position
      onTimeUpdate(globalTime);

      // Continue forward playback loop
      forwardAnimationFrameRef.current = requestAnimationFrame(forwardStep);
    };

    // Start the forward playback loop
    forwardAnimationFrameRef.current = requestAnimationFrame(forwardStep);
  };

  const handlePlayForward = () => {
    if (!videoRef.current || !activeClip) return;

    // Stop reverse playback if active
    stopReversePlayback();
    // Stop any existing forward playback loop
    stopForwardPlayback();

    // Start forward playback with RAF-based scrubber updates
    startForwardPlayback();
  };

  const handleVideoEnded = () => {
    console.log('[Clip] Video ended event fired');

    // Skip if already transitioning (handleTimeUpdate already handled it)
    if (isTransitioningRef.current) {
      console.log('[Clip] Already transitioning, skipping onEnded');
      return;
    }

    // Note: URL comparison removed - browser normalizes src to absolute URL which
    // doesn't match relative/blob URLs. We rely on isTransitioningRef instead.

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
      // Don't call play() here - the useEffect will handle it after canplay
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

    // Skip if video is not ready (readyState < 2 means HAVE_CURRENT_DATA not reached)
    if (videoRef.current.readyState < 2) {
      console.log('[Clip] Skipping timeupdate, video not ready:', videoRef.current.readyState);
      return;
    }

    // Note: URL comparison removed - browser normalizes src to absolute URL which
    // doesn't match relative/blob URLs. We rely on isTransitioningRef and isSeekingRef instead.

    // Skip if playing in reverse (reverse playback handles its own updates)
    if (isPlayingReverseRef.current) {
      return;
    }

    // Skip scrubber updates if our forward RAF loop is handling them
    // (still continue to check clip transitions below)
    const skipScrubberUpdate = isPlayingForwardRef.current;

    const trimStart = activeClip.trimStart || 0;
    const trimEnd = activeClip.trimEnd || 0;
    const visibleDuration = activeClip.duration - trimStart - trimEnd;
    const clipStart = activeClip.timestamp;
    const clipEnd = clipStart + visibleDuration;
    
    const globalTime = clipStart + (videoRef.current.currentTime - trimStart);

    console.log('[Clip] timeupdate:', {
      clipId: activeClip.id.slice(0, 8),
      videoTime: videoRef.current.currentTime.toFixed(3),
      globalTime: globalTime.toFixed(3),
      clipStart: clipStart.toFixed(3),
      clipEnd: clipEnd.toFixed(3),
    });

    // Check if we've reached the visible clip end (when playing forward)
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
        // Don't call play() here - the useEffect will handle it after canplay
      } else {
        console.log('[Clip] End of timeline, resetting to 0');
        // Note: pause() will trigger onPause which calls setIsPlaying(false)
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

    // Only update scrubber if our RAF loop isn't handling it
    if (!skipScrubberUpdate) {
      onTimeUpdate(globalTime);
    }
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
      className={`flex-1 bg-black flex flex-col overflow-hidden ${
        isDraggingOver ? 'ring-1 ring-inset ring-blue-500/50' : ''
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
            onPlay={() => {
              if (!isPlayingReverseRef.current) {
                setIsPlaying(true);
              }
            }}
            onPause={() => {
              if (!isPlayingReverseRef.current && !isTransitioningRef.current) {
                setIsPlaying(false);
                stopForwardPlayback();
              }
            }}
            onTimeUpdate={handleTimeUpdate}
          />
        ) : clips.length > 0 ? null : (
          <div className="text-gray-500">No clips in timeline</div>
        )}
      </div>

      {/* Controls Area */}
      <div className="flex-shrink-0 bg-gray-800 border-t border-gray-700 h-10 flex items-center justify-center gap-1 px-2">
        {/* Skip to Beginning */}
        <button
          onClick={handleSkipToBeginning}
          disabled={!activeClip || sortedClips.length === 0}
          className="w-7 h-7 bg-transparent hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          title="Skip to beginning"
        >
          <SkipBack className="w-4 h-4 text-gray-300" />
        </button>

        {/* Play Backward */}
        <button
          onClick={handlePlayBackward}
          disabled={!activeClip}
          className="w-7 h-7 bg-transparent hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          title="Play backward"
        >
          <Play className="w-4 h-4 text-gray-300 rotate-180" />
        </button>

        {/* Pause */}
        <button
          onClick={handlePause}
          disabled={!activeClip || !isPlaying}
          className="w-7 h-7 bg-transparent hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          title="Pause"
        >
          <Pause className="w-4 h-4 text-gray-300" />
        </button>

        {/* Play Forward */}
        <button
          onClick={handlePlayForward}
          disabled={!activeClip}
          className="w-7 h-7 bg-transparent hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          title="Play forward"
        >
          <Play className="w-4 h-4 text-gray-300" />
        </button>

        {/* Skip to End */}
        <button
          onClick={handleSkipToEnd}
          disabled={!activeClip || sortedClips.length === 0}
          className="w-7 h-7 bg-transparent hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          title="Skip to end"
        >
          <SkipForward className="w-4 h-4 text-gray-300" />
        </button>
      </div>
    </div>
  );
}
