'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, Film, Music, Loader2 } from 'lucide-react';
import { VideoMetadata } from '@/types/video';
import { AudioMetadata } from '@/types/audio';
import { createClient } from '@/lib/supabase/client';

interface SidebarProps {
  onAddToTimeline: (video: { id: string; url: string; duration?: number }) => void;
  onAddAudioToTimeline: (audio: { id: string; url: string; duration?: number }) => void;
}

export function Sidebar({ onAddToTimeline, onAddAudioToTimeline }: SidebarProps) {
  const [videos, setVideos] = useState<VideoMetadata[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioMetadata[]>([]);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadMedia() {
      try {
        const [videosResponse, audioResponse] = await Promise.all([
          fetch('/api/videos'),
          fetch('/api/audio'),
        ]);

        if (videosResponse.ok) {
          const videoData = await videosResponse.json();
          setVideos(videoData);
        }

        if (audioResponse.ok) {
          const audioData = await audioResponse.json();
          setAudioFiles(audioData);
        }
      } catch (error) {
        console.error('Failed to load media:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadMedia();
  }, []);

  // Helper function to extract video duration from a video URL
  const getVideoDuration = (url: string): Promise<number> => {
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
  };

  const handleAddToTimeline = async (video: VideoMetadata) => {
    try {
      let duration = video.duration ?? undefined;

      // If duration is not available, try to extract it from the video
      if (!duration) {
        try {
          duration = await getVideoDuration(video.url);
        } catch (error) {
          console.error('Failed to extract video duration:', error);
          // Will fall back to default duration in the store
        }
      }

      onAddToTimeline({
        id: video.id,
        url: video.url,
        duration,
      });
    } catch (error) {
      console.error('Failed to add video to timeline:', error);
    }
  };

  // Helper function to extract audio duration from an audio URL
  const getAudioDuration = (url: string): Promise<number> => {
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
  };

  const handleAddAudioToTimeline = async (audio: AudioMetadata) => {
    try {
      let duration = audio.duration ?? undefined;

      if (!duration) {
        try {
          duration = await getAudioDuration(audio.url);
        } catch (error) {
          console.error('Failed to extract audio duration:', error);
        }
      }

      onAddAudioToTimeline({
        id: audio.id,
        url: audio.url,
        duration,
      });
    } catch (error) {
      console.error('Failed to add audio to timeline:', error);
    }
  };

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingVideo(true);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('No session found');
        setIsUploadingVideo(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const { video } = await response.json();
        setVideos((prev) => [video, ...prev]);
      } else {
        const error = await response.json();
        console.error('Upload failed:', error);
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploadingVideo(false);
      if (videoFileInputRef.current) {
        videoFileInputRef.current.value = '';
      }
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAudio(true);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('No session found');
        setIsUploadingAudio(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload-audio', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const { audio } = await response.json();
        setAudioFiles((prev) => [audio, ...prev]);
      } else {
        const error = await response.json();
        console.error('Audio upload failed:', error);
      }
    } catch (error) {
      console.error('Audio upload failed:', error);
    } finally {
      setIsUploadingAudio(false);
      if (audioFileInputRef.current) {
        audioFileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* Video Library */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-white font-semibold mb-3">Video Library</h2>
        <input
          ref={videoFileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
          onChange={handleVideoUpload}
          className="hidden"
        />
        <button
          onClick={() => videoFileInputRef.current?.click()}
          disabled={isUploadingVideo}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-md transition-colors"
        >
          {isUploadingVideo ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Upload Video
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 border-b border-gray-700">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : videos.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-4">
            No videos uploaded yet
          </div>
        ) : (
          <div className="space-y-2">
            {videos.map((video) => (
              <div
                key={video.id}
                className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 cursor-pointer transition-colors"
                onClick={() => handleAddToTimeline(video)}
              >
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-blue-400" />
                  <span className="text-white text-sm truncate flex-1">
                    {video.fileName}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audio Library */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-white font-semibold mb-3">Audio Library</h2>
        <input
          ref={audioFileInputRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/ogg,audio/aac,audio/mp4,audio/x-m4a"
          onChange={handleAudioUpload}
          className="hidden"
        />
        <button
          onClick={() => audioFileInputRef.current?.click()}
          disabled={isUploadingAudio}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 text-white rounded-md transition-colors"
        >
          {isUploadingAudio ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Upload Audio
            </>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : audioFiles.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-4">
            No audio uploaded yet
          </div>
        ) : (
          <div className="space-y-2">
            {audioFiles.map((audio) => (
              <div
                key={audio.id}
                className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 cursor-pointer transition-colors"
                onClick={() => handleAddAudioToTimeline(audio)}
              >
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-green-400" />
                  <span className="text-white text-sm truncate flex-1">
                    {audio.fileName}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
