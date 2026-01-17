// Timeline action types for chat agent responses

export type TimelineAction =
  | { type: 'ADD_VIDEO_CLIP'; payload: AddVideoClipPayload }
  | { type: 'MOVE_CLIP'; payload: MoveClipPayload }
  | { type: 'TRIM_CLIP'; payload: TrimClipPayload }
  | { type: 'REMOVE_CLIP'; payload: RemoveClipPayload }
  | { type: 'ADD_AUDIO_CLIP'; payload: AddAudioClipPayload }
  | { type: 'MOVE_AUDIO_CLIP'; payload: MoveAudioClipPayload }
  | { type: 'TRIM_AUDIO_CLIP'; payload: TrimAudioClipPayload }
  | { type: 'REMOVE_AUDIO_CLIP'; payload: RemoveAudioClipPayload };

export interface AddVideoClipPayload {
  clipId: string;
  videoId: string;
  url: string;
  duration: number;
  timestamp: number;
}

export interface MoveClipPayload {
  clipId: string;
  timestamp: number;
}

export interface TrimClipPayload {
  clipId: string;
  trimStart?: number;
  trimEnd?: number;
  timestamp?: number;
}

export interface RemoveClipPayload {
  clipId: string;
}

export interface AddAudioClipPayload {
  clipId: string;
  audioId: string;
  url: string;
  duration: number;
  timestamp: number;
}

export interface MoveAudioClipPayload {
  clipId: string;
  timestamp: number;
}

export interface TrimAudioClipPayload {
  clipId: string;
  trimStart?: number;
  trimEnd?: number;
  timestamp?: number;
}

export interface RemoveAudioClipPayload {
  clipId: string;
}
