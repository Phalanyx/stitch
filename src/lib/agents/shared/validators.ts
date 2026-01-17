import { ValidationResult } from './types';

/**
 * Extract a string value from args using multiple possible key names
 */
export function extractString(
  args: Record<string, unknown>,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * Extract a number value from args using multiple possible key names
 */
export function extractNumber(
  args: Record<string, unknown>,
  keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

/**
 * Validate args for add_video_to_timeline tool
 * Accepts: videoId, video_id, id (for ID)
 *          videoName, video_name, name (for name)
 */
export function validateAddVideoArgs(
  args: Record<string, unknown>
): ValidationResult {
  const videoId = extractString(args, ['videoId', 'video_id', 'id']);
  const videoName = extractString(args, ['videoName', 'video_name', 'name', 'video']);
  const timestamp = extractNumber(args, ['timestamp', 'time', 'position', 'at']);

  if (!videoId && !videoName) {
    return { valid: false, error: 'Provide either videoId or videoName' };
  }

  return {
    valid: true,
    parsed: {
      videoId,
      videoName,
      timestamp,
    },
  };
}

/**
 * Validate args for add_audio_to_timeline tool
 * Accepts: audioId, audio_id, id (for ID)
 *          audioName, audio_name, name (for name)
 */
export function validateAddAudioArgs(
  args: Record<string, unknown>
): ValidationResult {
  const audioId = extractString(args, ['audioId', 'audio_id', 'id']);
  const audioName = extractString(args, ['audioName', 'audio_name', 'name', 'audio']);
  const timestamp = extractNumber(args, ['timestamp', 'time', 'position', 'at']);

  if (!audioId && !audioName) {
    return { valid: false, error: 'Provide either audioId or audioName' };
  }

  return {
    valid: true,
    parsed: {
      audioId,
      audioName,
      timestamp,
    },
  };
}

/**
 * Validate args for modify_video_clip tool
 */
export function validateModifyVideoArgs(
  args: Record<string, unknown>
): ValidationResult {
  const action = extractString(args, ['action', 'type', 'operation']);
  const clipId = extractString(args, ['clipId', 'clip_id', 'id', 'clip']);
  const timestamp = extractNumber(args, ['timestamp', 'time', 'position', 'to']);
  const trimStart = extractNumber(args, ['trimStart', 'trim_start', 'startTrim', 'start']);
  const trimEnd = extractNumber(args, ['trimEnd', 'trim_end', 'endTrim', 'end']);

  if (!clipId) {
    return { valid: false, error: 'Please specify which clip to modify (clipId required)' };
  }

  if (!action) {
    return { valid: false, error: 'Please specify action: move, trim, or remove' };
  }

  const normalizedAction = action.toLowerCase();
  if (!['move', 'trim', 'remove', 'delete'].includes(normalizedAction)) {
    return { valid: false, error: 'Action must be: move, trim, or remove' };
  }

  return {
    valid: true,
    parsed: {
      action: normalizedAction === 'delete' ? 'remove' : normalizedAction,
      clipId,
      timestamp,
      trimStart,
      trimEnd,
    },
  };
}

/**
 * Validate args for modify_audio_clip tool
 */
export function validateModifyAudioArgs(
  args: Record<string, unknown>
): ValidationResult {
  const action = extractString(args, ['action', 'type', 'operation']);
  const clipId = extractString(args, ['clipId', 'clip_id', 'id', 'clip']);
  const timestamp = extractNumber(args, ['timestamp', 'time', 'position', 'to']);
  const trimStart = extractNumber(args, ['trimStart', 'trim_start', 'startTrim', 'start']);
  const trimEnd = extractNumber(args, ['trimEnd', 'trim_end', 'endTrim', 'end']);

  if (!clipId) {
    return { valid: false, error: 'Please specify which audio clip to modify (clipId required)' };
  }

  if (!action) {
    return { valid: false, error: 'Please specify action: move, trim, or remove' };
  }

  const normalizedAction = action.toLowerCase();
  if (!['move', 'trim', 'remove', 'delete'].includes(normalizedAction)) {
    return { valid: false, error: 'Action must be: move, trim, or remove' };
  }

  return {
    valid: true,
    parsed: {
      action: normalizedAction === 'delete' ? 'remove' : normalizedAction,
      clipId,
      timestamp,
      trimStart,
      trimEnd,
    },
  };
}

/**
 * Validate args for get_video tool
 */
export function validateGetVideoArgs(
  args: Record<string, unknown>
): ValidationResult {
  const name = extractString(args, ['name', 'videoName', 'video_name', 'search', 'query']);

  if (!name) {
    return { valid: false, error: 'Please specify a video name to search for' };
  }

  return {
    valid: true,
    parsed: { name },
  };
}

/**
 * Validate args for get_audio tool
 */
export function validateGetAudioArgs(
  args: Record<string, unknown>
): ValidationResult {
  const name = extractString(args, ['name', 'audioName', 'audio_name', 'search', 'query']);

  if (!name) {
    return { valid: false, error: 'Please specify an audio name to search for' };
  }

  return {
    valid: true,
    parsed: { name },
  };
}

/**
 * Validate args for find_clip tool
 */
export function validateFindClipArgs(
  args: Record<string, unknown>
): ValidationResult {
  const id = extractString(args, ['id', 'clipId', 'clip_id', 'clip']);

  if (!id) {
    return { valid: false, error: 'Please specify a clip ID' };
  }

  return {
    valid: true,
    parsed: { id },
  };
}

/**
 * Log debug info when args parsing fails
 */
export function logArgsDebug(
  tool: string,
  rawArgs: Record<string, unknown>,
  error: string
): void {
  console.warn(`[Agent Debug] Tool "${tool}" args validation failed`);
  console.warn(`[Agent Debug] Raw args:`, JSON.stringify(rawArgs, null, 2));
  console.warn(`[Agent Debug] Error: ${error}`);
}
