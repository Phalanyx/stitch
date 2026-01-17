import { create } from 'zustand';
import { AudioReference } from '@/types/audio';

interface AudioTimelineState {
  audioClips: AudioReference[];
  isDirty: boolean;

  normalizeClips: (clips: AudioReference[]) => { clips: AudioReference[]; changed: boolean };
  addAudioToTimeline: (audio: { id: string; url: string; duration?: number }) => void;
  addAudioAtTimestamp: (audio: { id: string; url: string; duration?: number }, timestamp: number) => void;
  updateAudioTimestamp: (id: string, newTime: number) => void;
  updateAudioClipTrim: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }) => void;
  removeAudioClip: (id: string) => void;
  setAudioClips: (clips: AudioReference[]) => void;
  markSaved: () => void;
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

    set({
      audioClips: [...audioClips, {
        id: clipId,
        audioId: audio.id,
        url: audio.url,
        timestamp: Math.max(0, timestamp),
        duration: audio.duration || 5,
      }],
      isDirty: true,
    });
  },

  updateAudioTimestamp: (id, newTime) => {
    set((state) => ({
      audioClips: state.audioClips.map((clip) =>
        clip.id === id ? { ...clip, timestamp: Math.max(0, newTime) } : clip
      ),
      isDirty: true,
    }));
  },

  updateAudioClipTrim: (id, updates) => {
    set((state) => ({
      audioClips: state.audioClips.map((clip) =>
        clip.id === id ? { ...clip, ...updates } : clip
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

  setAudioClips: (clips) => {
    const { normalizeClips } = get();
    const { clips: normalized, changed } = normalizeClips(clips);
    set({ audioClips: normalized, isDirty: changed });
  },

  markSaved: () => set({ isDirty: false }),
}));
