import { useEffect, useState } from 'react';
import { useTimelineStore } from '@/stores/timelineStore';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { VideoReference } from '@/types/video';
import { AudioReference, AudioLayer } from '@/types/audio';

export function useTimeline() {
  const { clips, setClips, addVideoToTimeline, addVideoAtTimestamp, updateVideoTimestamp, updateClipTrim, removeClip } = useTimelineStore();
  const {
    audioLayers,
    activeLayerId,
    setAudioClips,
    addAudioToTimeline,
    addAudioAtTimestamp,
    updateAudioTimestamp,
    updateAudioClipTrim,
    removeAudioClip,
    // Layer management
    addLayer,
    removeLayer,
    setActiveLayer,
    toggleLayerMute,
    renameLayer,
    cleanupEmptyLayers,
    // Helper
    getAllAudioClips,
  } = useAudioTimelineStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      try {
        const response = await fetch('/api/session');
        if (response.ok) {
          const data = await response.json();
          const videoData = data.session_video as VideoReference[];
          const audioData = data.session_audio as AudioReference[] | AudioLayer[];
          setClips(videoData ?? []);
          setAudioClips(audioData ?? []);
        }
      } catch (error) {
        console.error('Failed to load session:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadSession();
  }, [setClips, setAudioClips]);

  return {
    clips,
    isLoading,
    addVideoToTimeline,
    addVideoAtTimestamp,
    updateVideoTimestamp,
    updateClipTrim,
    removeClip,
    // Audio handlers
    audioLayers,
    activeLayerId,
    addAudioToTimeline,
    addAudioAtTimestamp,
    updateAudioTimestamp,
    updateAudioClipTrim,
    removeAudioClip,
    // Layer management
    addLayer,
    removeLayer,
    setActiveLayer,
    toggleLayerMute,
    renameLayer,
    cleanupEmptyLayers,
    // Helper
    getAllAudioClips,
  };
}
