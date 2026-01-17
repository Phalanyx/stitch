import { create } from 'zustand';
import { VideoReference } from '@/types/video';

interface TimelineState {
  clips: VideoReference[];
  isDirty: boolean;

  addVideoToTimeline: (video: { id: string; url: string; duration?: number }) => void;
  updateVideoTimestamp: (id: string, newTime: number) => void;
  removeClip: (id: string) => void;
  setClips: (clips: VideoReference[]) => void;
  markSaved: () => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  clips: [],
  isDirty: false,

  addVideoToTimeline: (video) => {
    const { clips } = get();
    const lastClip = clips[clips.length - 1];
    const newTimestamp = lastClip ? lastClip.timestamp + lastClip.duration : 0;

    set({
      clips: [...clips, {
        id: video.id,
        url: video.url,
        timestamp: newTimestamp,
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

  removeClip: (id) => {
    set((state) => ({
      clips: state.clips.filter((clip) => clip.id !== id),
      isDirty: true,
    }));
  },

  setClips: (clips) => set({ clips, isDirty: false }),
  markSaved: () => set({ isDirty: false }),
}));
