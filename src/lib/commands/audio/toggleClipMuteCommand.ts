import { Command } from '../types';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { CommandExecutionError } from '../errors';

interface ToggleClipMuteParams {
  clipId: string;
  layerId: string;
}

export function createToggleClipMuteCommand(params: ToggleClipMuteParams): Command {
  const { clipId, layerId } = params;

  // Validate layer and clip exist
  const store = useAudioTimelineStore.getState();
  const layer = store.audioLayers.find((l) => l.id === layerId);
  if (!layer) {
    throw new CommandExecutionError(`Layer ${layerId} not found`, 'audio:toggleClipMute');
  }
  const clip = layer.clips.find((c) => c.id === clipId);
  if (!clip) {
    throw new CommandExecutionError(`Clip ${clipId} not found in layer ${layerId}`, 'audio:toggleClipMute');
  }

  return {
    id: crypto.randomUUID(),
    description: `Toggle clip mute`,
    timestamp: Date.now(),
    type: 'audio:toggleClipMute',

    execute() {
      const store = useAudioTimelineStore.getState();
      useAudioTimelineStore.setState({
        audioLayers: store.audioLayers.map((l) =>
          l.id === layerId
            ? {
                ...l,
                clips: l.clips.map((c) =>
                  c.id === clipId ? { ...c, muted: !c.muted } : c
                ),
              }
            : l
        ),
        isDirty: true,
      });
    },

    undo() {
      // Toggle mute is its own inverse
      const store = useAudioTimelineStore.getState();
      useAudioTimelineStore.setState({
        audioLayers: store.audioLayers.map((l) =>
          l.id === layerId
            ? {
                ...l,
                clips: l.clips.map((c) =>
                  c.id === clipId ? { ...c, muted: !c.muted } : c
                ),
              }
            : l
        ),
        isDirty: true,
      });
    },
  };
}
