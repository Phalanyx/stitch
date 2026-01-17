# Video Clip Playback System

This document explains how video clip playback works in the Stitch editor, including time management, state synchronization, and the key components involved.

## Overview

The playback system uses a **lifted state** architecture where `currentTime` and `isPlaying` are managed in the parent `Editor` component and passed down to child components. The HTML `<video>` element fires time updates which are converted to global timeline coordinates.

## Core Components

| Component | File | Purpose |
|-----------|------|---------|
| Editor | `src/components/editor/Editor.tsx` | State orchestration, seek handling |
| Preview | `src/components/editor/Preview.tsx` | Video element, play/pause, time updates |
| Timeline | `src/components/editor/Timeline.tsx` | Playhead, time markers, drop zones |
| TimelineClip | `src/components/editor/TimelineClip.tsx` | Draggable/resizable video clips |

## Time Management

### State Lifting (Editor.tsx:70-71)

```typescript
const [isPlaying, setIsPlaying] = useState(false);
const [currentTime, setCurrentTime] = useState(0);  // Global timeline time in seconds
```

### Key Time Formulas

**Global to Video Time (for seeking):**
```
videoTime = (globalTime - clip.timestamp) + clip.trimStart
```

**Video to Global Time (from timeupdate):**
```
globalTime = clip.timestamp + (videoTime - clip.trimStart)
```

**Visible Duration:**
```
visibleDuration = clip.duration - trimStart - trimEnd
```

## Playback Flow

### 1. Play/Pause Toggle (Preview.tsx:140-149)

```typescript
const handlePlayPause = useCallback(() => {
  const video = videoRef.current;
  if (!video) return;

  if (isPlaying) {
    video.pause();
  } else {
    video.play();
  }
  onPlayPauseChange(!isPlaying);
}, [isPlaying, onPlayPauseChange]);
```

### 2. Time Update Handler (Preview.tsx:167-195)

When the video element fires `onTimeUpdate`:

1. Get current video element time
2. Convert to global timeline time
3. Check if we've reached clip end (accounting for trims)
4. Call `onTimeUpdate(globalTime)` to update Editor state

```typescript
const handleTimeUpdate = useCallback(() => {
  const video = videoRef.current;
  if (!video || !activeClip) return;

  const trimStart = activeClip.trimStart || 0;
  const trimEnd = activeClip.trimEnd || 0;
  const visibleDuration = activeClip.duration - trimStart - trimEnd;

  // Convert video time to global timeline time
  const globalTime = activeClip.timestamp + (video.currentTime - trimStart);

  // Check if we've reached the end of visible clip
  const clipEndTime = activeClip.timestamp + visibleDuration;
  if (video.currentTime >= activeClip.duration - trimEnd - 0.05) {
    handleVideoEnded();
    return;
  }

  onTimeUpdate(globalTime);
}, [activeClip, onTimeUpdate, handleVideoEnded]);
```

### 3. Clip End Handling (Preview.tsx:151-165)

When a clip ends:
- Find the next clip in sorted order
- If exists, seek to its start
- If no next clip, pause and reset to beginning

### 4. Active Clip Detection (Preview.tsx:93-106)

```typescript
let activeClip = sortedClips.find(clip => {
  const clipStart = clip.timestamp;
  const visibleDuration = clip.duration - (clip.trimStart || 0) - (clip.trimEnd || 0);
  const clipEnd = clipStart + visibleDuration;
  return currentTime >= clipStart && currentTime <= clipEnd;
});
```

## Seek Handling (Editor.tsx:74-101)

```typescript
const handleSeek = useCallback((time: number) => {
  setCurrentTime(time);

  // Prevent video timeupdate from overriding seek
  isSeekingRef.current = true;

  // Find active clip for this time
  const activeClip = clips.find(clip => {
    const visibleDuration = clip.duration - (clip.trimStart || 0) - (clip.trimEnd || 0);
    return time >= clip.timestamp && time < clip.timestamp + visibleDuration;
  });

  if (activeClip && videoRef.current) {
    // Convert global time to video element time
    const clipRelativeTime = time - activeClip.timestamp + (activeClip.trimStart || 0);
    videoRef.current.currentTime = clipRelativeTime;
  }

  setTimeout(() => {
    isSeekingRef.current = false;
  }, 100);
}, [clips]);
```

