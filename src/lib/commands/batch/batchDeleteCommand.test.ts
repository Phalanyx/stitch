/**
 * Tests for batchDeleteCommand.
 */

import { createBatchDeleteCommand } from './batchDeleteCommand';
import { useTimelineStore } from '@/stores/timelineStore';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { VideoReference } from '@/types/video';
import { AudioLayer, AudioReference } from '@/types/audio';

// Mock both stores
jest.mock('@/stores/timelineStore');
jest.mock('@/stores/audioTimelineStore');

describe('createBatchDeleteCommand', () => {
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
    (useTimelineStore.getState as jest.Mock).mockImplementation(() => videoMockState);
    (useTimelineStore.setState as jest.Mock).mockImplementation((newState) => {
      Object.assign(videoMockState, newState);
    });

    // Setup audio store mocks
    (useAudioTimelineStore.getState as jest.Mock).mockImplementation(() => audioMockState);
    (useAudioTimelineStore.setState as jest.Mock).mockImplementation((newState) => {
      Object.assign(audioMockState, newState);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('command creation', () => {
    it('captures video clip snapshots', () => {
      videoMockState.clips = [
        { id: 'v-clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 5, duration: 10 },
      ];

      const command = createBatchDeleteCommand({
        videoClipIds: ['v-clip-1'],
        audioClips: [],
      });

      // Modify state after creation
      videoMockState.clips[0].timestamp = 100;

      // Execute and undo to verify snapshot was captured
      command.execute();
      command.undo();

      expect(videoMockState.clips[0].timestamp).toBe(5);
    });

    it('captures audio clip snapshots', () => {
      audioMockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'a-clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 5, duration: 10 },
        ]),
      ];

      const command = createBatchDeleteCommand({
        videoClipIds: [],
        audioClips: [{ id: 'a-clip-1', layerId: 'layer-1' }],
      });

      // Modify state after creation
      audioMockState.audioLayers[0].clips[0].timestamp = 100;

      // Execute and undo to verify snapshot was captured
      command.execute();
      command.undo();

      expect(audioMockState.audioLayers[0].clips[0].timestamp).toBe(5);
    });

    it('throws error when no clips found to delete', () => {
      expect(() => {
        createBatchDeleteCommand({
          videoClipIds: ['non-existent'],
          audioClips: [{ id: 'non-existent', layerId: 'layer-1' }],
        });
      }).toThrow('No clips found to delete');
    });

    it('creates command with correct type and description', () => {
      videoMockState.clips = [
        { id: 'v-clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
        { id: 'v-clip-2', videoId: 'v2', url: 'test2.mp4', timestamp: 10, duration: 5 },
      ];

      const command = createBatchDeleteCommand({
        videoClipIds: ['v-clip-1', 'v-clip-2'],
        audioClips: [],
      });

      expect(command.type).toBe('batch:delete');
      expect(command.description).toBe('Delete 2 clips');
    });

    it('uses singular in description for single clip', () => {
      videoMockState.clips = [
        { id: 'v-clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createBatchDeleteCommand({
        videoClipIds: ['v-clip-1'],
        audioClips: [],
      });

      expect(command.description).toBe('Delete 1 clip');
    });

    it('skips non-existent clips gracefully', () => {
      videoMockState.clips = [
        { id: 'v-clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];

      const command = createBatchDeleteCommand({
        videoClipIds: ['v-clip-1', 'non-existent'],
        audioClips: [],
      });

      expect(command.description).toBe('Delete 1 clip');
    });
  });

  describe('execute', () => {
    it('removes video clips from timeline', () => {
      videoMockState.clips = [
        { id: 'v-clip-1', videoId: 'v1', url: 'test1.mp4', timestamp: 0, duration: 10 },
        { id: 'v-clip-2', videoId: 'v2', url: 'test2.mp4', timestamp: 10, duration: 5 },
      ];

      const command = createBatchDeleteCommand({
        videoClipIds: ['v-clip-1'],
        audioClips: [],
      });

      command.execute();

      expect(videoMockState.clips).toHaveLength(1);
      expect(videoMockState.clips[0].id).toBe('v-clip-2');
      expect(videoMockState.isDirty).toBe(true);
    });

    it('removes audio clips from layers', () => {
      audioMockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'a-clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 10 },
          { id: 'a-clip-2', audioId: 'a2', url: 'test2.mp3', timestamp: 10, duration: 5 },
        ]),
      ];

      const command = createBatchDeleteCommand({
        videoClipIds: [],
        audioClips: [{ id: 'a-clip-1', layerId: 'layer-1' }],
      });

      command.execute();

      expect(audioMockState.audioLayers[0].clips).toHaveLength(1);
      expect(audioMockState.audioLayers[0].clips[0].id).toBe('a-clip-2');
      expect(audioMockState.isDirty).toBe(true);
    });

    it('removes both video and audio clips', () => {
      videoMockState.clips = [
        { id: 'v-clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];
      audioMockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'a-clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 5 },
        ]),
      ];

      const command = createBatchDeleteCommand({
        videoClipIds: ['v-clip-1'],
        audioClips: [{ id: 'a-clip-1', layerId: 'layer-1' }],
      });

      command.execute();

      expect(videoMockState.clips).toHaveLength(0);
      expect(audioMockState.audioLayers[0].clips).toHaveLength(0);
    });

    it('removes multiple video clips', () => {
      videoMockState.clips = [
        { id: 'v-clip-1', videoId: 'v1', url: 'test1.mp4', timestamp: 0, duration: 10 },
        { id: 'v-clip-2', videoId: 'v2', url: 'test2.mp4', timestamp: 10, duration: 5 },
        { id: 'v-clip-3', videoId: 'v3', url: 'test3.mp4', timestamp: 15, duration: 5 },
      ];

      const command = createBatchDeleteCommand({
        videoClipIds: ['v-clip-1', 'v-clip-3'],
        audioClips: [],
      });

      command.execute();

      expect(videoMockState.clips).toHaveLength(1);
      expect(videoMockState.clips[0].id).toBe('v-clip-2');
    });

    it('removes audio clips from multiple layers', () => {
      audioMockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'a-clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 5 },
        ]),
        createLayer('layer-2', [
          { id: 'a-clip-2', audioId: 'a2', url: 'test2.mp3', timestamp: 0, duration: 5 },
        ]),
      ];

      const command = createBatchDeleteCommand({
        videoClipIds: [],
        audioClips: [
          { id: 'a-clip-1', layerId: 'layer-1' },
          { id: 'a-clip-2', layerId: 'layer-2' },
        ],
      });

      command.execute();

      expect(audioMockState.audioLayers[0].clips).toHaveLength(0);
      expect(audioMockState.audioLayers[1].clips).toHaveLength(0);
    });
  });

  describe('undo', () => {
    it('restores video clips', () => {
      videoMockState.clips = [
        { id: 'v-clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 5, duration: 10 },
      ];

      const command = createBatchDeleteCommand({
        videoClipIds: ['v-clip-1'],
        audioClips: [],
      });

      command.execute();
      expect(videoMockState.clips).toHaveLength(0);

      command.undo();
      expect(videoMockState.clips).toHaveLength(1);
      expect(videoMockState.clips[0]).toMatchObject({
        id: 'v-clip-1',
        timestamp: 5,
        duration: 10,
      });
    });

    it('restores audio clips to correct layers', () => {
      audioMockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'a-clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 5, duration: 10 },
        ]),
        createLayer('layer-2', [
          { id: 'a-clip-2', audioId: 'a2', url: 'test2.mp3', timestamp: 0, duration: 5 },
        ]),
      ];

      const command = createBatchDeleteCommand({
        videoClipIds: [],
        audioClips: [
          { id: 'a-clip-1', layerId: 'layer-1' },
          { id: 'a-clip-2', layerId: 'layer-2' },
        ],
      });

      command.execute();
      expect(audioMockState.audioLayers[0].clips).toHaveLength(0);
      expect(audioMockState.audioLayers[1].clips).toHaveLength(0);

      command.undo();
      expect(audioMockState.audioLayers[0].clips).toHaveLength(1);
      expect(audioMockState.audioLayers[0].clips[0].id).toBe('a-clip-1');
      expect(audioMockState.audioLayers[1].clips).toHaveLength(1);
      expect(audioMockState.audioLayers[1].clips[0].id).toBe('a-clip-2');
    });

    it('restores both video and audio clips', () => {
      videoMockState.clips = [
        { id: 'v-clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];
      audioMockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'a-clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 5 },
        ]),
      ];

      const command = createBatchDeleteCommand({
        videoClipIds: ['v-clip-1'],
        audioClips: [{ id: 'a-clip-1', layerId: 'layer-1' }],
      });

      command.execute();
      command.undo();

      expect(videoMockState.clips).toHaveLength(1);
      expect(audioMockState.audioLayers[0].clips).toHaveLength(1);
    });

    it('marks both stores as dirty', () => {
      videoMockState.clips = [
        { id: 'v-clip-1', videoId: 'v1', url: 'test.mp4', timestamp: 0, duration: 10 },
      ];
      audioMockState.audioLayers = [
        createLayer('layer-1', [
          { id: 'a-clip-1', audioId: 'a1', url: 'test.mp3', timestamp: 0, duration: 5 },
        ]),
      ];

      const command = createBatchDeleteCommand({
        videoClipIds: ['v-clip-1'],
        audioClips: [{ id: 'a-clip-1', layerId: 'layer-1' }],
      });

      command.execute();
      videoMockState.isDirty = false;
      audioMockState.isDirty = false;

      command.undo();

      expect(videoMockState.isDirty).toBe(true);
      expect(audioMockState.isDirty).toBe(true);
    });
  });
});
