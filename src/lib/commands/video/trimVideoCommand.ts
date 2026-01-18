import { Command, CommandType } from '../types';
import { useTimelineStore } from '@/stores/timelineStore';

interface TrimVideoParams {
  clipId: string;
  updates: {
    trimStart?: number;
    trimEnd?: number;
    timestamp?: number;
  };
}

export function createTrimVideoCommand(params: TrimVideoParams): Command {
  const { clipId, updates } = params;

  // Capture original trim values at command creation time
  const store = useTimelineStore.getState();
  const clip = store.clips.find((c) => c.id === clipId);

  if (!clip) {
    throw new Error(`Clip with id ${clipId} not found`);
  }

  const originalValues = {
    trimStart: clip.trimStart ?? 0,
    trimEnd: clip.trimEnd ?? 0,
    timestamp: clip.timestamp,
  };

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
