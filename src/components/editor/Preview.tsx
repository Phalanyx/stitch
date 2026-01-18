'use client';

import { useState, useRef, useEffect, RefObject, useMemo } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Undo2, Redo2 } from 'lucide-react';
import { VideoReference } from '@/types/video';
import { AudioLayer } from '@/types/audio';
import { Transition } from '@/types/transition';
import { renderTransitionFrame } from '@/lib/transitions';

interface PreviewProps {
  clips: VideoReference[];
  transitions: Transition[];
  audioLayers: AudioLayer[];
  videoRef: RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  onSeek: (time: number) => void;
  onDropVideo?: (video: { id: string; url: string; duration?: number }) => void;
  isSeekingRef: RefObject<boolean>;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export function Preview({ 
  clips, 
  transitions, 
  audioLayers, 
  videoRef, // This will be attached to the primary video (Video A)
  isPlaying, 
  setIsPlaying, 
  currentTime, 
  onTimeUpdate, 
  onSeek, 
  onDropVideo, 
  isSeekingRef, 
  onUndo, 
  onRedo, 
  canUndo, 
  canRedo 
}: PreviewProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [volume, setVolume] = useState(1);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null); // Secondary video for transitions
  
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const sortedClips = useMemo(() => [...clips].sort((a, b) => a.timestamp - b.timestamp), [clips]);

  // --- Audio Management (kept mostly same) ---
  const audioClips = useMemo(() => {
    return audioLayers
      .filter(layer => !layer.muted)
      .flatMap(layer => layer.clips)
      .filter(clip => !clip.muted);
  }, [audioLayers]);

  useEffect(() => {
    audioClips.forEach(clip => {
      if (!audioRefs.current.has(clip.id)) {
        const audio = new Audio(clip.url);
        audioRefs.current.set(clip.id, audio);
      }
    });
    audioRefs.current.forEach((audio, id) => {
      if (!audioClips.find(c => c.id === id)) {
        audio.pause();
        audioRefs.current.delete(id);
      }
    });
  }, [audioClips]);

  useEffect(() => {
    audioRefs.current.forEach((audio) => {
      audio.volume = volume;
    });
  }, [volume]);

  // Sync audio
  useEffect(() => {
    if (isSeekingRef.current) {
      audioClips.forEach(clip => {
        const audio = audioRefs.current.get(clip.id);
        if (audio && !audio.paused) audio.pause();
      });
      return;
    }

    audioClips.forEach(clip => {
      const audio = audioRefs.current.get(clip.id);
      if (!audio) return;

      const clipStart = clip.timestamp;
      const trimStart = clip.trimStart || 0;
      const visibleDuration = clip.duration - trimStart - (clip.trimEnd || 0);
      const clipEnd = clipStart + visibleDuration;

      if (currentTime >= clipStart && currentTime <= clipEnd) {
        const audioTime = currentTime - clipStart + trimStart;
        if (Math.abs(audio.currentTime - audioTime) > 0.3) {
          audio.currentTime = audioTime;
        }
        if (isPlaying && audio.paused) {
          audio.play().catch(() => {});
        }
        if (!isPlaying && !audio.paused) {
          audio.pause();
        }
      } else {
        if (!audio.paused) audio.pause();
        audio.currentTime = trimStart;
      }
    });
  }, [currentTime, isPlaying, audioClips, isSeekingRef]);

  // --- Video & Transition Logic ---

  // Helper to find active clip
  const getActiveClip = (time: number) => {
    return sortedClips.find(clip => {
      const duration = clip.duration - (clip.trimStart || 0) - (clip.trimEnd || 0);
      return time >= clip.timestamp && time < clip.timestamp + duration;
    });
  };

  // Helper to find active transition
  const getActiveTransition = (time: number) => {
    return transitions.find(t => {
      // Find the cut point this transition is associated with.
      // Assuming transitions are stored with prevClipId/nextClipId.
      let cutPoint = 0;
      if (t.prevClipId) {
        const prevClip = sortedClips.find(c => c.id === t.prevClipId);
        if (prevClip) {
          const duration = prevClip.duration - (prevClip.trimStart || 0) - (prevClip.trimEnd || 0);
          cutPoint = prevClip.timestamp + duration;
        }
      } else if (t.nextClipId) {
        const nextClip = sortedClips.find(c => c.id === t.nextClipId);
        if (nextClip) cutPoint = nextClip.timestamp;
      }

      const durationSec = t.duration / 1000;
      const start = cutPoint - durationSec / 2;
      const end = cutPoint + durationSec / 2;
      
      return time >= start && time <= end;
    });
  };

