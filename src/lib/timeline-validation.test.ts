import {
  findAvailableDepth,
  findOverlappingClips,
  findNearestValidPosition,
  rangesOverlap,
  getClipEndTime,
  getVisibleDuration,
  wouldOverlap,
  TimelineClip,
} from './timeline-validation';

describe('getClipEndTime', () => {
  it('calculates end time without trims', () => {
    const clip: TimelineClip = { id: '1', timestamp: 5, duration: 10 };
    expect(getClipEndTime(clip)).toBe(15);
  });

  it('accounts for trims', () => {
    const clip: TimelineClip = { id: '1', timestamp: 5, duration: 10, trimStart: 2, trimEnd: 3 };
    // Visible: 10 - 2 - 3 = 5s, starting at 5s = end at 10s
    expect(getClipEndTime(clip)).toBe(10);
  });

  it('handles zero timestamp', () => {
    const clip: TimelineClip = { id: '1', timestamp: 0, duration: 5 };
    expect(getClipEndTime(clip)).toBe(5);
  });
});

describe('getVisibleDuration', () => {
  it('returns full duration without trims', () => {
    const clip: TimelineClip = { id: '1', timestamp: 0, duration: 10 };
    expect(getVisibleDuration(clip)).toBe(10);
  });

  it('subtracts trims from duration', () => {
    const clip: TimelineClip = { id: '1', timestamp: 0, duration: 10, trimStart: 2, trimEnd: 3 };
    expect(getVisibleDuration(clip)).toBe(5);
  });
});

describe('rangesOverlap', () => {
  it('returns false for non-overlapping ranges', () => {
    expect(rangesOverlap(0, 5, 5, 10)).toBe(false);
    expect(rangesOverlap(0, 5, 6, 10)).toBe(false);
  });

  it('returns true for overlapping ranges', () => {
    expect(rangesOverlap(0, 5, 4, 10)).toBe(true);
    expect(rangesOverlap(0, 10, 5, 15)).toBe(true);
  });

  it('returns false for touching edges (within epsilon)', () => {
    expect(rangesOverlap(0, 5, 5.0005, 10)).toBe(false);
  });

  it('returns true for overlap greater than epsilon', () => {
    expect(rangesOverlap(0, 5, 4.99, 10)).toBe(true);
  });

  it('handles ranges in reverse order', () => {
    expect(rangesOverlap(5, 10, 0, 5)).toBe(false);
    expect(rangesOverlap(5, 10, 0, 6)).toBe(true);
  });
});

describe('findAvailableDepth', () => {
  it('returns 0 when no clips exist', () => {
    expect(findAvailableDepth([], 0, 5)).toBe(0);
  });

  it('returns 0 when clips do not overlap at timestamp', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
    ];
    // New clip at 5s (after existing clip ends)
    expect(findAvailableDepth(clips, 5, 5)).toBe(0);
  });

  it('returns 1 when depth 0 is occupied at timestamp', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
    ];
    // New clip at 2s overlaps with existing
    expect(findAvailableDepth(clips, 2, 5)).toBe(1);
  });

  it('returns first available depth when multiple depths occupied', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
      { id: '2', timestamp: 0, duration: 5, depth: 1 },
      { id: '3', timestamp: 0, duration: 5, depth: 2 },
    ];
    expect(findAvailableDepth(clips, 0, 5)).toBe(3);
  });

  it('fills gaps in depth sequence', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
      { id: '2', timestamp: 0, duration: 5, depth: 2 }, // gap at depth 1
    ];
    expect(findAvailableDepth(clips, 0, 5)).toBe(1);
  });

  it('accounts for trim values', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 10, trimStart: 2, trimEnd: 3, depth: 0 },
      // Visible: 0s to 5s (10 - 2 - 3 = 5s visible)
    ];
    // Clip at 5s should NOT overlap
    expect(findAvailableDepth(clips, 5, 5)).toBe(0);
    // Clip at 4s SHOULD overlap
    expect(findAvailableDepth(clips, 4, 5)).toBe(1);
  });

  it('treats undefined depth as depth 0', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5 }, // no depth specified = depth 0
    ];
    expect(findAvailableDepth(clips, 2, 5)).toBe(1);
  });
});

describe('findOverlappingClips', () => {
  it('only finds overlaps at same depth', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
      { id: '2', timestamp: 0, duration: 5, depth: 1 },
    ];
    const newClip: TimelineClip = { id: '3', timestamp: 2, duration: 3, depth: 0 };
    const overlapping = findOverlappingClips(clips, newClip);
    expect(overlapping).toHaveLength(1);
    expect(overlapping[0].id).toBe('1');
  });

  it('excludes specified clip id', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
    ];
    const newClip: TimelineClip = { id: '1', timestamp: 2, duration: 3, depth: 0 };
    const overlapping = findOverlappingClips(clips, newClip, '1');
    expect(overlapping).toHaveLength(0);
  });

  it('returns empty array when no overlaps', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
    ];
    const newClip: TimelineClip = { id: '2', timestamp: 5, duration: 5, depth: 0 };
    const overlapping = findOverlappingClips(clips, newClip);
    expect(overlapping).toHaveLength(0);
  });

  it('finds multiple overlapping clips', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
      { id: '2', timestamp: 4, duration: 5, depth: 0 },
    ];
    const newClip: TimelineClip = { id: '3', timestamp: 2, duration: 10, depth: 0 };
    const overlapping = findOverlappingClips(clips, newClip);
    expect(overlapping).toHaveLength(2);
  });
});

