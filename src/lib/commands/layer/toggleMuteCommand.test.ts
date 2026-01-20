/**
 * Tests for layer toggleMuteCommand.
 */

import { createToggleMuteCommand } from './toggleMuteCommand';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { AudioLayer, AudioReference } from '@/types/audio';

// Mock the audio timeline store
jest.mock('@/stores/audioTimelineStore');

describe('createToggleMuteCommand', () => {
  let mockState: { audioLayers: AudioLayer[]; isDirty: boolean };
  let uuidCounter: number;

  const createLayer = (id: string, muted = false, clips: AudioReference[] = []): AudioLayer => ({
    id,
    name: 'Audio',
    clips,
    muted,
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
      const command = createToggleMuteCommand({ layerId: 'layer-1' });

      expect(command.type).toBe('layer:toggleMute');
      expect(command.description).toBe('Toggle layer mute');
    });

    it('generates unique command ID', () => {
      const command = createToggleMuteCommand({ layerId: 'layer-1' });

      expect(command.id).toBe('test-uuid-1');
    });
  });

  describe('execute', () => {
    it('toggles layer muted from false to true', () => {
      mockState.audioLayers = [createLayer('layer-1', false)];

      const command = createToggleMuteCommand({ layerId: 'layer-1' });
      command.execute();

      expect(mockState.audioLayers[0].muted).toBe(true);
      expect(mockState.isDirty).toBe(true);
    });

    it('toggles layer muted from true to false', () => {
      mockState.audioLayers = [createLayer('layer-1', true)];

      const command = createToggleMuteCommand({ layerId: 'layer-1' });
      command.execute();

      expect(mockState.audioLayers[0].muted).toBe(false);
    });

    it('only toggles the specified layer', () => {
      mockState.audioLayers = [
        createLayer('layer-1', false),
        createLayer('layer-2', false),
      ];

      const command = createToggleMuteCommand({ layerId: 'layer-1' });
      command.execute();

      expect(mockState.audioLayers[0].muted).toBe(true);
      expect(mockState.audioLayers[1].muted).toBe(false); // Unchanged
    });

    it('preserves other layer properties', () => {
      mockState.audioLayers = [
        {
          id: 'layer-1',
          name: 'Custom Name',
          clips: [
            { id: 'clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 5 },
          ],
          muted: false,
        },
      ];

      const command = createToggleMuteCommand({ layerId: 'layer-1' });
      command.execute();

      expect(mockState.audioLayers[0].name).toBe('Custom Name');
      expect(mockState.audioLayers[0].clips).toHaveLength(1);
    });

    it('handles layer not found gracefully (no error)', () => {
      mockState.audioLayers = [createLayer('layer-1')];

      const command = createToggleMuteCommand({ layerId: 'non-existent' });

      // Should not throw
      expect(() => command.execute()).not.toThrow();

      // Original layer should be unchanged
      expect(mockState.audioLayers[0].muted).toBe(false);
    });
  });

  describe('undo', () => {
    it('toggles layer muted back from true to false (self-inverse)', () => {
      mockState.audioLayers = [createLayer('layer-1', false)];

      const command = createToggleMuteCommand({ layerId: 'layer-1' });
      command.execute();
      expect(mockState.audioLayers[0].muted).toBe(true);

      command.undo();
      expect(mockState.audioLayers[0].muted).toBe(false);
    });

    it('toggles layer muted back from false to true (self-inverse)', () => {
      mockState.audioLayers = [createLayer('layer-1', true)];

      const command = createToggleMuteCommand({ layerId: 'layer-1' });
      command.execute();
      expect(mockState.audioLayers[0].muted).toBe(false);

      command.undo();
      expect(mockState.audioLayers[0].muted).toBe(true);
    });

    it('marks timeline as dirty', () => {
      mockState.audioLayers = [createLayer('layer-1')];

      const command = createToggleMuteCommand({ layerId: 'layer-1' });
      command.execute();
      mockState.isDirty = false;

      command.undo();

      expect(mockState.isDirty).toBe(true);
    });

    it('only affects the specified layer on undo', () => {
      mockState.audioLayers = [
        createLayer('layer-1', false),
        createLayer('layer-2', true),
      ];

      const command = createToggleMuteCommand({ layerId: 'layer-1' });
      command.execute();

      // Manually change layer-2
      mockState.audioLayers[1].muted = false;

      command.undo();

      expect(mockState.audioLayers[0].muted).toBe(false); // Restored
      expect(mockState.audioLayers[1].muted).toBe(false); // Unchanged by undo
    });
  });

  describe('redo (execute after undo)', () => {
    it('can be re-executed after undo', () => {
      mockState.audioLayers = [createLayer('layer-1', false)];

      const command = createToggleMuteCommand({ layerId: 'layer-1' });

      command.execute();
      expect(mockState.audioLayers[0].muted).toBe(true);

      command.undo();
      expect(mockState.audioLayers[0].muted).toBe(false);

      command.execute();
      expect(mockState.audioLayers[0].muted).toBe(true);
    });

    it('multiple execute/undo cycles work correctly', () => {
      mockState.audioLayers = [createLayer('layer-1', false)];

      const command = createToggleMuteCommand({ layerId: 'layer-1' });

      // Toggle multiple times
      command.execute(); // true
      command.undo();    // false
      command.execute(); // true
      command.undo();    // false
      command.execute(); // true

      expect(mockState.audioLayers[0].muted).toBe(true);
    });
  });
});
