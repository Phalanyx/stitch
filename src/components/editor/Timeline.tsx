'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Film, Music, Volume2, VolumeX } from 'lucide-react';
import { TimelineClip } from './TimelineClip';
import { AudioTimelineClip, AUDIO_CLIP_HEIGHT, AUDIO_CLIP_PADDING, AUDIO_CLIP_GAP } from './AudioTimelineClip';
import { VideoReference } from '@/types/video';
import { AudioLayer } from '@/types/audio';
import { useSelectionStore, SelectedClip } from '@/stores/selectionStore';

interface TimelineProps {
  clips: VideoReference[];
  audioLayers?: AudioLayer[];
  activeLayerId?: string | null;
  onUpdateTimestamp: (id: string, newTime: number) => void;
  onUpdateTrim?: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }) => void;
  onRemove: (id: string) => void;
  onUpdateAudioTimestamp?: (id: string, newTime: number, layerId?: string, newDepth?: number) => void;
  onUpdateAudioTrim?: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }, layerId?: string) => void;
  onRemoveAudio?: (id: string, layerId?: string) => void;
  onDropVideo?: (video: { id: string; url: string; duration?: number; timestamp: number }) => void;
  onDropAudio?: (audio: { id: string; url: string; duration?: number; timestamp: number }, layerId: string) => void;
  onToggleLayerMute?: (layerId: string) => void;
  currentTime: number;
  onSeek: (time: number) => void;
}

const PIXELS_PER_SECOND = 50;
const DEFAULT_TRACK_LABEL_WIDTH = 120;
const MIN_TRACK_LABEL_WIDTH = 80;
const MAX_TRACK_LABEL_WIDTH = 250;
const MIN_AUDIO_TRACK_HEIGHT = 64; // Minimum height for audio track
const VIDEO_TRACK_HEIGHT = 80; // h-20
const TIME_MARKERS_HEIGHT = 24; // h-6
const SNAP_INCREMENT = 0.05;
const snapToGrid = (time: number): number => Math.round(time / SNAP_INCREMENT) * SNAP_INCREMENT;

// Helper function to calculate depth for overlapping clips
function calculateClipDepths(clips: { id: string; timestamp: number; duration: number; trimStart?: number; trimEnd?: number; depth?: number }[]): Map<string, number> {
  const depthMap = new Map<string, number>();

  // First pass: assign explicit depths
  const clipsWithExplicitDepth = clips.filter(c => c.depth !== undefined);
  const clipsWithoutDepth = clips.filter(c => c.depth === undefined);

  for (const clip of clipsWithExplicitDepth) {
    depthMap.set(clip.id, clip.depth!);
  }

  // Second pass: auto-assign remaining clips to available depths
  // Sort clips without explicit depth by timestamp
  const sortedClips = [...clipsWithoutDepth].sort((a, b) => a.timestamp - b.timestamp);

  // Track the end times for each depth level (including explicit clips)
  const depthEndTimes: number[] = [];

  // Initialize depth end times from explicit depth clips
  for (const clip of clipsWithExplicitDepth) {
    const trimStart = clip.trimStart ?? 0;
    const trimEnd = clip.trimEnd ?? 0;
    const visibleDuration = clip.duration - trimStart - trimEnd;
    const clipEnd = clip.timestamp + visibleDuration;
    const d = clip.depth!;
    // Ensure array is long enough
    while (depthEndTimes.length <= d) {
      depthEndTimes.push(0);
    }
    // Track the latest end time at this depth
    depthEndTimes[d] = Math.max(depthEndTimes[d], clipEnd);
  }

  for (const clip of sortedClips) {
    const trimStart = clip.trimStart ?? 0;
    const trimEnd = clip.trimEnd ?? 0;
    const visibleDuration = clip.duration - trimStart - trimEnd;
    const clipStart = clip.timestamp;
    const clipEnd = clipStart + visibleDuration;

    // Find the lowest depth where this clip doesn't overlap
    let assignedDepth = 0;
    for (let d = 0; d < depthEndTimes.length; d++) {
      if (depthEndTimes[d] <= clipStart) {
        assignedDepth = d;
        break;
      }
      assignedDepth = d + 1;
    }

    // Assign the depth and update end time
    depthMap.set(clip.id, assignedDepth);
    // Ensure array is long enough
    while (depthEndTimes.length <= assignedDepth) {
      depthEndTimes.push(0);
    }
    depthEndTimes[assignedDepth] = clipEnd;
  }

  return depthMap;
}

