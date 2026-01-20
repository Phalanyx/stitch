/**
 * Tests for toggleClipMuteCommand.
 */

import { createToggleClipMuteCommand } from './toggleClipMuteCommand';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { AudioLayer, AudioReference } from '@/types/audio';
import { CommandExecutionError } from '../errors';

// Mock the audio timeline store
jest.mock('@/stores/audioTimelineStore');

describe('createToggleClipMuteCommand', () => {
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
    it('creates command with correct type', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createToggleClipMuteCommand({ clipId: 'clip-1', layerId: 'layer-1' });

      expect(command.type).toBe('audio:toggleClipMute');
      expect(command.description).toBe('Toggle clip mute');
    });

    it('generates unique command ID', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createToggleClipMuteCommand({ clipId: 'clip-1', layerId: 'layer-1' });

      expect(command.id).toBe('test-uuid-1');
    });

    it('throws CommandExecutionError when layer not found', () => {
      mockState.audioLayers = [createLayer('layer-1', [])];

      expect(() => createToggleClipMuteCommand({ clipId: 'clip-1', layerId: 'non-existent' }))
        .toThrow(CommandExecutionError);
    });

    it('throws CommandExecutionError when clip not found in layer', () => {
      mockState.audioLayers = [createLayer('layer-1', [])];

      expect(() => createToggleClipMuteCommand({ clipId: 'non-existent', layerId: 'layer-1' }))
        .toThrow(CommandExecutionError);
    });
  });

  describe('execute', () => {
    it('toggles muted from false to true', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10, muted: false },
        ]),
      ];

      const command = createToggleClipMuteCommand({ clipId: 'clip-1', layerId: 'layer-1' });
      command.execute();

      expect(mockState.audioLayers[0].clips[0].muted).toBe(true);
      expect(mockState.isDirty).toBe(true);
    });

    it('toggles muted from true to false', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10, muted: true },
        ]),
      ];

      const command = createToggleClipMuteCommand({ clipId: 'clip-1', layerId: 'layer-1' });
      command.execute();

      expect(mockState.audioLayers[0].clips[0].muted).toBe(false);
    });

    it('toggles muted from undefined to true', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createToggleClipMuteCommand({ clipId: 'clip-1', layerId: 'layer-1' });
      command.execute();

      expect(mockState.audioLayers[0].clips[0].muted).toBe(true);
    });

    it('only toggles the specified clip', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test1.mp3', timestamp: 0, duration: 10, muted: false },
          { id: 'clip-2', audioId: 'a2', url: 'test2.mp3', timestamp: 10, duration: 5, muted: false },
        ]),
      ];

      const command = createToggleClipMuteCommand({ clipId: 'clip-1', layerId: 'layer-1' });
      command.execute();

      expect(mockState.audioLayers[0].clips[0].muted).toBe(true);
      expect(mockState.audioLayers[0].clips[1].muted).toBe(false); // Unchanged
    });

    it('only affects the specified layer', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10, muted: false },
        ]),
        createLayer('layer-2', [
          { id: 'clip-2', audioId: 'a2', url: 'test2.mp3', timestamp: 0, duration: 5, muted: false },
        ]),
      ];

      const command = createToggleClipMuteCommand({ clipId: 'clip-1', layerId: 'layer-1' });
      command.execute();

      expect(mockState.audioLayers[0].clips[0].muted).toBe(true);
      expect(mockState.audioLayers[1].clips[0].muted).toBe(false); // Unchanged
    });
  });

  describe('undo', () => {
    it('toggles muted back from true to false (self-inverse)', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10, muted: false },
        ]),
      ];

      const command = createToggleClipMuteCommand({ clipId: 'clip-1', layerId: 'layer-1' });
      command.execute();
      expect(mockState.audioLayers[0].clips[0].muted).toBe(true);

      command.undo();
      expect(mockState.audioLayers[0].clips[0].muted).toBe(false);
    });

    it('toggles muted back from false to true (self-inverse)', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10, muted: true },
        ]),
      ];

      const command = createToggleClipMuteCommand({ clipId: 'clip-1', layerId: 'layer-1' });
      command.execute();
      expect(mockState.audioLayers[0].clips[0].muted).toBe(false);

      command.undo();
      expect(mockState.audioLayers[0].clips[0].muted).toBe(true);
    });

    it('marks timeline as dirty', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createToggleClipMuteCommand({ clipId: 'clip-1', layerId: 'layer-1' });
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
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10, muted: false },
        ]),
      ];

      const command = createToggleClipMuteCommand({ clipId: 'clip-1', layerId: 'layer-1' });

      command.execute();
      expect(mockState.audioLayers[0].clips[0].muted).toBe(true);

      command.undo();
      expect(mockState.audioLayers[0].clips[0].muted).toBe(false);

      command.execute();
      expect(mockState.audioLayers[0].clips[0].muted).toBe(true);
    });

    it('multiple execute/undo cycles work correctly', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10, muted: false },
        ]),
      ];

      const command = createToggleClipMuteCommand({ clipId: 'clip-1', layerId: 'layer-1' });

      // Toggle multiple times
      command.execute(); // true
      command.undo();    // false
      command.execute(); // true
      command.undo();    // false
      command.execute(); // true

      expect(mockState.audioLayers[0].clips[0].muted).toBe(true);
    });
  });
});
