'use client';

import { useRef, useState, useEffect } from 'react';
import { X, Music } from 'lucide-react';
import { AudioReference } from '@/types/audio';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';

const SNAP_INCREMENT = 0.05;
const snapToGrid = (time: number): number => Math.round(time / SNAP_INCREMENT) * SNAP_INCREMENT;

export const AUDIO_CLIP_HEIGHT = 40; // Height of each stacked clip row
export const AUDIO_CLIP_PADDING = 4; // Top padding for the first clip
export const AUDIO_CLIP_GAP = 2; // Gap between stacked clips

interface AudioTimelineClipProps {
  clip: AudioReference;
  layerId: string;
  pixelsPerSecond: number;
  onUpdateTimestamp: (id: string, newTime: number, layerId: string, newDepth?: number) => void;
  onUpdateTrim: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }, layerId: string) => void;
  onRemove: (id: string, layerId: string) => void;
  isSelected?: boolean;
  onSelect?: (id: string, shiftKey: boolean, layerId: string) => void;
  depth?: number; // Vertical stacking depth (0 = bottom row)
}

export function AudioTimelineClip({
  clip,
  layerId,
  pixelsPerSecond,
  onUpdateTimestamp,
  onUpdateTrim,
  onRemove,
  isSelected,
  onSelect,
  depth = 0,
}: AudioTimelineClipProps) {
  const clipRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isPositionInvalid, setIsPositionInvalid] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const initialTimestamp = useRef(0);
  const initialDepth = useRef(0);

  const isPositionValid = useAudioTimelineStore((state) => state.isPositionValid);

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
    onSelect?.(clip.id, false, layerId);
  };

  // Calculate visible duration after trimming
  const trimStart = clip.trimStart ?? 0;
  const trimEnd = clip.trimEnd ?? 0;
  const visibleDuration = clip.duration - trimStart - trimEnd;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    initialTimestamp.current = clip.timestamp;
    initialDepth.current = depth;

    let currentDepth = depth;

    const handleMouseMove = (e: MouseEvent) => {
      // Horizontal movement -> timestamp change
      const deltaX = e.clientX - dragStartX.current;
      const deltaTime = deltaX / pixelsPerSecond;
      const newTimestamp = snapToGrid(initialTimestamp.current + deltaTime);

      // Check if the position would be valid within this layer
      const valid = isPositionValid(clip.id, newTimestamp, clip.duration, clip.trimStart, clip.trimEnd, layerId);
      setIsPositionInvalid(!valid);

      // Vertical movement -> depth change
      const deltaY = e.clientY - dragStartY.current;
      const depthChange = Math.round(deltaY / (AUDIO_CLIP_HEIGHT + AUDIO_CLIP_GAP));
      const newDepth = Math.max(0, initialDepth.current + depthChange);

      // Update both timestamp and depth together
      if (newDepth !== currentDepth) {
        currentDepth = newDepth;
        onUpdateTimestamp(clip.id, newTimestamp, layerId, newDepth);
      } else {
        onUpdateTimestamp(clip.id, newTimestamp, layerId);
      }
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

      onUpdateTrim(clip.id, { trimStart: clampedTrimStart, timestamp: snapToGrid(newTimestamp) }, layerId);
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

      onUpdateTrim(clip.id, { trimEnd: clampedTrimEnd }, layerId);
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
  // Calculate top position based on depth (stacked from bottom)
  const top = AUDIO_CLIP_PADDING + depth * (AUDIO_CLIP_HEIGHT + AUDIO_CLIP_GAP);

  return (
    <div
      ref={clipRef}
      className={`absolute rounded-md flex items-center ${
        isPositionInvalid
          ? 'bg-red-500 ring-2 ring-red-300'
          : isSelected
          ? 'bg-green-600 ring-2 ring-white'
          : 'bg-green-600'
      } ${isDragging ? 'cursor-grabbing opacity-80' : ''} ${isResizing ? 'opacity-90' : ''}`}
      style={{ left: `${left}px`, width: `${width}px`, minWidth: '20px', top: `${top}px`, height: `${AUDIO_CLIP_HEIGHT}px` }}
      onContextMenu={handleContextMenu}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(clip.id, e.shiftKey, layerId);
      }}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-green-700 hover:bg-green-500 rounded-l-md"
        onMouseDown={handleLeftResize}
      />

      {/* Clip content */}
      <div
        className="flex-1 flex items-center justify-between px-3 cursor-grab min-w-0"
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
            onRemove(clip.id, layerId);
          }}
          className="text-white/70 hover:text-white ml-1 flex-shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-green-700 hover:bg-green-500 rounded-r-md"
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
            className="w-full px-4 py-1 text-left text-sm text-white hover:bg-gray-700"
            onClick={() => {
              onRemove(clip.id, layerId);
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
