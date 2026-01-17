import { useEffect, useState } from 'react';
import { useTimelineStore } from '@/stores/timelineStore';
import { VideoReference } from '@/types/video';

export function useTimeline() {
  const { clips, setClips, addVideoToTimeline, updateVideoTimestamp, removeClip } = useTimelineStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      try {
        const response = await fetch('/api/session');
        if (response.ok) {
          const data = await response.json() as VideoReference[];
          setClips(data);
        }
      } catch (error) {
        console.error('Failed to load session:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadSession();
  }, [setClips]);

  return {
    clips,
    isLoading,
    addVideoToTimeline,
    updateVideoTimestamp,
    removeClip,
  };
}
