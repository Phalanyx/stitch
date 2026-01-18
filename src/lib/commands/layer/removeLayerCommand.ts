import { Command, CommandType } from '../types';

interface RemoveLayerParams {
  layerId: string;
}

/**
 * @deprecated Single audio track mode - layers are no longer supported.
 * This command is a no-op and exists only for backwards compatibility.
 */
export function createRemoveLayerCommand(_params: RemoveLayerParams): Command {
  return {
    id: crypto.randomUUID(),
    description: `Remove audio layer (no-op)`,
    timestamp: Date.now(),
    type: 'layer:remove' as CommandType,

    execute() {
      // No-op: Single audio track mode - cannot remove the only layer
    },

    undo() {
      // No-op: Nothing to undo
    },
  };
}
