import { spawn } from 'child_process';
import https from 'https';
import http from 'http';
import { URL } from 'url';

interface ExtractorResult {
  success: boolean;
  platform: string;
  data?: {
    title?: string;
    videoUrl?: string;
    audioUrl?: string;
    thumbnail?: string;
    duration?: number;
    author?: string;
    views?: number;
  };
  error?: string;
}

const INVIDIOUS_INSTANCES = [
  'https://invidious.nadeko.net',
  'https://invidious.jingl.xyz',
  'https://invidious.projectsegfau.lt',
  'https://iv.ggtyler.dev',
];

const PIPED_INSTANCES = [
  'https://pipedapi.adminforge.de',
  'https://piped-api.lunar.duckdns.org',
  'https://pipedapi.kavin.rocks',
];

async function fetchJson(url: string, timeout: number = 8000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(url, { timeout }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function extractYouTubeInvidious(videoId: string): Promise<ExtractorResult> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log('[MultiExtractor] Trying Invidious:', instance);
      const data = await fetchJson(`${instance}/api/v1/videos/${videoId}`, 8000) as {
        title?: string;
        thumbnailUrl?: string;
        lengthSeconds?: string;
        author?: string;
        viewCount?: number;
        adaptiveFormats?: Array<{ url: string; type: string }>;
      };

      const videoFormat = data.adaptiveFormats?.find(f => f.type.includes('video'));
      const audioFormat = data.adaptiveFormats?.find(f => f.type.includes('audio'));

      return {
        success: true,
        platform: 'invidious',
        data: {
          title: data.title,
          thumbnail: data.thumbnailUrl,
          duration: parseInt(data.lengthSeconds || '0'),
          author: data.author,
          views: data.viewCount,
          videoUrl: videoFormat?.url,
          audioUrl: audioFormat?.url,
        },
      };
    } catch (e) {
      console.log('[MultiExtractor] Invidious failed:', e);
      continue;
    }
  }
  return { success: false, platform: 'invidious', error: 'All instances failed' };
}

async function extractYouTubePiped(videoId: string): Promise<ExtractorResult> {
  for (const instance of PIPED_INSTANCES) {
    try {
      console.log('[MultiExtractor] Trying Piped:', instance);
      const data = await fetchJson(`${instance}/streams/${videoId}`, 8000) as {
        title?: string;
        thumbnailUrl?: string;
        duration?: number;
        uploader?: string;
        videoStreams?: Array<{ url: string; quality: string }>;
        audioStreams?: Array<{ url: string }>;
      };

      return {
        success: true,
        platform: 'piped',
        data: {
          title: data.title,
          thumbnail: data.thumbnailUrl,
          duration: data.duration,
          author: data.uploader,
          videoUrl: data.videoStreams?.[0]?.url,
          audioUrl: data.audioStreams?.[0]?.url,
        },
      };
    } catch (e) {
      console.log('[MultiExtractor] Piped failed:', e);
      continue;
    }
  }
  return { success: false, platform: 'piped', error: 'All instances failed' };
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/v\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function extractYouTubeYtdlp(url: string): Promise<ExtractorResult> {
  return new Promise((resolve) => {
    console.log('[MultiExtractor] Trying yt-dlp...');
    const args = [
      '--no-playlist',
      '--dump-json',
      '--no-warnings',
      '--extractor-args', 'youtube:player_client=tv',
      '--user-agent', 'Mozilla/5.0 (SmartTV; Tizen/6.0) AppleWebKit/537.36',
      url,
    ];

    const child = spawn('yt-dlp', args);
    let output = '';
    let errorOutput = '';

    child.stdout?.on('data', (data) => { output += data.toString(); });
    child.stderr?.on('data', (data) => { errorOutput += data.toString(); });

    child.on('close', (code) => {
      if (code === 0 && output.trim()) {
        try {
          const data = JSON.parse(output.trim());
          console.log('[MultiExtractor] yt-dlp success');
          resolve({
            success: true,
            platform: 'yt-dlp',
            data: {
              title: data.title,
              thumbnail: data.thumbnail,
              duration: data.duration,
              author: data.uploader,
              views: data.view_count,
            },
          });
        } catch {
          resolve({ success: false, platform: 'yt-dlp', error: 'Parse failed' });
        }
      } else {
        console.log('[MultiExtractor] yt-dlp error:', errorOutput.substring(0, 100));
        resolve({ success: false, platform: 'yt-dlp', error: errorOutput.substring(0, 100) });
      }
    });

    child.on('error', (error) => {
      console.log('[MultiExtractor] yt-dlp exception:', error.message);
      resolve({ success: false, platform: 'yt-dlp', error: error.message });
    });

    setTimeout(() => {
      child.kill();
      resolve({ success: false, platform: 'yt-dlp', error: 'Timeout' });
    }, 25000);
  });
}

export async function extractMedia(url: string): Promise<ExtractorResult> {
  const source = url.toLowerCase();
  
  if (source.includes('youtube.com') || source.includes('youtu.be')) {
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      return { success: false, platform: 'unknown', error: 'Invalid YouTube URL' };
    }

    // Try yt-dlp first
    const tryYtdlp = await extractYouTubeYtdlp(url);
    if (tryYtdlp.success) return tryYtdlp;

    // Try Invidious
    const tryInvidious = await extractYouTubeInvidious(videoId);
    if (tryInvidious.success) return tryInvidious;

    // Try Piped
    const tryPiped = await extractYouTubePiped(videoId);
    if (tryPiped.success) return tryPiped;

    return { 
      success: false, 
      platform: 'youtube', 
      error: 'All extractors failed. Try a different source.' 
    };
  }

  if (source.includes('facebook.com') || source.includes('fb.watch')) {
    return extractFacebook(url);
  }

  if (source.includes('instagram.com')) {
    return extractInstagram(url);
  }

  if (source.includes('tiktok.com')) {
    return extractTiktok(url);
  }

  return { success: false, platform: 'unknown', error: 'Unsupported platform' };
}

