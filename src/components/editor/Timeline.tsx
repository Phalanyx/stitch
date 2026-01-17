'use client';

import { useRef } from 'react';
import { TimelineClip } from './TimelineClip';
import { VideoReference } from '@/types/video';

interface TimelineProps {
  clips: VideoReference[];
  onUpdateTimestamp: (id: string, newTime: number) => void;
  onRemove: (id: string) => void;
}

const PIXELS_PER_SECOND = 50;

export function Timeline({ clips, onUpdateTimestamp, onRemove }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate total timeline width based on clips
  const maxEndTime = clips.reduce((max, clip) => {
    const endTime = clip.timestamp + clip.duration;
    return endTime > max ? endTime : max;
  }, 10); // Minimum 10 seconds

  const timelineWidth = maxEndTime * PIXELS_PER_SECOND + 200; // Extra padding

  // Generate time markers
  const markers = [];
  for (let i = 0; i <= maxEndTime + 2; i++) {
    markers.push(i);
  }

  return (
    <div className="bg-gray-900 border-t border-gray-700 h-32 overflow-x-auto">
      <div
        ref={containerRef}
        className="relative h-full"
        style={{ width: `${timelineWidth}px` }}
      >
        {/* Time markers */}
        <div className="absolute top-0 left-0 right-0 h-6 flex border-b border-gray-700">
          {markers.map((second) => (
            <div
              key={second}
              className="absolute text-xs text-gray-400"
              style={{ left: `${second * PIXELS_PER_SECOND}px` }}
            >
              <div className="h-2 w-px bg-gray-600" />
              <span className="ml-1">{second}s</span>
            </div>
          ))}
        </div>

        {/* Clips track */}
        <div className="absolute top-6 left-0 right-0 bottom-0">
          {clips.map((clip) => (
            <TimelineClip
              key={clip.id}
              clip={clip}
              pixelsPerSecond={PIXELS_PER_SECOND}
              onUpdateTimestamp={onUpdateTimestamp}
              onRemove={onRemove}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
