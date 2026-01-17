'use client';

import { useRef, useState, useEffect } from 'react';
import { Film, Music, Plus, Volume2, VolumeX, Trash2 } from 'lucide-react';
import { TimelineClip } from './TimelineClip';
import { AudioTimelineClip } from './AudioTimelineClip';
import { VideoReference } from '@/types/video';
import { AudioLayer } from '@/types/audio';

interface TimelineProps {
  clips: VideoReference[];
  audioLayers?: AudioLayer[];
  activeLayerId?: string | null;
  onUpdateTimestamp: (id: string, newTime: number) => void;
  onUpdateTrim?: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }) => void;
  onRemove: (id: string) => void;
  onUpdateAudioTimestamp?: (id: string, newTime: number, layerId?: string) => void;
  onUpdateAudioTrim?: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }, layerId?: string) => void;
  onRemoveAudio?: (id: string, layerId?: string) => void;
  onDropVideo?: (video: { id: string; url: string; duration?: number; timestamp: number }) => void;
  onDropAudio?: (audio: { id: string; url: string; duration?: number; timestamp: number }, layerId: string) => void;
  onSetActiveLayer?: (layerId: string) => void;
  onAddLayer?: () => void;
  onToggleLayerMute?: (layerId: string) => void;
  onRenameLayer?: (layerId: string, name: string) => void;
  onCleanupEmptyLayers?: () => void;
  onAddLayerWithAudio?: (audio: { id: string; url: string; duration?: number }, timestamp: number) => void;
  onRemoveLayer?: (layerId: string) => void;
  currentTime: number;
  onSeek: (time: number) => void;
}

const PIXELS_PER_SECOND = 50;
const DEFAULT_TRACK_LABEL_WIDTH = 120;
const MIN_TRACK_LABEL_WIDTH = 80;
const MAX_TRACK_LABEL_WIDTH = 250;
const AUDIO_TRACK_HEIGHT = 64; // h-16
const VIDEO_TRACK_HEIGHT = 80; // h-20
const TIME_MARKERS_HEIGHT = 24; // h-6
const ADD_BUTTON_HEIGHT = 32; // h-8
const SNAP_INCREMENT = 0.05;
const snapToGrid = (time: number): number => Math.round(time / SNAP_INCREMENT) * SNAP_INCREMENT;

