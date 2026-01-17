'use client';

import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { VideoReference } from '@/types/video';
import { useTimelineStore } from '@/stores/timelineStore';

const SNAP_INCREMENT = 0.05;
const snapToGrid = (time: number): number => Math.round(time / SNAP_INCREMENT) * SNAP_INCREMENT;

interface TimelineClipProps {
  clip: VideoReference;
  pixelsPerSecond: number;
  onUpdateTimestamp: (id: string, newTime: number) => void;
  onUpdateTrim: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }) => void;
  onRemove: (id: string) => void;
}

export function TimelineClip({
  clip,
  pixelsPerSecond,
  onUpdateTimestamp,
  onUpdateTrim,
  onRemove,
}: TimelineClipProps) {
  const clipRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isPositionInvalid, setIsPositionInvalid] = useState(false);
  const dragStartX = useRef(0);
  const initialTimestamp = useRef(0);

  const isPositionValid = useTimelineStore((state) => state.isPositionValid);

  // Calculate visible duration after trimming
  const trimStart = clip.trimStart ?? 0;
  const trimEnd = clip.trimEnd ?? 0;
  const visibleDuration = clip.duration - trimStart - trimEnd;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    initialTimestamp.current = clip.timestamp;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartX.current;
      const deltaTime = deltaX / pixelsPerSecond;
      const newTimestamp = snapToGrid(initialTimestamp.current + deltaTime);

      // Check if the position would be valid
      const valid = isPositionValid(clip.id, newTimestamp, clip.duration, clip.trimStart, clip.trimEnd);
      setIsPositionInvalid(!valid);

      onUpdateTimestamp(clip.id, newTimestamp);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsPositionInvalid(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleLeftResize = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startTrimStart = clip.trimStart ?? 0;
    const startTimestamp = clip.timestamp;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const deltaTime = deltaX / pixelsPerSecond;

      const newTrimStart = Math.max(0, startTrimStart + deltaTime);
      const maxTrim = clip.duration - (clip.trimEnd ?? 0) - 0.1; // Keep min 0.1s visible
      const clampedTrimStart = snapToGrid(Math.min(newTrimStart, maxTrim));

      const newTimestamp = startTimestamp + (clampedTrimStart - startTrimStart);

      onUpdateTrim(clip.id, { trimStart: clampedTrimStart, timestamp: snapToGrid(newTimestamp) });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleRightResize = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startTrimEnd = clip.trimEnd ?? 0;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const deltaTime = -deltaX / pixelsPerSecond; // Negative because right drag = less trimEnd

      const newTrimEnd = Math.max(0, startTrimEnd + deltaTime);
      const maxTrim = clip.duration - (clip.trimStart ?? 0) - 0.1; // Keep min 0.1s visible
      const clampedTrimEnd = snapToGrid(Math.min(newTrimEnd, maxTrim));

      onUpdateTrim(clip.id, { trimEnd: clampedTrimEnd });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const left = clip.timestamp * pixelsPerSecond;
  const width = visibleDuration * pixelsPerSecond;

  return (
    <div
      ref={clipRef}
      className={`absolute top-2 h-16 rounded-md flex items-center ${
        isPositionInvalid
          ? 'bg-red-500 ring-2 ring-red-300'
          : 'bg-blue-500'
      } ${isDragging ? 'cursor-grabbing opacity-80' : ''} ${isResizing ? 'opacity-90' : ''}`}
      style={{ left: `${left}px`, width: `${width}px`, minWidth: '20px' }}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-blue-700 hover:bg-blue-600 rounded-l-md"
        onMouseDown={handleLeftResize}
      />

      {/* Clip content */}
      <div
        className="flex-1 flex items-center justify-between px-3 cursor-grab"
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

      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-blue-700 hover:bg-blue-600 rounded-r-md"
        onMouseDown={handleRightResize}
      />
    </div>
  );
}
