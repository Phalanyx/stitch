'use client';

import { useRef, useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { VideoReference } from '@/types/video';
import { useTimelineStore } from '@/stores/timelineStore';
import { useContextMenuStore } from '@/stores/contextMenuStore';
import { getMaxTrimExtension, TimelineClip as TimelineClipType } from '@/lib/timeline-validation';

const SNAP_INCREMENT = 0.05;
const snapToGrid = (time: number): number => Math.round(time / SNAP_INCREMENT) * SNAP_INCREMENT;

interface TrimState {
  trimStart: number;
  trimEnd: number;
  timestamp: number;
}

interface TimelineClipProps {
  clip: VideoReference;
  clips: VideoReference[];
  pixelsPerSecond: number;
  onUpdateTimestamp: (id: string, newTime: number) => void;
  onUpdateTrim: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }) => void;
  onRemove: (id: string) => void;
  isSelected?: boolean;
  onSelect?: (id: string, shiftKey: boolean) => void;
  // Silent update methods (no history - visual only during drag)
  onUpdateTimestampSilent?: (id: string, newTime: number) => void;
  onUpdateTrimSilent?: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }) => void;
  // Commit methods (single history entry for entire drag operation)
  onCommitMove?: (id: string, initialTimestamp: number, finalTimestamp: number) => void;
  onCommitTrim?: (id: string, initialState: TrimState, finalState: { trimStart?: number; trimEnd?: number; timestamp?: number }) => void;
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
  onUpdateTimestampSilent,
  onUpdateTrimSilent,
  onCommitMove,
  onCommitTrim,
}: TimelineClipProps) {
  const clipRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isPositionInvalid, setIsPositionInvalid] = useState(false);
  const dragStartX = useRef(0);
  const initialTimestamp = useRef(0);
  const pendingTimestamp = useRef(0);

  const isPositionValidOrAutoTrimmable = useTimelineStore((state) => state.isPositionValidOrAutoTrimmable);
  const updateVideoTimestampWithAutoTrim = useTimelineStore((state) => state.updateVideoTimestampWithAutoTrim);

  const contextMenu = useContextMenuStore();
  const showContextMenu = contextMenu.isOpen && contextMenu.clipId === clip.id && contextMenu.clipType === 'video';

  // Close context menu when clicking outside
  useEffect(() => {
    if (!showContextMenu) return;
    const handleClick = () => contextMenu.closeContextMenu();
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [showContextMenu, contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    contextMenu.openContextMenu({
      x: e.clientX,
      y: e.clientY,
      clipId: clip.id,
      clipType: 'video',
    });
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

      // Use silent update during drag (no history) if available, otherwise fallback
      if (onUpdateTimestampSilent) {
        onUpdateTimestampSilent(clip.id, newTimestamp);
      } else {
        onUpdateTimestamp(clip.id, newTimestamp);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsPositionInvalid(false);

      // Commit the move with a single history entry if commit method is available
      if (onCommitMove) {
        onCommitMove(clip.id, initialTimestamp.current, pendingTimestamp.current);
      }

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
    const startTrimEnd = clip.trimEnd ?? 0;
    const startTimestamp = clip.timestamp;

    // Track initial state for commit
    const initialTrimState: TrimState = {
      trimStart: startTrimStart,
      trimEnd: startTrimEnd,
      timestamp: startTimestamp,
    };

    // Track final state for commit
    let finalTrimStart = startTrimStart;
    let finalTimestamp = startTimestamp;

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

      // Track final values for commit
      finalTrimStart = clampedTrimStart;
      finalTimestamp = snapToGrid(newTimestamp);

      // Use silent update during resize (no history) if available, otherwise fallback
      if (onUpdateTrimSilent) {
        onUpdateTrimSilent(clip.id, { trimStart: clampedTrimStart, timestamp: finalTimestamp });
      } else {
        onUpdateTrim(clip.id, { trimStart: clampedTrimStart, timestamp: finalTimestamp });
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);

      // Commit the trim with a single history entry if commit method is available
      if (onCommitTrim) {
        onCommitTrim(clip.id, initialTrimState, { trimStart: finalTrimStart, timestamp: finalTimestamp });
      }

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
    const startTrimStart = clip.trimStart ?? 0;
    const startTrimEnd = clip.trimEnd ?? 0;
    const startTimestamp = clip.timestamp;

    // Track initial state for commit
    const initialTrimState: TrimState = {
      trimStart: startTrimStart,
      trimEnd: startTrimEnd,
      timestamp: startTimestamp,
    };

    // Track final state for commit
    let finalTrimEnd = startTrimEnd;

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

      // Track final value for commit
      finalTrimEnd = clampedTrimEnd;

      // Use silent update during resize (no history) if available, otherwise fallback
      if (onUpdateTrimSilent) {
        onUpdateTrimSilent(clip.id, { trimEnd: clampedTrimEnd });
      } else {
        onUpdateTrim(clip.id, { trimEnd: clampedTrimEnd });
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);

      // Commit the trim with a single history entry if commit method is available
      if (onCommitTrim) {
        onCommitTrim(clip.id, initialTrimState, { trimEnd: finalTrimEnd });
      }

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
          ? 'bg-sky-600 ring-2 ring-white'
          : 'bg-sky-600'
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
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-sky-700 hover:bg-sky-500 rounded-l-md"
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
          onMouseDown={(e) => e.stopPropagation()}
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
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-sky-700 hover:bg-sky-500 rounded-r-md"
        onMouseDown={handleRightResize}
      />

      {/* Context menu */}
      {showContextMenu && (
        <div
          className="fixed bg-gray-800 border border-gray-600 rounded shadow-lg py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-4 py-1 text-left text-sm text-white hover:bg-gray-700 rounded"
            onClick={() => {
              onRemove(clip.id);
              contextMenu.closeContextMenu();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
