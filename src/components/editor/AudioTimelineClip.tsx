'use client';

import { useRef, useState } from 'react';
import { X, Music } from 'lucide-react';
import { AudioReference } from '@/types/audio';

interface AudioTimelineClipProps {
  clip: AudioReference;
  pixelsPerSecond: number;
  onUpdateTimestamp: (id: string, newTime: number) => void;
  onRemove: (id: string) => void;
}

export function AudioTimelineClip({
  clip,
  pixelsPerSecond,
  onUpdateTimestamp,
  onRemove,
}: AudioTimelineClipProps) {
  const clipRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const initialTimestamp = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    initialTimestamp.current = clip.timestamp;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartX.current;
      const deltaTime = deltaX / pixelsPerSecond;
      onUpdateTimestamp(clip.id, initialTimestamp.current + deltaTime);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const left = clip.timestamp * pixelsPerSecond;
  const width = clip.duration * pixelsPerSecond;

  return (
    <div
      ref={clipRef}
      className={`absolute top-2 h-12 rounded-md bg-green-600 cursor-grab flex items-center justify-between px-2 ${
        isDragging ? 'cursor-grabbing opacity-80' : ''
      }`}
      style={{ left: `${left}px`, width: `${width}px` }}
      onMouseDown={handleMouseDown}
    >
      <div className="flex items-center gap-1 flex-1 min-w-0">
        <Music size={12} className="text-white/80 flex-shrink-0" />
        <span className="text-white text-xs truncate">
          {(clip.audioId ?? clip.id).slice(0, 8)}...
        </span>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(clip.id);
        }}
        className="text-white/70 hover:text-white ml-1 flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}
