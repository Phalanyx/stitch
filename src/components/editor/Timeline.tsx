'use client';

import { useRef, useState, useEffect } from 'react';
import { Film, Music } from 'lucide-react';
import { TimelineClip } from './TimelineClip';
import { AudioTimelineClip } from './AudioTimelineClip';
import { VideoReference } from '@/types/video';
import { AudioReference } from '@/types/audio';

interface TimelineProps {
  clips: VideoReference[];
  audioClips?: AudioReference[];
  onUpdateTimestamp: (id: string, newTime: number) => void;
  onUpdateTrim?: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }) => void;
  onRemove: (id: string) => void;
  onUpdateAudioTimestamp?: (id: string, newTime: number) => void;
  onUpdateAudioTrim?: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }) => void;
  onRemoveAudio?: (id: string) => void;
  onDropVideo?: (video: { id: string; url: string; duration?: number; timestamp: number }) => void;
  onDropAudio?: (audio: { id: string; url: string; duration?: number; timestamp: number }) => void;
  currentTime: number;
  onSeek: (time: number) => void;
}

const PIXELS_PER_SECOND = 50;
const TRACK_LABEL_WIDTH = 48;
const SNAP_INCREMENT = 0.05;
const snapToGrid = (time: number): number => Math.round(time / SNAP_INCREMENT) * SNAP_INCREMENT;

export function Timeline({
  clips = [],
  audioClips = [],
  onUpdateTimestamp,
  onUpdateTrim,
  onRemove,
  onUpdateAudioTimestamp,
  onUpdateAudioTrim,
  onRemoveAudio,
  onDropVideo,
  onDropAudio,
  currentTime,
  onSeek,
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDraggingOverVideo, setIsDraggingOverVideo] = useState(false);
  const [isDraggingOverAudio, setIsDraggingOverAudio] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

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
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'audio') {
        const rect = e.currentTarget.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        const timestamp = dropX / PIXELS_PER_SECOND;
        onDropAudio?.({ ...data, timestamp });
      }
    } catch (err) {
      console.error('Failed to parse drop data:', err);
    }
  };

  // Calculate total timeline width based on both video and audio clips (accounting for trim)
  const videoMaxEndTime = clips.reduce((max, clip) => {
    const trimStart = clip.trimStart ?? 0;
    const trimEnd = clip.trimEnd ?? 0;
    const visibleDuration = clip.duration - trimStart - trimEnd;
    const endTime = clip.timestamp + visibleDuration;
    return endTime > max ? endTime : max;
  }, 0);

  const audioMaxEndTime = audioClips.reduce((max, clip) => {
    const trimStart = clip.trimStart ?? 0;
    const trimEnd = clip.trimEnd ?? 0;
    const visibleDuration = clip.duration - trimStart - trimEnd;
    const endTime = clip.timestamp + visibleDuration;
    return endTime > max ? endTime : max;
  }, 0);

  const maxEndTime = Math.max(videoMaxEndTime, audioMaxEndTime);

  // Calculate if we need scrolling (account for track label width)
  const availableWidth = containerWidth - TRACK_LABEL_WIDTH;
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
    <div className="bg-gray-900 border-t border-gray-700 h-48 flex">
      {/* Track labels */}
      <div className="flex-shrink-0 border-r border-gray-700" style={{ width: `${TRACK_LABEL_WIDTH}px` }}>
        <div className="h-6 border-b border-gray-700" />
        <div className="h-20 flex items-center justify-center border-b border-gray-700">
          <Film size={16} className="text-blue-400" />
        </div>
        <div className="h-16 flex items-center justify-center">
          <Music size={16} className="text-green-400" />
        </div>
      </div>

      {/* Timeline content */}
      <div ref={scrollContainerRef} className={`flex-1 ${needsScroll ? 'overflow-x-auto' : 'overflow-x-hidden'}`}>
        <div
          ref={containerRef}
          className="relative h-full"
          style={{ width: `${timelineWidth}px` }}
        >
          {/* Time markers - clickable for seeking */}
          <div
            className="absolute top-0 left-0 right-0 h-6 flex border-b border-gray-700 cursor-pointer"
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

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white z-20 cursor-ew-resize"
            style={{ left: `${currentTime * PIXELS_PER_SECOND}px` }}
            onMouseDown={() => setIsDraggingPlayhead(true)}
          >
            <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full" />
          </div>

          {/* Video track */}
          <div
            className={`absolute top-6 left-0 right-0 h-20 border-b border-gray-700 transition-colors ${
              isDraggingOverVideo ? 'bg-blue-500/20' : ''
            }`}
            onDragOver={handleVideoDragOver}
            onDragLeave={handleVideoDragLeave}
            onDrop={handleVideoDrop}
          >
            {clips.map((clip) => (
              <TimelineClip
                key={clip.id}
                clip={clip}
                pixelsPerSecond={PIXELS_PER_SECOND}
                onUpdateTimestamp={onUpdateTimestamp}
                onUpdateTrim={onUpdateTrim!}
                onRemove={onRemove}
              />
            ))}
          </div>

          {/* Audio track */}
          <div
            className={`absolute top-[104px] left-0 right-0 h-16 transition-colors ${
              isDraggingOverAudio ? 'bg-green-500/20' : ''
            }`}
            onDragOver={handleAudioDragOver}
            onDragLeave={handleAudioDragLeave}
            onDrop={handleAudioDrop}
          >
            {audioClips.map((clip) => (
              <AudioTimelineClip
                key={clip.id}
                clip={clip}
                pixelsPerSecond={PIXELS_PER_SECOND}
                onUpdateTimestamp={onUpdateAudioTimestamp!}
                onUpdateTrim={onUpdateAudioTrim!}
                onRemove={onRemoveAudio!}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
