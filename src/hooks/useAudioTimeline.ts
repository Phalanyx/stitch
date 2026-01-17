import { useEffect, useState } from 'react';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { AudioReference, AudioLayer } from '@/types/audio';

export function useAudioTimeline() {
  const { audioLayers, setAudioClips, addAudioToTimeline, updateAudioTimestamp, removeAudioClip } = useAudioTimelineStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      try {
        const response = await fetch('/api/session');
        if (response.ok) {
          const data = await response.json();
          const audioData = data.session_audio as AudioReference[] | AudioLayer[];
          setAudioClips(audioData ?? []);
        }
      } catch (error) {
        console.error('Failed to load audio session:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadSession();
  }, [setAudioClips]);

  return {
    audioLayers,
    isLoading,
    addAudioToTimeline,
    updateAudioTimestamp,
    removeAudioClip,
  };
}
