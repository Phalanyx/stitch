'use client';

import { X, AlertTriangle } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
  itemType: 'video' | 'audio';
  isUsedInTimeline: boolean;
  isDeleting: boolean;
  linkedVideoName?: string;
}

export function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  itemType,
  isUsedInTimeline,
  isDeleting,
  linkedVideoName,
}: ConfirmDeleteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-2">
              Delete {itemType}?
            </h3>
            <p className="text-gray-300 text-sm mb-2">
              Are you sure you want to delete &quot;{itemName}&quot;? This action cannot be undone.
            </p>
            {linkedVideoName && (
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-md p-3 mb-4">
                <p className="text-purple-400 text-sm">
                  This audio was extracted from video &quot;{linkedVideoName}&quot;. Deleting it will remove the audio link from that video.
                </p>
              </div>
            )}
            {isUsedInTimeline && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md p-3 mb-4">
                <p className="text-yellow-400 text-sm">
                  This {itemType} is currently used in the timeline. Deleting it will remove all clips that reference it.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isDeleting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
