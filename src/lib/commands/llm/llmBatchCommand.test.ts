/**
 * Tests for llmBatchCommand.
 */

import { createLLMBatchCommand } from './llmBatchCommand';
import { useTimelineStore } from '@/stores/timelineStore';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { VideoReference } from '@/types/video';
import { AudioLayer, AudioReference } from '@/types/audio';

// Mock both stores
jest.mock('@/stores/timelineStore');
jest.mock('@/stores/audioTimelineStore');

describe('createLLMBatchCommand', () => {
  let videoMockState: { clips: VideoReference[]; isDirty: boolean };
  let audioMockState: { audioLayers: AudioLayer[]; isDirty: boolean };
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

    // Mock crypto.randomUUID
    Object.defineProperty(global, 'crypto', {
      value: {
        randomUUID: () => `test-uuid-${++uuidCounter}`,
      },
      writable: true,
      configurable: true,
    });

    // Setup video store mocks
    (useTimelineStore.setState as jest.Mock).mockImplementation((newState) => {
      Object.assign(videoMockState, newState);
    });

    // Setup audio store mocks
    (useAudioTimelineStore.setState as jest.Mock).mockImplementation((newState) => {
      Object.assign(audioMockState, newState);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('command creation', () => {
    it('creates command with correct type', () => {
      const command = createLLMBatchCommand({
        description: 'Test LLM operation',
        beforeClips: [],
        afterClips: [],
        beforeAudioLayers: [],
        afterAudioLayers: [],
      });

      expect(command.type).toBe('llm:batch');
    });

    it('uses provided description', () => {
      const command = createLLMBatchCommand({
        description: 'Add intro and outro clips',
        beforeClips: [],
        afterClips: [],
        beforeAudioLayers: [],
        afterAudioLayers: [],
      });

      expect(command.description).toBe('Add intro and outro clips');
    });

    it('generates unique command ID', () => {
      const command = createLLMBatchCommand({
        description: 'Test',
        beforeClips: [],
        afterClips: [],
        beforeAudioLayers: [],
        afterAudioLayers: [],
      });

      expect(command.id).toBe('test-uuid-1');
    });
  });

  describe('execute', () => {
    it('sets timeline to afterClips state', () => {
      const afterClips: VideoReference[] = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
        { id: 'clip-2', videoId: 'v2', url: 'test2.mp4', timestamp: 10, duration: 5 },
      ];

      const command = createLLMBatchCommand({
        description: 'Add clips',
        beforeClips: [],
        afterClips,
        beforeAudioLayers: [],
        afterAudioLayers: [],
      });

      command.execute();

      expect(videoMockState.clips).toHaveLength(2);
      expect(videoMockState.clips[0].id).toBe('clip-1');
      expect(videoMockState.clips[1].id).toBe('clip-2');
      expect(videoMockState.isDirty).toBe(true);
    });

    it('sets audio layers to afterAudioLayers state', () => {
      const afterAudioLayers: AudioLayer[] = [
        createLayer('layer-1', [
          { id: 'a-clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 5 },
        ]),
      ];

      const command = createLLMBatchCommand({
        description: 'Add audio',
        beforeClips: [],
        afterClips: [],
        beforeAudioLayers: [createLayer('layer-1')],
        afterAudioLayers,
      });

      command.execute();

      expect(audioMockState.audioLayers[0].clips).toHaveLength(1);
      expect(audioMockState.audioLayers[0].clips[0].id).toBe('a-clip-1');
      expect(audioMockState.isDirty).toBe(true);
    });

    it('replaces all existing clips with afterClips', () => {
      videoMockState.clips = [
        { id: 'old-clip', videoId: 'v0', url: 'old.mp4', timestamp: 0, duration: 5 },
      ];

      const afterClips: VideoReference[] = [
        { id: 'new-clip', videoId: 'v1', url: 'new.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createLLMBatchCommand({
        description: 'Replace clips',
        beforeClips: videoMockState.clips,
        afterClips,
        beforeAudioLayers: [],
        afterAudioLayers: [],
      });

      command.execute();

      expect(videoMockState.clips).toHaveLength(1);
      expect(videoMockState.clips[0].id).toBe('new-clip');
    });

    it('spreads clips array for immutable state updates', () => {
      const afterClips: VideoReference[] = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];
      const afterAudioLayers: AudioLayer[] = [
        createLayer('layer-1', [
          { id: 'a-clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 5 },
        ]),
      ];

      const command = createLLMBatchCommand({
        description: 'Test',
        beforeClips: [],
        afterClips,
        beforeAudioLayers: [],
        afterAudioLayers,
      });

      command.execute();

      // Verify clips were set correctly
      expect(videoMockState.clips).toHaveLength(1);
      expect(videoMockState.clips[0].id).toBe('clip-1');
      expect(audioMockState.audioLayers[0].clips).toHaveLength(1);
      expect(audioMockState.audioLayers[0].clips[0].id).toBe('a-clip-1');

      // Note: The implementation uses spread operator which creates shallow copies
      // Pushing to the original array won't affect state array (different array refs)
      afterClips.push({ id: 'new', videoId: 'v2', url: 'new.mp4', timestamp: 10, duration: 5 });
      expect(videoMockState.clips).toHaveLength(1); // State array unaffected by push
    });
  });

  describe('undo', () => {
    it('restores timeline to beforeClips state', () => {
      const beforeClips: VideoReference[] = [
        { id: 'clip-before', videoId: 'v1', url: 'before.mp4', timestamp: 0, duration: 5 },
      ];
      const afterClips: VideoReference[] = [
        { id: 'clip-after', videoId: 'v2', url: 'after.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createLLMBatchCommand({
        description: 'Modify timeline',
        beforeClips,
        afterClips,
        beforeAudioLayers: [],
        afterAudioLayers: [],
      });

      command.execute();
      expect(videoMockState.clips[0].id).toBe('clip-after');

      command.undo();
      expect(videoMockState.clips).toHaveLength(1);
      expect(videoMockState.clips[0].id).toBe('clip-before');
      expect(videoMockState.isDirty).toBe(true);
    });

    it('restores audio layers to beforeAudioLayers state', () => {
      const beforeAudioLayers: AudioLayer[] = [
        createLayer('layer-1', [
          { id: 'a-clip-before', audioId: 'a1', url: 'before.mp3', timestamp: 0, duration: 5 },
        ]),
      ];
      const afterAudioLayers: AudioLayer[] = [
        createLayer('layer-1', [
          { id: 'a-clip-after', audioId: 'a2', url: 'after.mp3', timestamp: 0, duration: 10 },
        ]),
      ];

      const command = createLLMBatchCommand({
        description: 'Modify audio',
        beforeClips: [],
        afterClips: [],
        beforeAudioLayers,
        afterAudioLayers,
      });

      command.execute();
      expect(audioMockState.audioLayers[0].clips[0].id).toBe('a-clip-after');

      command.undo();
      expect(audioMockState.audioLayers[0].clips[0].id).toBe('a-clip-before');
      expect(audioMockState.isDirty).toBe(true);
    });

    it('restores empty state', () => {
      const afterClips: VideoReference[] = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createLLMBatchCommand({
        description: 'Add clips',
        beforeClips: [],
        afterClips,
        beforeAudioLayers: [createLayer('layer-1')],
        afterAudioLayers: [createLayer('layer-1')],
      });

      command.execute();
      expect(videoMockState.clips).toHaveLength(1);

      command.undo();
      expect(videoMockState.clips).toHaveLength(0);
    });

    it('spreads clips array when restoring for immutable state', () => {
      const beforeClips: VideoReference[] = [
        { id: 'clip-before', videoId: 'v1', url: 'before.mp4', timestamp: 0, duration: 5 },
      ];

      const command = createLLMBatchCommand({
        description: 'Test',
        beforeClips,
        afterClips: [],
        beforeAudioLayers: [],
        afterAudioLayers: [],
      });

      command.execute();
      command.undo();

      // Verify clips were restored correctly
      expect(videoMockState.clips).toHaveLength(1);
      expect(videoMockState.clips[0].id).toBe('clip-before');

      // Note: The implementation uses spread operator which creates shallow copies
      // Pushing to the original array won't affect state array
      beforeClips.push({ id: 'new', videoId: 'v2', url: 'new.mp4', timestamp: 10, duration: 5 });
      expect(videoMockState.clips).toHaveLength(1); // State array unaffected by push
    });
  });

  describe('redo (execute after undo)', () => {
    it('can be re-executed after undo', () => {
      const beforeClips: VideoReference[] = [
        { id: 'before', videoId: 'v1', url: 'before.mp4', timestamp: 0, duration: 5 },
      ];
      const afterClips: VideoReference[] = [
        { id: 'after', videoId: 'v2', url: 'after.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createLLMBatchCommand({
        description: 'LLM Edit',
        beforeClips,
        afterClips,
        beforeAudioLayers: [],
        afterAudioLayers: [],
      });

      command.execute();
      expect(videoMockState.clips[0].id).toBe('after');

      command.undo();
      expect(videoMockState.clips[0].id).toBe('before');

      command.execute();
      expect(videoMockState.clips[0].id).toBe('after');
    });

    it('multiple undo/redo cycles work correctly', () => {
      const beforeClips: VideoReference[] = [];
      const afterClips: VideoReference[] = [
        { id: 'clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createLLMBatchCommand({
        description: 'Add clip',
        beforeClips,
        afterClips,
        beforeAudioLayers: [],
        afterAudioLayers: [],
      });

      // Execute -> Undo -> Execute -> Undo -> Execute
      command.execute();
      expect(videoMockState.clips).toHaveLength(1);

      command.undo();
      expect(videoMockState.clips).toHaveLength(0);

      command.execute();
      expect(videoMockState.clips).toHaveLength(1);

      command.undo();
      expect(videoMockState.clips).toHaveLength(0);

      command.execute();
      expect(videoMockState.clips).toHaveLength(1);
    });
  });
});
