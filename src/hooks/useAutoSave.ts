import { useEffect, useRef } from 'react';
import { useTimelineStore } from '@/stores/timelineStore';

export function useAutoSave() {
  const { clips, isDirty, markSaved } = useTimelineStore();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isDirty) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(async () => {
      await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_video: clips }),
      });
      markSaved();
    }, 1000);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [clips, isDirty, markSaved]);
}
