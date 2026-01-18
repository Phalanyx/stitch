'use client';

import { X, Film, Music, Calendar, HardDrive, Clock } from 'lucide-react';

interface MediaPropertiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'video' | 'audio';
  name: string;
  size: number | null;
  duration: number | null;
  createdAt: Date | string;
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return 'Unknown';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  return `${size.toFixed(i > 0 ? 2 : 0)} ${units[i]}`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return 'Unknown';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MediaPropertiesModal({
  isOpen,
  onClose,
  type,
  name,
  size,
  duration,
  createdAt,
}: MediaPropertiesModalProps) {
  if (!isOpen) return null;

  const Icon = type === 'video' ? Film : Music;
  const iconColor = type === 'video' ? 'text-sky-400' : 'text-blue-400';

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

        <div className="flex items-center gap-3 mb-6">
          <div className={`w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center ${iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Properties</h3>
            <p className="text-sm text-gray-400 capitalize">{type} File</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
              <Icon className={`w-4 h-4 ${iconColor}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Name</p>
              <p className="text-white text-sm break-all">{name}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
              <HardDrive className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Size</p>
              <p className="text-white text-sm">{formatFileSize(size)}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
              <Clock className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Duration</p>
              <p className="text-white text-sm">{formatDuration(duration)}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
              <Calendar className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Date Added</p>
              <p className="text-white text-sm">{formatDate(createdAt)}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
