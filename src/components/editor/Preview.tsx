'use client';

import { useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import { VideoReference } from '@/types/video';

interface PreviewProps {
  clips: VideoReference[];
}

export function Preview({ clips }: PreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);

  const sortedClips = [...clips].sort((a, b) => a.timestamp - b.timestamp);
  const currentClip = sortedClips[currentClipIndex];

  const handlePlayPause = () => {
    if (!videoRef.current || !currentClip) return;

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

  return (
    <div className="flex-1 bg-black flex flex-col items-center justify-center">
      {currentClip ? (
        <video
          ref={videoRef}
          src={currentClip.url}
          className="max-h-full max-w-full"
          onEnded={handleVideoEnded}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      ) : (
        <div className="text-gray-500">No clips in timeline</div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={handlePlayPause}
          disabled={!currentClip}
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
