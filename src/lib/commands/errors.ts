import { AudioLayer } from '@/types/audio';

/**
 * Custom error class for command execution failures.
 * Includes the command type for better error tracking and debugging.
 */
export class CommandExecutionError extends Error {
  constructor(
    message: string,
    public readonly commandType: string
  ) {
    super(message);
    this.name = 'CommandExecutionError';
  }
}

/**
 * Assert that a layer exists in the audio layers array.
 * Throws CommandExecutionError if the layer is not found.
 *
 * @param layers - Array of audio layers to search
 * @param layerId - The ID of the layer to find
 * @param operation - The operation name (for error messages)
 * @throws CommandExecutionError if layer is not found
 */
export function assertLayerExists(
  layers: AudioLayer[],
  layerId: string,
  operation: string
): AudioLayer {
  const layer = layers.find((l) => l.id === layerId);
  if (!layer) {
    throw new CommandExecutionError(
      `Layer with id ${layerId} not found`,
      operation
    );
  }
  return layer;
}

/**
 * Assert that a clip exists in a layer.
 * Throws CommandExecutionError if the clip is not found.
 *
 * @param layer - The audio layer to search
 * @param clipId - The ID of the clip to find
 * @param operation - The operation name (for error messages)
 * @throws CommandExecutionError if clip is not found
 */
export function assertClipExists(
  layer: AudioLayer,
  clipId: string,
  operation: string
): void {
  const clip = layer.clips.find((c) => c.id === clipId);
  if (!clip) {
    throw new CommandExecutionError(
      `Audio clip with id ${clipId} not found in layer ${layer.id}`,
      operation
    );
  }
}
