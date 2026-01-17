import { VideoReference } from '@/types/video';
import { TimelineAction } from '@/types/actions';
import { prisma } from '@/lib/prisma';
import {
  ToolResult,
  AudioReference,
  ToolDecision,
  DbVideo,
  DbAudio,
} from './types';
import {
  validateAddVideoArgs,
  validateAddAudioArgs,
  validateModifyVideoArgs,
  validateModifyAudioArgs,
  validateGetVideoArgs,
  validateGetAudioArgs,
  validateFindClipArgs,
  logArgsDebug,
} from './validators';

/**
 * Fuzzy match helper - simple substring matching
 */
function fuzzyMatch(query: string, target: string): boolean {
  const normalizedQuery = query.toLowerCase().trim();
  const normalizedTarget = target.toLowerCase();
  return normalizedTarget.includes(normalizedQuery);
}

// ============================================================================
// Timeline Info Tools (no database access needed)
// ============================================================================

export function summarizeTimeline(clips: VideoReference[]): ToolResult {
  if (clips.length === 0) {
    return { success: true, data: 'No clips on the timeline yet.' };
  }

  const totalDuration = clips.reduce((sum, clip) => {
    const visible = clip.duration - (clip.trimStart || 0) - (clip.trimEnd || 0);
    return sum + visible;
  }, 0);

  const earliest = Math.min(...clips.map((clip) => clip.timestamp));
  const latest = Math.max(
    ...clips.map((clip) => {
      const visible = clip.duration - (clip.trimStart || 0) - (clip.trimEnd || 0);
      return clip.timestamp + visible;
    })
  );

  return {
    success: true,
    data: `Timeline has ${clips.length} clip(s), total visible duration ${totalDuration.toFixed(1)}s, spanning ${earliest.toFixed(1)}s to ${latest.toFixed(1)}s.`,
  };
}

export function listClips(clips: VideoReference[]): ToolResult {
  if (clips.length === 0) {
    return { success: true, data: 'No clips on the timeline.' };
  }

  const list = clips
    .map((clip, index) => {
      const name = clip.videoId ?? clip.id;
      const visible = clip.duration - (clip.trimStart || 0) - (clip.trimEnd || 0);
      return `#${index + 1} ${name} @ ${clip.timestamp.toFixed(1)}s (${visible.toFixed(1)}s)`;
    })
    .join('\n');

  return { success: true, data: list };
}

export function findClip(
  clips: VideoReference[],
  args: Record<string, unknown>
): ToolResult {
  const validation = validateFindClipArgs(args);
  if (!validation.valid) {
    logArgsDebug('find_clip', args, validation.error);
    return { success: false, error: validation.error };
  }

  const { id } = validation.parsed as { id: string };
  const clip = clips.find((item) => item.id === id || item.videoId === id);

  if (!clip) {
    return { success: false, error: `No clip found with id "${id}".` };
  }

  const visible = clip.duration - (clip.trimStart || 0) - (clip.trimEnd || 0);
  return {
    success: true,
    data: `Clip ${clip.videoId ?? clip.id} starts at ${clip.timestamp.toFixed(1)}s and is ${visible.toFixed(1)}s visible.`,
  };
}

export function suggestNextAction(
  clips: VideoReference[],
  audioClips: AudioReference[]
): ToolResult {
  if (clips.length === 0) {
    return {
      success: true,
      data: 'Start by adding a video clip from the media library.',
    };
  }
  if (audioClips.length === 0) {
    return {
      success: true,
      data: 'Consider adding background audio to match your timeline.',
    };
  }
  return {
    success: true,
    data: 'Preview the timeline and fine-tune clip timing.',
  };
}

// ============================================================================
// Library Tools (require database access)
// ============================================================================

export async function listVideos(userId: string): Promise<ToolResult> {
  const videos = await prisma.video.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  if (videos.length === 0) {
    return {
      success: true,
      data: 'No videos in your library yet. Upload some videos to get started.',
    };
  }

  const list = videos
    .map(
      (v, i) =>
        `${i + 1}. "${v.fileName}" (${v.duration?.toFixed(1) ?? '?'}s) - id: ${v.id}`
    )
    .join('\n');

  return { success: true, data: `Videos in your library:\n${list}` };
}

