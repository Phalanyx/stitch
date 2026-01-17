'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, Film, Loader2 } from 'lucide-react';
import { VideoMetadata } from '@/types/video';
import { createClient } from '@/lib/supabase/client';

interface SidebarProps {
  onAddToTimeline: (video: { id: string; url: string; duration?: number }) => void;
}

export function Sidebar({ onAddToTimeline }: SidebarProps) {
  const [videos, setVideos] = useState<VideoMetadata[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadVideos() {
      try {
        const response = await fetch('/api/videos');
        if (response.ok) {
          const data = await response.json();
          setVideos(data);
        }
      } catch (error) {
        console.error('Failed to load videos:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadVideos();
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

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('No session found');
        setIsUploading(false);
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
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-white font-semibold mb-3">Media Library</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
          onChange={handleUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white rounded-md transition-colors"
        >
          {isUploading ? (
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

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : videos.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-8">
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
                  <Film className="w-4 h-4 text-gray-400" />
                  <span className="text-white text-sm truncate flex-1">
                    {video.fileName}
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
