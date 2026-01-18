import { create } from 'zustand';
import { VideoReference } from '@/types/video';
import {
  findNearestValidPosition,
  isPositionValid as checkPositionValid,
  getValidPosition as computeValidPosition,
  calculateAutoTrim,
  isPositionValidOrAutoTrimmable,
  TimelineClip,
} from '@/lib/timeline-validation';

interface TimelineState {
  clips: VideoReference[];
  isDirty: boolean;

  normalizeClips: (clips: VideoReference[]) => { clips: VideoReference[]; changed: boolean };
  addVideoToTimeline: (video: { id: string; url: string; duration?: number }) => void;
  addVideoAtTimestamp: (video: { id: string; url: string; duration?: number }, timestamp: number) => void;
  updateVideoTimestamp: (id: string, newTime: number) => void;
  updateVideoTimestampWithAutoTrim: (id: string, newTime: number) => void;
  updateClipTrim: (id: string, updates: { trimStart?: number; trimEnd?: number; timestamp?: number }) => void;
  removeClip: (id: string) => void;
  removeClipsByVideoId: (videoId: string) => void;
  setClips: (clips: VideoReference[]) => void;
  markSaved: () => void;
  // Overlap validation helpers
  isPositionValid: (clipId: string, timestamp: number, duration: number, trimStart?: number, trimEnd?: number) => boolean;
  isPositionValidOrAutoTrimmable: (clipId: string, timestamp: number, duration: number, trimStart?: number, trimEnd?: number) => boolean;
  getValidPosition: (clipId: string, timestamp: number, duration: number, trimStart?: number, trimEnd?: number) => number;
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

    const duration = video.duration || 5;
    const newClip: TimelineClip = {
      id: clipId,
      timestamp: Math.max(0, timestamp),
      duration,
    };

    // Find valid position that doesn't overlap with existing clips
    const validTimestamp = findNearestValidPosition(clips as TimelineClip[], newClip);

    set({
      clips: [...clips, {
        id: clipId,
        videoId: video.id,
        url: video.url,
        timestamp: validTimestamp,
        duration,
      }],
      isDirty: true,
    });
  },

  updateVideoTimestamp: (id, newTime) => {
    const { clips } = get();
    const clip = clips.find((c) => c.id === id);
    if (!clip) return;

    const testClip: TimelineClip = {
      id,
      timestamp: Math.max(0, newTime),
      duration: clip.duration,
      trimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
    };

    // Find valid position that doesn't overlap with other clips
    const validTimestamp = findNearestValidPosition(clips as TimelineClip[], testClip, id);

    set((state) => ({
      clips: state.clips.map((c) =>
        c.id === id ? { ...c, timestamp: validTimestamp } : c
      ),
      isDirty: true,
    }));
  },

  updateVideoTimestampWithAutoTrim: (id, newTime) => {
    const { clips } = get();
    const clip = clips.find((c) => c.id === id);
    if (!clip) return;

    const testClip: TimelineClip = {
      id,
      timestamp: Math.max(0, newTime),
      duration: clip.duration,
      trimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
    };

    // Check if auto-trim can resolve any overlap
    const autoTrimResult = calculateAutoTrim(clips as TimelineClip[], testClip, id);

    if (autoTrimResult.isValid && autoTrimResult.clipToTrim) {
      // Apply auto-trim: update both the moved clip and the trimmed clip
      set((state) => ({
        clips: state.clips.map((c) => {
          if (c.id === id) {
            return { ...c, timestamp: testClip.timestamp };
          }
          if (c.id === autoTrimResult.clipToTrim) {
            return { ...c, trimEnd: autoTrimResult.newTrimEnd };
          }
          return c;
        }),
        isDirty: true,
      }));
    } else if (autoTrimResult.isValid) {
      // No overlap, just update position
      set((state) => ({
        clips: state.clips.map((c) =>
          c.id === id ? { ...c, timestamp: testClip.timestamp } : c
        ),
        isDirty: true,
      }));
    } else {
      // Invalid position, fall back to nearest valid position
      const validTimestamp = findNearestValidPosition(clips as TimelineClip[], testClip, id);
      set((state) => ({
        clips: state.clips.map((c) =>
          c.id === id ? { ...c, timestamp: validTimestamp } : c
        ),
        isDirty: true,
      }));
    }
  },

  updateClipTrim: (id, updates) => {
    const { clips } = get();
    const clip = clips.find((c) => c.id === id);
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
    const validTimestamp = findNearestValidPosition(clips as TimelineClip[], testClip, id);

    set((state) => ({
      clips: state.clips.map((c) =>
        c.id === id
          ? { ...c, ...updates, timestamp: validTimestamp }
          : c
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

  // Overlap validation helpers for UI feedback
  isPositionValid: (clipId, timestamp, duration, trimStart, trimEnd) => {
    const { clips } = get();
    return checkPositionValid(clips as TimelineClip[], clipId, timestamp, duration, trimStart, trimEnd);
  },

  isPositionValidOrAutoTrimmable: (clipId, timestamp, duration, trimStart, trimEnd) => {
    const { clips } = get();
    const testClip: TimelineClip = {
      id: clipId,
      timestamp,
      duration,
      trimStart,
      trimEnd,
    };
    return isPositionValidOrAutoTrimmable(clips as TimelineClip[], testClip, clipId);
  },

  getValidPosition: (clipId, timestamp, duration, trimStart, trimEnd) => {
    const { clips } = get();
    return computeValidPosition(clips as TimelineClip[], clipId, timestamp, duration, trimStart, trimEnd);
  },
}));
