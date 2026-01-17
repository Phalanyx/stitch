export interface VideoReference {
  id: string;
  videoId?: string;
  url: string;
  timestamp: number;
  duration: number;
  trimStart?: number;  // Seconds trimmed from start (default 0)
  trimEnd?: number;    // Seconds trimmed from end (default 0)
}

export interface VideoMetadata {
  id: string;
  userId: string;
  url: string;
  fileName: string;
  duration: number | null;
  fileSize: number | null;
  createdAt: Date;
  twelveLabsId: string | null;
  twelveLabsStatus: string | null;
  summary: string | null;
}
