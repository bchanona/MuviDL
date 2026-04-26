import { Router, Request, Response } from 'express';
import {
  GetMediaInfoUseCase,
  StartDownloadUseCase,
  GetDownloadStatusUseCase,
  CancelDownloadUseCase,
} from '../../application/useCases';
import { downloader } from '../adapters/YtDlpAdapter';
import { MediaType } from '../../domain/entities/Media';
import { isValidUrl, getSupportedSources } from '../../shared/utils/UrlValidator';
import { autoDebugger } from '../worker/AutoDebugger';
import { cookieManager } from '../worker/CookieManager';
import { taskStore } from '../worker/TaskStore';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const router = Router();

const getInfoUseCase = new GetMediaInfoUseCase(downloader);
const startDownloadUseCase = new StartDownloadUseCase(downloader);
const getDownloadStatusUseCase = new GetDownloadStatusUseCase(downloader);
const cancelDownloadUseCase = new CancelDownloadUseCase(downloader);

autoDebugger.on('failure', (log) => {
  console.error(`[AUTO-DEBUG] Failure on ${log.source}: ${log.error}`);
});

autoDebugger.on('success', (log) => {
  console.log(`[AUTO-DEBUG] Success on ${log.source}`);
});

autoDebugger.on('issues', ({ log, issues }) => {
  console.log(`[AUTO-DEBUG] Issues detected for ${log.url}:`, issues);
});

autoDebugger.startWatching();

router.get('/sources', (_req: Request, res: Response) => {
  res.json({ sources: getSupportedSources() });
});

router.get('/download/info', async (req: Request, res: Response) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    const validation = isValidUrl(url);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const info = await getInfoUseCase.execute(url);
    res.json(info);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

router.post('/download', async (req: Request, res: Response) => {
  try {
    const { url, type } = req.body;
    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    const validation = isValidUrl(url);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    console.log('[Route] Starting download for:', url);

    const mediaType: MediaType = type === 'audio' ? 'audio' : 'video';
    const task = await startDownloadUseCase.execute(url, mediaType);
    
    console.log('[Route] Download started, task:', task);
    res.json(task);
  } catch (error) {
    console.log('[Route] Download error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

router.get('/download/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const task = await getDownloadStatusUseCase.execute(id);
    if (!task) {
      res.status(404).json({ error: 'Download not found' });
      return;
    }
    res.json(task);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

router.delete('/download/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    await cancelDownloadUseCase.execute(id);
    res.json({ message: 'Download cancelled', id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

router.get('/download/:id/stream', async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const task = await getDownloadStatusUseCase.execute(id);
    
    if (!task) {
      res.status(404).json({ error: 'Download not found' });
      return;
    }

    if (task.status !== 'completed') {
      res.status(400).json({ 
        error: 'Download not ready',
        status: task.status,
        progress: task.progress 
      });
      return;
    }

    if (!task.filePath) {
      res.status(400).json({ error: 'File path not available' });
      return;
    }

    const filePath = task.filePath;
    const fileName = path.basename(filePath);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found on server' });
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      });

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      });

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

router.get('/debug/logs', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = autoDebugger.getDebugLogs(limit);
    res.json({ logs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

router.get('/debug/patterns', (req: Request, res: Response) => {
  try {
    const updates = autoDebugger.getPatternUpdates();
    res.json({ updates });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

router.get('/cookies', (_req: Request, res: Response) => {
  res.json(downloader.getCookieStats());
});

router.get('/cookies/profiles', (_req: Request, res: Response) => {
  res.json({ profiles: downloader.getCookieProfiles() });
});

router.post('/cookies/profiles', async (req: Request, res: Response) => {
  try {
    const { name, filePath, email } = req.body;
    if (!name || !filePath) {
      res.status(400).json({ error: 'name and filePath are required' });
      return;
    }
    const profile = downloader.addCookieProfile(name, filePath, email);
    res.json(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

router.delete('/cookies/profiles/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const removed = downloader.removeCookieProfile(id);
    if (removed) {
      res.json({ message: 'Profile removed' });
    } else {
      res.status(404).json({ error: 'Profile not found' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

router.post('/cookies/profiles/:id/validate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const result = await downloader.validateCookieProfile(id);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

router.post('/cookies/rotate', (_req: Request, res: Response) => {
  const profile = cookieManager.rotateToNext();
  if (profile) {
    res.json({ message: 'Rotated to next profile', profile });
  } else {
    res.status(400).json({ error: 'No valid profiles available' });
  }
});

router.post('/download/direct', async (req: Request, res: Response) => {
  try {
    const { url, type } = req.body;
    if (!url) {
      res.status(400).json({ error: 'URL is required' });
      return;
    }

    console.log('[DirectDownload] Starting for:', url);

    const downloadType = type === 'audio' ? 'audio' : 'video';
    const ext = downloadType === 'audio' ? 'mp3' : 'mp4';
    const outputFile = path.join('./downloads', `direct_${Date.now()}.${ext}`);

    const args = downloadType === 'audio'
      ? ['-x', '--audio-format', 'mp3', '-o', outputFile, url]
      : ['-f', 'best', '-o', outputFile, url];

    const child = spawn('yt-dlp', args);
    let output = '';
    let errorOutput = '';

    child.stdout?.on('data', (data) => { output += data.toString(); });
    child.stderr?.on('data', (data) => { errorOutput += data.toString(); });

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="downloading"',
    });

    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputFile)) {
        const fileStream = fs.createReadStream(outputFile);
        fileStream.pipe(res);
        fileStream.on('end', () => {
          fs.unlinkSync(outputFile);
        });
      } else {
        res.end('Error downloading: ' + errorOutput);
      }
    });

    child.on('error', (error) => {
      res.end('Error: ' + error.message);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: message });
  }
});

export default router;