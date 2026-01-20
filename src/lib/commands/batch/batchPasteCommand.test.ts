/**
 * Tests for batchPasteCommand.
 */

import { createBatchPasteCommand } from './batchPasteCommand';
import { useTimelineStore } from '@/stores/timelineStore';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { useClipboardStore, ClipboardClip } from '@/stores/clipboardStore';
import { VideoReference } from '@/types/video';
import { AudioLayer, AudioReference } from '@/types/audio';

// Mock all stores
jest.mock('@/stores/timelineStore');
jest.mock('@/stores/audioTimelineStore');
jest.mock('@/stores/clipboardStore');

describe('createBatchPasteCommand', () => {
  let videoMockState: { clips: VideoReference[]; isDirty: boolean };
  let audioMockState: { audioLayers: AudioLayer[]; isDirty: boolean };
  let clipboardClips: ClipboardClip[];
  let uuidCounter: number;

  const createLayer = (id: string, clips: AudioReference[] = []): AudioLayer => ({
    id,
    name: 'Audio',
    clips,
    muted: false,
  });

  beforeEach(() => {
    uuidCounter = 0;
    videoMockState = { clips: [], isDirty: false };
    audioMockState = {
      audioLayers: [createLayer('layer-1')],
      isDirty: false,
    };
    clipboardClips = [];

    // Mock crypto.randomUUID
    Object.defineProperty(global, 'crypto', {
      value: {
        randomUUID: () => `test-uuid-${++uuidCounter}`,
      },
      writable: true,
      configurable: true,
    });

    // Setup video store mocks
    (useTimelineStore.getState as jest.Mock).mockImplementation(() => videoMockState);
    (useTimelineStore.setState as jest.Mock).mockImplementation((newState) => {
      Object.assign(videoMockState, newState);
    });

    // Setup audio store mocks
    (useAudioTimelineStore.getState as jest.Mock).mockImplementation(() => audioMockState);
    (useAudioTimelineStore.setState as jest.Mock).mockImplementation((newState) => {
      Object.assign(audioMockState, newState);
    });

    // Setup clipboard store mocks
    (useClipboardStore.getState as jest.Mock).mockImplementation(() => ({
      getClips: () => clipboardClips,
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('command creation', () => {
    it('throws error when clipboard is empty', () => {
      clipboardClips = [];

      expect(() => {
        createBatchPasteCommand({ playheadPosition: 0 });
      }).toThrow('Clipboard is empty');
    });

    it('generates new IDs for pasted clips', () => {
      clipboardClips = [
        { type: 'video', url: 'test.mp4', duration: 10, relativeOffset: 0, sourceId: 'v1' },
      ];

      const command = createBatchPasteCommand({ playheadPosition: 5 });
      command.execute();

      // Should have generated a new UUID for the clip
      // Clip IDs are generated first (test-uuid-1), then command ID (test-uuid-2)
      expect(videoMockState.clips[0].id).toBe('test-uuid-1');
    });

    it('calculates timestamps based on playhead and relative offset', () => {
      clipboardClips = [
        { type: 'video', url: 'test1.mp4', duration: 10, relativeOffset: 0, sourceId: 'v1' },
        { type: 'video', url: 'test2.mp4', duration: 5, relativeOffset: 5, sourceId: 'v2' },
      ];

      const command = createBatchPasteCommand({ playheadPosition: 10 });
      command.execute();

      expect(videoMockState.clips[0].timestamp).toBe(10); // playhead + offset 0
      expect(videoMockState.clips[1].timestamp).toBe(15); // playhead + offset 5
    });

    it('creates command with correct type and description', () => {
      clipboardClips = [
        { type: 'video', url: 'test1.mp4', duration: 10, relativeOffset: 0 },
        { type: 'video', url: 'test2.mp4', duration: 5, relativeOffset: 5 },
      ];

      const command = createBatchPasteCommand({ playheadPosition: 0 });

      expect(command.type).toBe('batch:paste');
      expect(command.description).toBe('Paste 2 clips');
    });

    it('uses singular in description for single clip', () => {
      clipboardClips = [
        { type: 'video', url: 'test.mp4', duration: 10, relativeOffset: 0 },
      ];

      const command = createBatchPasteCommand({ playheadPosition: 0 });

      expect(command.description).toBe('Paste 1 clip');
    });
  });

  describe('execute', () => {
    it('adds video clips to timeline', () => {
      clipboardClips = [
        { type: 'video', url: 'test.mp4', duration: 10, relativeOffset: 0, sourceId: 'v1', trimStart: 1, trimEnd: 2 },
      ];

      const command = createBatchPasteCommand({ playheadPosition: 5 });
      command.execute();

      expect(videoMockState.clips).toHaveLength(1);
      expect(videoMockState.clips[0]).toMatchObject({
        url: 'test.mp4',
        duration: 10,
        timestamp: 5,
        trimStart: 1,
        trimEnd: 2,
      });
      expect(videoMockState.isDirty).toBe(true);
    });

    it('adds audio clips to layers', () => {
      clipboardClips = [
        { type: 'audio', url: 'test.mp3', duration: 5, relativeOffset: 0, layerId: 'layer-1', sourceId: 'a1' },
      ];

      const command = createBatchPasteCommand({ playheadPosition: 10 });
      command.execute();

      expect(audioMockState.audioLayers[0].clips).toHaveLength(1);
      expect(audioMockState.audioLayers[0].clips[0]).toMatchObject({
        url: 'test.mp3',
        duration: 5,
        timestamp: 10,
      });
      expect(audioMockState.isDirty).toBe(true);
    });

    it('adds both video and audio clips', () => {
      clipboardClips = [
        { type: 'video', url: 'test.mp4', duration: 10, relativeOffset: 0, sourceId: 'v1' },
        { type: 'audio', url: 'test.mp3', duration: 5, relativeOffset: 2, layerId: 'layer-1', sourceId: 'a1' },
      ];

      const command = createBatchPasteCommand({ playheadPosition: 0 });
      command.execute();

      expect(videoMockState.clips).toHaveLength(1);
      expect(audioMockState.audioLayers[0].clips).toHaveLength(1);
    });

    it('falls back to first layer when target layer not found', () => {
      clipboardClips = [
        { type: 'audio', url: 'test.mp3', duration: 5, relativeOffset: 0, layerId: 'non-existent', sourceId: 'a1' },
      ];

      const command = createBatchPasteCommand({ playheadPosition: 0 });
      command.execute();

      expect(audioMockState.audioLayers[0].clips).toHaveLength(1);
    });

    it('appends to existing clips', () => {
      videoMockState.clips = [
        { id: 'existing', videoId: 'v0', url: 'existing.mp4', timestamp: 0, duration: 5 },
      ];

      clipboardClips = [
        { type: 'video', url: 'test.mp4', duration: 10, relativeOffset: 0, sourceId: 'v1' },
      ];

      const command = createBatchPasteCommand({ playheadPosition: 10 });
      command.execute();

      expect(videoMockState.clips).toHaveLength(2);
      expect(videoMockState.clips[0].id).toBe('existing');
    });
  });

  describe('undo', () => {
    it('removes pasted video clips', () => {
      clipboardClips = [
        { type: 'video', url: 'test.mp4', duration: 10, relativeOffset: 0, sourceId: 'v1' },
      ];

      const command = createBatchPasteCommand({ playheadPosition: 0 });
      command.execute();
      expect(videoMockState.clips).toHaveLength(1);

      command.undo();
      expect(videoMockState.clips).toHaveLength(0);
      expect(videoMockState.isDirty).toBe(true);
    });

    it('removes pasted audio clips', () => {
      clipboardClips = [
        { type: 'audio', url: 'test.mp3', duration: 5, relativeOffset: 0, layerId: 'layer-1', sourceId: 'a1' },
      ];

      const command = createBatchPasteCommand({ playheadPosition: 0 });
      command.execute();
      expect(audioMockState.audioLayers[0].clips).toHaveLength(1);

      command.undo();
      expect(audioMockState.audioLayers[0].clips).toHaveLength(0);
      expect(audioMockState.isDirty).toBe(true);
    });

    it('removes both video and audio clips', () => {
      clipboardClips = [
        { type: 'video', url: 'test.mp4', duration: 10, relativeOffset: 0, sourceId: 'v1' },
        { type: 'audio', url: 'test.mp3', duration: 5, relativeOffset: 0, layerId: 'layer-1', sourceId: 'a1' },
      ];

      const command = createBatchPasteCommand({ playheadPosition: 0 });
      command.execute();
      command.undo();

      expect(videoMockState.clips).toHaveLength(0);
      expect(audioMockState.audioLayers[0].clips).toHaveLength(0);
    });

    it('preserves existing clips when undoing', () => {
      videoMockState.clips = [
        { id: 'existing', videoId: 'v0', url: 'existing.mp4', timestamp: 0, duration: 5 },
      ];

      clipboardClips = [
        { type: 'video', url: 'test.mp4', duration: 10, relativeOffset: 0, sourceId: 'v1' },
      ];

      const command = createBatchPasteCommand({ playheadPosition: 10 });
      command.execute();
      command.undo();

      expect(videoMockState.clips).toHaveLength(1);
      expect(videoMockState.clips[0].id).toBe('existing');
    });

    it('only removes the specific pasted clips', () => {
      videoMockState.clips = [
        { id: 'existing', videoId: 'v0', url: 'existing.mp4', timestamp: 0, duration: 5 },
      ];

      clipboardClips = [
        { type: 'video', url: 'test.mp4', duration: 10, relativeOffset: 0, sourceId: 'v1' },
      ];

      const command = createBatchPasteCommand({ playheadPosition: 10 });
      command.execute();

      // Add another clip manually
      videoMockState.clips.push({
        id: 'manual',
        videoId: 'v2',
        url: 'manual.mp4',
        timestamp: 20,
        duration: 5,
      });

      command.undo();

      expect(videoMockState.clips).toHaveLength(2);
      expect(videoMockState.clips.map(c => c.id)).toContain('existing');
      expect(videoMockState.clips.map(c => c.id)).toContain('manual');
    });
  });

  describe('redo (execute after undo)', () => {
    it('can be re-executed after undo', () => {
      clipboardClips = [
        { type: 'video', url: 'test.mp4', duration: 10, relativeOffset: 0, sourceId: 'v1' },
      ];

      const command = createBatchPasteCommand({ playheadPosition: 5 });

      command.execute();
      expect(videoMockState.clips).toHaveLength(1);

      command.undo();
      expect(videoMockState.clips).toHaveLength(0);

      command.execute();
      expect(videoMockState.clips).toHaveLength(1);
      expect(videoMockState.clips[0].timestamp).toBe(5);
    });
  });
});
