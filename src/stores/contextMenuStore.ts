import { create } from 'zustand';

interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  clipId: string | null;
  clipType: 'video' | 'audio' | null;
  layerId?: string; // For audio clips

  // Actions
  openContextMenu: (params: {
    x: number;
    y: number;
    clipId: string;
    clipType: 'video' | 'audio';
    layerId?: string;
  }) => void;
  closeContextMenu: () => void;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  isOpen: false,
  x: 0,
  y: 0,
  clipId: null,
  clipType: null,
  layerId: undefined,

  openContextMenu: ({ x, y, clipId, clipType, layerId }) => {
    set({
      isOpen: true,
      x,
      y,
      clipId,
      clipType,
      layerId,
    });
  },

  closeContextMenu: () => {
    set({
      isOpen: false,
      clipId: null,
      clipType: null,
      layerId: undefined,
    });
  },
}));
