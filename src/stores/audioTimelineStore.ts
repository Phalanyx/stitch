import { create } from 'zustand';
import { AudioReference, AudioLayer } from '@/types/audio';
import {
  findNearestValidPosition,
  isPositionValid as checkPositionValid,
  getValidPosition as computeValidPosition,
  TimelineClip,
} from '@/lib/timeline-validation';

const generateId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createDefaultLayer = (): AudioLayer => ({
  id: generateId(),
  name: 'Audio 1',
  clips: [],
  muted: false,
});

interface AudioTimelineState {
  audioLayers: AudioLayer[];
  activeLayerId: string | null;
  isDirty: boolean;

  // Layer management
  addLayer: () => void;
  removeLayer: (layerId: string) => void;
  setActiveLayer: (layerId: string | null) => void;
  toggleLayerMute: (layerId: string) => void;
  renameLayer: (layerId: string, name: string) => void;
  cleanupEmptyLayers: () => void;

  // Clip management (with optional layerId)
  normalizeClips: (clips: AudioReference[]) => { clips: AudioReference[]; changed: boolean };
  addAudioToTimeline: (audio: { id: string; url: string; duration?: number }, layerId?: string) => void;
  addAudioAtTimestamp: (audio: { id: string; url: string; duration?: number }, timestamp: number, layerId?: string) => void;
  updateAudioTimestamp: (id: string, newTime: number, layerId?: string) => void;
  updateAudioClipTrim: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }, layerId?: string) => void;
  removeAudioClip: (id: string, layerId?: string) => void;
  removeClipsByAudioId: (audioId: string) => void;

  // Session persistence (handles both old and new formats)
  setAudioClips: (data: AudioReference[] | AudioLayer[]) => void;
  markSaved: () => void;

  // Helper to get all clips flattened (for playback)
  getAllAudioClips: () => AudioReference[];

  // Overlap validation helpers (layer-specific)
  isPositionValid: (clipId: string, timestamp: number, duration: number, trimStart?: number, trimEnd?: number, layerId?: string) => boolean;
  getValidPosition: (clipId: string, timestamp: number, duration: number, trimStart?: number, trimEnd?: number, layerId?: string) => number;
}

