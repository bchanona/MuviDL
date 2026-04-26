import { Redis } from '@upstash/redis';
import { DownloadTask } from '../../domain/entities/Media';

const TASKS_KEY = 'muvidl:tasks';

export class RedisTaskStore {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }

  async saveTask(task: DownloadTask): Promise<void> {
    await this.redis.hset(TASKS_KEY, { [task.id]: JSON.stringify(task) });
  }

  async getTask(id: string): Promise<DownloadTask | null> {
    const data = await this.redis.hget(TASKS_KEY, id);
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