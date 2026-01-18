import { Command, CommandType } from '../types';

interface RenameLayerParams {
  layerId: string;
  newName: string;
}

/**
 * @deprecated Single audio track mode - layers are no longer supported.
 * This command is a no-op and exists only for backwards compatibility.
 */
export function createRenameLayerCommand(_params: RenameLayerParams): Command {
  return {
    id: crypto.randomUUID(),
    description: `Rename audio layer (no-op)`,
    timestamp: Date.now(),
    type: 'layer:rename' as CommandType,

    execute() {
      // No-op: Single audio track mode - track is always named "Audio"
    },

    undo() {
      // No-op: Nothing to undo
    },
  };
}