  // Main Render Loop
  const render = (time: number) => {
    if (!canvasRef.current || !videoRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;

    const transition = getActiveTransition(time);
    
    if (transition) {
      // --- Transition Mode ---
      const durationSec = transition.duration / 1000;
      
      // Calculate cut point
      let cutPoint = 0;
      let clipA: VideoReference | undefined;
      let clipB: VideoReference | undefined;
      
      if (transition.prevClipId) {
        clipA = sortedClips.find(c => c.id === transition.prevClipId);
        if (clipA) {
             const duration = clipA.duration - (clipA.trimStart || 0) - (clipA.trimEnd || 0);
             cutPoint = clipA.timestamp + duration;
        }
      }
      if (transition.nextClipId) {
        clipB = sortedClips.find(c => c.id === transition.nextClipId);
        if (!cutPoint && clipB) cutPoint = clipB.timestamp;
      }
      
      const start = cutPoint - durationSec / 2;
      const progress = (time - start) / durationSec;
      
      // Setup Video A (Previous)
      if (clipA && videoRef.current) {
        // Sync Video A
        const timeInClipA = time - clipA.timestamp + (clipA.trimStart || 0);
        // Ensure src is set (optimization: check if already set)
        if (videoRef.current.getAttribute('data-clip-id') !== clipA.id) {
            videoRef.current.src = clipA.url;
            videoRef.current.setAttribute('data-clip-id', clipA.id);
        }
        if (Math.abs(videoRef.current.currentTime - timeInClipA) > 0.1) {
            videoRef.current.currentTime = timeInClipA;
        }
      }
      
      // Setup Video B (Next)
      if (clipB && videoBRef.current) {
        const timeInClipB = time - clipB.timestamp + (clipB.trimStart || 0);
        if (videoBRef.current.getAttribute('data-clip-id') !== clipB.id) {
            videoBRef.current.src = clipB.url;
            videoBRef.current.setAttribute('data-clip-id', clipB.id);
        }
        if (Math.abs(videoBRef.current.currentTime - timeInClipB) > 0.1) {
            videoBRef.current.currentTime = timeInClipB;
        }
      }
      
      renderTransitionFrame(
        transition,
        progress,
        clipA ? videoRef.current : null,
        clipB ? videoBRef.current : null,
        ctx,
        width,
        height
      );

    } else {
      // --- Normal Playback Mode ---
      const activeClip = getActiveClip(time);
      
      if (activeClip && videoRef.current) {
        // Ensure correct src
        if (videoRef.current.getAttribute('data-clip-id') !== activeClip.id) {
            console.log('[Preview] Switching to clip', activeClip.id);
            videoRef.current.src = activeClip.url;
            videoRef.current.setAttribute('data-clip-id', activeClip.id);
            // Wait for load? handled by loop checking readiness
        }
        
        // Sync time
        const timeInClip = time - activeClip.timestamp + (activeClip.trimStart || 0);
        if (Math.abs(videoRef.current.currentTime - timeInClip) > 0.2) { // Looser sync for normal playback
            videoRef.current.currentTime = timeInClip;
        }

        // Draw
        if (videoRef.current.readyState >= 2) {
             ctx.drawImage(videoRef.current, 0, 0, width, height);
        } else {
             // Loading indicator? or black
             ctx.fillStyle = 'black';
             ctx.fillRect(0, 0, width, height);
        }
      } else {
        // No active clip (blank space)
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);
      }
    }
  };

  // Animation Loop
  useEffect(() => {
    let lastTimestamp = performance.now();

    const loop = (timestamp: number) => {
      const deltaTime = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      if (isPlaying && !isSeekingRef.current) {
        // Increment time
        const newTime = currentTime + deltaTime;
        
        // Check end of timeline
        const lastClip = sortedClips[sortedClips.length - 1];
        const endTime = lastClip 
            ? lastClip.timestamp + (lastClip.duration - (lastClip.trimStart || 0) - (lastClip.trimEnd || 0))
            : 0;

        if (newTime >= endTime) {
            setIsPlaying(false);
            onSeek(0);
        } else {
            onTimeUpdate(newTime);
        }
      }
      
      // Always render
      render(currentTime);
      requestRef.current = requestAnimationFrame(loop);
    };
    
    requestRef.current = requestAnimationFrame(loop);
    
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, currentTime, clips, transitions, sortedClips]); // Dependencies need to be right

