/**
 * Tests for trimAudioCommand.
 */

import { createTrimAudioCommand } from './trimAudioCommand';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { AudioLayer, AudioReference } from '@/types/audio';
import { CommandExecutionError } from '../errors';

// Mock the audio timeline store
jest.mock('@/stores/audioTimelineStore');

describe('createTrimAudioCommand', () => {
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
    it('captures original values from current state', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 5, duration: 10, trimStart: 1, trimEnd: 2 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { trimStart: 3, trimEnd: 4 },
      });

      // Modify state after creation
      mockState.audioLayers[0].clips[0].trimStart = 10;

      // Execute and undo to verify original was captured
      command.execute();
      command.undo();

      expect(mockState.audioLayers[0].clips[0].trimStart).toBe(1);
    });

    it('uses provided originalValues if given', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 5, duration: 10, trimStart: 1, trimEnd: 2 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { trimStart: 3 },
        originalValues: { trimStart: 0, trimEnd: 0, timestamp: 0 },
      });

      command.execute();
      command.undo();

      expect(mockState.audioLayers[0].clips[0].trimStart).toBe(0);
      expect(mockState.audioLayers[0].clips[0].trimEnd).toBe(0);
      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(0);
    });

    it('throws CommandExecutionError when clip not found', () => {
      mockState.audioLayers = [createLayer('layer-1', [])];

      expect(() => {
        createTrimAudioCommand({
          clipId: 'non-existent',
          layerId: 'layer-1',
          updates: { trimStart: 1 },
        });
      }).toThrow(CommandExecutionError);
    });

    it('throws CommandExecutionError when layer not found', () => {
      mockState.audioLayers = [createLayer('layer-1', [])];

      expect(() => {
        createTrimAudioCommand({
          clipId: 'clip-1',
          layerId: 'non-existent',
          updates: { trimStart: 1 },
        });
      }).toThrow(CommandExecutionError);
    });

    it('defaults trimStart and trimEnd to 0 if undefined', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 5, duration: 10 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { trimStart: 2 },
      });

      command.execute();
      command.undo();

      expect(mockState.audioLayers[0].clips[0].trimStart).toBe(0);
      expect(mockState.audioLayers[0].clips[0].trimEnd).toBe(0);
    });

    it('creates command with correct type', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { trimStart: 1 },
      });

      expect(command.type).toBe('audio:trim');
      expect(command.description).toBe('Trim audio clip');
    });
  });

  describe('execute', () => {
    it('applies trimStart update', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { trimStart: 2 },
      });

      command.execute();

      expect(mockState.audioLayers[0].clips[0].trimStart).toBe(2);
      expect(mockState.isDirty).toBe(true);
    });

    it('applies trimEnd update', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { trimEnd: 3 },
      });

      command.execute();

      expect(mockState.audioLayers[0].clips[0].trimEnd).toBe(3);
    });

    it('applies timestamp update', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { timestamp: 5 },
      });

      command.execute();

      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(5);
    });

    it('applies multiple updates at once', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { trimStart: 1, trimEnd: 2, timestamp: 5 },
      });

      command.execute();

      expect(mockState.audioLayers[0].clips[0].trimStart).toBe(1);
      expect(mockState.audioLayers[0].clips[0].trimEnd).toBe(2);
      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(5);
    });

    it('preserves values not in updates', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10, trimStart: 1, trimEnd: 2 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { trimStart: 3 },
      });

      command.execute();

      expect(mockState.audioLayers[0].clips[0].trimStart).toBe(3);
      expect(mockState.audioLayers[0].clips[0].trimEnd).toBe(2); // Preserved
    });

    it('only updates the specified clip', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test1.mp3', timestamp: 0, duration: 10 },
          { id: 'clip-2', audioId: 'a2', url: 'test2.mp3', timestamp: 10, duration: 5, trimStart: 1 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { trimStart: 2 },
      });

      command.execute();

      expect(mockState.audioLayers[0].clips[0].trimStart).toBe(2);
      expect(mockState.audioLayers[0].clips[1].trimStart).toBe(1); // Unchanged
    });

    it('does not affect other layers', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
        createLayer('layer-2', [
          { id: 'clip-2', audioId: 'a2', url: 'test2.mp3', timestamp: 0, duration: 5, trimStart: 1 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { trimStart: 3 },
      });

      command.execute();

      expect(mockState.audioLayers[1].clips[0].trimStart).toBe(1); // Unchanged
    });
  });

  describe('undo', () => {
    it('restores original trimStart', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10, trimStart: 1 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { trimStart: 5 },
      });

      command.execute();
      expect(mockState.audioLayers[0].clips[0].trimStart).toBe(5);

      command.undo();
      expect(mockState.audioLayers[0].clips[0].trimStart).toBe(1);
    });

    it('restores original trimEnd', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10, trimEnd: 2 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { trimEnd: 4 },
      });

      command.execute();
      command.undo();

      expect(mockState.audioLayers[0].clips[0].trimEnd).toBe(2);
    });

    it('restores original timestamp', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 5, duration: 10 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { timestamp: 10 },
      });

      command.execute();
      command.undo();

      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(5);
    });

    it('restores all original values', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10, trimStart: 1, trimEnd: 2 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { trimStart: 3, trimEnd: 4, timestamp: 5 },
      });

      command.execute();
      command.undo();

      expect(mockState.audioLayers[0].clips[0].trimStart).toBe(1);
      expect(mockState.audioLayers[0].clips[0].trimEnd).toBe(2);
      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(0);
    });

    it('marks timeline as dirty', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
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
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createTrimAudioCommand({
        clipId: 'clip-1',
        layerId: 'layer-1',
        updates: { trimStart: 2, trimEnd: 3 },
      });

      command.execute();
      expect(mockState.audioLayers[0].clips[0].trimStart).toBe(2);
      expect(mockState.audioLayers[0].clips[0].trimEnd).toBe(3);

      command.undo();
      expect(mockState.audioLayers[0].clips[0].trimStart).toBe(0);
      expect(mockState.audioLayers[0].clips[0].trimEnd).toBe(0);

      command.execute();
      expect(mockState.audioLayers[0].clips[0].trimStart).toBe(2);
      expect(mockState.audioLayers[0].clips[0].trimEnd).toBe(3);
    });
  });
});
