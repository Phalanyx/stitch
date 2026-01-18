import { Command, CommandType } from '../types';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';

interface ToggleMuteParams {
  layerId: string;
}

export function createToggleMuteCommand(params: ToggleMuteParams): Command {
  const { layerId } = params;

  return {
    id: crypto.randomUUID(),
    description: `Toggle layer mute`,
    timestamp: Date.now(),
    type: 'layer:toggleMute' as CommandType,

    execute() {
      const store = useAudioTimelineStore.getState();
      useAudioTimelineStore.setState({
        audioLayers: store.audioLayers.map((l) =>
          l.id === layerId ? { ...l, muted: !l.muted } : l
        ),
        isDirty: true,
      });
    },

    undo() {
      // Toggle mute is its own inverse
      const store = useAudioTimelineStore.getState();
      useAudioTimelineStore.setState({
        audioLayers: store.audioLayers.map((l) =>
          l.id === layerId ? { ...l, muted: !l.muted } : l
        ),
        isDirty: true,
      });
    },
  };
}
