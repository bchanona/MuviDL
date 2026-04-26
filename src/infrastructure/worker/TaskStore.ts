import fs from 'fs';
import { DownloadTask } from '../../domain/entities/Media';

const TASKS_FILE = './downloads/tasks.json';

export class TaskStore {
  private tasks: Map<string, DownloadTask> = new Map();
  private filePath: string;

  constructor(filePath: string = TASKS_FILE) {
    this.filePath = filePath;
    this.ensureDir();
    this.load();
  }

  private ensureDir(): void {
    const dir = this.filePath.replace(/\/[^/]+$/, '');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        for (const task of data.tasks || []) {
          this.tasks.set(task.id, task);
        }
        console.log('[TaskStore] Loaded', this.tasks.size, 'tasks');
      }
    } catch (e) {
      console.log('[TaskStore] Load error:', e);
    }
  }

  private save(): void {
    try {
      const data = { tasks: Array.from(this.tasks.values()) };
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.log('[TaskStore] Save error:', e);
    }
  }

  saveTask(task: DownloadTask): void {
    this.tasks.set(task.id, task);
    this.save();
  }

  getTask(id: string): DownloadTask | null {
    return this.tasks.get(id) || null;
  }

  getAllTasks(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  updateTask(task: DownloadTask): void {
    if (this.tasks.has(task.id)) {
      this.tasks.set(task.id, task);
      this.save();
    }
  }

  deleteTask(id: string): void {
    this.tasks.delete(id);
    this.save();
  }

  cleanup(): void {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    let cleaned = 0;
    for (const [id, task] of this.tasks) {
      const created = new Date(task.createdAt);
      if (created < oneHourAgo) {
        this.tasks.delete(id);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      this.save();
      console.log('[TaskStore] Cleaned', cleaned, 'old tasks');
    }
  }
}

export const taskStore = new TaskStore();