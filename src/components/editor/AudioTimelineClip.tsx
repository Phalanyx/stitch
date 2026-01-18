'use client';

import { useRef, useState, useEffect } from 'react';
import { X, Music, VolumeX } from 'lucide-react';
import { AudioReference } from '@/types/audio';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { useContextMenuStore } from '@/stores/contextMenuStore';
import { getMaxTrimExtension, TimelineClip as TimelineClipType } from '@/lib/timeline-validation';

const SNAP_INCREMENT = 0.05;
const snapToGrid = (time: number): number => Math.round(time / SNAP_INCREMENT) * SNAP_INCREMENT;

export const AUDIO_CLIP_HEIGHT = 40; // Height of each stacked clip row
export const AUDIO_CLIP_PADDING = 4; // Top padding for the first clip
export const AUDIO_CLIP_GAP = 2; // Gap between stacked clips

interface TrimState {
  trimStart: number;
  trimEnd: number;
  timestamp: number;
}

interface AudioTimelineClipProps {
  clip: AudioReference;
  layerClips: AudioReference[];
  layerId: string;
  pixelsPerSecond: number;
  onUpdateTimestamp: (id: string, newTime: number, layerId: string, newDepth?: number) => void;
  onUpdateTrim: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }, layerId: string) => void;
  onRemove: (id: string, layerId: string) => void;
  onToggleMute?: (id: string, layerId: string) => void;
  isSelected?: boolean;
  onSelect?: (id: string, shiftKey: boolean, layerId: string) => void;
  depth?: number; // Vertical stacking depth (0 = bottom row)
  // Silent update methods (no history - visual only during drag)
  onUpdateTimestampSilent?: (id: string, newTime: number, layerId: string, newDepth?: number) => void;
  onUpdateTrimSilent?: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }, layerId: string) => void;
  // Commit methods (single history entry for entire drag operation)
  onCommitMove?: (id: string, layerId: string, initialTimestamp: number, finalTimestamp: number, initialDepth?: number, finalDepth?: number) => void;
  onCommitTrim?: (id: string, layerId: string, initialState: TrimState, finalState: { trimStart?: number; trimEnd?: number; timestamp?: number }) => void;
}

