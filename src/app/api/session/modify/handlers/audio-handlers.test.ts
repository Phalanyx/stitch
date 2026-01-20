/**
 * Tests for audio handler depth logic.
 * These tests verify the core depth assignment and position validation logic
 * used in handleAddAudio and handleMoveAudio.
 */
import {
  TimelineClip,
  findAvailableDepth,
  findNearestValidPosition,
} from '@/lib/timeline-validation';

describe('Audio Handler Logic', () => {
  describe('Add Audio Depth Assignment', () => {
    it('assigns depth 0 for first clip', () => {
      const layerClips: TimelineClip[] = [];
      const timestamp = 0;
      const duration = 5;

      const depth = findAvailableDepth(layerClips, timestamp, duration);
      expect(depth).toBe(0);
    });

    it('assigns depth 0 for back-to-back clips', () => {
      const layerClips: TimelineClip[] = [
        { id: '1', timestamp: 0, duration: 5, depth: 0 },
      ];
      const timestamp = 5; // Right after first clip
      const duration = 5;

      const depth = findAvailableDepth(layerClips, timestamp, duration);
      expect(depth).toBe(0); // Should be same depth since no overlap
    });

    it('assigns depth 1 for overlapping clips', () => {
      const layerClips: TimelineClip[] = [
        { id: '1', timestamp: 0, duration: 5, depth: 0 },
      ];
      const timestamp = 2; // Overlaps with first clip
      const duration = 5;

      const depth = findAvailableDepth(layerClips, timestamp, duration);
      expect(depth).toBe(1);
    });

    it('recalculates depth when position changes due to validation', () => {
      // Simulating the handleAddAudio flow
      const layerClips: TimelineClip[] = [
        { id: '1', timestamp: 0, duration: 5, depth: 0 },
        { id: '2', timestamp: 0, duration: 5, depth: 1 },
      ];

      // User requests timestamp 2 (overlaps both clips)
      const requestedTimestamp = 2;
      const duration = 5;

      // Initial depth calculation at requested position
      let initialDepth = findAvailableDepth(layerClips, requestedTimestamp, duration);
      expect(initialDepth).toBe(2); // Both depths 0 and 1 occupied

      // Create test clip
      const testClip: TimelineClip = {
        id: 'new',
        timestamp: requestedTimestamp,
        duration,
        depth: initialDepth,
      };

      // Position validation may adjust timestamp
      const validTimestamp = findNearestValidPosition(layerClips, testClip);

      // If position changed, recalculate depth
      if (validTimestamp !== requestedTimestamp) {
        const newDepth = findAvailableDepth(layerClips, validTimestamp, duration);
        // At 5s, no overlap, so depth should be 0
        expect(newDepth).toBe(0);
      }
    });
  });

  describe('Move Audio Depth Change', () => {
    it('allows move to different depth without timestamp change if no overlap', () => {
      const layerClips: TimelineClip[] = [
        { id: '1', timestamp: 0, duration: 5, depth: 0 },
        { id: '2', timestamp: 0, duration: 5, depth: 1 },
      ];

      // Move clip 2 from depth 1 to depth 2 at same timestamp
      const testClip: TimelineClip = { id: '2', timestamp: 0, duration: 5, depth: 2 };
      const validPos = findNearestValidPosition(layerClips, testClip, '2');
      expect(validPos).toBe(0); // Should stay at 0
    });

    it('adjusts position when moving to occupied depth', () => {
      const layerClips: TimelineClip[] = [
        { id: '1', timestamp: 0, duration: 5, depth: 0 },
        { id: '2', timestamp: 0, duration: 5, depth: 1 },
      ];

      // Move clip 2 from depth 1 to depth 0 - overlaps with clip 1
      const testClip: TimelineClip = { id: '2', timestamp: 0, duration: 5, depth: 0 };
      const validPos = findNearestValidPosition(layerClips, testClip, '2');
      expect(validPos).toBe(5); // Should move after clip 1
    });

    it('does not swap clips when depth change would cause overlap', () => {
      // This tests the fix for Issue 2
      const layerClips: TimelineClip[] = [
        { id: '1', timestamp: 0, duration: 5, depth: 0 },
        { id: '2', timestamp: 0, duration: 5, depth: 1 },
        { id: '3', timestamp: 0, duration: 5, depth: 2 },
      ];

      // Try to move clip 3 from depth 2 to depth 1 (occupied)
      const testClip: TimelineClip = { id: '3', timestamp: 0, duration: 5, depth: 1 };

      // Check if there's an overlap at target depth
      const otherClips = layerClips.filter(c => c.id !== '3');
      const hasOverlapAtTargetDepth = otherClips.some(c => {
        if ((c.depth ?? 0) !== 1) return false;
        const cEnd = c.timestamp + c.duration;
        const testEnd = 0 + 5;
        return 0 < cEnd - 0.001 && testEnd > c.timestamp + 0.001;
      });

      expect(hasOverlapAtTargetDepth).toBe(true);

      // Since overlap exists, position should be adjusted
      const validPos = findNearestValidPosition(layerClips, testClip, '3');
      expect(validPos).toBe(5); // Should move after clip 2
    });
  });

  describe('Depth Collapse Scenario', () => {
    it('preserves clip positions when moving up a depth level', () => {
      // Scenario: clips at depths 0, 1, 2 - we want to move depth 2 to depth 1
      // but there's already a clip at depth 1
      const layerClips: TimelineClip[] = [
        { id: 'clip-0', timestamp: 0, duration: 5, depth: 0 },
        { id: 'clip-1', timestamp: 0, duration: 5, depth: 1 },
        { id: 'clip-2', timestamp: 0, duration: 5, depth: 2 },
      ];

      // User wants to move clip-2 to depth 1 at timestamp 0
      // This should NOT swap with clip-1
      const testClip: TimelineClip = { id: 'clip-2', timestamp: 0, duration: 5, depth: 1 };

      // The system should detect overlap and adjust position
      const validPos = findNearestValidPosition(layerClips, testClip, 'clip-2');

      // Clip should be moved to after clip-1 at depth 1, not swap
      expect(validPos).toBe(5);
    });

    it('allows depth change when target is empty', () => {
      const layerClips: TimelineClip[] = [
        { id: 'clip-0', timestamp: 0, duration: 5, depth: 0 },
        { id: 'clip-2', timestamp: 0, duration: 5, depth: 2 }, // Gap at depth 1
      ];

      // Move clip-2 to depth 1 (empty)
      const testClip: TimelineClip = { id: 'clip-2', timestamp: 0, duration: 5, depth: 1 };
      const validPos = findNearestValidPosition(layerClips, testClip, 'clip-2');

      expect(validPos).toBe(0); // Should stay at timestamp 0
    });
  });

  describe('Sequential Clip Placement (LLM Back-to-Back)', () => {
    it('places multiple clips back-to-back at same depth', () => {
      // Simulates LLM adding "two clips back to back"
      let clips: TimelineClip[] = [];

      // Add first clip
      let timestamp = 0;
      let duration = 5;
      let depth = findAvailableDepth(clips, timestamp, duration);
      expect(depth).toBe(0);

      const clip1: TimelineClip = { id: '1', timestamp, duration, depth };
      clips.push(clip1);

      // Add second clip - should auto-calculate timestamp after first clip
      const lastClip = clips[clips.length - 1];
      timestamp = lastClip.timestamp + (lastClip.duration - (lastClip.trimStart ?? 0) - (lastClip.trimEnd ?? 0));
      expect(timestamp).toBe(5); // Right after first clip

      duration = 5;
      depth = findAvailableDepth(clips, timestamp, duration);
      expect(depth).toBe(0); // Same depth since no overlap

      const clip2: TimelineClip = { id: '2', timestamp, duration, depth };
      clips.push(clip2);

      // Verify final state
      expect(clips[0].depth).toBe(0);
      expect(clips[1].depth).toBe(0);
      expect(clips[0].timestamp).toBe(0);
      expect(clips[1].timestamp).toBe(5);
    });

    it('adjusts depth correctly when position validation changes timestamp', () => {
      // Start with one clip
      const clips: TimelineClip[] = [
        { id: '1', timestamp: 0, duration: 10, depth: 0 }, // 0-10s
      ];

      // User requests clip at 5s (overlaps with clip 1)
      const requestedTimestamp = 5;
      const duration = 5;

      // Initial depth at requested position
      let depth = findAvailableDepth(clips, requestedTimestamp, duration);
      expect(depth).toBe(1); // Would need depth 1 due to overlap

      // Create test clip
      const testClip: TimelineClip = {
        id: '2',
        timestamp: requestedTimestamp,
        duration,
        depth,
      };

      // But no validation adjustment needed since depth 1 is free
      const validTimestamp = findNearestValidPosition(clips, testClip);
      expect(validTimestamp).toBe(5); // Position OK at depth 1

      // If we explicitly wanted depth 0...
      const testClipDepth0: TimelineClip = {
        id: '2',
        timestamp: requestedTimestamp,
        duration,
        depth: 0,
      };

      const validTimestampDepth0 = findNearestValidPosition(clips, testClipDepth0);
      expect(validTimestampDepth0).toBe(10); // Must go after clip 1 at depth 0

      // After position adjustment, recalculate depth
      const newDepth = findAvailableDepth(clips, validTimestampDepth0, duration);
      expect(newDepth).toBe(0); // At 10s, depth 0 is available
    });
  });
});
