/**
 * Tests for moveVideoCommand.
 */

import { createMoveVideoCommand } from './moveVideoCommand';
import { useTimelineStore } from '@/stores/timelineStore';
import { VideoReference } from '@/types/video';

// Mock the timeline store
jest.mock('@/stores/timelineStore');

describe('createMoveVideoCommand', () => {
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
    it('captures original timestamp from current state', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 5, duration: 10 },
      ];

      const command = createMoveVideoCommand({ clipId: 'clip-1', newTimestamp: 20 });

      // Modify state after creation
      mockState.clips[0].timestamp = 100;

      // Execute and undo to verify original was captured
      command.execute();
      command.undo();

      expect(mockState.clips[0].timestamp).toBe(5);
    });

    it('uses provided originalTimestamp if given', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 5, duration: 10 },
      ];

      const command = createMoveVideoCommand({
        clipId: 'clip-1',
        newTimestamp: 20,
        originalTimestamp: 15, // Override captured value
      });

      command.execute();
      command.undo();

      expect(mockState.clips[0].timestamp).toBe(15);
    });

    it('throws error when clip not found and no originalTimestamp provided', () => {
      mockState.clips = [];

      expect(() => {
        createMoveVideoCommand({ clipId: 'non-existent', newTimestamp: 10 });
      }).toThrow('Clip with id non-existent not found');
    });

    it('creates command with correct type', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createMoveVideoCommand({ clipId: 'clip-1', newTimestamp: 5 });

      expect(command.type).toBe('video:move');
      expect(command.description).toBe('Move video clip');
    });
  });

  describe('execute', () => {
    it('updates clip timestamp', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createMoveVideoCommand({ clipId: 'clip-1', newTimestamp: 15 });
      command.execute();

      expect(mockState.clips[0].timestamp).toBe(15);
      expect(mockState.isDirty).toBe(true);
    });

    it('clamps negative timestamp to 0', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 10, duration: 10 },
      ];

      const command = createMoveVideoCommand({ clipId: 'clip-1', newTimestamp: -5 });
      command.execute();

      expect(mockState.clips[0].timestamp).toBe(0);
    });

    it('only updates the specified clip', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test1.mp4', timestamp: 0, duration: 10 },
        { id: 'clip-2', videoId: 'v2', url: 'test2.mp4', timestamp: 10, duration: 5 },
      ];

      const command = createMoveVideoCommand({ clipId: 'clip-1', newTimestamp: 20 });
      command.execute();

      expect(mockState.clips[0].timestamp).toBe(20);
      expect(mockState.clips[1].timestamp).toBe(10); // Unchanged
    });

    it('preserves other clip properties', () => {
      mockState.clips = [
        {
          id: 'clip-1',
          videoId: 'v1',
          url: 'test.mp4',
          timestamp: 0,
          duration: 10,
          trimStart: 1,
          trimEnd: 2,
        },
      ];

      const command = createMoveVideoCommand({ clipId: 'clip-1', newTimestamp: 15 });
      command.execute();

      expect(mockState.clips[0]).toMatchObject({
        id: 'clip-1',
        videoId: 'v1',
        url: 'test.mp4',
        duration: 10,
        trimStart: 1,
        trimEnd: 2,
      });
    });
  });

  describe('undo', () => {
    it('restores original timestamp', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 5, duration: 10 },
      ];

      const command = createMoveVideoCommand({ clipId: 'clip-1', newTimestamp: 20 });
      command.execute();
      expect(mockState.clips[0].timestamp).toBe(20);

      command.undo();
      expect(mockState.clips[0].timestamp).toBe(5);
    });

    it('marks timeline as dirty', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createMoveVideoCommand({ clipId: 'clip-1', newTimestamp: 10 });
      command.execute();
      mockState.isDirty = false;

      command.undo();

      expect(mockState.isDirty).toBe(true);
    });

    it('only updates the specified clip on undo', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test1.mp4', timestamp: 0, duration: 10 },
        { id: 'clip-2', videoId: 'v2', url: 'test2.mp4', timestamp: 10, duration: 5 },
      ];

      const command = createMoveVideoCommand({ clipId: 'clip-1', newTimestamp: 25 });
      command.execute();

      // Modify clip-2 timestamp manually
      mockState.clips[1].timestamp = 30;

      command.undo();

      expect(mockState.clips[0].timestamp).toBe(0); // Restored
      expect(mockState.clips[1].timestamp).toBe(30); // Unchanged by undo
    });
  });

  describe('redo (execute after undo)', () => {
    it('can be re-executed after undo', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createMoveVideoCommand({ clipId: 'clip-1', newTimestamp: 15 });

      command.execute();
      expect(mockState.clips[0].timestamp).toBe(15);

      command.undo();
      expect(mockState.clips[0].timestamp).toBe(0);

      command.execute();
      expect(mockState.clips[0].timestamp).toBe(15);
    });
  });
});
