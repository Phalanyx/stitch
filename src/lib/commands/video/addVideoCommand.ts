import { Command, CommandType } from '../types';
import { useTimelineStore } from '@/stores/timelineStore';
import { VideoReference } from '@/types/video';

interface AddVideoParams {
  video: { id: string; url: string; duration?: number };
  clipId: string;
  timestamp?: number;
}

export function createAddVideoCommand(params: AddVideoParams): Command {
  const { video, clipId, timestamp } = params;

  return {
    id: crypto.randomUUID(),
    description: `Add video clip`,
    timestamp: Date.now(),
    type: 'video:add' as CommandType,

    execute() {
      const store = useTimelineStore.getState();
      const clips = store.clips;

      // Calculate timestamp: if provided use it, otherwise add at end
      let newTimestamp: number;
      if (timestamp !== undefined) {
        newTimestamp = Math.max(0, timestamp);
      } else {
        const lastClip = clips[clips.length - 1];
        newTimestamp = lastClip
          ? lastClip.timestamp + (lastClip.duration - (lastClip.trimStart ?? 0) - (lastClip.trimEnd ?? 0))
          : 0;
      }

      const newClip: VideoReference = {
        id: clipId,
        videoId: video.id,
        url: video.url,
        timestamp: newTimestamp,
        duration: video.duration || 5,
      };

      useTimelineStore.setState({
        clips: [...clips, newClip],
        isDirty: true,
      });
    },

    undo() {
      const store = useTimelineStore.getState();
      useTimelineStore.setState({
        clips: store.clips.filter((c) => c.id !== clipId),
        isDirty: true,
      });
    },
  };
}
