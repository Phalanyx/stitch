import { Command, CommandType } from '../types';
import { useTimelineStore } from '@/stores/timelineStore';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { useClipboardStore, ClipboardClip } from '@/stores/clipboardStore';

interface BatchPasteParams {
  playheadPosition: number;
}

interface PastedClipInfo {
  type: 'video' | 'audio';
  id: string;
  layerId?: string;
}

export function createBatchPasteCommand(params: BatchPasteParams): Command {
  const { playheadPosition } = params;

  // Get clipboard contents at command creation time
  const clipboardClips = useClipboardStore.getState().getClips();

  if (clipboardClips.length === 0) {
    throw new Error('Clipboard is empty');
  }

  // Generate new IDs for all clips being pasted
  const pastedClips: PastedClipInfo[] = clipboardClips.map((clip) => ({
    type: clip.type,
    id: crypto.randomUUID(),
    layerId: clip.type === 'audio' ? clip.layerId : undefined,
  }));

  // Store clip data with new IDs for execute/undo
  const clipData = clipboardClips.map((clip, index) => ({
    ...clip,
    newId: pastedClips[index].id,
    timestamp: playheadPosition + clip.relativeOffset,
  }));

  return {
    id: crypto.randomUUID(),
    description: `Paste ${clipboardClips.length} clip${clipboardClips.length > 1 ? 's' : ''}`,
    timestamp: Date.now(),
    type: 'batch:paste' as CommandType,

    execute() {
      const audioStore = useAudioTimelineStore.getState();

      // Add video clips
      const videoClipsToAdd = clipData.filter((c) => c.type === 'video');
      if (videoClipsToAdd.length > 0) {
        const videoState = useTimelineStore.getState();
        useTimelineStore.setState({
          clips: [
            ...videoState.clips,
            ...videoClipsToAdd.map((clip) => ({
              id: clip.newId,
              videoId: clip.sourceId || clip.newId,
              url: clip.url,
              duration: clip.duration,
              timestamp: clip.timestamp,
              trimStart: clip.trimStart,
              trimEnd: clip.trimEnd,
            })),
          ],
          isDirty: true,
        });
      }

      // Add audio clips
      const audioClipsToAdd = clipData.filter((c) => c.type === 'audio');
      if (audioClipsToAdd.length > 0) {
        // Group by target layer
        const clipsByLayer = new Map<string, typeof audioClipsToAdd>();

        for (const clip of audioClipsToAdd) {
          // Try to use original layer, fallback to first layer
          let targetLayerId = clip.layerId;
          if (!targetLayerId || !audioStore.audioLayers.some((l) => l.id === targetLayerId)) {
            targetLayerId = audioStore.audioLayers[0]?.id;
          }
          if (!targetLayerId) continue;

          const existing = clipsByLayer.get(targetLayerId) || [];
          existing.push(clip);
          clipsByLayer.set(targetLayerId, existing);
        }

        const currentAudioState = useAudioTimelineStore.getState();
        useAudioTimelineStore.setState({
          audioLayers: currentAudioState.audioLayers.map((layer) => {
            const clipsForLayer = clipsByLayer.get(layer.id);
            if (!clipsForLayer) return layer;

            return {
              ...layer,
              clips: [
                ...layer.clips,
                ...clipsForLayer.map((clip) => ({
                  id: clip.newId,
                  audioId: clip.sourceId || clip.newId,
                  url: clip.url,
                  duration: clip.duration,
                  timestamp: clip.timestamp,
                  trimStart: clip.trimStart,
                  trimEnd: clip.trimEnd,
                })),
              ],
            };
          }),
          isDirty: true,
        });
      }
    },

    undo() {
      // Remove pasted video clips
      const videoIdsToRemove = new Set(
        pastedClips.filter((c) => c.type === 'video').map((c) => c.id)
      );
      if (videoIdsToRemove.size > 0) {
        const videoState = useTimelineStore.getState();
        useTimelineStore.setState({
          clips: videoState.clips.filter((c) => !videoIdsToRemove.has(c.id)),
          isDirty: true,
        });
      }

      // Remove pasted audio clips
      const audioIdsToRemove = new Set(
        pastedClips.filter((c) => c.type === 'audio').map((c) => c.id)
      );
      if (audioIdsToRemove.size > 0) {
        const audioState = useAudioTimelineStore.getState();
        useAudioTimelineStore.setState({
          audioLayers: audioState.audioLayers.map((layer) => ({
            ...layer,
            clips: layer.clips.filter((c) => !audioIdsToRemove.has(c.id)),
          })),
          isDirty: true,
        });
      }
    },
  };
}
