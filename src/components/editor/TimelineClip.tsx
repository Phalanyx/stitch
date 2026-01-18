'use client';

import { useRef, useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { VideoReference } from '@/types/video';
import { useTimelineStore } from '@/stores/timelineStore';
import { getMaxTrimExtension, TimelineClip as TimelineClipType } from '@/lib/timeline-validation';

const SNAP_INCREMENT = 0.05;
const snapToGrid = (time: number): number => Math.round(time / SNAP_INCREMENT) * SNAP_INCREMENT;

interface TimelineClipProps {
  clip: VideoReference;
  clips: VideoReference[];
  pixelsPerSecond: number;
  onUpdateTimestamp: (id: string, newTime: number) => void;
  onUpdateTrim: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }) => void;
  onRemove: (id: string) => void;
  isSelected?: boolean;
  onSelect?: (id: string, shiftKey: boolean) => void;
}

export function TimelineClip({
  clip,
  clips,
  pixelsPerSecond,
  onUpdateTimestamp,
  onUpdateTrim,
  onRemove,
  isSelected,
  onSelect,
}: TimelineClipProps) {
  const clipRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isPositionInvalid, setIsPositionInvalid] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const dragStartX = useRef(0);
  const initialTimestamp = useRef(0);
  const pendingTimestamp = useRef(0);

  const isPositionValidOrAutoTrimmable = useTimelineStore((state) => state.isPositionValidOrAutoTrimmable);
  const updateVideoTimestampWithAutoTrim = useTimelineStore((state) => state.updateVideoTimestampWithAutoTrim);

  // Close context menu when clicking outside
  useEffect(() => {
    if (!showContextMenu) return;
    const handleClick = () => setShowContextMenu(false);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [showContextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
    onSelect?.(clip.id, false);
  };

  // Calculate visible duration after trimming
  const trimStart = clip.trimStart ?? 0;
  const trimEnd = clip.trimEnd ?? 0;
  const visibleDuration = clip.duration - trimStart - trimEnd;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    initialTimestamp.current = clip.timestamp;
    pendingTimestamp.current = clip.timestamp;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartX.current;
      const deltaTime = deltaX / pixelsPerSecond;
      const newTimestamp = snapToGrid(Math.max(0, initialTimestamp.current + deltaTime));

      // Store the pending timestamp for auto-trim on release
      pendingTimestamp.current = newTimestamp;

      // Check if the position would be valid (including auto-trim resolution)
      const valid = isPositionValidOrAutoTrimmable(clip.id, newTimestamp, clip.duration, clip.trimStart, clip.trimEnd);
      setIsPositionInvalid(!valid);

      onUpdateTimestamp(clip.id, newTimestamp);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsPositionInvalid(false);
      // Apply auto-trim if needed on release
      updateVideoTimestampWithAutoTrim(clip.id, pendingTimestamp.current);
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

    // Calculate max extension based on adjacent clips
    const timelineClips: TimelineClipType[] = clips.map((c) => ({
      id: c.id,
      timestamp: c.timestamp,
      duration: c.duration,
      trimStart: c.trimStart,
      trimEnd: c.trimEnd,
    }));
    const maxExtension = getMaxTrimExtension(timelineClips, clip.id, 'left');

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const deltaTime = deltaX / pixelsPerSecond;

      const newTrimStart = startTrimStart + deltaTime;
      // Clamp: can't go below 0, can't exceed max trim, and can't extend past adjacent clip
      const minTrimStart = startTrimStart - maxExtension; // How far we can extend (reduce trimStart)
      const maxTrim = clip.duration - (clip.trimEnd ?? 0) - 0.1; // Keep min 0.1s visible
      const clampedTrimStart = snapToGrid(Math.max(minTrimStart, Math.min(newTrimStart, maxTrim)));

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

    // Calculate max extension based on adjacent clips
    const timelineClips: TimelineClipType[] = clips.map((c) => ({
      id: c.id,
      timestamp: c.timestamp,
      duration: c.duration,
      trimStart: c.trimStart,
      trimEnd: c.trimEnd,
    }));
    const maxExtension = getMaxTrimExtension(timelineClips, clip.id, 'right');

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const deltaTime = -deltaX / pixelsPerSecond; // Negative because right drag = less trimEnd

      const newTrimEnd = startTrimEnd + deltaTime;
      // Clamp: can't go below 0, can't exceed max trim, and can't extend past adjacent clip
      const minTrimEnd = startTrimEnd - maxExtension; // How far we can extend (reduce trimEnd)
      const maxTrim = clip.duration - (clip.trimStart ?? 0) - 0.1; // Keep min 0.1s visible
      const clampedTrimEnd = snapToGrid(Math.max(minTrimEnd, Math.min(newTrimEnd, maxTrim)));

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
          : isSelected
          ? 'bg-slate-600 ring-2 ring-white'
          : 'bg-slate-600'
      } ${isDragging ? 'cursor-grabbing opacity-80' : ''} ${isResizing ? 'opacity-90' : ''}`}
      style={{ left: `${left}px`, width: `${width}px`, minWidth: '20px' }}
      onContextMenu={handleContextMenu}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(clip.id, e.shiftKey);
      }}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-slate-700 hover:bg-slate-500 rounded-l-md"
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
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-slate-700 hover:bg-slate-500 rounded-r-md"
        onMouseDown={handleRightResize}
      />

      {/* Context menu */}
      {showContextMenu && (
        <div
          className="fixed bg-gray-800 border border-gray-600 rounded shadow-lg py-1 z-50"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-4 py-1 text-left text-sm text-white hover:bg-gray-700 rounded"
            onClick={() => {
              onRemove(clip.id);
              setShowContextMenu(false);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