export function AudioTimelineClip({
  clip,
  layerClips,
  layerId,
  pixelsPerSecond,
  onUpdateTimestamp,
  onUpdateTrim,
  onRemove,
  onToggleMute,
  isSelected,
  onSelect,
  depth = 0,
  onUpdateTimestampSilent,
  onUpdateTrimSilent,
  onCommitMove,
  onCommitTrim,
}: AudioTimelineClipProps) {
  const clipRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isPositionInvalid, setIsPositionInvalid] = useState(false);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const initialTimestamp = useRef(0);
  const initialDepth = useRef(0);
  const pendingTimestamp = useRef(0);

  const isPositionValidOrAutoTrimmable = useAudioTimelineStore((state) => state.isPositionValidOrAutoTrimmable);
  const updateAudioTimestampWithAutoTrim = useAudioTimelineStore((state) => state.updateAudioTimestampWithAutoTrim);

  const contextMenu = useContextMenuStore();
  const showContextMenu = contextMenu.isOpen && contextMenu.clipId === clip.id && contextMenu.clipType === 'audio';

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
      clipType: 'audio',
      layerId,
    });
    onSelect?.(clip.id, false, layerId);
  };

  // Calculate visible duration after trimming
  const trimStart = clip.trimStart ?? 0;
  const trimEnd = clip.trimEnd ?? 0;
  const visibleDuration = clip.duration - trimStart - trimEnd;

  const handleMouseDown = (e: React.MouseEvent) => {
    console.log('[AudioTimelineClip] handleMouseDown fired', { clipId: clip.id, layerId, timestamp: clip.timestamp, depth });
    e.preventDefault();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    initialTimestamp.current = clip.timestamp;
    initialDepth.current = depth;

    let currentDepth = depth;
    let finalDepth = depth;
    pendingTimestamp.current = clip.timestamp;

    const handleMouseMove = (e: MouseEvent) => {
      // Horizontal movement -> timestamp change
      const deltaX = e.clientX - dragStartX.current;
      const deltaTime = deltaX / pixelsPerSecond;
      const newTimestamp = snapToGrid(Math.max(0, initialTimestamp.current + deltaTime));
      console.log('[AudioTimelineClip] handleMouseMove', { deltaX, deltaTime, newTimestamp, clipId: clip.id });

      // Store the pending timestamp for auto-trim on release
      pendingTimestamp.current = newTimestamp;

      // Check if the position would be valid within this layer (including auto-trim resolution)
      // Pass the current depth so clips at different depths don't show as invalid
      const valid = isPositionValidOrAutoTrimmable(clip.id, newTimestamp, clip.duration, layerId, clip.trimStart, clip.trimEnd, currentDepth);
      setIsPositionInvalid(!valid);

      // Vertical movement -> depth change
      const deltaY = e.clientY - dragStartY.current;
      const depthChange = Math.round(deltaY / (AUDIO_CLIP_HEIGHT + AUDIO_CLIP_GAP));
      const newDepth = Math.max(0, initialDepth.current + depthChange);

      // Track final depth for commit
      finalDepth = newDepth;

      // Update both timestamp and depth together
      // Use silent update during drag (no history) if available, otherwise fallback
      if (newDepth !== currentDepth) {
        currentDepth = newDepth;
        console.log('[AudioTimelineClip] calling onUpdateTimestamp (with depth)', { clipId: clip.id, newTimestamp, layerId, newDepth });
        if (onUpdateTimestampSilent) {
          onUpdateTimestampSilent(clip.id, newTimestamp, layerId, newDepth);
        } else {
          onUpdateTimestamp(clip.id, newTimestamp, layerId, newDepth);
        }
      } else {
        console.log('[AudioTimelineClip] calling onUpdateTimestamp', { clipId: clip.id, newTimestamp, layerId });
        if (onUpdateTimestampSilent) {
          onUpdateTimestampSilent(clip.id, newTimestamp, layerId);
        } else {
          onUpdateTimestamp(clip.id, newTimestamp, layerId);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsPositionInvalid(false);

      // Get current layer ID from store to handle potential layer ID changes during drag
      const store = useAudioTimelineStore.getState();
      const currentLayer = store.audioLayers.find((l) => l.clips.some((c) => c.id === clip.id));
      const currentLayerId = currentLayer?.id ?? layerId;

      // Commit the move with a single history entry if commit method is available
      if (onCommitMove) {
        onCommitMove(clip.id, currentLayerId, initialTimestamp.current, pendingTimestamp.current, initialDepth.current, finalDepth);
      }

      // Apply auto-trim if needed on release
      updateAudioTimestampWithAutoTrim(clip.id, pendingTimestamp.current, currentLayerId);
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

    // Calculate max extension based on adjacent clips in this layer at the same depth
    const timelineClips: TimelineClipType[] = layerClips.map((c) => ({
      id: c.id,
      timestamp: c.timestamp,
      duration: c.duration,
      trimStart: c.trimStart,
      trimEnd: c.trimEnd,
      depth: c.depth,
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
        onUpdateTrimSilent(clip.id, { trimStart: clampedTrimStart, timestamp: finalTimestamp }, layerId);
      } else {
        onUpdateTrim(clip.id, { trimStart: clampedTrimStart, timestamp: finalTimestamp }, layerId);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);

      // Commit the trim with a single history entry if commit method is available
      if (onCommitTrim) {
        onCommitTrim(clip.id, layerId, initialTrimState, { trimStart: finalTrimStart, timestamp: finalTimestamp });
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

    // Calculate max extension based on adjacent clips in this layer at the same depth
    const timelineClips: TimelineClipType[] = layerClips.map((c) => ({
      id: c.id,
      timestamp: c.timestamp,
      duration: c.duration,
      trimStart: c.trimStart,
      trimEnd: c.trimEnd,
      depth: c.depth,
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
        onUpdateTrimSilent(clip.id, { trimEnd: clampedTrimEnd }, layerId);
      } else {
        onUpdateTrim(clip.id, { trimEnd: clampedTrimEnd }, layerId);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);

      // Commit the trim with a single history entry if commit method is available
      if (onCommitTrim) {
        onCommitTrim(clip.id, layerId, initialTrimState, { trimEnd: finalTrimEnd });
      }

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
          ? 'bg-blue-600 ring-2 ring-white'
          : 'bg-blue-600'
      } ${isDragging ? 'cursor-grabbing opacity-80' : ''} ${isResizing ? 'opacity-90' : ''} ${clip.muted ? 'opacity-50' : ''}`}
      style={{ left: `${left}px`, width: `${width}px`, minWidth: '20px', top: `${top}px`, height: `${AUDIO_CLIP_HEIGHT}px` }}
      onContextMenu={handleContextMenu}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(clip.id, e.shiftKey, layerId);
      }}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-blue-700 hover:bg-blue-500 rounded-l-md"
        onMouseDown={handleLeftResize}
      />

      {/* Clip content */}
      <div
        className="flex-1 flex items-center justify-between px-3 cursor-grab min-w-0"
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-1 flex-1 min-w-0">
          {clip.muted ? (
            <VolumeX size={12} className="text-red-400 flex-shrink-0" />
          ) : (
            <Music size={12} className="text-white/80 flex-shrink-0" />
          )}
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
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-blue-700 hover:bg-blue-500 rounded-r-md"
        onMouseDown={handleRightResize}
      />

      {/* Context menu */}
      {showContextMenu && (
        <div
          className="fixed bg-gray-800 border border-gray-600 rounded shadow-lg py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y, transform: 'translateY(-100%)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-4 py-1 text-left text-sm text-white hover:bg-gray-700"
            onClick={() => {
              onToggleMute?.(clip.id, layerId);
              contextMenu.closeContextMenu();
            }}
          >
            {clip.muted ? 'Unmute' : 'Mute'}
          </button>
          <button
            className="w-full px-4 py-1 text-left text-sm text-white hover:bg-gray-700 rounded"
            onClick={() => {
              onRemove(clip.id, layerId);
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