export const useAudioTimelineStore = create<AudioTimelineState>((set, get) => ({
  audioLayers: [createDefaultLayer()],
  activeLayerId: null,
  isDirty: false,

  // Layer management
  addLayer: () => {
    const { audioLayers } = get();
    const newLayerNumber = audioLayers.length + 1;
    const newLayer: AudioLayer = {
      id: generateId(),
      name: `Audio ${newLayerNumber}`,
      clips: [],
      muted: false,
    };
    set({
      audioLayers: [...audioLayers, newLayer],
      activeLayerId: newLayer.id,
      isDirty: true,
    });
  },

  removeLayer: (layerId) => {
    const { audioLayers, activeLayerId } = get();
    // Don't remove the last layer
    if (audioLayers.length <= 1) return;

    const newLayers = audioLayers.filter((l) => l.id !== layerId);
    const newActiveLayerId = activeLayerId === layerId ? newLayers[0]?.id ?? null : activeLayerId;

    set({
      audioLayers: newLayers,
      activeLayerId: newActiveLayerId,
      isDirty: true,
    });
  },

  setActiveLayer: (layerId) => {
    set({ activeLayerId: layerId });
  },

  toggleLayerMute: (layerId) => {
    set((state) => ({
      audioLayers: state.audioLayers.map((l) =>
        l.id === layerId ? { ...l, muted: !l.muted } : l
      ),
      isDirty: true,
    }));
  },

  renameLayer: (layerId, name) => {
    set((state) => ({
      audioLayers: state.audioLayers.map((l) =>
        l.id === layerId ? { ...l, name } : l
      ),
      isDirty: true,
    }));
  },

  cleanupEmptyLayers: () => {
    const { audioLayers, activeLayerId } = get();

    // Keep non-empty layers, but always keep at least one
    const nonEmptyLayers = audioLayers.filter((l) => l.clips.length > 0);

    if (nonEmptyLayers.length === 0) {
      // All layers empty - keep the first one
      return;
    }

    if (nonEmptyLayers.length === audioLayers.length) {
      // No empty layers to remove
      return;
    }

    // Update active layer if it was removed
    const newActiveLayerId = nonEmptyLayers.some((l) => l.id === activeLayerId)
      ? activeLayerId
      : nonEmptyLayers[0]?.id ?? null;

    set({
      audioLayers: nonEmptyLayers,
      activeLayerId: newActiveLayerId,
      isDirty: true,
    });
  },

  normalizeClips: (clips: AudioReference[]) => {
    let changed = false;
    const seen = new Set<string>();
    const normalized = clips.map((clip) => {
      const audioId = clip.audioId ?? clip.id;
      let clipId = clip.id;

      if (!clip.audioId || seen.has(clipId)) {
        clipId = generateId();
      }

      if (clipId !== clip.id || audioId !== clip.audioId) {
        changed = true;
      }

      seen.add(clipId);

      return { ...clip, id: clipId, audioId };
    });

    return { clips: normalized, changed };
  },

  addAudioToTimeline: (audio, layerId) => {
    const { audioLayers, activeLayerId } = get();
    const targetLayerId = layerId ?? activeLayerId ?? audioLayers[0]?.id;
    if (!targetLayerId) return;

    const targetLayer = audioLayers.find((l) => l.id === targetLayerId);
    if (!targetLayer) return;

    const lastClip = targetLayer.clips[targetLayer.clips.length - 1];
    const newTimestamp = lastClip
      ? lastClip.timestamp + lastClip.duration - (lastClip.trimStart ?? 0) - (lastClip.trimEnd ?? 0)
      : 0;

    const clipId = generateId();

    set((state) => ({
      audioLayers: state.audioLayers.map((l) =>
        l.id === targetLayerId
          ? {
              ...l,
              clips: [
                ...l.clips,
                {
                  id: clipId,
                  audioId: audio.id,
                  url: audio.url,
                  timestamp: newTimestamp,
                  duration: audio.duration || 5,
                },
              ],
            }
          : l
      ),
      isDirty: true,
    }));
  },

  addAudioAtTimestamp: (audio, timestamp, layerId) => {
    const { audioLayers, activeLayerId } = get();
    const targetLayerId = layerId ?? activeLayerId ?? audioLayers[0]?.id;
    if (!targetLayerId) return;

    const targetLayer = audioLayers.find((l) => l.id === targetLayerId);
    if (!targetLayer) return;

    const clipId = generateId();
    const duration = audio.duration || 5;
    const newClip: TimelineClip = {
      id: clipId,
      timestamp: Math.max(0, timestamp),
      duration,
    };

    // Find valid position within this layer only
    const validTimestamp = findNearestValidPosition(targetLayer.clips as TimelineClip[], newClip);

    set((state) => ({
      audioLayers: state.audioLayers.map((l) =>
        l.id === targetLayerId
          ? {
              ...l,
              clips: [
                ...l.clips,
                {
                  id: clipId,
                  audioId: audio.id,
                  url: audio.url,
                  timestamp: validTimestamp,
                  duration,
                },
              ],
            }
          : l
      ),
      isDirty: true,
    }));
  },

  updateAudioTimestamp: (id, newTime, layerId) => {
    const { audioLayers } = get();

    // Find the layer containing this clip
    let targetLayer: AudioLayer | undefined;
    if (layerId) {
      targetLayer = audioLayers.find((l) => l.id === layerId);
    } else {
      targetLayer = audioLayers.find((l) => l.clips.some((c) => c.id === id));
    }
    if (!targetLayer) return;

    const clip = targetLayer.clips.find((c) => c.id === id);
    if (!clip) return;

    const testClip: TimelineClip = {
      id,
      timestamp: Math.max(0, newTime),
      duration: clip.duration,
      trimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
    };

    // Find valid position within this layer only
    const validTimestamp = findNearestValidPosition(targetLayer.clips as TimelineClip[], testClip, id);

    set((state) => ({
      audioLayers: state.audioLayers.map((l) =>
        l.id === targetLayer!.id
          ? {
              ...l,
              clips: l.clips.map((c) =>
                c.id === id ? { ...c, timestamp: validTimestamp } : c
              ),
            }
          : l
      ),
      isDirty: true,
    }));
  },

  updateAudioClipTrim: (id, updates, layerId) => {
    const { audioLayers } = get();

    // Find the layer containing this clip
    let targetLayer: AudioLayer | undefined;
    if (layerId) {
      targetLayer = audioLayers.find((l) => l.id === layerId);
    } else {
      targetLayer = audioLayers.find((l) => l.clips.some((c) => c.id === id));
    }
    if (!targetLayer) return;

    const clip = targetLayer.clips.find((c) => c.id === id);
    if (!clip) return;

    // Apply updates to create test clip
    const newTrimStart = updates.trimStart ?? clip.trimStart ?? 0;
    const newTrimEnd = updates.trimEnd ?? clip.trimEnd ?? 0;
    const newTimestamp = updates.timestamp ?? clip.timestamp;

    const testClip: TimelineClip = {
      id,
      timestamp: newTimestamp,
      duration: clip.duration,
      trimStart: newTrimStart,
      trimEnd: newTrimEnd,
    };

    // Find valid position within this layer only
    const validTimestamp = findNearestValidPosition(targetLayer.clips as TimelineClip[], testClip, id);

    set((state) => ({
      audioLayers: state.audioLayers.map((l) =>
        l.id === targetLayer!.id
          ? {
              ...l,
              clips: l.clips.map((c) =>
                c.id === id
                  ? { ...c, ...updates, timestamp: validTimestamp }
                  : c
              ),
            }
          : l
      ),
      isDirty: true,
    }));
  },

  removeAudioClip: (id, layerId) => {
    const { audioLayers } = get();

    // Find the layer containing this clip
    let targetLayerId: string | undefined;
    if (layerId) {
      targetLayerId = layerId;
    } else {
      const layer = audioLayers.find((l) => l.clips.some((c) => c.id === id));
      targetLayerId = layer?.id;
    }
    if (!targetLayerId) return;

    set((state) => ({
      audioLayers: state.audioLayers.map((l) =>
        l.id === targetLayerId
          ? { ...l, clips: l.clips.filter((clip) => clip.id !== id) }
          : l
      ),
      isDirty: true,
    }));
  },

  removeClipsByAudioId: (audioId) => {
    set((state) => ({
      audioLayers: state.audioLayers.map((l) => ({
        ...l,
        clips: l.clips.filter((clip) => clip.audioId !== audioId),
      })),
      isDirty: true,
    }));
  },

  setAudioClips: (data) => {
    const { normalizeClips } = get();

    // Detect if data is new format (array of layers) or old format (array of clips)
    const isNewFormat = Array.isArray(data) && data.length > 0 && 'clips' in data[0];

    if (isNewFormat) {
      // New format: array of AudioLayer objects
      const layers = data as AudioLayer[];
      let changed = false;

      const normalizedLayers = layers.map((layer) => {
        const { clips: normalizedClips, changed: clipsChanged } = normalizeClips(layer.clips);
        if (clipsChanged) changed = true;
        return { ...layer, clips: normalizedClips };
      });

      // Ensure at least one layer exists
      if (normalizedLayers.length === 0) {
        normalizedLayers.push(createDefaultLayer());
        changed = true;
      }

      set({
        audioLayers: normalizedLayers,
        activeLayerId: normalizedLayers[0]?.id ?? null,
        isDirty: changed,
      });
    } else {
      // Old format: array of AudioReference objects - migrate to single layer
      const clips = data as AudioReference[];
      const { clips: normalizedClips, changed } = normalizeClips(clips);

      const migratedLayer: AudioLayer = {
        id: generateId(),
        name: 'Audio 1',
        clips: normalizedClips,
        muted: false,
      };

      set({
        audioLayers: [migratedLayer],
        activeLayerId: migratedLayer.id,
        isDirty: changed,
      });
    }
  },

  markSaved: () => set({ isDirty: false }),

  getAllAudioClips: () => {
    const { audioLayers } = get();
    return audioLayers
      .filter((l) => !l.muted)
      .flatMap((l) => l.clips);
  },

  // Overlap validation helpers for UI feedback
  isPositionValid: (clipId, timestamp, duration, trimStart, trimEnd, layerId) => {
    const { audioLayers } = get();

    // Find the layer containing this clip
    let targetLayer: AudioLayer | undefined;
    if (layerId) {
      targetLayer = audioLayers.find((l) => l.id === layerId);
    } else {
      targetLayer = audioLayers.find((l) => l.clips.some((c) => c.id === clipId));
    }
    if (!targetLayer) return true;

    return checkPositionValid(targetLayer.clips as TimelineClip[], clipId, timestamp, duration, trimStart, trimEnd);
  },

  getValidPosition: (clipId, timestamp, duration, trimStart, trimEnd, layerId) => {
    const { audioLayers } = get();

    // Find the layer containing this clip
    let targetLayer: AudioLayer | undefined;
    if (layerId) {
      targetLayer = audioLayers.find((l) => l.id === layerId);
    } else {
      targetLayer = audioLayers.find((l) => l.clips.some((c) => c.id === clipId));
    }
    if (!targetLayer) return timestamp;

    return computeValidPosition(targetLayer.clips as TimelineClip[], clipId, timestamp, duration, trimStart, trimEnd);
  },
}));
