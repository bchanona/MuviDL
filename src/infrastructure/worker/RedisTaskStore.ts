import { Redis } from '@upstash/redis';
import { DownloadTask } from '../../domain/entities/Media';

const TASKS_KEY = 'muvidl:tasks';

export class RedisTaskStore {
  private redis: Redis;
  private isConnected: boolean = false;

  constructor() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    
    console.log('[RedisTaskStore] Initializing with URL:', url ? 'SET' : 'NOT SET');
    console.log('[RedisTaskStore] Token:', token ? 'SET' : 'NOT SET');
    
    this.redis = new Redis({
      url: url!,
      token: token!,
    });
  }

  async saveTask(task: DownloadTask): Promise<void> {
    console.log('[RedisTaskStore] Saving task:', task.id);
    await this.redis.hset(TASKS_KEY, { [task.id]: JSON.stringify(task) });
    console.log('[RedisTaskStore] Task saved:', task.id);
  }

  async getTask(id: string): Promise<DownloadTask | null> {
    console.log('[RedisTaskStore] Getting task:', id);
    const data = await this.redis.hget(TASKS_KEY, id);
    console.log('[RedisTaskStore] Got data:', data);
    if (!data) return null;
    return typeof data === 'string' ? JSON.parse(data) : null;
  }

  async getAllTasks(): Promise<DownloadTask[]> {
    const tasks = await this.redis.hgetall(TASKS_KEY);
    if (!tasks) return [];
    return Object.values(tasks).map((v) =>
      typeof v === 'string' ? JSON.parse(v) : v
    );
  }

  async updateTask(task: DownloadTask): Promise<void> {
    await this.redis.hset(TASKS_KEY, { [task.id]: JSON.stringify(task) });
  }

  async deleteTask(id: string): Promise<void> {
    await this.redis.hdel(TASKS_KEY, id);
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