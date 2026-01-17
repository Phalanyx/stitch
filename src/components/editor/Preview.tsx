'use client';

import { useState, RefObject } from 'react';
import { Play, Pause } from 'lucide-react';
import { VideoReference } from '@/types/video';

interface PreviewProps {
  clips: VideoReference[];
  videoRef: RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
}

export function Preview({ clips, videoRef, isPlaying, setIsPlaying, currentTime, onTimeUpdate }: PreviewProps) {
  const [currentClipIndex, setCurrentClipIndex] = useState(0);

  const sortedClips = [...clips].sort((a, b) => a.timestamp - b.timestamp);

  // Find the clip that contains the current scrubber time
  const activeClip = sortedClips.find(clip => {
    const clipStart = clip.timestamp;
    const clipEnd = clip.timestamp + clip.duration;
    return currentTime >= clipStart && currentTime < clipEnd;
  });

  const currentClip = sortedClips[currentClipIndex];

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
    if (currentClipIndex < sortedClips.length - 1) {
      setCurrentClipIndex(currentClipIndex + 1);
    } else {
      setIsPlaying(false);
      setCurrentClipIndex(0);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    // Calculate global timeline time based on clip timestamp + video time
    const globalTime = activeClip ? activeClip.timestamp + videoRef.current.currentTime : 0;
    onTimeUpdate(globalTime);
  };

  return (
    <div className="flex-1 bg-black flex flex-col overflow-hidden">
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
