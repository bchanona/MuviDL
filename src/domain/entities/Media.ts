export type MediaSource = 'youtube' | 'facebook' | 'instagram' | 'tiktok';
export type MediaType = 'video' | 'audio';
export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface MediaMetadata {
  id: string;
  url: string;
  title: string;
  source: MediaSource;
  type: MediaType;
  duration?: number;
  thumbnail?: string;
  author?: string;
  uploadDate?: string;
}

export interface DownloadTask {
  id: string;
  mediaId: string;
  url: string;
  title: string;
  source: MediaSource;
  type: MediaType;
  status: DownloadStatus;
  progress: number;
  filePath?: string;
  fileSize?: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface DownloadInfo {
  metadata: MediaMetadata;
  bestFormat: {
    ext: string;
    quality: string;
    filesize?: number;
  };
}