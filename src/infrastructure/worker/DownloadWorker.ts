import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { DownloadTask, DownloadStatus, MediaType, MediaSource } from '../../domain/entities/Media';
import path from 'path';
import fs from 'fs';
import { detectSource } from '../../shared/utils/UrlValidator';
import { autoDebugger } from './AutoDebugger';
import { taskStore } from './TaskStore';

interface ProcessEntry {
  process: ChildProcess;
  task: DownloadTask;
}

const COOKIES_FILE = './cookies.txt';

function hasCookiesFile(): boolean {
  return fs.existsSync(COOKIES_FILE);
}

export class DownloadWorker extends EventEmitter {
  private processes: Map<string, ProcessEntry> = new Map();
  private outputDir: string;

  constructor(outputDir: string = './downloads') {
    super();
    this.outputDir = outputDir;
    this.ensureOutputDir();
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private formatFileName(title: string, ext: string, source: MediaSource): string {
    const sanitizedTitle = title
      .replace(/[^a-zA-Z0-9\s\-_]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 80);
    const timestamp = new Date().toISOString().slice(0, 10);
    const sourcePrefix = source.substring(0, 2).toUpperCase();
    return `${sourcePrefix}_${timestamp}_${sanitizedTitle}.${ext}`;
  }

  private getArgs(url: string, type: MediaType): string[] {
    const typeArgs = type === 'audio'
      ? ['--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0']
      : ['-f', 'best[height<=720]/best'];

    const cookiesArgs = hasCookiesFile() ? ['--cookies', COOKIES_FILE] : [];

    return [
      '--no-playlist',
      '--no-warnings',
      '--sleep-requests', '2',
      '--extractor-args', 'youtube:player_client=android',
      '--user-agent', 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      '--no-check-certificate',
      '--print-after', 'FINISHED:{filepath}',
      ...cookiesArgs,
      ...typeArgs,
      '-o', path.join(this.outputDir, '%(title)s.%(ext)s'),
      url
    ];
  }

  async startDownload(url: string, type: MediaType, mediaId: string, title: string): Promise<DownloadTask> {
    const source = detectSource(url) || 'youtube';
    const ext = type === 'audio' ? 'mp3' : 'mp4';

    const task: DownloadTask = {
      id: mediaId,
      mediaId,
      url,
      title,
      source,
      type,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    taskStore.saveTask(task);
    this.processes.set(mediaId, { process: null as unknown as ChildProcess, task });

    const args = this.getArgs(url, type);
    
    const childProcess = spawn('yt-dlp', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const entry = { process: childProcess, task };
    this.processes.set(mediaId, entry);

    entry.task.status = 'downloading';
    taskStore.saveTask(entry.task);
    this.emit('start', { mediaId, url });

    childProcess.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      this.emit('progress', { mediaId, output });

      if (output.includes('FINISHED:')) {
        const filepath = output.split('FINISHED:')[1].trim();
        entry.task.filePath = filepath;
        entry.task.status = 'completed';
        entry.task.progress = 100;
        entry.task.completedAt = new Date();
        entry.task.filePath = filepath;
        taskStore.saveTask(entry.task);
        autoDebugger.logSuccess(url, source);
        this.emit('complete', { mediaId, filepath });
      }
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      const output = data.toString();
      this.emit('progress', { mediaId, output });

      const progressMatch = output.match(/(\d+\.\d+)%/);
      if (progressMatch) {
        entry.task.progress = parseFloat(progressMatch[1]);
        this.emit('progress', { mediaId, progress: entry.task.progress });
      }
    });

    childProcess.on('error', (error: Error) => {
      entry.task.status = 'failed';
      entry.task.error = error.message;
      taskStore.saveTask(entry.task);
      autoDebugger.logFailure(url, source, error.message, '');
      this.emit('error', { mediaId, error: error.message });
    });

    childProcess.on('exit', (code: number) => {
      if (code !== 0 && entry.task.status !== 'completed' && entry.task.status !== 'cancelled') {
        entry.task.status = 'failed';
        entry.task.error = `Process exited with code ${code}`;
        taskStore.saveTask(entry.task);
        autoDebugger.logFailure(url, source, `Exit code: ${code}`, '');
        this.emit('error', { mediaId, error: entry.task.error });
      }
      taskStore.saveTask(entry.task);
      this.processes.delete(mediaId);
    });

    return entry.task;
  }

  async cancel(mediaId: string): Promise<void> {
    const entry = this.processes.get(mediaId);
    if (!entry) {
      throw new Error('Download not found');
    }

    entry.process.kill('SIGTERM');
    entry.task.status = 'cancelled';
    entry.task.updatedAt = new Date();
    this.processes.delete(mediaId);
    taskStore.deleteTask(mediaId);
    this.emit('cancel', { mediaId });
  }

  getStatus(mediaId: string): DownloadTask | null {
    const entry = this.processes.get(mediaId);
    if (entry) return entry.task;
    
    return taskStore.getTask(mediaId);
  }

  getProgress(mediaId: string): number {
    const entry = this.processes.get(mediaId);
    return entry ? entry.task.progress : 0;
  }

  getAllTasks(): DownloadTask[] {
    return taskStore.getAllTasks();
  }
}

export const downloadWorker = new DownloadWorker();