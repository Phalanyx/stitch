import { create } from 'zustand';
import { Command, CommandType } from '@/lib/commands/types';

const MAX_HISTORY_SIZE = 100;

export type SerializedCommand = {
  id: string;
  type: CommandType;
  description: string;
  timestamp: number;
};

export type SerializableHistory = {
  commands: SerializedCommand[];
  undoCount: number;
  redoCount: number;
  totalExecuted: number;
};

interface HistoryState {
  undoStack: Command[];
  redoStack: Command[];
  isUndoRedoInProgress: boolean;
  undoCount: number;
  redoCount: number;
  totalExecuted: number;

  execute: (command: Command) => void;
  addWithoutExecute: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
  getSerializableHistory: () => SerializableHistory;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],
  isUndoRedoInProgress: false,
  undoCount: 0,
  redoCount: 0,
  totalExecuted: 0,

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
        totalExecuted: state.totalExecuted + 1,
      };
    });
  },

  // Add command to history without executing (for LLM actions already applied via API)
  addWithoutExecute: (command: Command) => {
    set((state) => {
      const newUndoStack = [...state.undoStack, command];
      if (newUndoStack.length > MAX_HISTORY_SIZE) {
        newUndoStack.shift();
      }

      return {
        undoStack: newUndoStack,
        redoStack: [],
        totalExecuted: state.totalExecuted + 1,
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
        undoCount: state.undoCount + 1,
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
        redoCount: state.redoCount + 1,
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
      undoCount: 0,
      redoCount: 0,
      totalExecuted: 0,
    });
  },

  getSerializableHistory: (): SerializableHistory => {
    const state = get();
    const commands: SerializedCommand[] = state.undoStack.map((cmd) => ({
      id: cmd.id,
      type: cmd.type,
      description: cmd.description,
      timestamp: cmd.timestamp,
    }));

    return {
      commands,
      undoCount: state.undoCount,
      redoCount: state.redoCount,
      totalExecuted: state.totalExecuted,
    };
  },
}));