export async function getVideo(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const validation = validateGetVideoArgs(args);
  if (!validation.valid) {
    logArgsDebug('get_video', args, validation.error);
    return { success: false, error: validation.error };
  }

  const { name } = validation.parsed as { name: string };
  const videos = await prisma.video.findMany({ where: { userId } });
  const matches = videos.filter((v) => fuzzyMatch(name, v.fileName));

  if (matches.length === 0) {
    return { success: false, error: `No videos found matching "${name}".` };
  }

  if (matches.length === 1) {
    const v = matches[0];
    return {
      success: true,
      data: `Found: "${v.fileName}" (${v.duration?.toFixed(1) ?? '?'}s) - id: ${v.id}`,
    };
  }

  const list = matches
    .map((v, i) => `${i + 1}. "${v.fileName}" - id: ${v.id}`)
    .join('\n');
  return {
    success: true,
    data: `Found ${matches.length} videos matching "${name}":\n${list}`,
  };
}

export async function listAudio(userId: string): Promise<ToolResult> {
  const audioFiles = await prisma.audio.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  if (audioFiles.length === 0) {
    return {
      success: true,
      data: 'No audio files in your library yet. Upload some audio to get started.',
    };
  }

  const list = audioFiles
    .map(
      (a, i) =>
        `${i + 1}. "${a.fileName}" (${a.duration?.toFixed(1) ?? '?'}s) - id: ${a.id}`
    )
    .join('\n');

  return { success: true, data: `Audio files in your library:\n${list}` };
}

export async function getAudio(
  userId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const validation = validateGetAudioArgs(args);
  if (!validation.valid) {
    logArgsDebug('get_audio', args, validation.error);
    return { success: false, error: validation.error };
  }

  const { name } = validation.parsed as { name: string };
  const audioFiles = await prisma.audio.findMany({ where: { userId } });
  const matches = audioFiles.filter((a) => fuzzyMatch(name, a.fileName));

  if (matches.length === 0) {
    return { success: false, error: `No audio found matching "${name}".` };
  }

  if (matches.length === 1) {
    const a = matches[0];
    return {
      success: true,
      data: `Found: "${a.fileName}" (${a.duration?.toFixed(1) ?? '?'}s) - id: ${a.id}`,
    };
  }

  const list = matches
    .map((a, i) => `${i + 1}. "${a.fileName}" - id: ${a.id}`)
    .join('\n');
  return {
    success: true,
    data: `Found ${matches.length} audio files matching "${name}":\n${list}`,
  };
}

// ============================================================================
// Timeline Modification Tools
// ============================================================================

export async function addVideoToTimeline(
  userId: string,
  clips: VideoReference[],
  args: Record<string, unknown>
): Promise<ToolResult> {
  const validation = validateAddVideoArgs(args);
  if (!validation.valid) {
    logArgsDebug('add_video_to_timeline', args, validation.error);
    return { success: false, error: validation.error };
  }

  const { videoId, videoName, timestamp } = validation.parsed as {
    videoId?: string;
    videoName?: string;
    timestamp?: number;
  };

  let video: DbVideo | null = null;

  if (videoId) {
    video = await prisma.video.findFirst({
      where: { id: videoId, userId },
    });
  } else if (videoName) {
    const videos = await prisma.video.findMany({ where: { userId } });
    const matches = videos.filter((v) => fuzzyMatch(videoName, v.fileName));

    if (matches.length === 1) {
      video = matches[0];
    } else if (matches.length > 1) {
      const list = matches
        .map((v, i) => `${i + 1}. "${v.fileName}" - id: ${v.id}`)
        .join('\n');
      return {
        success: false,
        error: `Multiple videos match "${videoName}". Please be more specific:\n${list}`,
      };
    }
  }

  if (!video) {
    const notFoundMsg = videoId
      ? `Video with id "${videoId}" not found.`
      : `No video found matching "${videoName}".`;
    return { success: false, error: notFoundMsg };
  }

  const clipId = crypto.randomUUID();
  const duration = video.duration ?? 5;

  // Calculate timestamp: use provided value or append to end
  const lastClip = clips[clips.length - 1];
  const finalTimestamp =
    timestamp ?? (lastClip ? lastClip.timestamp + lastClip.duration : 0);

  const action: TimelineAction = {
    type: 'ADD_VIDEO_CLIP',
    payload: {
      clipId,
      videoId: video.id,
      url: video.url,
      duration,
      timestamp: Math.max(0, finalTimestamp),
    },
  };

  return {
    success: true,
    data: `Added "${video.fileName}" to timeline at ${finalTimestamp.toFixed(1)}s.`,
    action,
  };
}

