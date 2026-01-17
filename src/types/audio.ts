export interface AudioReference {
  id: string;
  audioId?: string;
  url: string;
  timestamp: number;
  duration: number;
  trimStart?: number;  // Seconds trimmed from start (default 0)
  trimEnd?: number;    // Seconds trimmed from end (default 0)
}

export interface AudioMetadata {
  id: string;
  userId: string;
  url: string;
  fileName: string;
  duration: number | null;
  createdAt: Date;
}
