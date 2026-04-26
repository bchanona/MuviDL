import { spawn } from 'child_process';
import { DownloadInfo, MediaMetadata, MediaType, MediaSource } from '../../domain/entities/Media';
import { IDownloader } from '../../domain/ports';
import { downloadWorker } from '../worker/DownloadWorker';
import { autoDebugger } from '../worker/AutoDebugger';
import { detectSource } from '../../shared/utils/UrlValidator';
import { cookieManager, CookieProfile } from '../worker/CookieManager';
import { extractMedia, ExtractorResult } from './MultiExtractor';

interface ApifyResponse {
  results?: Array<{
    videoUrl?: string;
    title?: string;
    thumbnailUrl?: string;
    duration?: number;
  }>;
}

async function fetchFromApify(url: string, source: string): Promise<DownloadInfo | null> {
  const APIFY_TOKEN = process.env.APIFY_TOKEN;
  if (!APIFY_TOKEN) {
    return null;
  }

  return new Promise((resolve) => {
    const postData = JSON.stringify({ url });
    const options = {
      hostname: 'api.apify.com',
      path: `/v2/acts/miccho27~social-video-downloader/run?token=${APIFY_TOKEN}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = require('https').request(options, (res: { on: (event: string, cb: (chunk: string) => void) => void; }) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result: ApifyResponse = JSON.parse(data);
          const item = result.results?.[0];
          
          if (item?.videoUrl) {
            resolve({
              metadata: {
                id: crypto.randomUUID(),
                url,
                title: item.title || 'Untitled',
                source: source as MediaSource,
                type: 'video' as MediaType,
                duration: item.duration,
                thumbnail: item.thumbnailUrl,
              },
              bestFormat: { ext: 'mp4', quality: 'best' },
            });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.write(postData);
    req.end();
  });
}

export class YtDlpDownloader implements IDownloader {
  private currentExtractor: 'multi' | 'apify' = 'multi';

  private async testYtDlp(): Promise<boolean> {
    return new Promise((resolve) => {
      const test = spawn('yt-dlp', ['--version']);
      test.on('close', (code) => resolve(code === 0));
      test.on('error', () => resolve(false));
    });
  }

  private convertToDownloadInfo(result: ExtractorResult, url: string, source: string): DownloadInfo {
    const src = source as MediaSource;
    return {
      metadata: {
        id: crypto.randomUUID(),
        url,
        title: result.data?.title || 'Untitled',
        source: src,
        type: result.data?.duration ? 'video' : 'audio',
        duration: result.data?.duration,
        thumbnail: result.data?.thumbnail,
        author: result.data?.author,
      },
      bestFormat: {
        ext: result.data?.videoUrl ? 'mp4' : 'mp3',
        quality: 'best',
        filesize: result.data?.videoUrl ? undefined : result.data?.duration,
      },
    };
  }

  async getInfo(url: string): Promise<DownloadInfo> {
    const source = detectSource(url) || 'youtube';

    const isAvailable = await this.testYtDlp();
    if (!isAvailable) {
      throw new Error('yt-dlp is not available on the server');
    }

    // Try MultiExtractor first (Invidious, Piped, yt-dlp fallback chain)
    if (source === 'youtube') {
      const multiResult = await extractMedia(url);
      
      if (multiResult.success) {
        autoDebugger.logSuccess(url, source);
        cookieManager.markSuccess();
        return this.convertToDownloadInfo(multiResult, url, source);
      }

      cookieManager.markFailure();
      autoDebugger.logFailure(url, source, multiResult.error || 'Extraction failed', '');

      // Fallback to Apify if available
      const apifyResult = await fetchFromApify(url, source);
      if (apifyResult) {
        return apifyResult;
      }

      throw new Error(multiResult.error || 'Could not extract media. Try a different video.');
    }

    // For other platforms, use yt-dlp directly
    return new Promise((resolve, reject) => {
      const args = [
        '--no-playlist',
        '--dump-json',
        '--no-warnings',
        url,
      ];

      const child = spawn('yt-dlp', args);
      let output = '';
      let errorOutput = '';

      child.stdout?.on('data', (data) => { output += data.toString(); });
      child.stderr?.on('data', (data) => { errorOutput += data.toString(); });

      child.on('error', (error) => {
        autoDebugger.logFailure(url, source, error.message, errorOutput);
        reject(new Error(`Failed: ${error.message}`));
      });

      child.on('close', async (code) => {
        if (code === 0 && output.trim()) {
          try {
            const data = JSON.parse(output.trim());
            autoDebugger.logSuccess(url, source);
            resolve({
              metadata: {
                id: data.display_id || data.id || crypto.randomUUID(),
                url,
                title: data.title || 'Untitled',
                source: source as MediaSource,
                type: 'video' as MediaType,
                duration: data.duration,
                thumbnail: data.thumbnail,
                author: data.uploader,
              },
              bestFormat: { ext: 'mp4', quality: 'best' },
            });
          } catch (err) {
            reject(new Error(`Parse error: ${err}`));
          }
        } else {
          // Try Apify fallback
          const apifyResult = await fetchFromApify(url, source);
          if (apifyResult) {
            resolve(apifyResult);
            return;
          }
          reject(new Error(errorOutput.substring(0, 100) || `Exit code: ${code}`));
        }
      });
    });
  }

  async download(url: string, type: MediaType, mediaId: string): Promise<import('../../domain/entities/Media').DownloadTask> {
    const info = await this.getInfo(url);
    return downloadWorker.startDownload(url, type, mediaId, info.metadata.title);
  }

  async cancel(mediaId: string): Promise<void> {
    await downloadWorker.cancel(mediaId);
  }

  async getStatus(mediaId: string): Promise<import('../../domain/entities/Media').DownloadTask | null> {
    return downloadWorker.getStatus(mediaId);
  }

  getProgress(mediaId: string): number {
    return downloadWorker.getProgress(mediaId);
  }

  getCookieStats() {
    return cookieManager.getStats();
  }

  getCookieProfiles(): CookieProfile[] {
    return cookieManager.getAllProfiles();
  }

  async validateCookieProfile(id: string) {
    return cookieManager.validateProfile(id);
  }

  addCookieProfile(name: string, filePath: string, email?: string): CookieProfile {
    return cookieManager.addProfile(name, filePath, email);
  }

  removeCookieProfile(id: string): boolean {
    return cookieManager.removeProfile(id);
  }
}

export const downloader = new YtDlpDownloader();