import { DownloadTask } from '../../domain/entities/Media';
import { IMediaRepository } from '../../domain/ports';

export class InMemoryMediaRepository implements IMediaRepository {
  private tasks: Map<string, DownloadTask> = new Map();

  save(task: DownloadTask): DownloadTask {
    this.tasks.set(task.id, task);
    return task;
  }

  findById(id: string): DownloadTask | null {
    return this.tasks.get(id) || null;
  }

  findAll(): DownloadTask[] {
    return Array.from(this.tasks.values());
  }

  update(task: DownloadTask): DownloadTask {
    if (!this.tasks.has(task.id)) {
      throw new Error('Task not found');
    }
    this.tasks.set(task.id, task);
    return task;
  }

  delete(id: string): void {
    this.tasks.delete(id);
  }
}

export const mediaRepository = new InMemoryMediaRepository();