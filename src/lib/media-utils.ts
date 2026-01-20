/**
 * Media utility functions for extracting duration from video and audio files.
 * Consolidated from duplicated implementations in Sidebar.tsx and Editor.tsx.
 */

/**
 * Extract duration from a video URL by loading it into a video element.
 * @param url - The video URL to extract duration from
 * @returns Promise resolving to duration in seconds
 */
export function getVideoDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      const duration = video.duration;
      if (isFinite(duration) && !isNaN(duration)) {
        resolve(duration);
      } else {
        reject(new Error('Invalid duration'));
      }
    };

    video.onerror = () => {
      window.URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };

    video.src = url;
  });
}

/**
 * Extract duration from an audio URL by loading it into an audio element.
 * @param url - The audio URL to extract duration from
 * @returns Promise resolving to duration in seconds
 */
export function getAudioDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      if (isFinite(duration) && !isNaN(duration)) {
        resolve(duration);
      } else {
        reject(new Error('Invalid duration'));
      }
    };

    audio.onerror = () => {
      reject(new Error('Failed to load audio metadata'));
    };

    audio.src = url;
  });
}

/**
 * Format a duration in seconds as MM:SS string.
 * @param seconds - Duration in seconds (can be null)
 * @returns Formatted string like "01:30" or empty string if invalid
 */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !isFinite(seconds)) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
