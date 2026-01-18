/**
 * Timeline overlap detection and prevention utilities
 */

export interface TimelineClip {
  id: string;
  timestamp: number;
  duration: number;
  trimStart?: number;
  trimEnd?: number;
}

export interface OverlapViolation {
  clipId: string;
  overlapsWithId: string;
  start: number;
  end: number;
}

/**
 * Calculate the effective end time of a clip (accounting for trims)
 */
export function getClipEndTime(clip: TimelineClip): number {
  const trimStart = clip.trimStart ?? 0;
  const trimEnd = clip.trimEnd ?? 0;
  const visibleDuration = clip.duration - trimStart - trimEnd;
  return clip.timestamp + visibleDuration;
}

/**
 * Get the visible duration of a clip (accounting for trims)
 */
export function getVisibleDuration(clip: TimelineClip): number {
  const trimStart = clip.trimStart ?? 0;
  const trimEnd = clip.trimEnd ?? 0;
  return clip.duration - trimStart - trimEnd;
}

/**
 * Small epsilon for floating point comparisons (1ms tolerance)
 */
const EPSILON = 0.001;

/**
 * Check if two time ranges overlap
 * Note: Touching edges (end1 === start2) is NOT considered an overlap
 * Uses epsilon tolerance for floating point precision issues
 */
export function rangesOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number
): boolean {
  // Add epsilon tolerance: ranges must overlap by more than EPSILON to count
  return start1 < end2 - EPSILON && end1 > start2 + EPSILON;
}

/**
 * Find all clips that overlap with a given clip
 * @param clips - Array of existing clips
 * @param newClip - The clip to check for overlaps
 * @param excludeId - Optional ID to exclude (useful when moving an existing clip)
 */
export function findOverlappingClips(
  clips: TimelineClip[],
  newClip: TimelineClip,
  excludeId?: string
): TimelineClip[] {
  const newStart = newClip.timestamp;
  const newEnd = getClipEndTime(newClip);

  return clips.filter((clip) => {
    if (excludeId && clip.id === excludeId) return false;

    const clipStart = clip.timestamp;
    const clipEnd = getClipEndTime(clip);

    return rangesOverlap(newStart, newEnd, clipStart, clipEnd);
  });
}

/**
 * Check if a new clip would overlap with any existing clips
 */
export function wouldOverlap(
  clips: TimelineClip[],
  newClip: TimelineClip,
  excludeId?: string
): boolean {
  return findOverlappingClips(clips, newClip, excludeId).length > 0;
}

/**
 * Find the nearest valid position for a clip that doesn't overlap with others
 * Returns the original timestamp if no overlap, otherwise finds the nearest gap
 */
export function findNearestValidPosition(
  clips: TimelineClip[],
  newClip: TimelineClip,
  excludeId?: string
): number {
  const requestedStart = newClip.timestamp;
  const clipDuration = getVisibleDuration(newClip);

  // Filter out the clip being moved if excludeId is provided
  const otherClips = excludeId
    ? clips.filter((c) => c.id !== excludeId)
    : clips;

  // If no other clips, return the requested position (but not less than 0)
  if (otherClips.length === 0) {
    return Math.max(0, requestedStart);
  }

  // Check if requested position is valid
  if (!wouldOverlap(clips, newClip, excludeId)) {
    return Math.max(0, requestedStart);
  }

  // Sort clips by timestamp
  const sortedClips = [...otherClips].sort((a, b) => a.timestamp - b.timestamp);

  // Find all possible valid positions (gaps between clips and at the start)
  const validPositions: { position: number; distance: number }[] = [];

  // Check position at the very start (0)
  const firstClipStart = sortedClips[0].timestamp;
  if (clipDuration <= firstClipStart) {
    // Can fit before the first clip
    const position = Math.max(0, Math.min(requestedStart, firstClipStart - clipDuration));
    validPositions.push({
      position,
      distance: Math.abs(position - requestedStart),
    });
  }

  // Check gaps between clips
  for (let i = 0; i < sortedClips.length; i++) {
    const currentClipEnd = getClipEndTime(sortedClips[i]);
    const nextClipStart = i < sortedClips.length - 1 ? sortedClips[i + 1].timestamp : Infinity;
    const gapSize = nextClipStart - currentClipEnd;

    if (gapSize >= clipDuration) {
      // Can fit in this gap
      let position: number;
      if (requestedStart >= currentClipEnd && requestedStart + clipDuration <= nextClipStart) {
        // Requested position fits in this gap
        position = requestedStart;
      } else if (requestedStart < currentClipEnd) {
        // Requested position is before this gap, snap to gap start
        position = currentClipEnd;
      } else {
        // Requested position is after this gap, snap to gap start (closest point in gap)
        position = currentClipEnd;
      }
      validPositions.push({
        position,
        distance: Math.abs(position - requestedStart),
      });
    }
  }

  // Check position after the last clip
  const lastClipEnd = getClipEndTime(sortedClips[sortedClips.length - 1]);
  const afterLastPosition = Math.max(lastClipEnd, requestedStart);
  validPositions.push({
    position: afterLastPosition,
    distance: Math.abs(afterLastPosition - requestedStart),
  });

  // Sort by distance to find nearest valid position
  validPositions.sort((a, b) => a.distance - b.distance);

  return Math.max(0, validPositions[0]?.position ?? requestedStart);
}

