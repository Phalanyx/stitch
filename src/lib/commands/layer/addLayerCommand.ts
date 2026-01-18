import { Command, CommandType } from '../types';

interface AddLayerParams {
  layerId: string;
  name: string;
}

/**
 * @deprecated Single audio track mode - layers are no longer supported.
 * This command is a no-op and exists only for backwards compatibility.
 */
export function createAddLayerCommand(_params: AddLayerParams): Command {
  return {
    id: crypto.randomUUID(),
    description: `Add audio layer (no-op)`,
    timestamp: Date.now(),
    type: 'layer:add' as CommandType,

    execute() {
      // No-op: Single audio track mode - cannot add layers
    },

    undo() {
      // No-op: Nothing to undo
    },
  };
}
