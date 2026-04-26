import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

interface DebugLog {
  timestamp: Date;
  url: string;
  source: string;
  error: string;
  output: string;
  resolved: boolean;
}

interface PatternUpdate {
  field: string;
  oldValue: string;
  newValue: string;
  timestamp: Date;
}

export class AutoDebugger extends EventEmitter {
  private debugLogs: DebugLog[] = [];
  private patternUpdates: PatternUpdate[] = [];
  private watchDir: string;
  private logFile: string;
  private configFile: string;
  private isWatching: boolean = false;

  constructor(watchDir: string = './logs', configFile: string = './src/shared/config/sources.json') {
    super();
    this.watchDir = watchDir;
    this.logFile = path.join(watchDir, 'debug.log');
    this.configFile = configFile;
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.watchDir)) {
      fs.mkdirSync(this.watchDir, { recursive: true });
    }
  }

  logFailure(url: string, source: string, error: string, output: string): void {
    const log: DebugLog = {
      timestamp: new Date(),
      url,
      source,
      error,
      output: output.substring(0, 5000),
      resolved: false,
    };

    this.debugLogs.push(log);
    this.saveLog(log);
    this.analyzeFailure(log);

    this.emit('failure', log);
  }

  logSuccess(url: string, source: string): void {
    const log: DebugLog = {
      timestamp: new Date(),
      url,
      source,
      error: 'SUCCESS',
      output: '',
      resolved: true,
    };

    this.debugLogs.push(log);
    this.emit('success', log);
  }

  private saveLog(log: DebugLog): void {
    const entry = JSON.stringify(log) + '\n';
    fs.appendFileSync(this.logFile, entry);
  }

  private analyzeFailure(log: DebugLog): void {
    const errorLower = log.error.toLowerCase();
    const outputLower = log.output.toLowerCase();

    const issues: string[] = [];

    if (errorLower.includes('geo') || outputLower.includes('geo')) {
      issues.push('GEO_RESTRICTION');
    }
    if (errorLower.includes('age') || outputLower.includes('age')) {
      issues.push('AGE_RESTRICTION');
    }
    if (errorLower.includes('login') || errorLower.includes('auth')) {
      issues.push('AUTH_REQUIRED');
    }
    if (errorLower.includes('private') || outputLower.includes('private')) {
      issues.push('PRIVATE_VIDEO');
    }
    if (errorLower.includes(' Removed') || outputLower.includes('removed')) {
      issues.push('VIDEO_REMOVED');
    }
    if (errorLower.includes('playlist') || outputLower.includes('playlist')) {
      issues.push('PLAYLIST_NOT_SUPPORTED');
    }
    if (errorLower.includes('403') || errorLower.includes('forbidden')) {
      issues.push('HTTP_403_BLOCKED');
    }
    if (errorLower.includes('signature') || errorLower.includes('cipher')) {
      issues.push('CIPHER_REQUIRED');
    }

    if (issues.length > 0) {
      this.emit('issues', { log, issues });
    }

    this.detectUrlPatternChange(log);
  }

  private detectUrlPatternChange(log: DebugLog): void {
    const update: PatternUpdate = {
      field: 'url_pattern',
      oldValue: log.url,
      newValue: log.url,
      timestamp: new Date(),
    };

    try {
      const url = new URL(log.url);
      const pathname = url.pathname;
      
      if (pathname !== update.oldValue) {
        update.oldValue = pathname;
        update.newValue = pathname;
        this.patternUpdates.push(update);
        this.emit('patternChange', update);
      }
    } catch {
      // ignore invalid URLs
    }
  }

  async testUrl(url: string, source: string): Promise<{ success: boolean; output: string; error: string }> {
    return new Promise((resolve) => {
      const args = ['--dump-json', '--no-playlist', '--no-warnings', url];
      const childProcess = spawn('yt-dlp', args);
      let output = '';
      let errorOutput = '';

      childProcess.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      childProcess.on('error', (error: Error) => {
        this.logFailure(url, source, error.message, errorOutput);
        resolve({ success: false, output: errorOutput, error: error.message });
      });

      childProcess.on('close', (code: number) => {
        if (code === 0) {
          this.logSuccess(url, source);
          resolve({ success: true, output, error: '' });
        } else {
          this.logFailure(url, source, `Exit code: ${code}`, errorOutput);
          resolve({ success: false, output, error: errorOutput });
        }
      });

      setTimeout(() => {
        childProcess.kill();
        resolve({ success: false, output: '', error: 'Timeout' });
      }, 30000);
    });
  }

  startWatching(): void {
    if (this.isWatching) return;
    this.isWatching = true;

    setInterval(() => {
      this.analyzeLogs();
    }, 3600000);

    this.emit('watchingStarted');
  }

  private analyzeLogs(): void {
    const recentLogs = this.debugLogs.slice(-100);
    const failedLogs = recentLogs.filter(l => !l.resolved);

    const issuesCount: Record<string, number> = {};
    for (const log of failedLogs) {
      const errorLower = log.error.toLowerCase();
      if (errorLower.includes('geo')) issuesCount['GEO_RESTRICTION'] = (issuesCount['GEO_RESTRICTION'] || 0) + 1;
      if (errorLower.includes('age')) issuesCount['AGE_RESTRICTION'] = (issuesCount['AGE_RESTRICTION'] || 0) + 1;
      if (errorLower.includes('403')) issuesCount['HTTP_403_BLOCKED'] = (issuesCount['HTTP_403_BLOCKED'] || 0) + 1;
    }

    if (Object.keys(issuesCount).length > 0) {
      this.emit('issuesSummary', issuesCount);
    }
  }

  getDebugLogs(limit: number = 50): DebugLog[] {
    return this.debugLogs.slice(-limit);
  }

  getPatternUpdates(): PatternUpdate[] {
    return this.patternUpdates;
  }

  clearLogs(): void {
    this.debugLogs = [];
    if (fs.existsSync(this.logFile)) {
      fs.unlinkSync(this.logFile);
    }
  }
}

export const autoDebugger = new AutoDebugger();