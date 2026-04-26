import { DownloadInfo, DownloadTask, MediaSource, MediaType } from '../entities/Media';

export interface IDownloader {
  getInfo(url: string): Promise<DownloadInfo>;
  download(url: string, type: MediaType, mediaId: string): Promise<DownloadTask>;
  cancel(mediaId: string): Promise<void>;
  getStatus(mediaId: string): Promise<DownloadTask | null>;
  getProgress(mediaId: string): number;
}

export interface IMediaRepository {
  save(task: DownloadTask): DownloadTask;
  findById(id: string): DownloadTask | null;
  findAll(): DownloadTask[];
  update(task: DownloadTask): DownloadTask;
  delete(id: string): void;
}