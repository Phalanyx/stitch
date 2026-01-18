import { Command, CommandType } from '../types';
import { useTimelineStore } from '@/stores/timelineStore';

interface MoveVideoParams {
  clipId: string;
  newTimestamp: number;
  originalTimestamp?: number; // If provided, use this for undo instead of current state
}

export function createMoveVideoCommand(params: MoveVideoParams): Command {
  const { clipId, newTimestamp, originalTimestamp: providedOriginalTimestamp } = params;

  // Use provided original timestamp or capture from current state
  let originalTimestamp: number;
  if (providedOriginalTimestamp !== undefined) {
    originalTimestamp = providedOriginalTimestamp;
  } else {
    const store = useTimelineStore.getState();
    const clip = store.clips.find((c) => c.id === clipId);

    if (!clip) {
      throw new Error(`Clip with id ${clipId} not found`);
    }

    originalTimestamp = clip.timestamp;
  }

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
