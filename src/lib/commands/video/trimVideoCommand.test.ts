/**
 * Tests for trimVideoCommand.
 */

import { createTrimVideoCommand } from './trimVideoCommand';
import { useTimelineStore } from '@/stores/timelineStore';
import { VideoReference } from '@/types/video';

// Mock the timeline store
jest.mock('@/stores/timelineStore');

describe('createTrimVideoCommand', () => {
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
    it('captures original values from current state', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 5, duration: 10, trimStart: 1, trimEnd: 2 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { trimStart: 3, trimEnd: 4 },
      });

      // Modify state after creation
      mockState.clips[0].trimStart = 10;

      // Execute and undo to verify original was captured
      command.execute();
      command.undo();

      expect(mockState.clips[0].trimStart).toBe(1);
    });

    it('uses provided originalValues if given', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 5, duration: 10, trimStart: 1, trimEnd: 2 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { trimStart: 3 },
        originalValues: { trimStart: 0, trimEnd: 0, timestamp: 0 },
      });

      command.execute();
      command.undo();

      expect(mockState.clips[0].trimStart).toBe(0);
      expect(mockState.clips[0].trimEnd).toBe(0);
      expect(mockState.clips[0].timestamp).toBe(0);
    });

    it('throws error when clip not found and no originalValues provided', () => {
      mockState.clips = [];

      expect(() => {
        createTrimVideoCommand({
          clipId: 'non-existent',
          updates: { trimStart: 1 },
        });
      }).toThrow('Clip with id non-existent not found');
    });

    it('defaults trimStart and trimEnd to 0 if undefined', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 5, duration: 10 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { trimStart: 2 },
      });

      command.execute();
      command.undo();

      expect(mockState.clips[0].trimStart).toBe(0);
      expect(mockState.clips[0].trimEnd).toBe(0);
    });

    it('creates command with correct type', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { trimStart: 1 },
      });

      expect(command.type).toBe('video:trim');
      expect(command.description).toBe('Trim video clip');
    });
  });

  describe('execute', () => {
    it('applies trimStart update', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { trimStart: 2 },
      });

      command.execute();

      expect(mockState.clips[0].trimStart).toBe(2);
      expect(mockState.isDirty).toBe(true);
    });

    it('applies trimEnd update', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { trimEnd: 3 },
      });

      command.execute();

      expect(mockState.clips[0].trimEnd).toBe(3);
    });

    it('applies timestamp update', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { timestamp: 5 },
      });

      command.execute();

      expect(mockState.clips[0].timestamp).toBe(5);
    });

    it('applies multiple updates at once', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { trimStart: 1, trimEnd: 2, timestamp: 5 },
      });

      command.execute();

      expect(mockState.clips[0].trimStart).toBe(1);
      expect(mockState.clips[0].trimEnd).toBe(2);
      expect(mockState.clips[0].timestamp).toBe(5);
    });

    it('preserves values not in updates', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10, trimStart: 1, trimEnd: 2 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { trimStart: 3 },
      });

      command.execute();

      expect(mockState.clips[0].trimStart).toBe(3);
      expect(mockState.clips[0].trimEnd).toBe(2); // Preserved
    });

    it('only updates the specified clip', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test1.mp4', timestamp: 0, duration: 10 },
        { id: 'clip-2', videoId: 'v2', url: 'test2.mp4', timestamp: 10, duration: 5, trimStart: 1 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { trimStart: 2 },
      });

      command.execute();

      expect(mockState.clips[0].trimStart).toBe(2);
      expect(mockState.clips[1].trimStart).toBe(1); // Unchanged
    });
  });

  describe('undo', () => {
    it('restores original trimStart', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10, trimStart: 1 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { trimStart: 5 },
      });

      command.execute();
      expect(mockState.clips[0].trimStart).toBe(5);

      command.undo();
      expect(mockState.clips[0].trimStart).toBe(1);
    });

    it('restores original trimEnd', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10, trimEnd: 2 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { trimEnd: 4 },
      });

      command.execute();
      command.undo();

      expect(mockState.clips[0].trimEnd).toBe(2);
    });

    it('restores original timestamp', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 5, duration: 10 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { timestamp: 10 },
      });

      command.execute();
      command.undo();

      expect(mockState.clips[0].timestamp).toBe(5);
    });

    it('restores all original values', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10, trimStart: 1, trimEnd: 2 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { trimStart: 3, trimEnd: 4, timestamp: 5 },
      });

      command.execute();
      command.undo();

      expect(mockState.clips[0].trimStart).toBe(1);
      expect(mockState.clips[0].trimEnd).toBe(2);
      expect(mockState.clips[0].timestamp).toBe(0);
    });

    it('marks timeline as dirty', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { trimStart: 1 },
      });

      command.execute();
      mockState.isDirty = false;

      command.undo();

      expect(mockState.isDirty).toBe(true);
    });
  });

  describe('redo (execute after undo)', () => {
    it('can be re-executed after undo', () => {
      mockState.clips = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createTrimVideoCommand({
        clipId: 'clip-1',
        updates: { trimStart: 2, trimEnd: 3 },
      });

      command.execute();
      expect(mockState.clips[0].trimStart).toBe(2);
      expect(mockState.clips[0].trimEnd).toBe(3);

      command.undo();
      expect(mockState.clips[0].trimStart).toBe(0);
      expect(mockState.clips[0].trimEnd).toBe(0);

      command.execute();
      expect(mockState.clips[0].trimStart).toBe(2);
      expect(mockState.clips[0].trimEnd).toBe(3);
    });
  });
});