export function modifyVideoClip(
  clips: VideoReference[],
  args: Record<string, unknown>
): ToolResult {
  const validation = validateModifyVideoArgs(args);
  if (!validation.valid) {
    logArgsDebug('modify_video_clip', args, validation.error);
    return { success: false, error: validation.error };
  }

  const { action, clipId, timestamp, trimStart, trimEnd } = validation.parsed as {
    action: string;
    clipId: string;
    timestamp?: number;
    trimStart?: number;
    trimEnd?: number;
  };

  // Find clip by ID or by index (e.g., "1" for first clip)
  let targetClip = clips.find((c) => c.id === clipId || c.videoId === clipId);
  let actualClipId = clipId;

  if (!targetClip) {
    const index = parseInt(clipId) - 1;
    if (index >= 0 && index < clips.length) {
      targetClip = clips[index];
      actualClipId = targetClip.id;
    }
  } else {
    actualClipId = targetClip.id;
  }

  if (!targetClip) {
    return { success: false, error: `Clip "${clipId}" not found on timeline.` };
  }

  let resultAction: TimelineAction;
  let message: string;

  if (action === 'move' && timestamp !== undefined) {
    resultAction = { type: 'MOVE_CLIP', payload: { clipId: actualClipId, timestamp } };
    message = `Moving clip to ${timestamp.toFixed(1)}s.`;
  } else if (action === 'trim') {
    resultAction = {
      type: 'TRIM_CLIP',
      payload: { clipId: actualClipId, trimStart, trimEnd, timestamp },
    };
    const parts: string[] = [];
    if (trimStart) parts.push(`${trimStart}s from start`);
    if (trimEnd) parts.push(`${trimEnd}s from end`);
    message = `Trimming clip by ${parts.join(' and ')}.`;
  } else if (action === 'remove') {
    resultAction = { type: 'REMOVE_CLIP', payload: { clipId: actualClipId } };
    message = 'Removed clip from timeline.';
  } else {
    return { success: false, error: 'Invalid action or missing required arguments.' };
  }

  return { success: true, data: message, action: resultAction };
}

export async function addAudioToTimeline(
  userId: string,
  audioClips: AudioReference[],
  args: Record<string, unknown>
): Promise<ToolResult> {
  const validation = validateAddAudioArgs(args);
  if (!validation.valid) {
    logArgsDebug('add_audio_to_timeline', args, validation.error);
    return { success: false, error: validation.error };
  }

  const { audioId, audioName, timestamp } = validation.parsed as {
    audioId?: string;
    audioName?: string;
    timestamp?: number;
  };

  let audio: DbAudio | null = null;

  if (audioId) {
    audio = await prisma.audio.findFirst({
      where: { id: audioId, userId },
    });
  } else if (audioName) {
    const audioFiles = await prisma.audio.findMany({ where: { userId } });
    const matches = audioFiles.filter((a) => fuzzyMatch(audioName, a.fileName));

    if (matches.length === 1) {
      audio = matches[0];
    } else if (matches.length > 1) {
      const list = matches
        .map((a, i) => `${i + 1}. "${a.fileName}" - id: ${a.id}`)
        .join('\n');
      return {
        success: false,
        error: `Multiple audio files match "${audioName}". Please be more specific:\n${list}`,
      };
    }
  }

  if (!audio) {
    const notFoundMsg = audioId
      ? `Audio with id "${audioId}" not found.`
      : `No audio found matching "${audioName}".`;
    return { success: false, error: notFoundMsg };
  }

  const clipId = crypto.randomUUID();
  const duration = audio.duration ?? 5;

  // Calculate timestamp: use provided value or append to end
  const lastClip = audioClips[audioClips.length - 1];
  const finalTimestamp =
    timestamp ?? (lastClip ? lastClip.timestamp + lastClip.duration : 0);

  const action: TimelineAction = {
    type: 'ADD_AUDIO_CLIP',
    payload: {
      clipId,
      audioId: audio.id,
      url: audio.url,
      duration,
      timestamp: Math.max(0, finalTimestamp),
    },
  };

  return {
    success: true,
    data: `Added "${audio.fileName}" to audio track at ${finalTimestamp.toFixed(1)}s.`,
    action,
  };
}

