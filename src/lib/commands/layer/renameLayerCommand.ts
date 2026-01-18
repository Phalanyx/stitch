import { Command, CommandType } from '../types';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';

interface RenameLayerParams {
  layerId: string;
  newName: string;
}

export function createRenameLayerCommand(params: RenameLayerParams): Command {
  const { layerId, newName } = params;

  // Capture original name at command creation time
  const store = useAudioTimelineStore.getState();
  const layer = store.audioLayers.find((l) => l.id === layerId);

  if (!layer) {
    throw new Error(`Layer with id ${layerId} not found`);
  }

  const originalName = layer.name;

  return {
    id: crypto.randomUUID(),
    description: `Rename audio layer`,
    timestamp: Date.now(),
    type: 'layer:rename' as CommandType,

    execute() {
      const currentStore = useAudioTimelineStore.getState();
      useAudioTimelineStore.setState({
        audioLayers: currentStore.audioLayers.map((l) =>
          l.id === layerId ? { ...l, name: newName } : l
        ),
        isDirty: true,
      });
    },

    undo() {
      const currentStore = useAudioTimelineStore.getState();
      useAudioTimelineStore.setState({
        audioLayers: currentStore.audioLayers.map((l) =>
          l.id === layerId ? { ...l, name: originalName } : l
        ),
        isDirty: true,
      });
    },
  };
}