/**
 * Check if a specific position is valid for a clip (no overlaps)
 */
export function isPositionValid(
  clips: TimelineClip[],
  clipId: string,
  timestamp: number,
  duration: number,
  trimStart?: number,
  trimEnd?: number
): boolean {
  const testClip: TimelineClip = {
    id: clipId,
    timestamp,
    duration,
    trimStart,
    trimEnd,
  };
  return !wouldOverlap(clips, testClip, clipId);
}

/**
 * Get a valid position for a clip (auto-corrected if necessary)
 */
export function getValidPosition(
  clips: TimelineClip[],
  clipId: string,
  timestamp: number,
  duration: number,
  trimStart?: number,
  trimEnd?: number
): number {
  const testClip: TimelineClip = {
    id: clipId,
    timestamp,
    duration,
    trimStart,
    trimEnd,
  };
  return findNearestValidPosition(clips, testClip, clipId);
}

/**
 * Validate an entire track for overlaps (for API validation)
 * Returns an array of violations, empty array means no overlaps
 */
export function validateTrack(clips: TimelineClip[]): OverlapViolation[] {
  const violations: OverlapViolation[] = [];

  for (let i = 0; i < clips.length; i++) {
    for (let j = i + 1; j < clips.length; j++) {
      const clipA = clips[i];
      const clipB = clips[j];

      const startA = clipA.timestamp;
      const endA = getClipEndTime(clipA);
      const startB = clipB.timestamp;
      const endB = getClipEndTime(clipB);

      if (rangesOverlap(startA, endA, startB, endB)) {
        violations.push({
          clipId: clipA.id,
          overlapsWithId: clipB.id,
          start: Math.max(startA, startB),
          end: Math.min(endA, endB),
        });
      }
    }
  }

  return violations;
}

/**
 * Result of auto-trim calculation
 */
export interface AutoTrimResult {
  clipToTrim: string | null;
  newTrimEnd: number;
  isValid: boolean;
}

/**
 * Calculate if auto-trim can resolve an overlap when moving a clip.
 * When clip START is dragged INTO an existing clip (overwrite case),
 * this calculates how to auto-trim the existing clip's end.
 *
 * @param clips - Array of existing clips
 * @param movingClip - The clip being moved (with its new position)
 * @param excludeId - ID of the clip being moved (to exclude from overlap check)
 * @returns AutoTrimResult with clip to trim, new trimEnd value, and validity
 */
