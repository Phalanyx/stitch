import { Command, CommandType } from '../types';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { AudioReference } from '@/types/audio';
import { assertLayerExists } from '../errors';

interface AddAudioParams {
  audio: { id: string; url: string; duration?: number };
  clipId: string;
  layerId: string;
  timestamp?: number;
}

export function createAddAudioCommand(params: AddAudioParams): Command {
  const { audio, clipId, layerId, timestamp } = params;

  return {
    id: crypto.randomUUID(),
    description: `Add audio clip`,
    timestamp: Date.now(),
    type: 'audio:add' as CommandType,

    execute() {
      const store = useAudioTimelineStore.getState();
      const targetLayer = assertLayerExists(store.audioLayers, layerId, 'audio:add');

      // Calculate timestamp: if provided use it, otherwise add at end
      let newTimestamp: number;
      if (timestamp !== undefined) {
        newTimestamp = Math.max(0, timestamp);
      } else {
        const lastClip = targetLayer.clips[targetLayer.clips.length - 1];
        newTimestamp = lastClip
          ? lastClip.timestamp + (lastClip.duration - (lastClip.trimStart ?? 0) - (lastClip.trimEnd ?? 0))
          : 0;
      }

      const newClip: AudioReference = {
        id: clipId,
        audioId: audio.id,
        url: audio.url,
        timestamp: newTimestamp,
        duration: audio.duration || 5,
      };

      useAudioTimelineStore.setState({
        audioLayers: store.audioLayers.map((l) =>
          l.id === layerId
            ? { ...l, clips: [...l.clips, newClip] }
            : l
        ),
        isDirty: true,
      });
    },

    undo() {
      const store = useAudioTimelineStore.getState();
      useAudioTimelineStore.setState({
        audioLayers: store.audioLayers.map((l) =>
          l.id === layerId
            ? { ...l, clips: l.clips.filter((c) => c.id !== clipId) }
            : l
        ),
        isDirty: true,
      });
    },
  };
}
