'use client';

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { VideoReference } from '@/types/video';

interface TimelineClipProps {
  clip: VideoReference;
  pixelsPerSecond: number;
  onUpdateTimestamp: (id: string, newTime: number) => void;
  onRemove: (id: string) => void;
}

export function TimelineClip({
  clip,
  pixelsPerSecond,
  onUpdateTimestamp,
  onRemove,
}: TimelineClipProps) {
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
      className={`absolute top-2 h-16 rounded-md bg-blue-500 cursor-grab flex items-center justify-between px-2 ${
        isDragging ? 'cursor-grabbing opacity-80' : ''
      }`}
      style={{ left: `${left}px`, width: `${width}px` }}
      onMouseDown={handleMouseDown}
    >
      <span className="text-white text-xs truncate flex-1">
        {(clip.videoId ?? clip.id).slice(0, 8)}...
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(clip.id);
        }}
        className="text-white/70 hover:text-white ml-1"
      >
        <X size={14} />
      </button>
    </div>
  );
}
