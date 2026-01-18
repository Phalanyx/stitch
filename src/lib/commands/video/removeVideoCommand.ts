import { Command, CommandType } from '../types';
import { useTimelineStore } from '@/stores/timelineStore';
import { VideoReference } from '@/types/video';

interface RemoveVideoParams {
  clipId: string;
}

export function createRemoveVideoCommand(params: RemoveVideoParams): Command {
  const { clipId } = params;

  // Capture the clip state at command creation time
  const store = useTimelineStore.getState();
  const clipSnapshot = store.clips.find((c) => c.id === clipId);

  if (!clipSnapshot) {
    throw new Error(`Clip with id ${clipId} not found`);
  }

  // Deep copy the clip to preserve state
  const savedClip: VideoReference = { ...clipSnapshot };

  return {
    id: crypto.randomUUID(),
    description: `Remove video clip`,
    timestamp: Date.now(),
    type: 'video:remove' as CommandType,

    execute() {
      const currentStore = useTimelineStore.getState();
      useTimelineStore.setState({
        clips: currentStore.clips.filter((c) => c.id !== clipId),
        isDirty: true,
      });
    },

    undo() {
      const currentStore = useTimelineStore.getState();
      useTimelineStore.setState({
        clips: [...currentStore.clips, savedClip],
        isDirty: true,
      });
    },
  };
}
