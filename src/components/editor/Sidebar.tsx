'use client';

import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
import { Film, Music, Loader2, Sparkles, AlertCircle, Pencil, Check, X, Info } from 'lucide-react';
import { VideoMetadata } from '@/types/video';
import { AudioMetadata } from '@/types/audio';
import { createClient } from '@/lib/supabase/client';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { MediaPropertiesModal } from '@/components/ui/MediaPropertiesModal';
import { UploadProgressModal, UploadStage } from '@/components/ui/UploadProgressModal';
import { useTimelineStore } from '@/stores/timelineStore';
import { useAudioTimelineStore } from '@/stores/audioTimelineStore';
import { formatDuration, getVideoDuration, getAudioDuration } from '@/lib/media-utils';

// Video thumbnail component that extracts frame from video
function VideoThumbnail({ url, className }: { url: string; className?: string }) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;

    const handleLoadedData = () => {
      // Seek to 0.1 seconds to get a frame (not exactly 0 to avoid black frames)
      video.currentTime = 0.1;
    };

    const handleSeeked = () => {
      if (!isMounted) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setThumbnailUrl(dataUrl);
        }
      } catch (err) {
        console.error('Failed to generate thumbnail:', err);
        setError(true);
      } finally {
        setIsLoading(false);
      }
    };

    const handleError = () => {
      if (!isMounted) return;
      setError(true);
      setIsLoading(false);
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);
    video.src = url;

    return () => {
      isMounted = false;
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
      video.src = '';
    };
  }, [url]);

  if (isLoading) {
    return (
      <div className={`bg-gray-700 flex items-center justify-center ${className}`}>
        <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
      </div>
    );
  }

  if (error || !thumbnailUrl) {
    return (
      <div className={`bg-gray-700 flex items-center justify-center ${className}`}>
        <Film className="w-8 h-8 text-gray-500" />
      </div>
    );
  }

  return (
    <img
      src={thumbnailUrl}
      alt="Video thumbnail"
      className={`object-cover ${className}`}
    />
  );
}

interface SidebarProps {
  onAddToTimeline: (video: { id: string; url: string; duration?: number }) => void;
  onAddAudioToTimeline: (audio: { id: string; url: string; duration?: number }) => void;
  newAudio?: AudioMetadata | null;
  onNewAudioHandled?: () => void;
}

export interface SidebarRef {
  processFile: (file: File) => void;
}

type MediaItem = (VideoMetadata | AudioMetadata) & { type: 'video' | 'audio' };

interface UploadModalState {
  isOpen: boolean;
  stage: UploadStage;
  fileName: string;
  videoId: string | null;
  errorMessage?: string;
}

interface PreUploadModalState {
  isOpen: boolean;
  file: File | null;
  customName: string;
}