The `isSeekingRef` flag prevents race conditions where the video's `timeupdate` event would override the manual seek position.

## Audio Synchronization (Preview.tsx:44-80)

Audio clips are HTML `<audio>` elements synced to the timeline:

```typescript
// For each audio clip at current time
if (currentTime >= clipStart && currentTime <= clipEnd) {
  const audioTime = currentTime - clipStart + trimStart;

  // Dynamic sync threshold (tighter at boundaries)
  const syncThreshold = isNearBoundary ? 0.05 : 0.3;

  if (Math.abs(audio.currentTime - audioTime) > syncThreshold) {
    audio.currentTime = audioTime;
  }

  if (isPlaying && audio.paused) {
    audio.play();
  }
} else {
  if (!audio.paused) {
    audio.pause();
  }
}
```

## Timeline UI (Timeline.tsx)

### Constants
- `PIXELS_PER_SECOND = 50`
- `SNAP_INCREMENT = 0.05` seconds
- `TRACK_LABEL_WIDTH = 48` pixels

### Playhead Position (Timeline.tsx:64-86)

```typescript
// Position = currentTime * PIXELS_PER_SECOND
// Dragging calculates: time = (x - TRACK_LABEL_WIDTH) / PIXELS_PER_SECOND
```

### Clip Position (TimelineClip.tsx)

```typescript
const left = clip.timestamp * pixelsPerSecond;
const width = visibleDuration * pixelsPerSecond;
```

## Data Types

### VideoReference (src/types/video.ts)

```typescript
export interface VideoReference {
  id: string;           // Unique clip ID
  videoId?: string;     // Source video ID
  url: string;          // Video file URL
  timestamp: number;    // Position on timeline (seconds)
  duration: number;     // Full video duration (seconds)
  trimStart?: number;   // Trim from start (seconds)
  trimEnd?: number;     // Trim from end (seconds)
}
```

## State Management

### Video Timeline Store (src/stores/timelineStore.ts)

Zustand store with methods:
- `addVideoToTimeline()` - Add clip at end
- `addVideoAtTimestamp()` - Add at specific position
- `updateVideoTimestamp()` - Move clip
- `updateClipTrim()` - Adjust trim values
- `removeClip()` - Delete clip

### Overlap Prevention (src/lib/timeline-validation.ts)

All position updates use `findNearestValidPosition()` to prevent clips from overlapping:

```typescript
// Overlap detection (touching edges are NOT overlaps)
return start1 < end2 && end1 > start2;
```

## Flow Diagrams

### Playback Flow
```
User clicks Play
    ↓
Editor.handlePlayPause()
    ↓
videoRef.current.play()
    ↓
Video fires 'timeupdate'
    ↓
Preview.handleTimeUpdate()
    ↓
Convert video time → global time
    ↓
Editor.setCurrentTime(globalTime)
    ↓
Timeline playhead updates
```

### Seek Flow
```
User clicks Timeline
    ↓
Timeline.onSeek(time)
    ↓
Editor.handleSeek(time)
    ↓
1. setCurrentTime(time)
2. isSeekingRef = true
3. Find active clip
4. videoRef.currentTime = clipRelativeTime
5. isSeekingRef = false (after 100ms)
    ↓
Preview detects clip change
    ↓
Loads new clip if needed
```

## Key Implementation Details

1. **Seeking Flag**: The `isSeekingRef` prevents the video's `timeupdate` from overriding manual seeks during the 100ms window after a seek.

2. **Grid Snapping**: All timeline operations snap to 0.05 second increments via `snapToGrid()`.

3. **Clip Boundaries**: Containment check uses `<=` for end bound, but seeking uses `<` to avoid ambiguity at exact boundaries.

4. **Audio Sync Thresholds**: 0.05s at clip boundaries, 0.3s elsewhere - prevents jitter while maintaining accuracy.

5. **Trim Handling**: All time calculations account for `trimStart` and `trimEnd` to show only the visible portion of each clip.
