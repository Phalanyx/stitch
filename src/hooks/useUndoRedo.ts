'use client';

import { useCallback, useEffect } from 'react';
import { useHistoryStore } from '@/stores/historyStore';
import { useSelectionStore } from '@/stores/selectionStore';
import { useClipboardStore } from '@/stores/clipboardStore';
import { Command } from '@/lib/commands/types';

interface UseUndoRedoOptions {
  onBatchDelete?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
}

export function useUndoRedo(options: UseUndoRedoOptions = {}) {
  const { onBatchDelete, onCopy, onPaste } = options;
  const {
    execute,
    undo,
    redo,
    canUndo,
    canRedo,
    undoStack,
    redoStack,
  } = useHistoryStore();

  // Setup keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd (Mac) or Ctrl (Windows/Linux)
      const isMod = e.metaKey || e.ctrlKey;

      // Escape - Clear selection
      if (e.key === 'Escape') {
        e.preventDefault();
        useSelectionStore.getState().clearSelection();
        return;
      }

      // Delete/Backspace - Batch delete selected clips
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const { selectedClips } = useSelectionStore.getState();
        if (selectedClips.length > 0) {
          e.preventDefault();
          onBatchDelete?.();
          return;
        }
      }

      if (!isMod) return;

      // Cmd+C - Copy
      if (e.key === 'c') {
        const { selectedClips } = useSelectionStore.getState();
        if (selectedClips.length > 0) {
          e.preventDefault();
          onCopy?.();
          return;
        }
      }

      // Cmd+V - Paste
      if (e.key === 'v') {
        const { hasContent } = useClipboardStore.getState();
        if (hasContent()) {
          e.preventDefault();
          onPaste?.();
          return;
        }
      }

      // Cmd+Z - Undo
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      // Cmd+Shift+Z - Redo
      if (e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }

      // Cmd+Y - Redo (alternative)
      if (e.key === 'y') {
        e.preventDefault();
        redo();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, onBatchDelete, onCopy, onPaste]);

  const executeCommand = useCallback(
    (command: Command) => {
      execute(command);
    },
    [execute]
  );

  return {
    execute: executeCommand,
    undo,
    redo,
    canUndo: canUndo(),
    canRedo: canRedo(),
    undoStackSize: undoStack.length,
    redoStackSize: redoStack.length,
  };
}