describe('wouldOverlap', () => {
  it('returns false when no overlap', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
    ];
    const newClip: TimelineClip = { id: '2', timestamp: 5, duration: 5, depth: 0 };
    expect(wouldOverlap(clips, newClip)).toBe(false);
  });

  it('returns true when overlap exists', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
    ];
    const newClip: TimelineClip = { id: '2', timestamp: 2, duration: 5, depth: 0 };
    expect(wouldOverlap(clips, newClip)).toBe(true);
  });

  it('returns false for overlap at different depth', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
    ];
    const newClip: TimelineClip = { id: '2', timestamp: 2, duration: 5, depth: 1 };
    expect(wouldOverlap(clips, newClip)).toBe(false);
  });
});

describe('findNearestValidPosition', () => {
  it('returns requested position if no overlap', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
    ];
    const newClip: TimelineClip = { id: '2', timestamp: 5, duration: 5, depth: 0 };
    expect(findNearestValidPosition(clips, newClip)).toBe(5);
  });

  it('finds gap after existing clip', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
    ];
    const newClip: TimelineClip = { id: '2', timestamp: 2, duration: 5, depth: 0 };
    expect(findNearestValidPosition(clips, newClip)).toBe(5);
  });

  it('allows overlap at different depths', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
    ];
    const newClip: TimelineClip = { id: '2', timestamp: 0, duration: 5, depth: 1 };
    expect(findNearestValidPosition(clips, newClip)).toBe(0);
  });

  it('finds gap between clips', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
      { id: '2', timestamp: 10, duration: 5, depth: 0 },
    ];
    // 3s clip should fit in 5s gap
    const newClip: TimelineClip = { id: '3', timestamp: 6, duration: 3, depth: 0 };
    expect(findNearestValidPosition(clips, newClip)).toBe(6);
  });

  it('returns 0 for empty clips array', () => {
    const newClip: TimelineClip = { id: '1', timestamp: 5, duration: 5, depth: 0 };
    expect(findNearestValidPosition([], newClip)).toBe(5);
  });

  it('does not return negative position', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 2, duration: 5, depth: 0 },
    ];
    const newClip: TimelineClip = { id: '2', timestamp: -5, duration: 2, depth: 0 };
    expect(findNearestValidPosition(clips, newClip)).toBeGreaterThanOrEqual(0);
  });

  it('handles excludeId for moving existing clip', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
      { id: '2', timestamp: 5, duration: 5, depth: 0 },
    ];
    // Moving clip 1 to timestamp 3 - excludes self, only checks against clip 2
    // 3-8s overlaps with clip 2 (5-10s), so needs to find valid position
    const movingClip: TimelineClip = { id: '1', timestamp: 3, duration: 5, depth: 0 };
    const validPos = findNearestValidPosition(clips, movingClip, '1');
    // Position 0-5s doesn't overlap with clip 2 (5-10s), so 0 is valid
    expect(validPos).toBe(0);
  });

  it('excludeId allows clip to move into its own space', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
      { id: '2', timestamp: 10, duration: 5, depth: 0 },
    ];
    // Moving clip 1 to timestamp 5 (in the gap) should work
    const movingClip: TimelineClip = { id: '1', timestamp: 5, duration: 5, depth: 0 };
    const validPos = findNearestValidPosition(clips, movingClip, '1');
    expect(validPos).toBe(5); // Gap between clips is valid
  });
});

describe('Integration: Back-to-back clip placement', () => {
  it('places sequential clips at same depth when no overlap', () => {
    const clips: TimelineClip[] = [];

    // First clip at 0-5s
    const firstClipTimestamp = 0;
    const firstClipDuration = 5;
    const firstDepth = findAvailableDepth(clips, firstClipTimestamp, firstClipDuration);
    expect(firstDepth).toBe(0);

    const firstClip: TimelineClip = {
      id: '1',
      timestamp: firstClipTimestamp,
      duration: firstClipDuration,
      depth: firstDepth,
    };
    clips.push(firstClip);

    // Second clip at 5-10s (back-to-back)
    const secondClipTimestamp = 5;
    const secondClipDuration = 5;
    const secondDepth = findAvailableDepth(clips, secondClipTimestamp, secondClipDuration);
    expect(secondDepth).toBe(0); // Should be same depth since no overlap
  });

  it('places overlapping clips at different depths', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
    ];

    // Overlapping clip at 2-7s
    const newClipTimestamp = 2;
    const newClipDuration = 5;
    const newDepth = findAvailableDepth(clips, newClipTimestamp, newClipDuration);
    expect(newDepth).toBe(1); // Should be different depth
  });
});

describe('Integration: Move with depth change', () => {
  it('allows move to different depth without timestamp change if no overlap', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
      { id: '2', timestamp: 0, duration: 5, depth: 1 },
    ];

    // Move clip 2 from depth 1 to depth 2 at same timestamp
    const testClip: TimelineClip = { id: '2', timestamp: 0, duration: 5, depth: 2 };
    const validPos = findNearestValidPosition(clips, testClip, '2');
    expect(validPos).toBe(0); // Should stay at 0
  });

  it('adjusts position when moving to occupied depth', () => {
    const clips: TimelineClip[] = [
      { id: '1', timestamp: 0, duration: 5, depth: 0 },
      { id: '2', timestamp: 0, duration: 5, depth: 1 },
    ];

    // Move clip 2 from depth 1 to depth 0 - overlaps with clip 1
    const testClip: TimelineClip = { id: '2', timestamp: 0, duration: 5, depth: 0 };
    const validPos = findNearestValidPosition(clips, testClip, '2');
    expect(validPos).toBe(5); // Should move after clip 1
  });
});