export function Timeline({
  clips = [],
  audioLayers = [],
  onUpdateTimestamp,
  onUpdateTrim,
  onRemove,
  onUpdateAudioTimestamp,
  onUpdateAudioTrim,
  onRemoveAudio,
  onDropVideo,
  onDropAudio,
  onToggleLayerMute,
  currentTime,
  onSeek,
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingOverVideo, setIsDraggingOverVideo] = useState(false);
  const [isDraggingOverAudio, setIsDraggingOverAudio] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [trackLabelWidth, setTrackLabelWidth] = useState(DEFAULT_TRACK_LABEL_WIDTH);

  // Selection store
  const { selectedClips, selectClip, clearSelection, selectRange, lastSelectedId, isSelected } = useSelectionStore();
  const [isResizingTrackLabel, setIsResizingTrackLabel] = useState(false);

  // Get the single audio layer (there's only one in single track mode)
  const audioLayer = audioLayers[0];
  const audioClips = audioLayer?.clips ?? [];

  // Calculate depths for overlapping clips
  const clipDepths = useMemo(() => calculateClipDepths(audioClips), [audioClips]);

  // Calculate max depth to determine track height
  const maxDepth = useMemo(() => {
    let max = 0;
    for (const depth of clipDepths.values()) {
      if (depth > max) max = depth;
    }
    return max;
  }, [clipDepths]);

  // Calculate dynamic audio track height based on number of stacked clips
  const audioTrackHeight = Math.max(
    MIN_AUDIO_TRACK_HEIGHT,
    AUDIO_CLIP_PADDING + (maxDepth + 1) * (AUDIO_CLIP_HEIGHT + AUDIO_CLIP_GAP) + AUDIO_CLIP_PADDING
  );

  // Calculate dynamic height for the timeline
  const tracksHeight = TIME_MARKERS_HEIGHT + VIDEO_TRACK_HEIGHT + audioTrackHeight;
  const totalHeight = tracksHeight;

  // Measure container width on mount and resize
  useEffect(() => {
    const updateWidth = () => {
      if (scrollContainerRef.current) {
        setContainerWidth(scrollContainerRef.current.clientWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Playhead dragging
  useEffect(() => {
    if (!isDraggingPlayhead) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = Math.max(0, snapToGrid(x / PIXELS_PER_SECOND));
      onSeek(time);
    };

    const handleMouseUp = () => {
      setIsDraggingPlayhead(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingPlayhead, onSeek]);

  // Keyboard handler for delete - moved to useUndoRedo hook for batch delete support

  // Track label resize dragging
  useEffect(() => {
    if (!isResizingTrackLabel) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_TRACK_LABEL_WIDTH, Math.max(MIN_TRACK_LABEL_WIDTH, e.clientX));
      setTrackLabelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingTrackLabel(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingTrackLabel]);

  const handleVideoDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingOverVideo(true);
  };

  const handleVideoDragLeave = () => {
    setIsDraggingOverVideo(false);
  };

  const handleVideoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverVideo(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'video') {
        const rect = e.currentTarget.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        const timestamp = dropX / PIXELS_PER_SECOND;
        onDropVideo?.({ ...data, timestamp });
        // If video has linked audio, also add it to the first audio layer at the same timestamp
        if (data.audio && audioLayers.length > 0) {
          onDropAudio?.({
            id: data.audio.id,
            url: data.audio.url,
            duration: data.audio.duration,
            timestamp,
          }, audioLayers[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to parse drop data:', err);
    }
  };

  const handleAudioDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingOverAudio(true);
  };

  const handleAudioDragLeave = () => {
    setIsDraggingOverAudio(false);
  };

  const handleAudioDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverAudio(false);
    if (!audioLayer) return;
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'audio') {
        const rect = e.currentTarget.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        const timestamp = dropX / PIXELS_PER_SECOND;
        onDropAudio?.({ ...data, timestamp }, audioLayer.id);
      }
    } catch (err) {
      console.error('Failed to parse drop data:', err);
    }
  };

  // Get all clips (video and audio) sorted by timestamp for range selection
  const allClipsSorted = useMemo(() => {
    const allClips: (SelectedClip & { timestamp: number })[] = [
      ...clips.map((c) => ({ id: c.id, type: 'video' as const, timestamp: c.timestamp })),
      ...audioLayers.flatMap((layer) =>
        layer.clips.map((c) => ({ id: c.id, type: 'audio' as const, layerId: layer.id, timestamp: c.timestamp }))
      ),
    ];
    return allClips.sort((a, b) => a.timestamp - b.timestamp);
  }, [clips, audioLayers]);

  // Handle video clip selection with shift+click support
  const handleVideoSelect = useCallback((id: string, shiftKey: boolean) => {
    if (shiftKey && lastSelectedId) {
      // Range selection: select all clips between lastSelectedId and clicked clip
      const lastIndex = allClipsSorted.findIndex((c) => c.id === lastSelectedId);
      const currentIndex = allClipsSorted.findIndex((c) => c.id === id);
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        // Filter to only video clips in range
        const rangeClips = allClipsSorted
          .slice(start, end + 1)
          .filter((c) => c.type === 'video')
          .map(({ timestamp, ...clip }) => clip);
        selectRange(rangeClips);
        return;
      }
    }
    selectClip({ id, type: 'video' }, shiftKey);
  }, [allClipsSorted, lastSelectedId, selectClip, selectRange]);

  // Handle audio clip selection with shift+click support
  const handleAudioSelect = useCallback((id: string, shiftKey: boolean, layerId: string) => {
    if (shiftKey && lastSelectedId) {
      // Range selection: select all clips between lastSelectedId and clicked clip
      const lastIndex = allClipsSorted.findIndex((c) => c.id === lastSelectedId);
      const currentIndex = allClipsSorted.findIndex((c) => c.id === id);
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        // Filter to only audio clips in range
        const rangeClips = allClipsSorted
          .slice(start, end + 1)
          .filter((c) => c.type === 'audio')
          .map(({ timestamp, ...clip }) => clip);
        selectRange(rangeClips);
        return;
      }
    }
    selectClip({ id, type: 'audio', layerId }, shiftKey);
  }, [allClipsSorted, lastSelectedId, selectClip, selectRange]);

  // Calculate total timeline width based on both video and audio clips (accounting for trim)
  const videoMaxEndTime = clips.reduce((max, clip) => {
    const trimStart = clip.trimStart ?? 0;
    const trimEnd = clip.trimEnd ?? 0;
    const visibleDuration = clip.duration - trimStart - trimEnd;
    const endTime = clip.timestamp + visibleDuration;
    return endTime > max ? endTime : max;
  }, 0);

  const audioMaxEndTime = audioLayers.reduce((layerMax, layer) => {
    const layerEndTime = layer.clips.reduce((max, clip) => {
      const trimStart = clip.trimStart ?? 0;
      const trimEnd = clip.trimEnd ?? 0;
      const visibleDuration = clip.duration - trimStart - trimEnd;
      const endTime = clip.timestamp + visibleDuration;
      return endTime > max ? endTime : max;
    }, 0);
    return layerEndTime > layerMax ? layerEndTime : layerMax;
  }, 0);

  const maxEndTime = Math.max(videoMaxEndTime, audioMaxEndTime);

  // Calculate if we need scrolling (account for track label width)
  const availableWidth = containerWidth - trackLabelWidth;
  const needsScroll = maxEndTime * PIXELS_PER_SECOND > availableWidth;

  // Timeline fills container exactly, or expands for clips
  const timelineWidth = needsScroll
    ? (maxEndTime + 10) * PIXELS_PER_SECOND  // Extra space when scrolling
    : availableWidth;

  // Generate markers to fill the timeline
  const timelineSeconds = timelineWidth / PIXELS_PER_SECOND;

  // Generate time markers to fill the entire timeline
  const markers = [];
  for (let i = 0; i <= Math.ceil(timelineSeconds); i++) {
    markers.push(i);
  }

  return (
    <div className="bg-gray-900 border-t border-gray-700 flex" style={{ height: `${totalHeight}px` }}>
      {/* Track labels */}
      <div className="flex-shrink-0 border-r border-gray-700 relative" style={{ width: `${trackLabelWidth}px` }}>
        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-slate-500 z-10"
          onMouseDown={() => setIsResizingTrackLabel(true)}
        />
        {/* Time markers spacer */}
        <div className="border-b border-gray-700" style={{ height: `${TIME_MARKERS_HEIGHT}px` }} />

        {/* Video track label */}
        <div
          className="flex items-center justify-center border-b border-gray-700 gap-1"
          style={{ height: `${VIDEO_TRACK_HEIGHT}px` }}
        >
          <Film size={14} className="text-slate-400" />
          <span className="text-xs text-gray-400">Video</span>
        </div>

        {/* Single audio track label */}
        {audioLayer && (
          <div
            className="flex items-center px-1 border-b border-gray-700 gap-1 bg-violet-900/30"
            style={{ height: `${audioTrackHeight}px` }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleLayerMute?.(audioLayer.id);
              }}
              className={`p-1 rounded hover:bg-gray-700 flex-shrink-0 ${audioLayer.muted ? 'text-red-400' : 'text-violet-400'}`}
              title={audioLayer.muted ? 'Unmute audio' : 'Mute audio'}
            >
              {audioLayer.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            </button>
            <Music size={14} className="text-green-400 flex-shrink-0" />
            <span className={`text-xs truncate flex-1 min-w-0 ${audioLayer.muted ? 'text-gray-500' : 'text-gray-400'}`}>
              Audio
            </span>
          </div>
        )}
      </div>

      {/* Timeline content */}
      <div ref={scrollContainerRef} className={`flex-1 ${needsScroll ? 'overflow-x-auto' : 'overflow-x-hidden'}`}>
        <div
          ref={containerRef}
          className="relative"
          style={{ width: `${timelineWidth}px`, height: `${totalHeight}px` }}
        >
          {/* Time markers - clickable for seeking */}
          <div
            className="absolute top-0 left-0 right-0 flex border-b border-gray-700 cursor-pointer"
            style={{ height: `${TIME_MARKERS_HEIGHT}px` }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const time = snapToGrid(Math.max(0, clickX / PIXELS_PER_SECOND));
              onSeek(time);
            }}
          >
            {markers.map((second) => (
              <div
                key={second}
                className="absolute text-xs text-gray-500 pointer-events-none"
                style={{ left: `${second * PIXELS_PER_SECOND}px` }}
              >
                <div className="h-1.5 w-px bg-gray-700" />
                <span className="ml-0.5">{second}s</span>
              </div>
            ))}
          </div>

          {/* Playhead - only spans the tracks area, not the add button row */}
          <div
            className="absolute top-0 w-0.5 bg-white z-20 cursor-ew-resize"
            style={{ left: `${currentTime * PIXELS_PER_SECOND}px`, height: `${tracksHeight}px` }}
            onMouseDown={() => setIsDraggingPlayhead(true)}
          >
            <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full" />
          </div>

          {/* Video track */}
          <div
            className={`absolute left-0 right-0 border-b border-gray-700 transition-colors ${
              isDraggingOverVideo ? 'bg-slate-500/20' : ''
            }`}
            style={{ top: `${TIME_MARKERS_HEIGHT}px`, height: `${VIDEO_TRACK_HEIGHT}px` }}
            onDragOver={handleVideoDragOver}
            onDragLeave={handleVideoDragLeave}
            onDrop={handleVideoDrop}
            onClick={() => {
              clearSelection();
            }}
          >
            {clips.map((clip) => (
              <TimelineClip
                key={clip.id}
                clip={clip}
                clips={clips}
                pixelsPerSecond={PIXELS_PER_SECOND}
                onUpdateTimestamp={onUpdateTimestamp}
                onUpdateTrim={onUpdateTrim!}
                onRemove={onRemove}
                isSelected={isSelected(clip.id)}
                onSelect={handleVideoSelect}
              />
            ))}
          </div>

          {/* Single audio track with stacked clips */}
          {audioLayer && (
            <div
              className={`absolute left-0 right-0 border-b border-gray-700 transition-colors ${
                isDraggingOverAudio[layer.id] ? 'bg-violet-500/20' : ''
              } ${activeLayerId === layer.id ? 'bg-violet-900/10' : ''} ${
                layer.muted ? 'opacity-50' : ''
              }`}
              style={{
                top: `${TIME_MARKERS_HEIGHT + VIDEO_TRACK_HEIGHT}px`,
                height: `${audioTrackHeight}px`,
              }}
              onDragOver={handleAudioDragOver}
              onDragLeave={handleAudioDragLeave}
              onDrop={handleAudioDrop}
              onClick={() => {
                clearSelection();
              }}
            >
              {audioClips.map((clip) => (
                <AudioTimelineClip
                  key={clip.id}
                  clip={clip}
                  layerId={audioLayer.id}
                  pixelsPerSecond={PIXELS_PER_SECOND}
                  onUpdateTimestamp={onUpdateAudioTimestamp!}
                  onUpdateTrim={onUpdateAudioTrim!}
                  onRemove={onRemoveAudio!}
                  isSelected={isSelected(clip.id)}
                  onSelect={handleAudioSelect}
                  depth={clipDepths.get(clip.id) ?? 0}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
