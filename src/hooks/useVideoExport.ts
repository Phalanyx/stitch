import { useState, useCallback } from 'react';
import { VideoReference } from '@/types/video';
import { AudioReference } from '@/types/audio';
import { createClient } from '@/lib/supabase/client';

export interface ExportProgress {
  stage: 'preparing' | 'downloading' | 'processing' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
}

export function useVideoExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const exportToFile = useCallback(
    async (clips: VideoReference[], audioClips: AudioReference[]) => {
      if (isExporting) {
        return;
      }

      setIsExporting(true);
      setError(null);
      setProgress({ stage: 'preparing', progress: 0, message: 'Initializing export...' });

      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          throw new Error('Not authenticated');
        }

        setProgress({ stage: 'preparing', progress: 10, message: 'Sending export request...' });

        const response = await fetch('/api/export', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ clips, audioClips }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Export failed' }));
          throw new Error(errorData.error || `Export failed: ${response.statusText}`);
        }

        setProgress({ stage: 'processing', progress: 50, message: 'Processing video...' });

        // Get the blob from response
        const blob = await response.blob();

        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `stitch-export-${Date.now()}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setProgress({ stage: 'complete', progress: 100, message: 'Export complete!' });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Export failed';
        setError(errorMessage);
        setProgress({ stage: 'error', progress: 0, message: errorMessage });
        throw err;
      } finally {
        setIsExporting(false);
      }
    },
    [isExporting]
  );

  const reset = useCallback(() => {
    setProgress(null);
    setError(null);
  }, []);

  return {
    exportToFile,
    isExporting,
    progress,
    error,
    reset,
  };
}
