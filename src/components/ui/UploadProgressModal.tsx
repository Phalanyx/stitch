'use client';

import { X, Check, Loader2, AlertCircle, Upload, Sparkles, FileVideo, FileText } from 'lucide-react';

export type UploadStage = 'uploading' | 'starting' | 'indexing' | 'generating' | 'complete' | 'error';

interface UploadProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  stage: UploadStage;
  fileName: string;
  errorMessage?: string;
}

const stages: { key: UploadStage; label: string; icon: typeof Upload }[] = [
  { key: 'uploading', label: 'Uploading video', icon: Upload },
  { key: 'starting', label: 'Starting AI processing', icon: Sparkles },
  { key: 'indexing', label: 'Analyzing video content', icon: FileVideo },
  { key: 'generating', label: 'Generating summary', icon: FileText },
];

function getStageIndex(stage: UploadStage): number {
  if (stage === 'complete') return stages.length;
  if (stage === 'error') return -1;
  return stages.findIndex((s) => s.key === stage);
}

function StageItem({
  stage,
  label,
  icon: Icon,
  currentStageIndex,
  index,
}: {
  stage: UploadStage;
  label: string;
  icon: typeof Upload;
  currentStageIndex: number;
  index: number;
}) {
  const isComplete = currentStageIndex > index;
  const isCurrent = currentStageIndex === index;
  const isPending = currentStageIndex < index;

  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isComplete
            ? 'bg-blue-500/20 text-blue-400'
            : isCurrent
            ? 'bg-sky-500/20 text-sky-400'
            : 'bg-gray-700 text-gray-500'
        }`}
      >
        {isComplete ? (
          <Check className="w-4 h-4" />
        ) : isCurrent ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Icon className="w-4 h-4" />
        )}
      </div>
      <span
        className={`text-sm ${
          isComplete ? 'text-blue-400' : isCurrent ? 'text-white' : 'text-gray-500'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

export function UploadProgressModal({
  isOpen,
  onClose,
  stage,
  fileName,
  errorMessage,
}: UploadProgressModalProps) {
  if (!isOpen) return null;

  const currentStageIndex = getStageIndex(stage);
  const isComplete = stage === 'complete';
  const isError = stage === 'error';
  const canClose = stage === 'indexing' || isComplete || isError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={canClose ? onClose : undefined} />
      <div className="relative bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        {canClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-1">
            {isComplete ? 'Upload Complete' : isError ? 'Upload Failed' : 'Uploading Video'}
          </h3>
          <p className="text-gray-400 text-sm truncate">{fileName}</p>
        </div>

        {isError ? (
          <div className="flex items-start gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-red-400 text-sm font-medium">Something went wrong</p>
              <p className="text-gray-400 text-sm mt-1">
                {errorMessage || 'Failed to process video. The video is still saved and usable.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mb-6">
            {stages.map((s, index) => (
              <StageItem
                key={s.key}
                stage={s.key}
                label={s.label}
                icon={s.icon}
                currentStageIndex={currentStageIndex}
                index={index}
              />
            ))}
            {isComplete && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center flex-shrink-0">
                  <Check className="w-4 h-4" />
                </div>
                <span className="text-sm text-blue-400">Complete</span>
              </div>
            )}
          </div>
        )}

        {stage === 'indexing' && (
          <p className="text-gray-500 text-xs mb-4">
            AI analysis can take 1-5 minutes. You can close this modal - processing will continue in
            the background.
          </p>
        )}

        {(isComplete || isError) && (
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${
                isComplete
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
            >
              {isComplete ? 'Done' : 'Close'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
