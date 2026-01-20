import { OperationHandler } from './types';
import {
  handleAddVideo,
  handleRemoveClip,
  handleMoveClip,
  handleTrimClip,
} from './video-handlers';
import {
  handleAddAudio,
  handleRemoveAudio,
  handleMoveAudio,
  handleTrimAudio,
} from './audio-handlers';

export type { ModifyRequest, SessionState, HandlerResult, OperationContext } from './types';

/**
 * Map of operation names to their handlers.
 */
export const operationHandlers: Record<string, OperationHandler> = {
  add_video: handleAddVideo,
  remove_clip: handleRemoveClip,
  move_clip: handleMoveClip,
  trim_clip: handleTrimClip,
  add_audio: handleAddAudio,
  remove_audio: handleRemoveAudio,
  move_audio: handleMoveAudio,
  trim_audio: handleTrimAudio,
};

/**
 * Operations that modify the video track.
 */
export const videoOperations = ['add_video', 'move_clip', 'trim_clip'];

/**
 * Operations that modify the audio track.
 */
export const audioOperations = ['add_audio', 'move_audio', 'trim_audio'];

/**
 * Operations that remove items (cannot create overlaps).
 */
export const removeOperations = ['remove_clip', 'remove_audio'];
