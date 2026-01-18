import { Command, CommandType } from '../types';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { AudioReference } from '@/types/audio';

interface RemoveAudioParams {
  clipId: string;
  layerId: string;
}

export function createRemoveAudioCommand(params: RemoveAudioParams): Command {
  const { clipId, layerId } = params;

  // Capture the clip state at command creation time
  const store = useAudioTimelineStore.getState();
  const layer = store.audioLayers.find((l) => l.id === layerId);
  const clipSnapshot = layer?.clips.find((c) => c.id === clipId);

  if (!clipSnapshot) {
    throw new Error(`Audio clip with id ${clipId} not found in layer ${layerId}`);
  }

  // Deep copy the clip to preserve state
  const savedClip: AudioReference = { ...clipSnapshot };

  return {
    id: crypto.randomUUID(),
    description: `Remove audio clip`,
    timestamp: Date.now(),
    type: 'audio:remove' as CommandType,

    execute() {
      const currentStore = useAudioTimelineStore.getState();
      useAudioTimelineStore.setState({
        audioLayers: currentStore.audioLayers.map((l) =>
          l.id === layerId
            ? { ...l, clips: l.clips.filter((c) => c.id !== clipId) }
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
            ? { ...l, clips: [...l.clips, savedClip] }
            : l
        ),
        isDirty: true,
      });
    },
  };
}
