import { create } from 'zustand';

export interface SelectedClip {
  id: string;
  type: 'video' | 'audio';
  layerId?: string; // For audio clips
}

interface SelectionState {
  selectedClips: SelectedClip[];
  lastSelectedId: string | null; // For shift+click range selection

  // Actions
  selectClip: (clip: SelectedClip, addToSelection?: boolean) => void;
  deselectClip: (id: string) => void;
  clearSelection: () => void;
  selectRange: (clips: SelectedClip[]) => void;
  setSelection: (clips: SelectedClip[]) => void;
  isSelected: (id: string) => boolean;
  getSelectedClips: () => SelectedClip[];
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selectedClips: [],
  lastSelectedId: null,

  selectClip: (clip, addToSelection = false) => {
    set((state) => {
      if (addToSelection) {
        // Add to existing selection (shift+click or ctrl+click)
        const alreadySelected = state.selectedClips.some((c) => c.id === clip.id);
        if (alreadySelected) {
          // Toggle off if already selected
          return {
            selectedClips: state.selectedClips.filter((c) => c.id !== clip.id),
            lastSelectedId: clip.id,
          };
        }
        return {
          selectedClips: [...state.selectedClips, clip],
          lastSelectedId: clip.id,
        };
      } else {
        // Replace selection (regular click)
        return {
          selectedClips: [clip],
          lastSelectedId: clip.id,
        };
      }
    });
  },

  deselectClip: (id) => {
    set((state) => ({
      selectedClips: state.selectedClips.filter((c) => c.id !== id),
    }));
  },

  clearSelection: () => {
    set({
      selectedClips: [],
      lastSelectedId: null,
    });
  },

  selectRange: (clips) => {
    // Add all clips in range to selection
    set((state) => {
      const existingIds = new Set(state.selectedClips.map((c) => c.id));
      const newClips = clips.filter((c) => !existingIds.has(c.id));
      return {
        selectedClips: [...state.selectedClips, ...newClips],
        lastSelectedId: clips[clips.length - 1]?.id ?? state.lastSelectedId,
      };
    });
  },

  setSelection: (clips) => {
    set({
      selectedClips: clips,
      lastSelectedId: clips[clips.length - 1]?.id ?? null,
    });
  },

  isSelected: (id) => {
    return get().selectedClips.some((c) => c.id === id);
  },

  getSelectedClips: () => {
    return get().selectedClips;
  },
}));
