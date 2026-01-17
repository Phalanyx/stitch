import { create } from 'zustand';
import { VideoReference } from '@/types/video';

interface TimelineState {
  clips: VideoReference[];
  isDirty: boolean;

  normalizeClips: (clips: VideoReference[]) => { clips: VideoReference[]; changed: boolean };
  addVideoToTimeline: (video: { id: string; url: string; duration?: number }) => void;
  addVideoAtTimestamp: (video: { id: string; url: string; duration?: number }, timestamp: number) => void;
  updateVideoTimestamp: (id: string, newTime: number) => void;
  updateClipTrim: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }) => void;
  removeClip: (id: string) => void;
  removeClipsByVideoId: (videoId: string) => void;
  setClips: (clips: VideoReference[]) => void;
  markSaved: () => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  clips: [],
  isDirty: false,

  // Ensure each clip has a unique id while preserving the source video id.
  // Returns whether any ids were changed to trigger an auto-save migration.
  normalizeClips: (clips: VideoReference[]) => {
    let changed = false;
    const seen = new Set<string>();
    const normalized = clips.map((clip) => {
      const videoId = clip.videoId ?? clip.id;
      let clipId = clip.id;

      if (!clip.videoId || seen.has(clipId)) {
        clipId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }

      if (clipId !== clip.id || videoId !== clip.videoId) {
        changed = true;
      }

      seen.add(clipId);

      return { ...clip, id: clipId, videoId };
    });

    return { clips: normalized, changed };
  },

  addVideoToTimeline: (video) => {
    const { clips } = get();
    const lastClip = clips[clips.length - 1];
    const newTimestamp = lastClip ? lastClip.timestamp + lastClip.duration : 0;
    const clipId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    set({
      clips: [...clips, {
        id: clipId,
        videoId: video.id,
        url: video.url,
        timestamp: newTimestamp,
        duration: video.duration || 5,
      }],
      isDirty: true,
    });
  },

  addVideoAtTimestamp: (video, timestamp) => {
    const { clips } = get();
    const clipId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    set({
      clips: [...clips, {
        id: clipId,
        videoId: video.id,
        url: video.url,
        timestamp: Math.max(0, timestamp),
        duration: video.duration || 5,
      }],
      isDirty: true,
    });
  },

  updateVideoTimestamp: (id, newTime) => {
    set((state) => ({
      clips: state.clips.map((clip) =>
        clip.id === id ? { ...clip, timestamp: Math.max(0, newTime) } : clip
      ),
      isDirty: true,
    }));
  },

  updateClipTrim: (id, updates) => {
    set((state) => ({
      clips: state.clips.map((clip) =>
        clip.id === id ? { ...clip, ...updates } : clip
      ),
      isDirty: true,
    }));
  },

  removeClip: (id) => {
    set((state) => ({
      clips: state.clips.filter((clip) => clip.id !== id),
      isDirty: true,
    }));
  },

  removeClipsByVideoId: (videoId) => {
    set((state) => ({
      clips: state.clips.filter((clip) => clip.videoId !== videoId),
      isDirty: true,
    }));
  },

  setClips: (clips) => {
    const { normalizeClips } = get();
    const { clips: normalized, changed } = normalizeClips(clips);
    set({ clips: normalized, isDirty: changed });
  },
  markSaved: () => set({ isDirty: false }),
}));
