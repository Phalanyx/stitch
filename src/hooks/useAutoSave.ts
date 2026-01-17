import { useEffect, useRef } from 'react';
import { useTimelineStore } from '@/stores/timelineStore';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';

export function useAutoSave() {
  const { clips, isDirty: videoIsDirty, markSaved: markVideoSaved } = useTimelineStore();
  const { audioClips, isDirty: audioIsDirty, markSaved: markAudioSaved } = useAudioTimelineStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!videoIsDirty && !audioIsDirty) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(async () => {
      const body: { session_video?: typeof clips; session_audio?: typeof audioClips } = {};

      if (videoIsDirty) {
        body.session_video = clips;
      }
      if (audioIsDirty) {
        body.session_audio = audioClips;
      }

      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (videoIsDirty) markVideoSaved();
      if (audioIsDirty) markAudioSaved();
    }, 1000);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [clips, audioClips, videoIsDirty, audioIsDirty, markVideoSaved, markAudioSaved]);
}
