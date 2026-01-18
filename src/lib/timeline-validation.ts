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
