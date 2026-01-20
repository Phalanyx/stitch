/**
 * Tests for addVideoCommand.
 */

import { createAddVideoCommand } from './addVideoCommand';
import { useTimelineStore } from '@/stores/timelineStore';
import { VideoReference } from '@/types/video';

// Mock the timeline store
jest.mock('@/stores/timelineStore');

describe('createAddVideoCommand', () => {
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
    it('creates command with correct type', () => {
      const command = createAddVideoCommand({
        video: { id: 'vid-1', url: 'https://example.com/video.mp4' },
        clipId: 'clip-1',
      });

      expect(command.type).toBe('video:add');
      expect(command.description).toBe('Add video clip');
    });

    it('generates unique command ID', () => {
      const command = createAddVideoCommand({
        video: { id: 'vid-1', url: 'https://example.com/video.mp4' },
        clipId: 'clip-1',
      });

      expect(command.id).toBe('test-uuid-1');
    });
  });

  describe('execute', () => {
    it('adds clip to empty timeline', () => {
      const command = createAddVideoCommand({
        video: { id: 'vid-1', url: 'https://example.com/video.mp4', duration: 10 },
        clipId: 'clip-1',
      });

      command.execute();

      expect(mockState.clips).toHaveLength(1);
      expect(mockState.clips[0]).toMatchObject({
        id: 'clip-1',
        videoId: 'vid-1',
        url: 'https://example.com/video.mp4',
        duration: 10,
        timestamp: 0,
      });
      expect(mockState.isDirty).toBe(true);
    });

    it('calculates timestamp at end of existing clips', () => {
      mockState.clips = [
        { id: 'existing', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createAddVideoCommand({
        video: { id: 'vid-2', url: 'https://example.com/video2.mp4', duration: 5 },
        clipId: 'clip-2',
      });

      command.execute();

      expect(mockState.clips).toHaveLength(2);
      expect(mockState.clips[1].timestamp).toBe(10); // After first clip ends
    });

    it('accounts for trim values when calculating end timestamp', () => {
      mockState.clips = [
        { id: 'existing', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10, trimStart: 2, trimEnd: 3 },
      ];

      const command = createAddVideoCommand({
        video: { id: 'vid-2', url: 'https://example.com/video2.mp4', duration: 5 },
        clipId: 'clip-2',
      });

      command.execute();

      // Visible duration: 10 - 2 - 3 = 5, so next clip should start at 5
      expect(mockState.clips[1].timestamp).toBe(5);
    });

    it('uses provided timestamp instead of calculating', () => {
      mockState.clips = [
        { id: 'existing', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createAddVideoCommand({
        video: { id: 'vid-2', url: 'https://example.com/video2.mp4', duration: 5 },
        clipId: 'clip-2',
        timestamp: 20,
      });

      command.execute();

      expect(mockState.clips[1].timestamp).toBe(20);
    });

    it('clamps negative timestamp to 0', () => {
      const command = createAddVideoCommand({
        video: { id: 'vid-1', url: 'https://example.com/video.mp4', duration: 5 },
        clipId: 'clip-1',
        timestamp: -5,
      });

      command.execute();

      expect(mockState.clips[0].timestamp).toBe(0);
    });

    it('uses default duration of 5 when not provided', () => {
      const command = createAddVideoCommand({
        video: { id: 'vid-1', url: 'https://example.com/video.mp4' },
        clipId: 'clip-1',
      });

      command.execute();

      expect(mockState.clips[0].duration).toBe(5);
    });
  });

  describe('undo', () => {
    it('removes the added clip', () => {
      const command = createAddVideoCommand({
        video: { id: 'vid-1', url: 'https://example.com/video.mp4', duration: 10 },
        clipId: 'clip-1',
      });

      command.execute();
      expect(mockState.clips).toHaveLength(1);

      command.undo();
      expect(mockState.clips).toHaveLength(0);
      expect(mockState.isDirty).toBe(true);
    });

    it('only removes the specific clip by ID', () => {
      mockState.clips = [
        { id: 'other-clip', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createAddVideoCommand({
        video: { id: 'vid-2', url: 'https://example.com/video2.mp4', duration: 5 },
        clipId: 'clip-2',
      });

      command.execute();
      expect(mockState.clips).toHaveLength(2);

      command.undo();
      expect(mockState.clips).toHaveLength(1);
      expect(mockState.clips[0].id).toBe('other-clip');
    });
  });
});
