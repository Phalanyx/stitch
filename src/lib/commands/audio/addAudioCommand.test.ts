/**
 * Tests for addAudioCommand.
 */

import { createAddAudioCommand } from './addAudioCommand';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { AudioLayer, AudioReference } from '@/types/audio';
import { CommandExecutionError } from '../errors';

// Mock the audio timeline store
jest.mock('@/stores/audioTimelineStore');

describe('createAddAudioCommand', () => {
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
      const command = createAddAudioCommand({
        audio: { id: 'audio-1', url: 'https://example.com/audio.mp3' },
        clipId: 'clip-1',
        layerId: 'layer-1',
      });

      expect(command.type).toBe('audio:add');
      expect(command.description).toBe('Add audio clip');
    });

    it('generates unique command ID', () => {
      const command = createAddAudioCommand({
        audio: { id: 'audio-1', url: 'https://example.com/audio.mp3' },
        clipId: 'clip-1',
        layerId: 'layer-1',
      });

      expect(command.id).toBe('test-uuid-1');
    });
  });

  describe('execute', () => {
    it('adds clip to specified layer', () => {
      const command = createAddAudioCommand({
        audio: { id: 'audio-1', url: 'https://example.com/audio.mp3', duration: 10 },
        clipId: 'clip-1',
        layerId: 'layer-1',
      });

      command.execute();

      expect(mockState.audioLayers[0].clips).toHaveLength(1);
      expect(mockState.audioLayers[0].clips[0]).toMatchObject({
        id: 'clip-1',
        audioId: 'audio-1',
        url: 'https://example.com/audio.mp3',
        duration: 10,
        timestamp: 0,
      });
      expect(mockState.isDirty).toBe(true);
    });

    it('calculates timestamp at end of existing clips', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'existing', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createAddAudioCommand({
        audio: { id: 'audio-2', url: 'https://example.com/audio2.mp3', duration: 5 },
        clipId: 'clip-2',
        layerId: 'layer-1',
      });

      command.execute();

      expect(mockState.audioLayers[0].clips[1].timestamp).toBe(10);
    });

    it('accounts for trim values when calculating end timestamp', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'existing', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10, trimStart: 2, trimEnd: 3 },
        ]),
      ];

      const command = createAddAudioCommand({
        audio: { id: 'audio-2', url: 'https://example.com/audio2.mp3', duration: 5 },
        clipId: 'clip-2',
        layerId: 'layer-1',
      });

      command.execute();

      // Visible duration: 10 - 2 - 3 = 5
      expect(mockState.audioLayers[0].clips[1].timestamp).toBe(5);
    });

    it('uses provided timestamp instead of calculating', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'existing', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createAddAudioCommand({
        audio: { id: 'audio-2', url: 'https://example.com/audio2.mp3', duration: 5 },
        clipId: 'clip-2',
        layerId: 'layer-1',
        timestamp: 20,
      });

      command.execute();

      expect(mockState.audioLayers[0].clips[1].timestamp).toBe(20);
    });

    it('clamps negative timestamp to 0', () => {
      const command = createAddAudioCommand({
        audio: { id: 'audio-1', url: 'https://example.com/audio.mp3', duration: 5 },
        clipId: 'clip-1',
        layerId: 'layer-1',
        timestamp: -5,
      });

      command.execute();

      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(0);
    });

    it('uses default duration of 5 when not provided', () => {
      const command = createAddAudioCommand({
        audio: { id: 'audio-1', url: 'https://example.com/audio.mp3' },
        clipId: 'clip-1',
        layerId: 'layer-1',
      });

      command.execute();

      expect(mockState.audioLayers[0].clips[0].duration).toBe(5);
    });

    it('throws CommandExecutionError when layer not found', () => {
      const command = createAddAudioCommand({
        audio: { id: 'audio-1', url: 'https://example.com/audio.mp3' },
        clipId: 'clip-1',
        layerId: 'non-existent',
      });

      expect(() => command.execute()).toThrow(CommandExecutionError);
    });

    it('adds to empty layer', () => {
      mockState.audioLayers = [createLayer('layer-1', [])];

      const command = createAddAudioCommand({
        audio: { id: 'audio-1', url: 'https://example.com/audio.mp3', duration: 5 },
        clipId: 'clip-1',
        layerId: 'layer-1',
      });

      command.execute();

      expect(mockState.audioLayers[0].clips).toHaveLength(1);
      expect(mockState.audioLayers[0].clips[0].timestamp).toBe(0);
    });

    it('does not affect other layers', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'existing-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 5 },
        ]),
        createLayer('layer-2', [
          { id: 'existing-2', audioId: 'a2', url: 'test2.mp3', timestamp: 0, duration: 5 },
        ]),
      ];

      const command = createAddAudioCommand({
        audio: { id: 'audio-new', url: 'https://example.com/new.mp3', duration: 5 },
        clipId: 'clip-new',
        layerId: 'layer-1',
      });

      command.execute();

      expect(mockState.audioLayers[0].clips).toHaveLength(2);
      expect(mockState.audioLayers[1].clips).toHaveLength(1); // Unchanged
    });
  });

  describe('undo', () => {
    it('removes the added clip', () => {
      const command = createAddAudioCommand({
        audio: { id: 'audio-1', url: 'https://example.com/audio.mp3', duration: 10 },
        clipId: 'clip-1',
        layerId: 'layer-1',
      });

      command.execute();
      expect(mockState.audioLayers[0].clips).toHaveLength(1);

      command.undo();
      expect(mockState.audioLayers[0].clips).toHaveLength(0);
      expect(mockState.isDirty).toBe(true);
    });

    it('only removes the specific clip by ID', () => {
      mockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'other-clip', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createAddAudioCommand({
        audio: { id: 'audio-2', url: 'https://example.com/audio2.mp3', duration: 5 },
        clipId: 'clip-2',
        layerId: 'layer-1',
      });

      command.execute();
      expect(mockState.audioLayers[0].clips).toHaveLength(2);

      command.undo();
      expect(mockState.audioLayers[0].clips).toHaveLength(1);
      expect(mockState.audioLayers[0].clips[0].id).toBe('other-clip');
    });

    it('does not affect other layers on undo', () => {
      mockState.audioLayers = [
        createLayer('layer-1', []),
        createLayer('layer-2', [
          { id: 'other', audioId: 'a', url: 'test.mp3', timestamp: 0, duration: 5 },
        ]),
      ];

      const command = createAddAudioCommand({
        audio: { id: 'audio-1', url: 'https://example.com/audio.mp3', duration: 5 },
        clipId: 'clip-1',
        layerId: 'layer-1',
      });

      command.execute();
      command.undo();

      expect(mockState.audioLayers[0].clips).toHaveLength(0);
      expect(mockState.audioLayers[1].clips).toHaveLength(1); // Unchanged
    });
  });
});
