import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const SCRIPT_PATH = path.join(__dirname, '../../scripts/youtube_downloader.py');

interface PythonResult {
  success: boolean;
  title?: string;
  thumbnail?: string;
  duration?: number;
  author?: string;
  views?: string | number;
  video_id?: string;
  file?: string;
  video_file?: string;
  audio_file?: string;
  error?: string;
}

export async function getVideoInfo(url: string): Promise<PythonResult> {
  return new Promise((resolve) => {
    const child = spawn('python3', [SCRIPT_PATH, 'info', url]);
    let output = '';
    let errorOutput = '';

    child.stdout?.on('data', (data) => { output += data.toString(); });
    child.stderr?.on('data', (data) => { errorOutput += data.toString(); });

    child.on('close', (code) => {
      if (code === 0 && output.trim()) {
        try {
          resolve(JSON.parse(output.trim()));
        } catch {
          resolve({ success: false, error: 'Failed to parse response' });
        }
      } else {
        resolve({ success: false, error: errorOutput || `Exit code: ${code}` });
      }
    });

    child.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    setTimeout(() => {
      child.kill();
      resolve({ success: false, error: 'Timeout' });
    }, 30000);
  });
}

export interface DownloadResult {
  success: boolean;
  file?: string;
  video_file?: string;
  audio_file?: string;
  title?: string;
  error?: string;
}

export async function downloadVideo(
  url: string,
  resolution: string = '1080p',
  audioOnly: boolean = false
): Promise<DownloadResult> {
  return new Promise((resolve) => {
    const args = [
      SCRIPT_PATH,
      'download',
      url,
      resolution,
      ...(audioOnly ? ['--audio'] : [])
    ];

    const child = spawn('python3', args);
    let output = '';
    let errorOutput = '';

    child.stdout?.on('data', (data) => { output += data.toString(); });
    child.stderr?.on('data', (data) => { errorOutput += data.toString(); });

    child.on('close', (code) => {
      if (code === 0 && output.trim()) {
        try {
          resolve(JSON.parse(output.trim()));
        } catch {
          resolve({ success: false, error: 'Failed to parse response' });
        }
      } else {
        resolve({ success: false, error: errorOutput || `Exit code: ${code}` });
      }
    });

    child.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    setTimeout(() => {
      child.kill();
      resolve({ success: false, error: 'Timeout' });
    }, 300000);
  });
}