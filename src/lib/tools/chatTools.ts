import { VideoReference } from '@/types/video';

export function summarizeTimeline(clips: VideoReference[]) {
  if (clips.length === 0) {
    return 'No clips on the timeline yet.';
  }
  const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0);
  const earliest = Math.min(...clips.map((clip) => clip.timestamp));
  const latest = Math.max(...clips.map((clip) => clip.timestamp + clip.duration));
  return `Timeline has ${clips.length} clip(s), total duration ${totalDuration.toFixed(
    1
  )}s, spanning ${earliest.toFixed(1)}s to ${latest.toFixed(1)}s.`;
}

export function listClips(clips: VideoReference[]) {
  if (clips.length === 0) {
    return 'No clips available.';
  }
  return clips
    .map((clip, index) => `#${index + 1} ${clip.videoId ?? clip.id} @ ${clip.timestamp.toFixed(1)}s`)
    .join('\n');
}

export function findClip(clips: VideoReference[], id: string) {
  const clip = clips.find((item) => item.id === id || item.videoId === id);
  if (!clip) return `No clip found with id ${id}.`;
  return `Clip ${clip.videoId ?? clip.id} starts at ${clip.timestamp.toFixed(
    1
  )}s and lasts ${clip.duration.toFixed(1)}s.`;
}

export function suggestNextAction(clips: VideoReference[], audioClips: VideoReference[]) {
  if (clips.length === 0) {
    return 'Start by adding a video clip from the media library.';
  }
  if (audioClips.length === 0) {
    return 'Consider adding background audio to match your timeline.';
  }
  return 'Preview the timeline and fine-tune clip timing.';
}
