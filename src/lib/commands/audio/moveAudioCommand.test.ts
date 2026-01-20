/**
 * Tests for moveAudioCommand.
 */

import { createMoveAudioCommand } from './moveAudioCommand';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { AudioLayer, AudioReference } from '@/types/audio';
import { CommandExecutionError } from '../errors';

// Mock the audio timeline store
jest.mock('@/stores/audioTimelineStore');

describe('createMoveAudioCommand', () => {
  let mockState: { audioLayers: AudioLayer[]; isDirty: boolean };
  let uuidCounter: number;

  const createLayer = (id: string, clips: AudioReference[] = []): AudioLayer => ({
    id,
    name: 'Audio',
    clips,
    muted: false,
  });

  beforeEach(() => {
    uuidCounter = 0;
    mockState = {
      audioLayers: [createLayer('layer-1')],
      isDirty: false,
    };

    // Mock crypto.randomUUID
    Object.defineProperty(global, 'crypto', {
      value: {
        randomUUID: () => `test-uuid-${++uuidCounter}`,
      },
      writable: true,
      configurable: true,
    });

    // Setup store mocks
    (useAudioTimelineStore.getState as jest.Mock).mockImplementation(() => mockState);
    (useAudioTimelineStore.setState as jest.Mock).mockImplementation((newState) => {
      Object.assign(mockState, newState);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('command creation', () => {
    it('captures original timestamp from current state', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 5, duration: 10 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        newTimestamp: 20,
      });

      // Modify state after creation
      mockState.audioLayers[0].clips[0].timestamp = 100;

      // Execute and undo to verify original was captured
      command.execute();
      command.undo();

      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(5);
    });

    it('searches all layers when clip not in specified layer', () => {
      mockState.audioLayers = [
        createLayer('layer-1', []),
        createLayer('layer-2', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 5, duration: 10 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1', // Clip is actually in layer-2
        newTimestamp: 20,
      });

      // Should still find the clip and work
      command.execute();
      expect(mockState.audioLayers[1].clips[0].timestamp).toBe(20);
    });

    it('throws CommandExecutionError when clip not found', () => {
      mockState.audioLayers = [createLayer('layer-1', [])];

      expect(() => createMoveAudioCommand({
        clipId: 'non-existent',
        layerId: 'layer-1',
        newTimestamp: 10,
      })).toThrow(CommandExecutionError);
    });

    it('uses provided originalTimestamp if given', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 5, duration: 10 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        newTimestamp: 20,
        originalTimestamp: 15,
      });

      command.execute();
      command.undo();

      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(15);
    });

    it('captures original depth from current state', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 5, duration: 10, depth: 2 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        newTimestamp: 20,
        newDepth: 0,
      });

      command.execute();
      command.undo();

      expect(mockState.audioLayers[0].clips[0].depth).toBe(2);
    });

    it('creates command with correct type', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        newTimestamp: 5,
      });

      expect(command.type).toBe('audio:move');
      expect(command.description).toBe('Move audio clip');
    });
  });

  describe('execute', () => {
    it('updates clip timestamp', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        newTimestamp: 15,
      });

      command.execute();

      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(15);
      expect(mockState.isDirty).toBe(true);
    });

    it('updates clip depth when provided', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10, depth: 0 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        newTimestamp: 5,
        newDepth: 2,
      });

      command.execute();

      expect(mockState.audioLayers[0].clips[0].depth).toBe(2);
    });

    it('clamps negative timestamp to 0', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 10, duration: 10 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        newTimestamp: -5,
      });

      command.execute();

      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(0);
    });

    it('throws CommandExecutionError when clip not found during execute', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 5, duration: 10 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        newTimestamp: 20,
      });

      // Remove clip before execute
      mockState.audioLayers[0].clips = [];

      expect(() => command.execute()).toThrow(CommandExecutionError);
    });

    it('only updates the specified clip', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test1.mp3', timestamp: 0, duration: 10 },
          { id: 'clip-2', audioId: 'a2', url: 'test2.mp3', timestamp: 10, duration: 5 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        newTimestamp: 25,
      });

      command.execute();

      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(25);
      expect(mockState.audioLayers[0].clips[1].timestamp).toBe(10); // Unchanged
    });

    it('finds clip in any layer during execute', () => {
      mockState.audioLayers = [
        createLayer('layer-1', []),
        createLayer('layer-2', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 5, duration: 10 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1', // Clip is in layer-2
        newTimestamp: 20,
      });

      command.execute();

      expect(mockState.audioLayers[1].clips[0].timestamp).toBe(20);
    });
  });

  describe('undo', () => {
    it('restores original timestamp', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 5, duration: 10 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        newTimestamp: 20,
      });

      command.execute();
      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(20);

      command.undo();
      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(5);
    });

    it('restores original depth', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10, depth: 1 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        newTimestamp: 10,
        newDepth: 3,
      });

      command.execute();
      expect(mockState.audioLayers[0].clips[0].depth).toBe(3);

      command.undo();
      expect(mockState.audioLayers[0].clips[0].depth).toBe(1);
    });

    it('throws CommandExecutionError when clip not found during undo', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 5, duration: 10 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        newTimestamp: 20,
      });

      command.execute();

      // Remove clip before undo
      mockState.audioLayers[0].clips = [];

      expect(() => command.undo()).toThrow(CommandExecutionError);
    });

    it('marks timeline as dirty', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        newTimestamp: 10,
      });

      command.execute();
      mockState.isDirty = false;

      command.undo();

      expect(mockState.isDirty).toBe(true);
    });
  });

  describe('redo (execute after undo)', () => {
    it('can be re-executed after undo', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createMoveAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        newTimestamp: 15,
      });

      command.execute();
      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(15);

      command.undo();
      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(0);

      command.execute();
      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(15);
    });
  });
});
