import { Command, CommandType } from '../types';
import { useTimelineStore } from '@/stores/timelineStore';

interface TrimVideoParams {
  clipId: string;
  updates: {
    trimStart?: number;
    trimEnd?: number;
    timestamp?: number;
  };
  originalValues?: {
    trimStart: number;
    trimEnd: number;
    timestamp: number;
  };
}

export function createTrimVideoCommand(params: TrimVideoParams): Command {
  const { clipId, updates, originalValues: providedOriginalValues } = params;

  // Use provided original values or capture from current state
  let originalValues: { trimStart: number; trimEnd: number; timestamp: number };

  if (providedOriginalValues !== undefined) {
    originalValues = providedOriginalValues;
  } else {
    const store = useTimelineStore.getState();
    const clip = store.clips.find((c) => c.id === clipId);

    if (!clip) {
      throw new Error(`Clip with id ${clipId} not found`);
    }

    originalValues = {
      trimStart: clip.trimStart ?? 0,
      trimEnd: clip.trimEnd ?? 0,
      timestamp: clip.timestamp,
    };
  }

  return {
    id: crypto.randomUUID(),
    description: `Trim video clip`,
    timestamp: Date.now(),
    type: 'video:trim' as CommandType,

    execute() {
      const currentStore = useTimelineStore.getState();
      useTimelineStore.setState({
        clips: currentStore.clips.map((c) =>
          c.id === clipId
            ? {
                ...c,
                trimStart: updates.trimStart ?? c.trimStart,
                trimEnd: updates.trimEnd ?? c.trimEnd,
                timestamp: updates.timestamp ?? c.timestamp,
              }
            : c
        ),
        isDirty: true,
      });
    },

    undo() {
      const currentStore = useTimelineStore.getState();
      useTimelineStore.setState({
        clips: currentStore.clips.map((c) =>
          c.id === clipId
            ? {
                ...c,
                trimStart: originalValues.trimStart,
                trimEnd: originalValues.trimEnd,
                timestamp: originalValues.timestamp,
              }
            : c
        ),
        isDirty: true,
      });
    },
  };
}
