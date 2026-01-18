import { create } from 'zustand';

export interface ClipboardClip {
  type: 'video' | 'audio';
  url: string;
  duration: number;
  trimStart?: number;
  trimEnd?: number;
  relativeOffset: number; // Relative to earliest clip in selection
  layerId?: string; // For audio - original layer for paste preference
  sourceId?: string; // Original video/audio ID for reference
}

interface ClipboardState {
  clips: ClipboardClip[];
  hasContent: () => boolean;
  copy: (clips: ClipboardClip[]) => void;
  getClips: () => ClipboardClip[];
  clear: () => void;
}

export const useClipboardStore = create<ClipboardState>((set, get) => ({
  clips: [],

  hasContent: () => {
    return get().clips.length > 0;
  },

  copy: (clips) => {
    set({ clips });
  },

  getClips: () => {
    return get().clips;
  },

  clear: () => {
    set({ clips: [] });
  },
}));