export function calculateAutoTrim(
  clips: TimelineClip[],
  movingClip: TimelineClip,
  excludeId?: string
): AutoTrimResult {
  const movingStart = movingClip.timestamp;
  const movingEnd = getClipEndTime(movingClip);

  // Filter out the clip being moved
  const otherClips = excludeId
    ? clips.filter((c) => c.id !== excludeId)
    : clips;

  // Find a clip that the moving clip's START falls within
  // (i.e., movingStart is inside an existing clip's range)
  const overlappedClip = otherClips.find((clip) => {
    const clipStart = clip.timestamp;
    const clipEnd = getClipEndTime(clip);
    // Moving clip's start is within this clip's range
    return movingStart > clipStart && movingStart < clipEnd;
  });

  if (!overlappedClip) {
    // No clip to auto-trim - check if there's any overlap at all
    const hasOverlap = otherClips.some((clip) => {
      const clipStart = clip.timestamp;
      const clipEnd = getClipEndTime(clip);
      return rangesOverlap(movingStart, movingEnd, clipStart, clipEnd);
    });

    return {
      clipToTrim: null,
      newTrimEnd: 0,
      isValid: !hasOverlap,
    };
  }

  // Calculate how much to increase the overlapped clip's trimEnd
  const overlappedClipEnd = getClipEndTime(overlappedClip);
  const overlapAmount = overlappedClipEnd - movingStart;

  // Calculate new trimEnd for the overlapped clip
  const currentTrimEnd = overlappedClip.trimEnd ?? 0;
  const newTrimEnd = currentTrimEnd + overlapAmount;

  // Check minimum duration constraint (0.1s)
  const overlappedTrimStart = overlappedClip.trimStart ?? 0;
  const newVisibleDuration = overlappedClip.duration - overlappedTrimStart - newTrimEnd;

  if (newVisibleDuration < 0.1) {
    // Would trim clip below minimum - not valid
    return {
      clipToTrim: null,
      newTrimEnd: 0,
      isValid: false,
    };
  }

  // Check if the moving clip would still overlap with other clips after this trim
  const trimmedOverlappedEnd = movingStart; // After trim, overlapped clip ends where moving starts
  const stillHasOverlap = otherClips.some((clip) => {
    if (clip.id === overlappedClip.id) return false; // Skip the clip we're trimming
    const clipStart = clip.timestamp;
    const clipEnd = getClipEndTime(clip);
    return rangesOverlap(movingStart, movingEnd, clipStart, clipEnd);
  });

  if (stillHasOverlap) {
    // Would still have overlap even after trimming - not valid for auto-trim
    return {
      clipToTrim: null,
      newTrimEnd: 0,
      isValid: false,
    };
  }

  return {
    clipToTrim: overlappedClip.id,
    newTrimEnd,
    isValid: true,
  };
}

/**
 * Check if a position is valid, accounting for potential auto-trim resolution
 */
export function isPositionValidOrAutoTrimmable(
  clips: TimelineClip[],
  movingClip: TimelineClip,
  excludeId?: string
): boolean {
  // First check if position is already valid (no overlap)
  if (!wouldOverlap(clips, movingClip, excludeId)) {
    return true;
  }

  // Check if auto-trim can resolve the overlap
  const autoTrimResult = calculateAutoTrim(clips, movingClip, excludeId);
  return autoTrimResult.isValid;
}

/**
 * Get the maximum trim that can be applied without overlapping the next clip
 * Used to constrain trim operations
 */
export function getMaxTrimExtension(
  clips: TimelineClip[],
  clipId: string,
  side: 'left' | 'right'
): number {
  const clip = clips.find((c) => c.id === clipId);
  if (!clip) return 0;

  const otherClips = clips.filter((c) => c.id !== clipId);
  if (otherClips.length === 0) {
    // No other clips, can extend fully
    return side === 'left' ? clip.trimStart ?? 0 : clip.trimEnd ?? 0;
  }

  const clipStart = clip.timestamp;
  const clipEnd = getClipEndTime(clip);

  if (side === 'left') {
    // Find the nearest clip that ends before our start
    const clipsBeforeUs = otherClips
      .filter((c) => getClipEndTime(c) <= clipStart)
      .sort((a, b) => getClipEndTime(b) - getClipEndTime(a));

    if (clipsBeforeUs.length === 0) {
      // No clips before us, can extend to 0 or fully restore trimStart
      const currentTrimStart = clip.trimStart ?? 0;
      return Math.min(currentTrimStart, clipStart);
    }

    const nearestClipEnd = getClipEndTime(clipsBeforeUs[0]);
    const availableSpace = clipStart - nearestClipEnd;
    const currentTrimStart = clip.trimStart ?? 0;
    return Math.min(currentTrimStart, availableSpace);
  } else {
    // Find the nearest clip that starts after our end
    const clipsAfterUs = otherClips
      .filter((c) => c.timestamp >= clipEnd)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (clipsAfterUs.length === 0) {
      // No clips after us, can fully restore trimEnd
      return clip.trimEnd ?? 0;
    }

    const nearestClipStart = clipsAfterUs[0].timestamp;
    const availableSpace = nearestClipStart - clipEnd;
    const currentTrimEnd = clip.trimEnd ?? 0;
    return Math.min(currentTrimEnd, availableSpace);
  }
}
