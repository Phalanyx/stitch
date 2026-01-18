import { Command, CommandType } from '../types';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { AudioLayer } from '@/types/audio';

interface RemoveLayerParams {
  layerId: string;
}

export function createRemoveLayerCommand(params: RemoveLayerParams): Command {
  const { layerId } = params;

  // Capture the full layer state at command creation time
  const store = useAudioTimelineStore.getState();
  const layerIndex = store.audioLayers.findIndex((l) => l.id === layerId);
  const layerSnapshot = store.audioLayers[layerIndex];

  if (!layerSnapshot) {
    throw new Error(`Layer with id ${layerId} not found`);
  }

  // Don't allow removing the last layer
  if (store.audioLayers.length <= 1) {
    throw new Error(`Cannot remove the last audio layer`);
  }

  // Deep copy the layer with all its clips
  const savedLayer: AudioLayer = {
    ...layerSnapshot,
    clips: layerSnapshot.clips.map((c) => ({ ...c })),
  };
  const savedIndex = layerIndex;
  const savedActiveLayerId = store.activeLayerId;

  return {
    id: crypto.randomUUID(),
    description: `Remove audio layer`,
    timestamp: Date.now(),
    type: 'layer:remove' as CommandType,

    execute() {
      const currentStore = useAudioTimelineStore.getState();
      const newLayers = currentStore.audioLayers.filter((l) => l.id !== layerId);

      // Don't remove the last layer
      if (newLayers.length === 0) return;

      const newActiveLayerId =
        currentStore.activeLayerId === layerId
          ? newLayers[0]?.id ?? null
          : currentStore.activeLayerId;

      useAudioTimelineStore.setState({
        audioLayers: newLayers,
        activeLayerId: newActiveLayerId,
        isDirty: true,
      });
    },

    undo() {
      const currentStore = useAudioTimelineStore.getState();

      // Restore the layer at its original index
      const newLayers = [...currentStore.audioLayers];
      newLayers.splice(savedIndex, 0, savedLayer);

      useAudioTimelineStore.setState({
        audioLayers: newLayers,
        activeLayerId: savedActiveLayerId,
        isDirty: true,
      });
    },
  };
}
