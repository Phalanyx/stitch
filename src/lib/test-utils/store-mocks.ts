/**
 * Mock utilities for testing Zustand stores in command tests.
 * Provides factory functions and setup helpers for consistent test mocking.
 */

import { VideoReference } from '@/types/video';
import { AudioReference, AudioLayer } from '@/types/audio';

// ==================== Factory Functions ====================

/**
 * Create a mock video clip with sensible defaults.
 */
export function createVideoClip(overrides: Partial<VideoReference> = {}): VideoReference {
  return {
    id: `clip-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    videoId: overrides.videoId || overrides.id || 'video-1',
    url: 'https://example.com/video.mp4',
    timestamp: 0,
    duration: 10,
    ...overrides,
  };
}

/**
 * Create a mock audio clip with sensible defaults.
 */
export function createAudioClip(overrides: Partial<AudioReference> = {}): AudioReference {
  return {
    id: `audio-clip-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    audioId: overrides.audioId || overrides.id || 'audio-1',
    url: 'https://example.com/audio.mp3',
    timestamp: 0,
    duration: 5,
    ...overrides,
  };
}

/**
 * Create a mock audio layer with clips.
 */
export function createAudioLayer(
  overrides: Partial<AudioLayer> = {},
  clips: AudioReference[] = []
): AudioLayer {
  return {
    id: `layer-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: 'Audio',
    clips,
    muted: false,
    ...overrides,
  };
}

// ==================== Timeline Store Mock ====================

export interface MockTimelineState {
  clips: VideoReference[];
  isDirty: boolean;
}

/**
 * Create a mock timeline store setup for testing video commands.
 * Returns the mock state object and mock functions.
 */
export function setupMockTimelineStore(initialState: Partial<MockTimelineState> = {}) {
  const mockState: MockTimelineState = {
    clips: [],
    isDirty: false,
    ...initialState,
  };

  const getState = jest.fn(() => mockState);
  const setState = jest.fn((newState: Partial<MockTimelineState> | ((state: MockTimelineState) => Partial<MockTimelineState>)) => {
    if (typeof newState === 'function') {
      const updates = newState(mockState);
      Object.assign(mockState, updates);
    } else {
      Object.assign(mockState, newState);
    }
  });

  return {
    mockState,
    getState,
    setState,
    getMockStore: () => ({
      getState,
      setState,
    }),
  };
}

// ==================== Audio Timeline Store Mock ====================

export interface MockAudioTimelineState {
  audioLayers: AudioLayer[];
  activeLayerId: string | null;
  isDirty: boolean;
}

/**
 * Create a mock audio timeline store setup for testing audio commands.
 * Returns the mock state object and mock functions.
 */
export function setupMockAudioTimelineStore(initialState: Partial<MockAudioTimelineState> = {}) {
  const defaultLayer = createAudioLayer({ id: 'default-layer' });

  const mockState: MockAudioTimelineState = {
    audioLayers: [defaultLayer],
    activeLayerId: defaultLayer.id,
    isDirty: false,
    ...initialState,
  };

  const getState = jest.fn(() => mockState);
  const setState = jest.fn((newState: Partial<MockAudioTimelineState> | ((state: MockAudioTimelineState) => Partial<MockAudioTimelineState>)) => {
    if (typeof newState === 'function') {
      const updates = newState(mockState);
      Object.assign(mockState, updates);
    } else {
      Object.assign(mockState, newState);
    }
  });

  return {
    mockState,
    getState,
    setState,
    getMockStore: () => ({
      getState,
      setState,
    }),
  };
}

// ==================== Clipboard Store Mock ====================

export interface MockClipboardState {
  clips: Array<{
    type: 'video' | 'audio';
    url: string;
    duration: number;
    trimStart?: number;
    trimEnd?: number;
    relativeOffset: number;
    layerId?: string;
    sourceId?: string;
  }>;
}

/**
 * Create a mock clipboard store setup for testing paste commands.
 */
export function setupMockClipboardStore(initialClips: MockClipboardState['clips'] = []) {
  const mockState: MockClipboardState = {
    clips: initialClips,
  };

  const getState = jest.fn(() => ({
    ...mockState,
    getClips: () => mockState.clips,
    hasContent: () => mockState.clips.length > 0,
  }));

  return {
    mockState,
    getState,
  };
}

// ==================== crypto.randomUUID Mock ====================

/**
 * Setup a predictable crypto.randomUUID mock for testing.
 * Returns a cleanup function to restore original behavior.
 */
export function setupCryptoMock() {
  let uuidCounter = 0;
  const originalCrypto = global.crypto;

  Object.defineProperty(global, 'crypto', {
    value: {
      ...originalCrypto,
      randomUUID: () => `test-uuid-${++uuidCounter}`,
    },
    writable: true,
    configurable: true,
  });

  return {
    reset: () => {
      uuidCounter = 0;
    },
    restore: () => {
      Object.defineProperty(global, 'crypto', {
        value: originalCrypto,
        writable: true,
        configurable: true,
      });
    },
    getCounter: () => uuidCounter,
  };
}
