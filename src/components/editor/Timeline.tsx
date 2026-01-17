'use client';

import { useRef } from 'react';
import { Film, Music } from 'lucide-react';
import { TimelineClip } from './TimelineClip';
import { AudioTimelineClip } from './AudioTimelineClip';
import { VideoReference } from '@/types/video';
import { AudioReference } from '@/types/audio';

interface TimelineProps {
  clips: VideoReference[];
  audioClips: AudioReference[];
  onUpdateTimestamp: (id: string, newTime: number) => void;
  onRemove: (id: string) => void;
  onUpdateAudioTimestamp: (id: string, newTime: number) => void;
  onRemoveAudio: (id: string) => void;
}

const PIXELS_PER_SECOND = 50;
const TRACK_LABEL_WIDTH = 48;

export function Timeline({
  clips,
  audioClips,
  onUpdateTimestamp,
  onRemove,
  onUpdateAudioTimestamp,
  onRemoveAudio,
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate total timeline width based on both video and audio clips
  const videoMaxEndTime = clips.reduce((max, clip) => {
    const endTime = clip.timestamp + clip.duration;
    return endTime > max ? endTime : max;
  }, 0);

  const audioMaxEndTime = audioClips.reduce((max, clip) => {
    const endTime = clip.timestamp + clip.duration;
    return endTime > max ? endTime : max;
  }, 0);

  const maxEndTime = Math.max(videoMaxEndTime, audioMaxEndTime, 10); // Minimum 10 seconds
  const timelineWidth = maxEndTime * PIXELS_PER_SECOND + 200; // Extra padding

  // Generate time markers
  const markers = [];
  for (let i = 0; i <= maxEndTime + 2; i++) {
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
      <div className="flex-1 overflow-x-auto">
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

          {/* Video track */}
          <div className="absolute top-6 left-0 right-0 h-20 border-b border-gray-700">
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

          {/* Audio track */}
          <div className="absolute top-[104px] left-0 right-0 h-16">
            {audioClips.map((clip) => (
              <AudioTimelineClip
                key={clip.id}
                clip={clip}
                pixelsPerSecond={PIXELS_PER_SECOND}
                onUpdateTimestamp={onUpdateAudioTimestamp}
                onRemove={onRemoveAudio}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
