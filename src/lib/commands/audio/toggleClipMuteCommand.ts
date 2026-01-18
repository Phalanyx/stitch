import { Command, CommandType } from '../types';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';

interface ToggleClipMuteParams {
  clipId: string;
  layerId: string;
}

export function createToggleClipMuteCommand(params: ToggleClipMuteParams): Command {
  const { clipId, layerId } = params;

  return {
    id: crypto.randomUUID(),
    description: `Toggle clip mute`,
    timestamp: Date.now(),
    type: 'audio:toggleClipMute' as CommandType,

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
