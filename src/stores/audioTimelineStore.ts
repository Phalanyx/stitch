import { create } from 'zustand';
import { AudioReference } from '@/types/audio';
import {
  findNearestValidPosition,
  isPositionValid as checkPositionValid,
  getValidPosition as computeValidPosition,
  TimelineClip,
} from '@/lib/timeline-validation';

interface AudioTimelineState {
  audioClips: AudioReference[];
  isDirty: boolean;

  normalizeClips: (clips: AudioReference[]) => { clips: AudioReference[]; changed: boolean };
  addAudioToTimeline: (audio: { id: string; url: string; duration?: number }) => void;
  addAudioAtTimestamp: (audio: { id: string; url: string; duration?: number }, timestamp: number) => void;
  updateAudioTimestamp: (id: string, newTime: number) => void;
  updateAudioClipTrim: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }) => void;
  removeAudioClip: (id: string) => void;
  removeClipsByAudioId: (audioId: string) => void;
  setAudioClips: (clips: AudioReference[]) => void;
  markSaved: () => void;
  // Overlap validation helpers
  isPositionValid: (clipId: string, timestamp: number, duration: number, trimStart?: number, trimEnd?: number) => boolean;
  getValidPosition: (clipId: string, timestamp: number, duration: number, trimStart?: number, trimEnd?: number) => number;
}

export const useAudioTimelineStore = create<AudioTimelineState>((set, get) => ({
  audioClips: [],
  isDirty: false,

  normalizeClips: (clips: AudioReference[]) => {
    let changed = false;
    const seen = new Set<string>();
    const normalized = clips.map((clip) => {
      const audioId = clip.audioId ?? clip.id;
      let clipId = clip.id;

      if (!clip.audioId || seen.has(clipId)) {
        clipId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }

      if (clipId !== clip.id || audioId !== clip.audioId) {
        changed = true;
      }

      seen.add(clipId);

      return { ...clip, id: clipId, audioId };
    });

    return { clips: normalized, changed };
  },

  addAudioToTimeline: (audio) => {
    const { audioClips } = get();
    const lastClip = audioClips[audioClips.length - 1];
    const newTimestamp = lastClip ? lastClip.timestamp + lastClip.duration : 0;
    const clipId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    set({
      audioClips: [...audioClips, {
        id: clipId,
        audioId: audio.id,
        url: audio.url,
        timestamp: newTimestamp,
        duration: audio.duration || 5,
      }],
      isDirty: true,
    });
  },

  addAudioAtTimestamp: (audio, timestamp) => {
    const { audioClips } = get();
    const clipId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const duration = audio.duration || 5;
    const newClip: TimelineClip = {
      id: clipId,
      timestamp: Math.max(0, timestamp),
      duration,
    };

    // Find valid position that doesn't overlap with existing clips
    const validTimestamp = findNearestValidPosition(audioClips as TimelineClip[], newClip);

    set({
      audioClips: [...audioClips, {
        id: clipId,
        audioId: audio.id,
        url: audio.url,
        timestamp: validTimestamp,
        duration,
      }],
      isDirty: true,
    });
  },

  updateAudioTimestamp: (id, newTime) => {
    const { audioClips } = get();
    const clip = audioClips.find((c) => c.id === id);
    if (!clip) return;

    const testClip: TimelineClip = {
      id,
      timestamp: Math.max(0, newTime),
      duration: clip.duration,
      trimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
    };

    // Find valid position that doesn't overlap with other clips
    const validTimestamp = findNearestValidPosition(audioClips as TimelineClip[], testClip, id);

    set((state) => ({
      audioClips: state.audioClips.map((c) =>
        c.id === id ? { ...c, timestamp: validTimestamp } : c
      ),
      isDirty: true,
    }));
  },

  updateAudioClipTrim: (id, updates) => {
    const { audioClips } = get();
    const clip = audioClips.find((c) => c.id === id);
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

    // Find valid position if the trim caused an overlap
    const validTimestamp = findNearestValidPosition(audioClips as TimelineClip[], testClip, id);

    set((state) => ({
      audioClips: state.audioClips.map((c) =>
        c.id === id
          ? { ...c, ...updates, timestamp: validTimestamp }
          : c
      ),
      isDirty: true,
    }));
  },

  removeAudioClip: (id) => {
    set((state) => ({
      audioClips: state.audioClips.filter((clip) => clip.id !== id),
      isDirty: true,
    }));
  },

  removeClipsByAudioId: (audioId) => {
    set((state) => ({
      audioClips: state.audioClips.filter((clip) => clip.audioId !== audioId),
      isDirty: true,
    }));
  },

  setAudioClips: (clips) => {
    const { normalizeClips } = get();
    const { clips: normalized, changed } = normalizeClips(clips);
    set({ audioClips: normalized, isDirty: changed });
  },

  markSaved: () => set({ isDirty: false }),

  // Overlap validation helpers for UI feedback
  isPositionValid: (clipId, timestamp, duration, trimStart, trimEnd) => {
    const { audioClips } = get();
    return checkPositionValid(audioClips as TimelineClip[], clipId, timestamp, duration, trimStart, trimEnd);
  },

  getValidPosition: (clipId, timestamp, duration, trimStart, trimEnd) => {
    const { audioClips } = get();
    return computeValidPosition(audioClips as TimelineClip[], clipId, timestamp, duration, trimStart, trimEnd);
  },
}));
