import { Command, CommandType } from '../types';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { CommandExecutionError } from '../errors';

interface MoveAudioParams {
  clipId: string;
  layerId: string;
  newTimestamp: number;
  newDepth?: number;  // Optional depth change
  originalTimestamp?: number; // If provided, use this for undo instead of current state
  originalDepth?: number; // If provided, use this for undo instead of current state
}

export function createMoveAudioCommand(params: MoveAudioParams): Command {
  const { clipId, layerId, newTimestamp, newDepth, originalTimestamp: providedOriginalTimestamp, originalDepth: providedOriginalDepth } = params;

  // Use provided original values or capture from current state
  let originalTimestamp: number;
  let originalDepth: number | undefined;

  if (providedOriginalTimestamp !== undefined) {
    originalTimestamp = providedOriginalTimestamp;
    originalDepth = providedOriginalDepth;
  } else {
    // Capture original state - search across all layers to handle layer changes
    const store = useAudioTimelineStore.getState();

    // First try the specified layer, then search all layers
    let layer = store.audioLayers.find((l) => l.id === layerId);
    let clip = layer?.clips.find((c) => c.id === clipId);

    // If not found in specified layer, search all layers
    if (!clip) {
      for (const l of store.audioLayers) {
        const found = l.clips.find((c) => c.id === clipId);
        if (found) {
          clip = found;
          layer = l;
          break;
        }
      }
    }

    if (!clip || !layer) {
      throw new CommandExecutionError(`Audio clip ${clipId} not found`, 'audio:move');
    }

    originalTimestamp = clip.timestamp;
    originalDepth = clip.depth;
  }

  return {
    id: crypto.randomUUID(),
    description: `Move audio clip`,
    timestamp: Date.now(),
    type: 'audio:move' as CommandType,

    execute() {
      const currentStore = useAudioTimelineStore.getState();
      // Find current layer containing the clip (may have changed)
      const currentLayer = currentStore.audioLayers.find((l) =>
        l.clips.some((c) => c.id === clipId)
      );
      if (!currentLayer) {
        throw new CommandExecutionError(`Audio clip ${clipId} not found in any layer`, 'audio:move');
      }

      const newLayers = currentStore.audioLayers.map((l) =>
        l.id === currentLayer.id
          ? {
              ...l,
              clips: l.clips.map((c) =>
                c.id === clipId
                  ? {
                      ...c,
                      timestamp: Math.max(0, newTimestamp),
                      ...(newDepth !== undefined ? { depth: newDepth } : {}),
                    }
                  : c
              ),
            }
          : l
      );
      useAudioTimelineStore.setState({
        audioLayers: newLayers,
        isDirty: true,
      });
    },

    undo() {
      const currentStore = useAudioTimelineStore.getState();
      const currentLayer = currentStore.audioLayers.find((l) =>
        l.clips.some((c) => c.id === clipId)
      );
      if (!currentLayer) {
        throw new CommandExecutionError(`Audio clip ${clipId} not found in any layer during undo`, 'audio:move');
      }

      useAudioTimelineStore.setState({
        audioLayers: currentStore.audioLayers.map((l) =>
          l.id === currentLayer.id
            ? {
                ...l,
                clips: l.clips.map((c) =>
                  c.id === clipId
                    ? {
                        ...c,
                        timestamp: originalTimestamp,
                        ...(originalDepth !== undefined ? { depth: originalDepth } : {}),
                      }
                    : c
                ),
              }
            : l
        ),
        isDirty: true,
      });
    },
  };
}