export function Timeline({
  clips = [],
  audioLayers = [],
  activeLayerId,
  onUpdateTimestamp,
  onUpdateTrim,
  onRemove,
  onUpdateAudioTimestamp,
  onUpdateAudioTrim,
  onRemoveAudio,
  onDropVideo,
  onDropAudio,
  onSetActiveLayer,
  onAddLayer,
  onToggleLayerMute,
  onRenameLayer,
  onCleanupEmptyLayers,
  onAddLayerWithAudio,
  onRemoveLayer,
  currentTime,
  onSeek,
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingOverVideo, setIsDraggingOverVideo] = useState(false);
  const [isDraggingOverAudio, setIsDraggingOverAudio] = useState<Record<string, boolean>>({});
  const [containerWidth, setContainerWidth] = useState(0);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState('');
  const [isDraggingOverNewTrack, setIsDraggingOverNewTrack] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedClipType, setSelectedClipType] = useState<'video' | 'audio' | null>(null);
  const [trackLabelWidth, setTrackLabelWidth] = useState(DEFAULT_TRACK_LABEL_WIDTH);
  const [isResizingTrackLabel, setIsResizingTrackLabel] = useState(false);

  // Calculate dynamic height based on number of audio layers (include add button row)
  const tracksHeight = TIME_MARKERS_HEIGHT + VIDEO_TRACK_HEIGHT + (audioLayers.length * AUDIO_TRACK_HEIGHT);
  const totalHeight = tracksHeight + ADD_BUTTON_HEIGHT;

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

  // Keyboard handler for delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipId) {
        e.preventDefault();
        if (selectedClipType === 'video') {
          onRemove(selectedClipId);
        } else if (selectedClipType === 'audio') {
          onRemoveAudio?.(selectedClipId);
        }
        setSelectedClipId(null);
        setSelectedClipType(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId, selectedClipType, onRemove, onRemoveAudio]);

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

  const handleAudioDragOver = (layerId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingOverAudio((prev) => ({ ...prev, [layerId]: true }));
  };

  const handleAudioDragLeave = (layerId: string) => () => {
    setIsDraggingOverAudio((prev) => ({ ...prev, [layerId]: false }));
  };

  const handleAudioDrop = (layerId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverAudio((prev) => ({ ...prev, [layerId]: false }));
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'audio') {
        const rect = e.currentTarget.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        const timestamp = dropX / PIXELS_PER_SECOND;
        onDropAudio?.({ ...data, timestamp }, layerId);
      }
    } catch (err) {
      console.error('Failed to parse drop data:', err);
    }
  };

  const handleLayerNameDoubleClick = (layerId: string, currentName: string) => {
    setEditingLayerId(layerId);
    setEditingLayerName(currentName);
  };

  const handleLayerNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingLayerName(e.target.value);
  };

  const handleLayerNameBlur = () => {
    if (editingLayerId && editingLayerName.trim()) {
      onRenameLayer?.(editingLayerId, editingLayerName.trim());
    }
    setEditingLayerId(null);
    setEditingLayerName('');
  };

  const handleLayerNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleLayerNameBlur();
    } else if (e.key === 'Escape') {
      setEditingLayerId(null);
      setEditingLayerName('');
    }
  };

  const handleNewTrackDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingOverNewTrack(true);
  };

  const handleNewTrackDragLeave = () => {
    setIsDraggingOverNewTrack(false);
  };

  const handleNewTrackDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverNewTrack(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'audio') {
        const rect = e.currentTarget.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        const timestamp = dropX / PIXELS_PER_SECOND;
        onAddLayerWithAudio?.({ id: data.id, url: data.url, duration: data.duration }, timestamp);
      }
    } catch (err) {
      console.error('Failed to parse drop data:', err);
    }
  };

  const handleSetActiveLayer = (layerId: string) => {
    onSetActiveLayer?.(layerId);
  };

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
          className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-blue-500 z-10"
          onMouseDown={() => setIsResizingTrackLabel(true)}
        />
        {/* Time markers spacer */}
        <div className="border-b border-gray-700" style={{ height: `${TIME_MARKERS_HEIGHT}px` }} />

        {/* Video track label */}
        <div
          className="flex items-center justify-center border-b border-gray-700 gap-1"
          style={{ height: `${VIDEO_TRACK_HEIGHT}px` }}
        >
          <Film size={14} className="text-blue-400" />
          <span className="text-xs text-gray-400">Video</span>
        </div>

        {/* Audio track labels */}
        {audioLayers.map((layer) => (
          <div
            key={layer.id}
            className={`flex items-center px-1 border-b border-gray-700 gap-1 cursor-pointer ${
              activeLayerId === layer.id ? 'bg-green-900/30' : ''
            }`}
            style={{ height: `${AUDIO_TRACK_HEIGHT}px` }}
            onClick={() => handleSetActiveLayer(layer.id)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleLayerMute?.(layer.id);
              }}
              className={`p-1 rounded hover:bg-gray-700 flex-shrink-0 ${layer.muted ? 'text-red-400' : 'text-green-400'}`}
              title={layer.muted ? 'Unmute layer' : 'Mute layer'}
            >
              {layer.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
            </button>
            {audioLayers.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveLayer?.(layer.id);
                }}
                className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-red-400 flex-shrink-0"
                title="Delete layer"
              >
                <Trash2 size={12} />
              </button>
            )}
            {editingLayerId === layer.id ? (
              <input
                type="text"
                value={editingLayerName}
                onChange={handleLayerNameChange}
                onBlur={handleLayerNameBlur}
                onKeyDown={handleLayerNameKeyDown}
                className="flex-1 text-xs bg-gray-800 text-white px-1 rounded border border-gray-600 focus:outline-none focus:border-green-500 min-w-0"
                autoFocus
              />
            ) : (
              <span
                className={`text-xs truncate flex-1 min-w-0 ${layer.muted ? 'text-gray-500' : 'text-gray-400'}`}
                onDoubleClick={() => handleLayerNameDoubleClick(layer.id, layer.name)}
                title={`${layer.name} (double-click to rename)`}
              >
                {layer.name}
              </span>
            )}
          </div>
        ))}

        {/* Add layer button row */}
        <div
          className={`flex items-center justify-center border-b border-gray-700 transition-colors ${
            isDraggingOverNewTrack ? 'bg-green-500/20' : ''
          }`}
          style={{ height: `${ADD_BUTTON_HEIGHT}px` }}
          onDragOver={handleNewTrackDragOver}
          onDragLeave={handleNewTrackDragLeave}
          onDrop={handleNewTrackDrop}
        >
          <button
            onClick={onAddLayer}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-green-400"
            title="Add audio layer"
          >
            <Plus size={14} />
          </button>
        </div>
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
                className="absolute text-xs text-gray-400 pointer-events-none"
                style={{ left: `${second * PIXELS_PER_SECOND}px` }}
              >
                <div className="h-2 w-px bg-gray-600" />
                <span className="ml-1">{second}s</span>
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
              isDraggingOverVideo ? 'bg-blue-500/20' : ''
            }`}
            style={{ top: `${TIME_MARKERS_HEIGHT}px`, height: `${VIDEO_TRACK_HEIGHT}px` }}
            onDragOver={handleVideoDragOver}
            onDragLeave={handleVideoDragLeave}
            onDrop={handleVideoDrop}
            onClick={() => {
              setSelectedClipId(null);
              setSelectedClipType(null);
            }}
          >
            {clips.map((clip) => (
              <TimelineClip
                key={clip.id}
                clip={clip}
                pixelsPerSecond={PIXELS_PER_SECOND}
                onUpdateTimestamp={onUpdateTimestamp}
                onUpdateTrim={onUpdateTrim!}
                onRemove={onRemove}
                isSelected={selectedClipId === clip.id && selectedClipType === 'video'}
                onSelect={(id) => {
                  setSelectedClipId(id);
                  setSelectedClipType('video');
                }}
              />
            ))}
          </div>

          {/* Audio tracks */}
          {audioLayers.map((layer, index) => (
            <div
              key={layer.id}
              className={`absolute left-0 right-0 border-b border-gray-700 transition-colors ${
                isDraggingOverAudio[layer.id] ? 'bg-green-500/20' : ''
              } ${activeLayerId === layer.id ? 'bg-green-900/10' : ''} ${
                layer.muted ? 'opacity-50' : ''
              }`}
              style={{
                top: `${TIME_MARKERS_HEIGHT + VIDEO_TRACK_HEIGHT + (index * AUDIO_TRACK_HEIGHT)}px`,
                height: `${AUDIO_TRACK_HEIGHT}px`,
              }}
              onDragOver={handleAudioDragOver(layer.id)}
              onDragLeave={handleAudioDragLeave(layer.id)}
              onDrop={handleAudioDrop(layer.id)}
              onClick={() => {
                setSelectedClipId(null);
                setSelectedClipType(null);
              }}
            >
              {layer.clips.map((clip) => (
                <AudioTimelineClip
                  key={clip.id}
                  clip={clip}
                  layerId={layer.id}
                  pixelsPerSecond={PIXELS_PER_SECOND}
                  onUpdateTimestamp={onUpdateAudioTimestamp!}
                  onUpdateTrim={onUpdateAudioTrim!}
                  onRemove={onRemoveAudio!}
                  isSelected={selectedClipId === clip.id && selectedClipType === 'audio'}
                  onSelect={(id) => {
                    setSelectedClipId(id);
                    setSelectedClipType('audio');
                  }}
                />
              ))}
            </div>
          ))}

          {/* Drop zone row for adding new track with audio */}
          <div
            className={`absolute left-0 right-0 border-b border-gray-700 transition-colors ${
              isDraggingOverNewTrack ? 'bg-green-500/20' : ''
            }`}
            style={{
              top: `${tracksHeight}px`,
              height: `${ADD_BUTTON_HEIGHT}px`,
            }}
            onDragOver={handleNewTrackDragOver}
            onDragLeave={handleNewTrackDragLeave}
            onDrop={handleNewTrackDrop}
          />
        </div>
      </div>
    </div>
  );
}
