/**
 * Tests for removeVideoCommand.
 */

import { createRemoveVideoCommand } from './removeVideoCommand';
import { useTimelineStore } from '@/stores/timelineStore';
import { VideoReference } from '@/types/video';

// Mock the timeline store
jest.mock('@/stores/timelineStore');

describe('createRemoveVideoCommand', () => {
  let mockState: { clips: VideoReference[]; isDirty: boolean };
  let uuidCounter: number;

  beforeEach(() => {
    uuidCounter = 0;
    mockState = { clips: [], isDirty: false };

    // Mock crypto.randomUUID
    Object.defineProperty(global, 'crypto', {
      value: {
        randomUUID: () => `test-uuid-${++uuidCounter}`,
      },
      writable: true,
      configurable: true,
    });

    // Setup store mocks
    (useTimelineStore.getState as jest.Mock).mockImplementation(() => mockState);
    (useTimelineStore.setState as jest.Mock).mockImplementation((newState) => {
      Object.assign(mockState, newState);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('command creation', () => {
    it('captures clip snapshot at creation time', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 5, duration: 10, trimStart: 1, trimEnd: 2 },
      ];

      const command = createRemoveVideoCommand({ clipId: 'clip-1' });

      // Modify state after creation
      mockState.clips[0].timestamp = 100;

      // Execute and undo to verify snapshot was captured
      command.execute();
      command.undo();

      // Should restore original timestamp, not modified one
      expect(mockState.clips[0].timestamp).toBe(5);
    });

    it('throws error when clip not found', () => {
      mockState.clips = [];

      expect(() => {
        createRemoveVideoCommand({ clipId: 'non-existent' });
      }).toThrow('Clip with id non-existent not found');
    });

    it('creates command with correct type', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createRemoveVideoCommand({ clipId: 'clip-1' });

      expect(command.type).toBe('video:remove');
      expect(command.description).toBe('Remove video clip');
    });
  });

  describe('execute', () => {
    it('removes the clip from timeline', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test1.mp4', timestamp: 0, duration: 10 },
        { id: 'clip-2', videoId: 'v2', url: 'test2.mp4', timestamp: 10, duration: 5 },
      ];

      const command = createRemoveVideoCommand({ clipId: 'clip-1' });
      command.execute();

      expect(mockState.clips).toHaveLength(1);
      expect(mockState.clips[0].id).toBe('clip-2');
      expect(mockState.isDirty).toBe(true);
    });

    it('removes the only clip leaving empty array', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createRemoveVideoCommand({ clipId: 'clip-1' });
      command.execute();

      expect(mockState.clips).toHaveLength(0);
    });

    it('marks timeline as dirty', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createRemoveVideoCommand({ clipId: 'clip-1' });
      command.execute();

      expect(mockState.isDirty).toBe(true);
    });
  });

  describe('undo', () => {
    it('restores the removed clip', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test1.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createRemoveVideoCommand({ clipId: 'clip-1' });
      command.execute();
      expect(mockState.clips).toHaveLength(0);

      command.undo();
      expect(mockState.clips).toHaveLength(1);
      expect(mockState.clips[0].id).toBe('clip-1');
    });

    it('restores clip with all original properties', () => {
      mockState.clips = [
        {
          id: 'clip-1',
          videoId: 'v1',
          url: 'test.mp4',
          timestamp: 5,
          duration: 10,
          trimStart: 1,
          trimEnd: 2,
        },
      ];

      const command = createRemoveVideoCommand({ clipId: 'clip-1' });
      command.execute();
      command.undo();

      expect(mockState.clips[0]).toMatchObject({
        id: 'clip-1',
        videoId: 'v1',
        url: 'test.mp4',
        timestamp: 5,
        duration: 10,
        trimStart: 1,
        trimEnd: 2,
      });
    });

    it('appends restored clip to existing clips', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test1.mp4', timestamp: 0, duration: 10 },
        { id: 'clip-2', videoId: 'v2', url: 'test2.mp4', timestamp: 10, duration: 5 },
      ];

      const command = createRemoveVideoCommand({ clipId: 'clip-1' });
      command.execute();

      // Add another clip while clip-1 is removed
      mockState.clips.push({
        id: 'clip-3',
        videoId: 'v3',
        url: 'test3.mp4',
        timestamp: 15,
        duration: 5,
      });

      command.undo();

      expect(mockState.clips).toHaveLength(3);
      // Restored clip should be at the end
      expect(mockState.clips[2].id).toBe('clip-1');
    });

    it('marks timeline as dirty', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createRemoveVideoCommand({ clipId: 'clip-1' });
      command.execute();
      mockState.isDirty = false;

      command.undo();

      expect(mockState.isDirty).toBe(true);
    });
  });
});
