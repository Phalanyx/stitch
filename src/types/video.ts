export interface VideoReference {
  id: string;
  videoId?: string;
  url: string;
  timestamp: number;
  duration: number;
}

export interface VideoMetadata {
  id: string;
  userId: string;
  url: string;
  fileName: string;
  duration: number | null;
  createdAt: Date;
}
