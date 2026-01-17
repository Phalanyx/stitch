'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, Film, Music, Loader2, Pencil, Info, X, Check } from 'lucide-react';
import { VideoMetadata } from '@/types/video';
import { AudioMetadata } from '@/types/audio';
import { createClient } from '@/lib/supabase/client';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { MediaPropertiesModal } from '@/components/ui/MediaPropertiesModal';
import { useTimelineStore } from '@/stores/timelineStore';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';

interface SidebarProps {
  onAddToTimeline: (video: { id: string; url: string; duration?: number }) => void;
  onAddAudioToTimeline: (audio: { id: string; url: string; duration?: number }) => void;
}

type MediaItem = (VideoMetadata | AudioMetadata) & { type: 'video' | 'audio' };

export function Sidebar({ onAddToTimeline, onAddAudioToTimeline }: SidebarProps) {
  const [videos, setVideos] = useState<VideoMetadata[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioMetadata[]>([]);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteModal, setDeleteModal] = useState<{ item: MediaItem; isUsed: boolean } | null>(null);
  const [propertiesModal, setPropertiesModal] = useState<MediaItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const clips = useTimelineStore((state) => state.clips);
  const audioClips = useAudioTimelineStore((state) => state.audioClips);
  const removeClipsByVideoId = useTimelineStore((state) => state.removeClipsByVideoId);
  const removeClipsByAudioId = useAudioTimelineStore((state) => state.removeClipsByAudioId);

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

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

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
    if (editingId) return;
    try {
      let duration = video.duration ?? undefined;

      if (!duration) {
        try {
          duration = await getVideoDuration(video.url);
        } catch (error) {
          console.error('Failed to extract video duration:', error);
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
    if (editingId) return;
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

  const isVideoUsedInTimeline = (videoId: string) => {
    return clips.some((clip) => clip.videoId === videoId);
  };

  const isAudioUsedInTimeline = (audioId: string) => {
    return audioClips.some((clip) => clip.audioId === audioId);
  };

  const handleStartEdit = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingName(currentName);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const handleSaveEdit = async (type: 'video' | 'audio', id: string) => {
    if (!editingName.trim()) {
      handleCancelEdit();
      return;
    }

    try {
      const response = await fetch(`/api/${type === 'video' ? 'videos' : 'audio'}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: editingName.trim() }),
      });

      if (response.ok) {
        const updated = await response.json();
        if (type === 'video') {
          setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, fileName: updated.fileName } : v)));
        } else {
          setAudioFiles((prev) => prev.map((a) => (a.id === id ? { ...a, fileName: updated.fileName } : a)));
        }
      }
    } catch (error) {
      console.error('Failed to rename:', error);
    }

    handleCancelEdit();
  };

  const handleDeleteClick = (item: VideoMetadata | AudioMetadata, type: 'video' | 'audio', e: React.MouseEvent) => {
    e.stopPropagation();
    const isUsed = type === 'video'
      ? isVideoUsedInTimeline(item.id)
      : isAudioUsedInTimeline(item.id);
    setDeleteModal({ item: { ...item, type }, isUsed });
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal) return;

    setIsDeleting(true);
    const { item } = deleteModal;

    try {
      const endpoint = item.type === 'video' ? 'videos' : 'audio';
      const response = await fetch(`/api/${endpoint}/${item.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        if (item.type === 'video') {
          setVideos((prev) => prev.filter((v) => v.id !== item.id));
          removeClipsByVideoId(item.id);
        } else {
          setAudioFiles((prev) => prev.filter((a) => a.id !== item.id));
          removeClipsByAudioId(item.id);
        }
      }
    } catch (error) {
      console.error('Failed to delete:', error);
    }

    setIsDeleting(false);
    setDeleteModal(null);
  };

  const handlePropertiesClick = (item: VideoMetadata | AudioMetadata, type: 'video' | 'audio', e: React.MouseEvent) => {
    e.stopPropagation();
    setPropertiesModal({ ...item, type });
  };

  const renderMediaItem = (
    item: VideoMetadata | AudioMetadata,
    type: 'video' | 'audio',
    Icon: typeof Film | typeof Music,
    iconColor: string,
    onClick: () => void
  ) => {
    const isHovered = hoveredId === item.id;
    const isEditing = editingId === item.id;

    return (
      <div
        key={item.id}
        draggable={!isEditing}
        onDragStart={(e) => {
          if (isEditing) {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData('application/json', JSON.stringify({
            type,
            id: item.id,
            url: item.url,
            duration: item.duration,
          }));
          e.dataTransfer.effectAllowed = 'copy';
        }}
        className="p-2 bg-gray-700 rounded-md hover:bg-gray-600 cursor-grab active:cursor-grabbing transition-colors group"
        onClick={onClick}
        onMouseEnter={() => setHoveredId(item.id)}
        onMouseLeave={() => setHoveredId(null)}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColor} flex-shrink-0`} />
          {isEditing ? (
            <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <input
                ref={editInputRef}
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveEdit(type, item.id);
                  } else if (e.key === 'Escape') {
                    handleCancelEdit();
                  }
                }}
                className="flex-1 bg-gray-800 text-white text-sm px-2 py-0.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none min-w-0"
              />
              <button
                onClick={() => handleSaveEdit(type, item.id)}
                className="p-1 text-green-400 hover:text-green-300 hover:bg-gray-700 rounded"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleCancelEdit}
                className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <>
              <span className="text-white text-sm truncate flex-1 min-w-0">
                {item.fileName}
              </span>
              {isHovered && (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={(e) => handleStartEdit(item.id, item.fileName, e)}
                    className="p-1 text-gray-400 hover:text-white hover:bg-gray-600 rounded transition-colors"
                    title="Rename"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handlePropertiesClick(item, type, e)}
                    className="p-1 text-gray-400 hover:text-white hover:bg-gray-600 rounded transition-colors"
                    title="Properties"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handleDeleteClick(item, type, e)}
                    className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded transition-colors"
                    title="Delete"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
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
            {videos.map((video) =>
              renderMediaItem(video, 'video', Film, 'text-blue-400', () => handleAddToTimeline(video))
            )}
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
            {audioFiles.map((audio) =>
              renderMediaItem(audio, 'audio', Music, 'text-green-400', () => handleAddAudioToTimeline(audio))
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <ConfirmDeleteModal
          isOpen={true}
          onClose={() => setDeleteModal(null)}
          onConfirm={handleConfirmDelete}
          itemName={deleteModal.item.fileName}
          itemType={deleteModal.item.type}
          isUsedInTimeline={deleteModal.isUsed}
          isDeleting={isDeleting}
        />
      )}

      {/* Properties Modal */}
      {propertiesModal && (
        <MediaPropertiesModal
          isOpen={true}
          onClose={() => setPropertiesModal(null)}
          type={propertiesModal.type}
          name={propertiesModal.fileName}
          size={propertiesModal.fileSize}
          duration={propertiesModal.duration}
          createdAt={propertiesModal.createdAt}
        />
      )}
    </div>
  );
}
