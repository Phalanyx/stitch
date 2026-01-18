import { Command, CommandType } from '../types';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { AudioLayer } from '@/types/audio';

interface AddLayerParams {
  layerId: string;
  name: string;
}

export function createAddLayerCommand(params: AddLayerParams): Command {
  const { layerId, name } = params;

  return {
    id: crypto.randomUUID(),
    description: `Add audio layer`,
    timestamp: Date.now(),
    type: 'layer:add' as CommandType,

    execute() {
      const store = useAudioTimelineStore.getState();

      const newLayer: AudioLayer = {
        id: layerId,
        name,
        clips: [],
        muted: false,
      };

      useAudioTimelineStore.setState({
        audioLayers: [...store.audioLayers, newLayer],
        activeLayerId: layerId,
        isDirty: true,
      });
    },

    undo() {
      const store = useAudioTimelineStore.getState();
      const newLayers = store.audioLayers.filter((l) => l.id !== layerId);

      // Don't remove the last layer
      if (newLayers.length === 0) return;

      const newActiveLayerId =
        store.activeLayerId === layerId
          ? newLayers[0]?.id ?? null
          : store.activeLayerId;

      useAudioTimelineStore.setState({
        audioLayers: newLayers,
        activeLayerId: newActiveLayerId,
        isDirty: true,
      });
    },
  };
}
