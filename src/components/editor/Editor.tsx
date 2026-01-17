'use client';

import { Sidebar } from './Sidebar';
import { Preview } from './Preview';
import { Timeline } from './Timeline';
import { useTimeline } from '@/hooks/useTimeline';
import { useAutoSave } from '@/hooks/useAutoSave';
import { Loader2 } from 'lucide-react';

export function Editor() {
  const { clips, isLoading, addVideoToTimeline, updateVideoTimestamp, removeClip } =
    useTimeline();

  // Enable auto-save
  useAutoSave();

  if (isLoading) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <div className="flex-1 flex overflow-hidden">
        <Sidebar onAddToTimeline={addVideoToTimeline} />
        <Preview clips={clips} />
      </div>
      <Timeline
        clips={clips}
        onUpdateTimestamp={updateVideoTimestamp}
        onRemove={removeClip}
      />
    </div>
  );
}
