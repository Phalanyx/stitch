import { Command, CommandType } from '../types';
import { useTimelineStore } from '@/stores/timelineStore';

interface MoveVideoParams {
  clipId: string;
  newTimestamp: number;
}

export function createMoveVideoCommand(params: MoveVideoParams): Command {
  const { clipId, newTimestamp } = params;

  // Capture original timestamp at command creation time
  const store = useTimelineStore.getState();
  const clip = store.clips.find((c) => c.id === clipId);

  if (!clip) {
    throw new Error(`Clip with id ${clipId} not found`);
  }

  const originalTimestamp = clip.timestamp;

  return {
    id: crypto.randomUUID(),
    description: `Move video clip`,
    timestamp: Date.now(),
    type: 'video:move' as CommandType,

    execute() {
      const currentStore = useTimelineStore.getState();
      useTimelineStore.setState({
        clips: currentStore.clips.map((c) =>
          c.id === clipId ? { ...c, timestamp: Math.max(0, newTimestamp) } : c
        ),
        isDirty: true,
      });
    },

    undo() {
      const currentStore = useTimelineStore.getState();
      useTimelineStore.setState({
        clips: currentStore.clips.map((c) =>
          c.id === clipId ? { ...c, timestamp: originalTimestamp } : c
        ),
        isDirty: true,
      });
    },
  };
}
