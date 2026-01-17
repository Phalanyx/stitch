export interface AudioReference {
  id: string;
  audioId?: string;
  url: string;
  timestamp: number;
  duration: number;
}

export interface AudioMetadata {
  id: string;
  userId: string;
  url: string;
  fileName: string;
  duration: number | null;
  createdAt: Date;
}
