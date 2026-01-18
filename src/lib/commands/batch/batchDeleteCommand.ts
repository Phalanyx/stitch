import { Command, CommandType } from '../types';
import { useTimelineStore } from '@/stores/timelineStore';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { VideoReference } from '@/types/video';
import { AudioReference } from '@/types/audio';

interface AudioClipInfo {
  id: string;
  layerId: string;
}

interface BatchDeleteParams {
  videoClipIds: string[];
  audioClips: AudioClipInfo[];
}

export function createBatchDeleteCommand(params: BatchDeleteParams): Command {
  const { videoClipIds, audioClips } = params;

  // Capture snapshots of all clips at command creation time
  const videoStore = useTimelineStore.getState();
  const audioStore = useAudioTimelineStore.getState();

  // Snapshot video clips
  const savedVideoClips: VideoReference[] = videoClipIds
    .map((id) => videoStore.clips.find((c) => c.id === id))
    .filter((c): c is VideoReference => c !== undefined)
    .map((c) => ({ ...c }));

  // Snapshot audio clips with their layer info
  const savedAudioClips: { clip: AudioReference; layerId: string }[] = audioClips
    .map(({ id, layerId }) => {
      const layer = audioStore.audioLayers.find((l) => l.id === layerId);
      const clip = layer?.clips.find((c) => c.id === id);
      return clip ? { clip: { ...clip }, layerId } : null;
    })
    .filter((c): c is { clip: AudioReference; layerId: string } => c !== null);

  const totalCount = savedVideoClips.length + savedAudioClips.length;
  if (totalCount === 0) {
    throw new Error('No clips found to delete');
  }

  return {
    id: crypto.randomUUID(),
    description: `Delete ${totalCount} clip${totalCount > 1 ? 's' : ''}`,
    timestamp: Date.now(),
    type: 'batch:delete' as CommandType,

    execute() {
      // Remove video clips
      if (savedVideoClips.length > 0) {
        const videoState = useTimelineStore.getState();
        const idsToRemove = new Set(savedVideoClips.map((c) => c.id));
        useTimelineStore.setState({
          clips: videoState.clips.filter((c) => !idsToRemove.has(c.id)),
          isDirty: true,
        });
      }

      // Remove audio clips
      if (savedAudioClips.length > 0) {
        const audioState = useAudioTimelineStore.getState();
        const audioIdsToRemove = new Set(savedAudioClips.map((c) => c.clip.id));
        useAudioTimelineStore.setState({
          audioLayers: audioState.audioLayers.map((layer) => ({
            ...layer,
            clips: layer.clips.filter((c) => !audioIdsToRemove.has(c.id)),
          })),
          isDirty: true,
        });
      }
    },

    undo() {
      // Restore video clips
      if (savedVideoClips.length > 0) {
        const videoState = useTimelineStore.getState();
        useTimelineStore.setState({
          clips: [...videoState.clips, ...savedVideoClips],
          isDirty: true,
        });
      }

      // Restore audio clips to their original layers
      if (savedAudioClips.length > 0) {
        const audioState = useAudioTimelineStore.getState();
        useAudioTimelineStore.setState({
          audioLayers: audioState.audioLayers.map((layer) => {
            const clipsToRestore = savedAudioClips
              .filter((c) => c.layerId === layer.id)
              .map((c) => c.clip);
            if (clipsToRestore.length > 0) {
              return { ...layer, clips: [...layer.clips, ...clipsToRestore] };
            }
            return layer;
          }),
          isDirty: true,
        });
      }
    },
  };
}
