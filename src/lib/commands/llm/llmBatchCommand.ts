import { Command, CommandType } from '../types';
import { useTimelineStore } from '@/stores/timelineStore';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { VideoReference } from '@/types/video';
import { AudioLayer } from '@/types/audio';

interface LLMBatchParams {
  description: string;
  beforeClips: VideoReference[];
  afterClips: VideoReference[];
  beforeAudioLayers: AudioLayer[];
  afterAudioLayers: AudioLayer[];
}

export function createLLMBatchCommand(params: LLMBatchParams): Command {
  const { description, beforeClips, afterClips, beforeAudioLayers, afterAudioLayers } = params;

  return {
    id: crypto.randomUUID(),
    description,
    timestamp: Date.now(),
    type: 'llm:batch' as CommandType,

    execute() {
      // Redo: restore "after" state
      useTimelineStore.setState({
        clips: [...afterClips],
        isDirty: true,
      });
      useAudioTimelineStore.setState({
        audioLayers: afterAudioLayers.map(layer => ({
          ...layer,
          clips: [...layer.clips],
        })),
        isDirty: true,
      });
    },

    undo() {
      // Undo: restore "before" state
      useTimelineStore.setState({
        clips: [...beforeClips],
        isDirty: true,
      });
      useAudioTimelineStore.setState({
        audioLayers: beforeAudioLayers.map(layer => ({
          ...layer,
          clips: [...layer.clips],
        })),
        isDirty: true,
      });
    },
  };
}
