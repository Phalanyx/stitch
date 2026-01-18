import { create } from 'zustand';
import { AudioReference, AudioLayer } from '@/types/audio';

const generateId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createDefaultLayer = (): AudioLayer => ({
  id: generateId(),
  name: 'Audio',
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
  updateAudioTimestampWithAutoTrim: (id: string, newTime: number, layerId: string) => void;
  updateAudioClipTrim: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }, layerId?: string) => void;
  updateAudioClipDepth: (id: string, newDepth: number, layerId?: string) => void;
  removeAudioClip: (id: string, layerId?: string) => void;
  removeClipsByAudioId: (audioId: string) => void;

  // Session persistence (handles both old and new formats)
  setAudioClips: (data: AudioReference[] | AudioLayer[]) => void;
  markSaved: () => void;

  // Helper to get all clips flattened (for playback)
  getAllAudioClips: () => AudioReference[];

  // Overlap validation helpers (layer-specific)
  isPositionValid: (clipId: string, timestamp: number, duration: number, trimStart?: number, trimEnd?: number, layerId?: string) => boolean;
  isPositionValidOrAutoTrimmable: (clipId: string, timestamp: number, duration: number, layerId: string, trimStart?: number, trimEnd?: number) => boolean;
  getValidPosition: (clipId: string, timestamp: number, duration: number, trimStart?: number, trimEnd?: number, layerId?: string) => number;
}

export const useAudioTimelineStore = create<AudioTimelineState>((set, get) => ({
  audioLayers: [createDefaultLayer()],
  activeLayerId: null,
  isDirty: false,

  // Layer management - Single layer mode: these are no-ops
  addLayer: () => {
    // No-op: Single audio track mode - cannot add layers
  },

  removeLayer: () => {
    // No-op: Single audio track mode - cannot remove the only layer
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

    const clipId = generateId();
    const duration = audio.duration || 5;

    // Allow overlapping clips - no position validation needed
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
                  timestamp: Math.max(0, timestamp),
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

    // Allow overlapping clips - no position validation needed
    set((state) => ({
      audioLayers: state.audioLayers.map((l) =>
        l.id === targetLayer!.id
          ? {
              ...l,
              clips: l.clips.map((c) =>
                c.id === id ? { ...c, timestamp: Math.max(0, newTime) } : c
              ),
            }
          : l
      ),
      isDirty: true,
    }));
  },

  updateAudioTimestampWithAutoTrim: (id, newTime, layerId) => {
    const { audioLayers } = get();

    const targetLayer = audioLayers.find((l) => l.id === layerId);
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

    // Check if auto-trim can resolve any overlap within this layer
    const autoTrimResult = calculateAutoTrim(targetLayer.clips as TimelineClip[], testClip, id);

    if (autoTrimResult.isValid && autoTrimResult.clipToTrim) {
      // Apply auto-trim: update both the moved clip and the trimmed clip
      set((state) => ({
        audioLayers: state.audioLayers.map((l) =>
          l.id === layerId
            ? {
                ...l,
                clips: l.clips.map((c) => {
                  if (c.id === id) {
                    return { ...c, timestamp: testClip.timestamp };
                  }
                  if (c.id === autoTrimResult.clipToTrim) {
                    return { ...c, trimEnd: autoTrimResult.newTrimEnd };
                  }
                  return c;
                }),
              }
            : l
        ),
        isDirty: true,
      }));
    } else if (autoTrimResult.isValid) {
      // No overlap, just update position
      set((state) => ({
        audioLayers: state.audioLayers.map((l) =>
          l.id === layerId
            ? {
                ...l,
                clips: l.clips.map((c) =>
                  c.id === id ? { ...c, timestamp: testClip.timestamp } : c
                ),
              }
            : l
        ),
        isDirty: true,
      }));
    } else {
      // Invalid position, fall back to nearest valid position
      const validTimestamp = findNearestValidPosition(targetLayer.clips as TimelineClip[], testClip, id);
      set((state) => ({
        audioLayers: state.audioLayers.map((l) =>
          l.id === layerId
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
    }
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

    // Allow overlapping clips - no position validation needed
    set((state) => ({
      audioLayers: state.audioLayers.map((l) =>
        l.id === targetLayer!.id
          ? {
              ...l,
              clips: l.clips.map((c) =>
                c.id === id
                  ? { ...c, ...updates }
                  : c
              ),
            }
          : l
      ),
      isDirty: true,
    }));
  },

  updateAudioClipDepth: (id, newDepth, layerId) => {
    const { audioLayers } = get();

    // Find the layer containing this clip
    let targetLayer: AudioLayer | undefined;
    if (layerId) {
      targetLayer = audioLayers.find((l) => l.id === layerId);
    } else {
      targetLayer = audioLayers.find((l) => l.clips.some((c) => c.id === id));
    }
    if (!targetLayer) return;

    set((state) => ({
      audioLayers: state.audioLayers.map((l) =>
        l.id === targetLayer!.id
          ? {
              ...l,
              clips: l.clips.map((c) =>
                c.id === id
                  ? { ...c, depth: newDepth }
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

      // Merge all clips from all layers into a single layer (migration to single track mode)
      const allClips: AudioReference[] = [];
      for (const layer of layers) {
        allClips.push(...layer.clips);
      }

      // If there were multiple layers, mark as changed (migration happened)
      if (layers.length > 1) {
        changed = true;
      }

      const { clips: normalizedClips, changed: clipsChanged } = normalizeClips(allClips);
      if (clipsChanged) changed = true;

      // Use first layer's mute state, or default to unmuted
      const muted = layers[0]?.muted ?? false;

      const mergedLayer: AudioLayer = {
        id: layers[0]?.id ?? generateId(),
        name: 'Audio',
        clips: normalizedClips,
        muted,
      };

      set({
        audioLayers: [mergedLayer],
        activeLayerId: mergedLayer.id,
        isDirty: changed,
      });
    } else {
      // Old format: array of AudioReference objects - migrate to single layer
      const clips = data as AudioReference[];
      const { clips: normalizedClips, changed } = normalizeClips(clips);

      const migratedLayer: AudioLayer = {
        id: generateId(),
        name: 'Audio',
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

  // Overlap validation helpers - Always return valid since clips can now overlap
  isPositionValid: () => {
    // Always valid - clips can overlap in single track mode
    return true;
  },

  isPositionValidOrAutoTrimmable: (clipId, timestamp, duration, layerId, trimStart, trimEnd) => {
    const { audioLayers } = get();

    const targetLayer = audioLayers.find((l) => l.id === layerId);
    if (!targetLayer) return true;

    const testClip: TimelineClip = {
      id: clipId,
      timestamp,
      duration,
      trimStart,
      trimEnd,
    };
    return isPositionValidOrAutoTrimmable(targetLayer.clips as TimelineClip[], testClip, clipId);
  },

  getValidPosition: (_clipId, timestamp) => {
    // No position adjustment needed - clips can overlap
    return timestamp;
  },
}));