export function modifyAudioClip(
  audioClips: AudioReference[],
  args: Record<string, unknown>
): ToolResult {
  const validation = validateModifyAudioArgs(args);
  if (!validation.valid) {
    logArgsDebug('modify_audio_clip', args, validation.error);
    return { success: false, error: validation.error };
  }

  const { action, clipId, timestamp, trimStart, trimEnd } = validation.parsed as {
    action: string;
    clipId: string;
    timestamp?: number;
    trimStart?: number;
    trimEnd?: number;
  };

  // Find clip by ID or by index
  let targetClip = audioClips.find((c) => c.id === clipId || c.audioId === clipId);
  let actualClipId = clipId;

  if (!targetClip) {
    const index = parseInt(clipId) - 1;
    if (index >= 0 && index < audioClips.length) {
      targetClip = audioClips[index];
      actualClipId = targetClip.id;
    }
  } else {
    actualClipId = targetClip.id;
  }

  if (!targetClip) {
    return { success: false, error: `Audio clip "${clipId}" not found on timeline.` };
  }

  let resultAction: TimelineAction;
  let message: string;

  if (action === 'move' && timestamp !== undefined) {
    resultAction = { type: 'MOVE_AUDIO_CLIP', payload: { clipId: actualClipId, timestamp } };
    message = `Moving audio clip to ${timestamp.toFixed(1)}s.`;
  } else if (action === 'trim') {
    resultAction = {
      type: 'TRIM_AUDIO_CLIP',
      payload: { clipId: actualClipId, trimStart, trimEnd, timestamp },
    };
    const parts: string[] = [];
    if (trimStart) parts.push(`${trimStart}s from start`);
    if (trimEnd) parts.push(`${trimEnd}s from end`);
    message = `Trimming audio clip by ${parts.join(' and ')}.`;
  } else if (action === 'remove') {
    resultAction = { type: 'REMOVE_AUDIO_CLIP', payload: { clipId: actualClipId } };
    message = 'Removed audio clip from timeline.';
  } else {
    return { success: false, error: 'Invalid action or missing required arguments.' };
  }

  return { success: true, data: message, action: resultAction };
}

// ============================================================================
// Main Tool Executor
// ============================================================================

export async function executeTool(
  decision: ToolDecision,
  userId: string,
  clips: VideoReference[],
  audioClips: AudioReference[]
): Promise<ToolResult> {
  const args = decision.args ?? {};

  switch (decision.tool) {
    // Timeline info tools
    case 'summarize_timeline':
      return summarizeTimeline(clips);

    case 'list_clips':
      return listClips(clips);

    case 'find_clip':
      return findClip(clips, args);

    case 'suggest_next_action':
      return suggestNextAction(clips, audioClips);

    // Library tools
    case 'list_videos':
      return listVideos(userId);

    case 'get_video':
      return getVideo(userId, args);

    case 'list_audio':
      return listAudio(userId);

    case 'get_audio':
      return getAudio(userId, args);

    // Timeline modification tools
    case 'add_video_to_timeline':
      return addVideoToTimeline(userId, clips, args);

    case 'modify_video_clip':
      return modifyVideoClip(clips, args);

    case 'add_audio_to_timeline':
      return addAudioToTimeline(userId, audioClips, args);

    case 'modify_audio_clip':
      return modifyAudioClip(audioClips, args);

    // No tool needed
    case 'none':
      return { success: true, data: '' };

    default:
      return { success: false, error: `Unknown tool: ${decision.tool}` };
  }
}
