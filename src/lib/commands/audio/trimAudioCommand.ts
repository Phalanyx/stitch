import { Command, CommandType } from '../types';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { CommandExecutionError } from '../errors';

interface TrimAudioParams {
  clipId: string;
  layerId: string;
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

export function createTrimAudioCommand(params: TrimAudioParams): Command {
  const { clipId, layerId, updates, originalValues: providedOriginalValues } = params;

  // Use provided original values or capture from current state
  let originalValues: { trimStart: number; trimEnd: number; timestamp: number };

  if (providedOriginalValues !== undefined) {
    originalValues = providedOriginalValues;
  } else {
    const store = useAudioTimelineStore.getState();
    const layer = store.audioLayers.find((l) => l.id === layerId);
    const clip = layer?.clips.find((c) => c.id === clipId);

    if (!clip) {
      throw new CommandExecutionError(`Audio clip with id ${clipId} not found in layer ${layerId}`, 'audio:trim');
    }

    originalValues = {
      trimStart: clip.trimStart ?? 0,
      trimEnd: clip.trimEnd ?? 0,
      timestamp: clip.timestamp,
    };
  }

  return {
    id: crypto.randomUUID(),
    description: `Trim audio clip`,
    timestamp: Date.now(),
    type: 'audio:trim' as CommandType,

    execute() {
      const currentStore = useAudioTimelineStore.getState();
      useAudioTimelineStore.setState({
        audioLayers: currentStore.audioLayers.map((l) =>
          l.id === layerId
            ? {
                ...l,
                clips: l.clips.map((c) =>
                  c.id === clipId
                    ? {
                        ...c,
                        trimStart: updates.trimStart ?? c.trimStart,
                        trimEnd: updates.trimEnd ?? c.trimEnd,
                        timestamp: updates.timestamp ?? c.timestamp,
                      }
                    : c
                ),
              }
            : l
        ),
        isDirty: true,
      });
    },

    undo() {
      const currentStore = useAudioTimelineStore.getState();
      useAudioTimelineStore.setState({
        audioLayers: currentStore.audioLayers.map((l) =>
          l.id === layerId
            ? {
                ...l,
                clips: l.clips.map((c) =>
                  c.id === clipId
                    ? {
                        ...c,
                        trimStart: originalValues.trimStart,
                        trimEnd: originalValues.trimEnd,
                        timestamp: originalValues.timestamp,
                      }
                    : c
                ),
              }
            : l
        ),
        isDirty: true,
      });
    },
  };
}
