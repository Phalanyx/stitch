/**
 * Tests for removeAudioCommand.
 */

import { createRemoveAudioCommand } from './removeAudioCommand';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { AudioLayer, AudioReference } from '@/types/audio';
import { CommandExecutionError } from '../errors';

// Mock the audio timeline store
jest.mock('@/stores/audioTimelineStore');

describe('createRemoveAudioCommand', () => {
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
    it('captures clip snapshot at creation time', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 5, duration: 10, trimStart: 1, trimEnd: 2 },
        ]),
      ];

      const command = createRemoveAudioCommand({ clipId: 'clip-1', layerId: 'layer-1' });

      // Modify state after creation
      mockState.audioLayers[0].clips[0].timestamp = 100;

      // Execute and undo to verify snapshot was captured
      command.execute();
      command.undo();

      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(5);
    });

    it('throws CommandExecutionError when clip not found', () => {
      mockState.audioLayers = [createLayer('layer-1', [])];

      expect(() => {
        createRemoveAudioCommand({ clipId: 'non-existent', layerId: 'layer-1' });
      }).toThrow(CommandExecutionError);
    });

    it('throws CommandExecutionError when layer not found', () => {
      mockState.audioLayers = [createLayer('layer-1', [])];

      expect(() => {
        createRemoveAudioCommand({ clipId: 'clip-1', layerId: 'non-existent' });
      }).toThrow(CommandExecutionError);
    });

    it('creates command with correct type', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createRemoveAudioCommand({ clipId: 'clip-1', layerId: 'layer-1' });

      expect(command.type).toBe('audio:remove');
      expect(command.description).toBe('Remove audio clip');
    });
  });

  describe('execute', () => {
    it('removes the clip from layer', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test1.mp3', timestamp: 0, duration: 10 },
          { id: 'clip-2', audioId: 'a2', url: 'test2.mp3', timestamp: 10, duration: 5 },
        ]),
      ];

      const command = createRemoveAudioCommand({ clipId: 'clip-1', layerId: 'layer-1' });
      command.execute();

      expect(mockState.audioLayers[0].clips).toHaveLength(1);
      expect(mockState.audioLayers[0].clips[0].id).toBe('clip-2');
      expect(mockState.isDirty).toBe(true);
    });

    it('removes the only clip leaving empty array', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createRemoveAudioCommand({ clipId: 'clip-1', layerId: 'layer-1' });
      command.execute();

      expect(mockState.audioLayers[0].clips).toHaveLength(0);
    });

    it('does not affect other layers', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
        createLayer('layer-2', [
          { id: 'clip-2', audioId: 'a2', url: 'test2.mp3', timestamp: 0, duration: 5 },
        ]),
      ];

      const command = createRemoveAudioCommand({ clipId: 'clip-1', layerId: 'layer-1' });
      command.execute();

      expect(mockState.audioLayers[0].clips).toHaveLength(0);
      expect(mockState.audioLayers[1].clips).toHaveLength(1); // Unchanged
    });
  });

  describe('undo', () => {
    it('restores the removed clip', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createRemoveAudioCommand({ clipId: 'clip-1', layerId: 'layer-1' });
      command.execute();
      expect(mockState.audioLayers[0].clips).toHaveLength(0);

      command.undo();
      expect(mockState.audioLayers[0].clips).toHaveLength(1);
      expect(mockState.audioLayers[0].clips[0].id).toBe('clip-1');
    });

    it('restores clip with all original properties', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          {
            id: 'clip-1',
            audioId: 'a1',
            url: 'test.mp3',
            timestamp: 5,
            duration: 10,
            trimStart: 1,
            trimEnd: 2,
            depth: 1,
            muted: true,
          },
        ]),
      ];

      const command = createRemoveAudioCommand({ clipId: 'clip-1', layerId: 'layer-1' });
      command.execute();
      command.undo();

      expect(mockState.audioLayers[0].clips[0]).toMatchObject({
        id: 'clip-1',
        audioId: 'a1',
        url: 'test.mp3',
        timestamp: 5,
        duration: 10,
        trimStart: 1,
        trimEnd: 2,
        depth: 1,
        muted: true,
      });
    });

    it('restores to correct layer', () => {
      mockState.audioLayers = [
        createLayer('layer-1', []),
        createLayer('layer-2', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createRemoveAudioCommand({ clipId: 'clip-1', layerId: 'layer-2' });
      command.execute();

      // Add a clip to layer-1 while clip-1 is removed
      mockState.audioLayers[0].clips.push({
        id: 'new-clip',
        audioId: 'a2',
        url: 'new.mp3',
        timestamp: 0,
        duration: 5,
      });

      command.undo();

      expect(mockState.audioLayers[0].clips).toHaveLength(1); // New clip only
      expect(mockState.audioLayers[1].clips).toHaveLength(1); // Restored clip
      expect(mockState.audioLayers[1].clips[0].id).toBe('clip-1');
    });

    it('marks timeline as dirty', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createRemoveAudioCommand({ clipId: 'clip-1', layerId: 'layer-1' });
      command.execute();
      mockState.isDirty = false;

      command.undo();

      expect(mockState.isDirty).toBe(true);
    });
  });
});
