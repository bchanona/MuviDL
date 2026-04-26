import { Redis } from '@upstash/redis';
import { DownloadTask } from '../../domain/entities/Media';

const TASKS_KEY = 'muvidl:tasks';

export class RedisTaskStore {
  private redis!: Redis;
  private isConnected: boolean = false;

  constructor() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    console.log('[RedisTaskStore] Initializing...');
    
    if (!url || !token) {
      console.log('[RedisTaskStore] ERROR: Missing credentials!');
      return;
    }
    
    this.redis = new Redis({
      url: url,
      token: token,
    });
    
    this.testConnection();
  }

  private async testConnection(): Promise<void> {
    try {
      const result = await this.redis.ping();
      console.log('[RedisTaskStore] Ping result:', result);
      this.isConnected = true;
    } catch (error) {
      console.log('[RedisTaskStore] Connection test FAILED:', error);
      this.isConnected = false;
    }
  }

  async saveTask(task: DownloadTask): Promise<void> {
    console.log('[RedisTaskStore] Saving task:', task.id, '- Connected:', this.isConnected);
    if (!this.isConnected) {
      console.log('[RedisTaskStore] WARNING: Not connected to Redis!');
      return;
    }
    try {
      await this.redis.hset(TASKS_KEY, { [task.id]: JSON.stringify(task) });
      console.log('[RedisTaskStore] Task saved successfully');
    } catch (error) {
      console.log('[RedisTaskStore] Save FAILED:', error);
    }
  }

  async getTask(id: string): Promise<DownloadTask | null> {
    console.log('[RedisTaskStore] Getting task:', id, '- Connected:', this.isConnected);
    if (!this.isConnected) {
      console.log('[RedisTaskStore] WARNING: Not connected to Redis!');
      return null;
    }
    try {
      const data = await this.redis.hget(TASKS_KEY, id);
      console.log('[RedisTaskStore] Got data:', data);
      if (!data) return null;
      return typeof data === 'string' ? JSON.parse(data) : null;
    } catch (error) {
      console.log('[RedisTaskStore] Get FAILED:', error);
      return null;
    }
  }

  async getAllTasks(): Promise<DownloadTask[]> {
    console.log('[RedisTaskStore] Getting all tasks - Connected:', this.isConnected);
    if (!this.isConnected) {
      return [];
    }
    try {
      const tasks = await this.redis.hgetall(TASKS_KEY);
      if (!tasks) return [];
      return Object.values(tasks).map((v) =>
        typeof v === 'string' ? JSON.parse(v) : v
      );
    } catch (error) {
      console.log('[RedisTaskStore] GetAll FAILED:', error);
      return [];
    }
  }

  async updateTask(task: DownloadTask): Promise<void> {
    await this.saveTask(task);
  }

  async deleteTask(id: string): Promise<void> {
    console.log('[RedisTaskStore] Deleting task:', id);
    if (!this.isConnected) return;
    try {
      await this.redis.hdel(TASKS_KEY, id);
      console.log('[RedisTaskStore] Task deleted');
    } catch (error) {
      console.log('[RedisTaskStore] Delete FAILED:', error);
    }
  }

  async cleanup(): Promise<void> {
    const tasks = await this.getAllTasks();
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    for (const task of tasks) {
      const created = new Date(task.createdAt);
      if (created < oneHourAgo) {
        await this.deleteTask(task.id);
      }
    }
  }
}

export const redisTaskStore = new RedisTaskStore();