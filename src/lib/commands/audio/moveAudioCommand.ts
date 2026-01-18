import { Command, CommandType } from '../types';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';

interface MoveAudioParams {
  clipId: string;
  layerId: string;
  newTimestamp: number;
}

export function createMoveAudioCommand(params: MoveAudioParams): Command {
  const { clipId, layerId, newTimestamp } = params;

  // Capture original timestamp at command creation time
  const store = useAudioTimelineStore.getState();
  const layer = store.audioLayers.find((l) => l.id === layerId);
  const clip = layer?.clips.find((c) => c.id === clipId);

  if (!clip) {
    throw new Error(`Audio clip with id ${clipId} not found in layer ${layerId}`);
  }

  const originalTimestamp = clip.timestamp;

  return {
    id: crypto.randomUUID(),
    description: `Move audio clip`,
    timestamp: Date.now(),
    type: 'audio:move' as CommandType,

    execute() {
      const currentStore = useAudioTimelineStore.getState();
      useAudioTimelineStore.setState({
        audioLayers: currentStore.audioLayers.map((l) =>
          l.id === layerId
            ? {
                ...l,
                clips: l.clips.map((c) =>
                  c.id === clipId ? { ...c, timestamp: Math.max(0, newTimestamp) } : c
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
                  c.id === clipId ? { ...c, timestamp: originalTimestamp } : c
                ),
              }
            : l
        ),
        isDirty: true,
      });
    },
  };
}
