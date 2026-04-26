import { DownloadInfo, DownloadTask, MediaType } from '../../domain/entities/Media';
import { IDownloader } from '../../domain/ports';

export class GetMediaInfoUseCase {
  constructor(private downloader: IDownloader) {}

  async execute(url: string): Promise<DownloadInfo> {
    if (!url) {
      throw new Error('URL is required');
    }
    return this.downloader.getInfo(url);
  }
}

export class StartDownloadUseCase {
  constructor(private downloader: IDownloader) {}

  async execute(url: string, type: MediaType): Promise<DownloadTask> {
    if (!url) {
      throw new Error('URL is required');
    }
    const mediaId = crypto.randomUUID();
    return this.downloader.download(url, type, mediaId);
  }
}

export class GetDownloadStatusUseCase {
  constructor(private downloader: IDownloader) {}

  async execute(mediaId: string): Promise<DownloadTask | null> {
    if (!mediaId) {
      throw new Error('Media ID is required');
    }
    return this.downloader.getStatus(mediaId);
  }
}

export class CancelDownloadUseCase {
  constructor(private downloader: IDownloader) {}

  async execute(mediaId: string): Promise<void> {
    if (!mediaId) {
      throw new Error('Media ID is required');
    }
    return this.downloader.cancel(mediaId);
  }
}