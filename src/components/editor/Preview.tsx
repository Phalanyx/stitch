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
}

export function Preview({ clips, audioClips, videoRef, isPlaying, setIsPlaying, currentTime, onTimeUpdate, onSeek, onDropVideo }: PreviewProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

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

      if (currentTime >= clipStart && currentTime < clipEnd) {
        // Audio should be playing at this time
        const audioTime = currentTime - clipStart + trimStart;
        // Only sync if significantly out of sync (to avoid choppy playback)
        if (Math.abs(audio.currentTime - audioTime) > 0.3) {
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
    return () => {
      audioRefs.current.forEach(audio => {
        audio.pause();
      });
      audioRefs.current.clear();
    };
  }, []);

  // Find the clip that contains the current scrubber time
  const activeClip = sortedClips.find(clip => {
    const clipStart = clip.timestamp;
    const visibleDuration = clip.duration - (clip.trimStart || 0) - (clip.trimEnd || 0);
    const clipEnd = clipStart + visibleDuration;
    return currentTime >= clipStart && currentTime < clipEnd;
  });

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
    const currentIndex = sortedClips.findIndex(c => c.id === activeClip?.id);
    if (currentIndex >= 0 && currentIndex < sortedClips.length - 1) {
      // Seek to start of next clip
      const nextClip = sortedClips[currentIndex + 1];
      onSeek(nextClip.timestamp);
      // Continue playing
      if (videoRef.current) {
        videoRef.current.play();
      }
    } else {
      setIsPlaying(false);
      onSeek(0); // Reset to beginning
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current || !activeClip) return;
    // Calculate global timeline time based on clip timestamp + video time
    // video.currentTime includes trimStart offset, so subtract it to get visible clip position
    const trimStart = activeClip.trimStart || 0;
    const globalTime = activeClip.timestamp + (videoRef.current.currentTime - trimStart);
    onTimeUpdate(globalTime);
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
            onEnded={handleVideoEnded}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={handleTimeUpdate}
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
