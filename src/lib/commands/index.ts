// Types
export * from './types';

// Video commands
export { createAddVideoCommand } from './video/addVideoCommand';
export { createRemoveVideoCommand } from './video/removeVideoCommand';
export { createMoveVideoCommand } from './video/moveVideoCommand';
export { createTrimVideoCommand } from './video/trimVideoCommand';

// Audio commands
export { createAddAudioCommand } from './audio/addAudioCommand';
export { createRemoveAudioCommand } from './audio/removeAudioCommand';
export { createMoveAudioCommand } from './audio/moveAudioCommand';
export { createTrimAudioCommand } from './audio/trimAudioCommand';

// Layer commands - mute toggle still works in single track mode
export { createToggleMuteCommand } from './layer/toggleMuteCommand';

// Deprecated layer commands (no-ops in single track mode)
/** @deprecated Single audio track mode - this command is a no-op */
export { createAddLayerCommand } from './layer/addLayerCommand';
/** @deprecated Single audio track mode - this command is a no-op */
export { createRemoveLayerCommand } from './layer/removeLayerCommand';
/** @deprecated Single audio track mode - this command is a no-op */
export { createRenameLayerCommand } from './layer/renameLayerCommand';

// Batch commands
export { createBatchDeleteCommand } from './batch/batchDeleteCommand';
export { createBatchPasteCommand } from './batch/batchPasteCommand';