  // Handle Play/Pause for Video Elements
  useEffect(() => {
      // We manually sync currentTimes in the render loop.
      // But we should also play() the videos if global is playing, to let browser buffer and handle audio?
      // Actually, since we have audio elements separate, we can keep videos muted and playing (or just advancing).
      // If we just seek constantly, it might be choppy. `video.play()` is smoother.
      
      if (videoRef.current) {
          if (isPlaying) videoRef.current.play().catch(() => {});
          else videoRef.current.pause();
      }
      if (videoBRef.current) {
          if (isPlaying) videoBRef.current.play().catch(() => {});
          else videoBRef.current.pause();
      }
  }, [isPlaying]);


  // Cleanup
  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'video' && onDropVideo) {
        onDropVideo({
          id: data.id,
          url: data.url,
          duration: data.duration,
        });
      }
    } catch (err) {
      console.error('Failed to parse drop data:', err);
    }
  };

  return (
    <div
      className={`flex-1 bg-black flex flex-col overflow-hidden ${
        isDraggingOver ? 'ring-1 ring-inset ring-blue-500/50' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Canvas Area */}
      <div className="flex-1 min-h-0 flex items-center justify-center relative">
        <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="max-h-full max-w-full object-contain"
        />
        
        {/* Hidden Video Elements */}
        <video ref={videoRef} className="hidden" muted playsInline />
        <video ref={videoBRef} className="hidden" muted playsInline />
        
        {clips.length === 0 && (
          <div className="absolute text-gray-500">No clips in timeline</div>
        )}
      </div>

      {/* Controls Area */}
      <div className="flex-shrink-0 bg-gray-800 border-t border-gray-700 h-10 flex items-center justify-center gap-1 px-2">
        {/* Undo/Redo Controls */}
        <div className="flex items-center gap-1 mr-2 pr-2 border-r border-gray-700">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="w-7 h-7 bg-transparent hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center rounded transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4 text-gray-300" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="w-7 h-7 bg-transparent hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center rounded transition-colors"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="w-4 h-4 text-gray-300" />
          </button>
        </div>

        {/* Skip to Beginning */}
        <button
          onClick={() => onSeek(0)}
          disabled={clips.length === 0}
          className="w-7 h-7 bg-transparent hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center rounded transition-colors"
        >
          <SkipBack className="w-4 h-4 text-gray-300" />
        </button>

        {/* Play Backward (Not implemented in this version, relying on simple play/pause for now) */}
        {/* <button className="w-7 h-7 bg-transparent hover:bg-gray-700 flex items-center justify-center rounded transition-colors opacity-50 cursor-not-allowed">
          <Play className="w-4 h-4 text-gray-300 rotate-180" />
        </button> */}

        {/* Pause */}
        <button
          onClick={() => setIsPlaying(false)}
          disabled={!isPlaying}
          className="w-7 h-7 bg-transparent hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center rounded transition-colors"
        >
          <Pause className="w-4 h-4 text-gray-300" />
        </button>

        {/* Play Forward */}
        <button
          onClick={() => setIsPlaying(true)}
          disabled={isPlaying || clips.length === 0}
          className="w-7 h-7 bg-transparent hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center rounded transition-colors"
        >
          <Play className="w-4 h-4 text-gray-300" />
        </button>

        {/* Skip to End */}
        <button
          onClick={() => {
              const last = sortedClips[sortedClips.length - 1];
              if(last) onSeek(last.timestamp + last.duration);
          }}
          disabled={clips.length === 0}
          className="w-7 h-7 bg-transparent hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center rounded transition-colors"
        >
          <SkipForward className="w-4 h-4 text-gray-300" />
        </button>

        {/* Volume Control */}
        <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-700">
          <Volume2 className="w-4 h-4 text-gray-300 flex-shrink-0" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
          />
        </div>
      </div>
    </div>
  );
}