export const Sidebar = forwardRef<SidebarRef, SidebarProps>(
  ({ onAddToTimeline, onAddAudioToTimeline, newAudio, onNewAudioHandled }, ref) => {
  const [activeTab, setActiveTab] = useState<'video' | 'audio'>('video');
  const [videos, setVideos] = useState<VideoMetadata[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioMetadata[]>([]);
  const [uploadModal, setUploadModal] = useState<UploadModalState>({
    isOpen: false,
    stage: 'uploading',
    fileName: '',
    videoId: null,
  });
  const [preUploadModal, setPreUploadModal] = useState<PreUploadModalState>({
    isOpen: false,
    file: null,
    customName: '',
  });
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
  const preUploadInputRef = useRef<HTMLInputElement>(null);

  const clips = useTimelineStore((state) => state.clips);
  const audioLayers = useAudioTimelineStore((state) => state.audioLayers);
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

  useEffect(() => {
    if (preUploadModal.isOpen && preUploadInputRef.current) {
      preUploadInputRef.current.focus();
      preUploadInputRef.current.select();
    }
  }, [preUploadModal.isOpen]);

  // Handle new audio created by the chat agent
  useEffect(() => {
    if (newAudio && onNewAudioHandled) {
      setAudioFiles((prev) => [newAudio, ...prev]);
      onNewAudioHandled();
    }
  }, [newAudio, onNewAudioHandled]);

  // Poll task status for the current upload in modal
  const pollTaskStatus = useCallback(async (videoId: string) => {
    try {
      const response = await fetch(`/api/videos/${videoId}/task-status`);
      if (response.ok) {
        const data = await response.json();

        // Update videos list with new status
        setVideos((prev) =>
          prev.map((v) =>
            v.id === videoId
              ? {
                  ...v,
                  twelveLabsStatus: data.twelveLabsStatus,
                  twelveLabsId: data.twelveLabsId,
                  summary: data.summary,
                }
              : v
          )
        );

        return data;
      }
    } catch (error) {
      console.error('Failed to poll task status:', error);
    }
    return null;
  }, []);

  // Polling effect for modal indexing stage
  useEffect(() => {
    if (!uploadModal.isOpen || uploadModal.stage !== 'indexing' || !uploadModal.videoId) {
      return;
    }

    const pollInterval = setInterval(async () => {
      const status = await pollTaskStatus(uploadModal.videoId!);
      if (status) {
        if (status.twelveLabsStatus === 'ready') {
          setUploadModal((prev) => ({ ...prev, stage: 'complete' }));
        } else if (status.twelveLabsStatus === 'failed') {
          setUploadModal((prev) => ({
            ...prev,
            stage: 'error',
            errorMessage: 'AI processing failed',
          }));
        }
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [uploadModal.isOpen, uploadModal.stage, uploadModal.videoId, pollTaskStatus]);

  // Background polling for videos still indexing on page load
  useEffect(() => {
    const indexingVideos = videos.filter((v) => v.twelveLabsStatus === 'indexing');
    if (indexingVideos.length === 0) return;

    const pollInterval = setInterval(() => {
      indexingVideos.forEach((video) => {
        pollTaskStatus(video.id);
      });
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [videos, pollTaskStatus]);

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

    // Get base name without extension for default custom name
    const baseName = file.name.replace(/\.[^/.]+$/, '');

    // Show pre-upload modal for naming
    setPreUploadModal({
      isOpen: true,
      file,
      customName: baseName,
    });

    // Clear file input
    if (videoFileInputRef.current) {
      videoFileInputRef.current.value = '';
    }
  };

  const handlePreUploadCancel = () => {
    setPreUploadModal({
      isOpen: false,
      file: null,
      customName: '',
    });
  };

  const handlePreUploadConfirm = async () => {
    const { file, customName } = preUploadModal;
    if (!file) return;

    // Close pre-upload modal
    setPreUploadModal({
      isOpen: false,
      file: null,
      customName: '',
    });

    // Use custom name if provided, otherwise use original filename
    const displayName = customName.trim() || file.name;

    // Open upload progress modal and start uploading
    setUploadModal({
      isOpen: true,
      stage: 'uploading',
      fileName: displayName,
      videoId: null,
    });

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        console.error('No session found');
        setUploadModal((prev) => ({
          ...prev,
          stage: 'error',
          errorMessage: 'Not authenticated',
        }));
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      if (customName.trim()) {
        formData.append('customName', customName.trim());
      }

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

        // Also add the extracted audio to audioFiles state
        if (video.audio) {
          const audioWithVideoRef = {
            ...video.audio,
            video: { id: video.id, fileName: video.fileName },
          };
          setAudioFiles((prev) => [audioWithVideoRef, ...prev]);
        }

        // If task was created successfully, start indexing stage
        if (video.twelveLabsStatus === 'indexing') {
          setUploadModal((prev) => ({
            ...prev,
            stage: 'indexing',
            videoId: video.id,
          }));
        } else if (video.twelveLabsStatus === 'failed') {
          setUploadModal((prev) => ({
            ...prev,
            stage: 'error',
            errorMessage: 'AI processing failed to start',
          }));
        } else {
          // Unexpected status, show as complete
          setUploadModal((prev) => ({
            ...prev,
            stage: 'complete',
            videoId: video.id,
          }));
        }
      } else {
        let errorMessage = 'Upload failed';
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const error = await response.json();
            errorMessage = error.error || errorMessage;
          } else {
            const text = await response.text();
            errorMessage = `Upload failed: ${response.status} ${response.statusText}`;
            console.error('Non-JSON error response:', text.substring(0, 200));
          }
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          errorMessage = `Upload failed: ${response.status} ${response.statusText}`;
        }
        console.error('Upload failed:', errorMessage);
        setUploadModal((prev) => ({
          ...prev,
          stage: 'error',
          errorMessage,
        }));
      }
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadModal((prev) => ({
        ...prev,
        stage: 'error',
        errorMessage: 'Network error',
      }));
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

  // Process file from external import (top bar)
  const processFile = useCallback((file: File) => {
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');

    if (isVideo) {
      // Switch to video tab and process video
      setActiveTab('video');
      // Set the file in the input and trigger the upload handler
      if (videoFileInputRef.current) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        videoFileInputRef.current.files = dataTransfer.files;
        const event = new Event('change', { bubbles: true });
        videoFileInputRef.current.dispatchEvent(event);
      }
    } else if (isAudio) {
      // Switch to audio tab and process audio
      setActiveTab('audio');
      // Set the file in the input and trigger the upload handler
      if (audioFileInputRef.current) {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        audioFileInputRef.current.files = dataTransfer.files;
        const event = new Event('change', { bubbles: true });
        audioFileInputRef.current.dispatchEvent(event);
      }
    }
  }, []);

  // Expose processFile method via ref
  useImperativeHandle(ref, () => ({
    processFile,
  }), [processFile]);

  const isVideoUsedInTimeline = (videoId: string) => {
    return clips.some((clip) => clip.videoId === videoId);
  };

  const isAudioUsedInTimeline = (audioId: string) => {
    return audioLayers.some((layer) => layer.clips.some((clip) => clip.audioId === audioId));
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

          // If this audio was linked to a video, update that video's state
          if ('video' in item && item.video) {
            setVideos((prev) =>
              prev.map((v) =>
                v.id === item.video!.id
                  ? { ...v, audioId: null, audio: null }
                  : v
              )
            );
          }
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
    onClick: () => void,
    statusContent?: React.ReactNode
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
          const dragData = {
            type,
            id: item.id,
            url: item.url,
            duration: item.duration,
          };
          e.dataTransfer.setData('application/json', JSON.stringify(dragData));
          e.dataTransfer.effectAllowed = 'copy';
        }}
        className="px-3 py-2 bg-transparent hover:bg-gray-700 cursor-grab active:cursor-grabbing border-b border-gray-800 transition-colors group"
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
                className="flex-1 bg-gray-800 text-white text-sm px-2 py-0.5 border border-gray-600 focus:border-blue-500 focus:outline-none min-w-0 rounded"
              />
              <button
                onClick={() => handleSaveEdit(type, item.id)}
                className="p-1 text-blue-400 hover:text-blue-300 hover:bg-gray-700 rounded"
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
              <span className="text-gray-200 text-sm truncate flex-1 min-w-0">
                {item.fileName}
              </span>
              {isHovered ? (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={(e) => handleStartEdit(item.id, item.fileName, e)}
                    className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                    title="Rename"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => handlePropertiesClick(item, type, e)}
                    className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
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
              ) : statusContent}
            </>
          )}
        </div>
      </div>
    );
  };


  return (
    <div className="w-72 bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* Asset Library Header */}
      <div className="p-3 border-b border-gray-700">
        <h2 className="text-gray-300 text-xs font-semibold mb-3 uppercase tracking-wider">Asset Library</h2>
        
        {/* Tabs */}
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('video')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === 'video'
                ? 'bg-sky-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            Video
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              activeTab === 'audio'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            Audio
          </button>
        </div>

        {/* Hidden file inputs for processFile method */}
        <input
          ref={videoFileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
          onChange={handleVideoUpload}
          className="hidden"
        />
        <input
          ref={audioFileInputRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/ogg,audio/aac,audio/mp4,audio/x-m4a"
          onChange={handleAudioUpload}
          className="hidden"
        />
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'video' ? (
          isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : videos.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-4">
              No videos uploaded yet
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {videos.map((video) => {
                const isHovered = hoveredId === video.id;
                const isEditing = editingId === video.id;

                return (
                  <div
                    key={video.id}
                    draggable={!isEditing}
                    onDragStart={(e) => {
                      if (isEditing) {
                        e.preventDefault();
                        return;
                      }
                      const dragData = {
                        type: 'video',
                        id: video.id,
                        url: video.url,
                        duration: video.duration,
                      };
                      e.dataTransfer.setData('application/json', JSON.stringify(dragData));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    className="bg-gray-700 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-sky-500 transition-all group"
                    onClick={() => !isEditing && handleAddToTimeline(video)}
                    onMouseEnter={() => setHoveredId(video.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-video">
                      <VideoThumbnail url={video.url} className="w-full h-full" />
                      {/* Duration badge */}
                      {video.duration && (
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                          {formatDuration(video.duration)}
                        </div>
                      )}
                      {/* Status indicator */}
                      <div className="absolute top-1 right-1">
                        {video.twelveLabsStatus === 'ready' && (
                          <span title="AI processed" className="bg-black/50 rounded p-0.5 block">
                            <Sparkles className="w-3 h-3 text-blue-400" />
                          </span>
                        )}
                        {video.twelveLabsStatus === 'indexing' && (
                          <span title="Processing" className="bg-black/50 rounded p-0.5 block">
                            <Loader2 className="w-3 h-3 text-yellow-400 animate-spin" />
                          </span>
                        )}
                        {video.twelveLabsStatus === 'failed' && (
                          <span title="AI processing failed" className="bg-black/50 rounded p-0.5 block">
                            <AlertCircle className="w-3 h-3 text-red-400" />
                          </span>
                        )}
                      </div>
                      {/* Hover actions */}
                      {isHovered && !isEditing && (
                        <div className="absolute top-1 left-1 flex gap-0.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(video.id, video.fileName, e);
                            }}
                            className="p-1 bg-black/50 text-gray-300 hover:text-white rounded transition-colors"
                            title="Rename"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePropertiesClick(video, 'video', e);
                            }}
                            className="p-1 bg-black/50 text-gray-300 hover:text-white rounded transition-colors"
                            title="Properties"
                          >
                            <Info className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(video, 'video', e);
                            }}
                            className="p-1 bg-black/50 text-gray-300 hover:text-red-400 rounded transition-colors"
                            title="Delete"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    {/* File name */}
                    <div className="p-2">
                      {isEditing ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            ref={editInputRef}
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveEdit('video', video.id);
                              } else if (e.key === 'Escape') {
                                handleCancelEdit();
                              }
                            }}
                            className="flex-1 bg-gray-800 text-white text-xs px-2 py-1 border border-gray-600 focus:border-blue-500 focus:outline-none min-w-0 rounded"
                          />
                          <button
                            onClick={() => handleSaveEdit('video', video.id)}
                            className="p-1 text-blue-400 hover:text-blue-300 rounded"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="p-1 text-gray-400 hover:text-white rounded"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <p className="text-gray-200 text-xs truncate" title={video.fileName}>
                          {video.fileName}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : audioFiles.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-4">
              No audio uploaded yet
            </div>
          ) : (
            <div className="-mx-3 -mt-3">
              {audioFiles.map((audio) =>
                renderMediaItem(
                  audio,
                  'audio',
                  Music,
                  audio.video ? 'text-purple-400' : 'text-blue-400',
                  () => handleAddAudioToTimeline(audio),
                  audio.video ? (
                    <span
                      className="flex items-center gap-1 text-purple-400"
                      title={`Extracted from: ${audio.video.fileName}`}
                    >
                      <Film className="w-3 h-3" />
                    </span>
                  ) : undefined
                )
              )}
            </div>
          )
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
          linkedVideoName={deleteModal.item.type === 'audio' && 'video' in deleteModal.item && deleteModal.item.video ? deleteModal.item.video.fileName : undefined}
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

      {/* Pre-Upload Naming Modal */}
      {preUploadModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-96 max-w-[90vw]">
            <h3 className="text-white font-semibold text-lg mb-4">Name Your Video</h3>
            <input
              ref={preUploadInputRef}
              type="text"
              value={preUploadModal.customName}
              onChange={(e) => setPreUploadModal((prev) => ({ ...prev, customName: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handlePreUploadConfirm();
                } else if (e.key === 'Escape') {
                  handlePreUploadCancel();
                }
              }}
              placeholder="Enter video name"
              className="w-full bg-gray-700 text-white px-4 py-2 rounded-md border border-gray-600 focus:border-blue-500 focus:outline-none mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={handlePreUploadCancel}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handlePreUploadConfirm}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md transition-colors"
              >
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Progress Modal */}
      <UploadProgressModal
        isOpen={uploadModal.isOpen}
        onClose={() => setUploadModal((prev) => ({ ...prev, isOpen: false }))}
        stage={uploadModal.stage}
        fileName={uploadModal.fileName}
        errorMessage={uploadModal.errorMessage}
      />
    </div>
  );
});
