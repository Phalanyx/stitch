import { create } from 'zustand';
import { Command } from '@/lib/commands/types';

const MAX_HISTORY_SIZE = 100;

interface HistoryState {
  undoStack: Command[];
  redoStack: Command[];
  isUndoRedoInProgress: boolean;

  execute: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  isUndoRedoInProgress: false,

  execute: (command: Command) => {
    // Execute the command
    command.execute();

    set((state) => {
      // Add to undo stack, enforce max size
      const newUndoStack = [...state.undoStack, command];
      if (newUndoStack.length > MAX_HISTORY_SIZE) {
        newUndoStack.shift();
      }

      return {
        undoStack: newUndoStack,
        // Clear redo stack when new command is executed
        redoStack: [],
      };
    });
  },

  undo: () => {
    const { undoStack, isUndoRedoInProgress } = get();
    if (undoStack.length === 0 || isUndoRedoInProgress) return;

    const command = undoStack[undoStack.length - 1];

    set({ isUndoRedoInProgress: true });

    try {
      command.undo();

      set((state) => ({
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, command],
        isUndoRedoInProgress: false,
      }));
    } catch (error) {
      set({ isUndoRedoInProgress: false });
      console.error('Undo failed:', error);
    }
  },

  redo: () => {
    const { redoStack, isUndoRedoInProgress } = get();
    if (redoStack.length === 0 || isUndoRedoInProgress) return;

    const command = redoStack[redoStack.length - 1];

    set({ isUndoRedoInProgress: true });

    try {
      command.execute();

      set((state) => ({
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, command],
        isUndoRedoInProgress: false,
      }));
    } catch (error) {
      set({ isUndoRedoInProgress: false });
      console.error('Redo failed:', error);
    }
  },

  canUndo: () => {
    return get().undoStack.length > 0;
  },

  canRedo: () => {
    return get().redoStack.length > 0;
  },

  clear: () => {
    set({
      undoStack: [],
      redoStack: [],
    });
  },
}));