async function extractFacebook(url: string): Promise<ExtractorResult> {
  return new Promise((resolve) => {
    const child = spawn('yt-dlp', ['--no-playlist', '--dump-json', '--no-warnings', url]);
    let output = '';
    let errorOutput = '';

    child.stdout?.on('data', (data) => { output += data.toString(); });
    child.stderr?.on('data', (data) => { errorOutput += data.toString(); });

    child.on('close', (code) => {
      if (code === 0 && output.trim()) {
        try {
          const data = JSON.parse(output.trim());
          resolve({
            success: true,
            platform: 'facebook',
            data: { title: data.title, thumbnail: data.thumbnail, duration: data.duration, author: data.uploader },
          });
        } catch {
          resolve({ success: false, platform: 'facebook', error: 'Parse failed' });
        }
      } else {
        resolve({ success: false, platform: 'facebook', error: errorOutput.substring(0, 100) });
      }
    });

    child.on('error', (error) => resolve({ success: false, platform: 'facebook', error: error.message }));

    setTimeout(() => { child.kill(); resolve({ success: false, platform: 'facebook', error: 'Timeout' }); }, 20000);
  });
}

async function extractInstagram(url: string): Promise<ExtractorResult> {
  return new Promise((resolve) => {
    const child = spawn('yt-dlp', ['--no-playlist', '--dump-json', '--no-warnings', url]);
    let output = '';
    let errorOutput = '';

    child.stdout?.on('data', (data) => { output += data.toString(); });
    child.stderr?.on('data', (data) => { errorOutput += data.toString(); });

    child.on('close', (code) => {
      if (code === 0 && output.trim()) {
        try {
          const data = JSON.parse(output.trim());
          resolve({
            success: true,
            platform: 'instagram',
            data: { title: data.title, thumbnail: data.thumbnail, duration: data.duration, author: data.uploader },
          });
        } catch {
          resolve({ success: false, platform: 'instagram', error: 'Parse failed' });
        }
      } else {
        resolve({ success: false, platform: 'instagram', error: errorOutput.substring(0, 100) });
      }
    });

    child.on('error', (error) => resolve({ success: false, platform: 'instagram', error: error.message }));

    setTimeout(() => { child.kill(); resolve({ success: false, platform: 'instagram', error: 'Timeout' }); }, 20000);
  });
}

async function extractTiktok(url: string): Promise<ExtractorResult> {
  return new Promise((resolve) => {
    const child = spawn('yt-dlp', ['--no-playlist', '--dump-json', '--no-warnings', url]);
    let output = '';
    let errorOutput = '';

    child.stdout?.on('data', (data) => { output += data.toString(); });
    child.stderr?.on('data', (data) => { errorOutput += data.toString(); });

    child.on('close', (code) => {
      if (code === 0 && output.trim()) {
        try {
          const data = JSON.parse(output.trim());
          resolve({
            success: true,
            platform: 'tiktok',
            data: { title: data.title, thumbnail: data.thumbnail, duration: data.duration, author: data.uploader },
          });
        } catch {
          resolve({ success: false, platform: 'tiktok', error: 'Parse failed' });
        }
      } else {
        resolve({ success: false, platform: 'tiktok', error: errorOutput.substring(0, 100) });
      }
    });

    child.on('error', (error) => resolve({ success: false, platform: 'tiktok', error: error.message }));

    setTimeout(() => { child.kill(); resolve({ success: false, platform: 'tiktok', error: 'Timeout' }); }, 20000);
  });
}

export type { ExtractorResult };