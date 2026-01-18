'use client';

import { X } from 'lucide-react';
import { ExportProgress } from '@/hooks/useVideoExport';

interface ExportProgressModalProps {
  progress: ExportProgress | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ExportProgressModal({ progress, isOpen, onClose }: ExportProgressModalProps) {
  if (!isOpen || !progress) {
    return null;
  }

  const getStageLabel = (stage: ExportProgress['stage']) => {
    switch (stage) {
      case 'preparing':
        return 'Preparing';
      case 'downloading':
        return 'Downloading';
      case 'processing':
        return 'Processing';
      case 'complete':
        return 'Complete';
      case 'error':
        return 'Error';
      default:
        return 'Processing';
    }
  };

  const isComplete = progress.stage === 'complete';
  const isError = progress.stage === 'error';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Export Video</h2>
          {!isComplete && !isError && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
              disabled
            >
              <X className="w-5 h-5" />
            </button>
          )}
          {(isComplete || isError) && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300">{getStageLabel(progress.stage)}</span>
              <span className="text-sm text-gray-400">{Math.round(progress.progress)}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all duration-300 ${
                  isError ? 'bg-red-500' : isComplete ? 'bg-violet-500' : 'bg-slate-500'
                }`}
                style={{ width: `${progress.progress}%` }}
              />
            </div>
          </div>

          <p className="text-sm text-gray-400">{progress.message}</p>

          {isComplete && (
            <div className="pt-2">
              <p className="text-sm text-violet-400">
                Your video has been exported successfully! Check your downloads folder.
              </p>
            </div>
          )}

          {isError && (
            <div className="pt-2">
              <p className="text-sm text-red-400">
                Export failed. Please try again or check the browser console for details.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
