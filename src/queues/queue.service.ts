import { Injectable } from '@nestjs/common';
import { metrics } from '../monitoring/metrics.registry';
import { QUEUE_NAMES } from './queues.constants';

export type JobHandler<T = unknown> = (data: T) => Promise<void> | void;

export interface QueueStat {
  queue: string;
  enqueued: number;
  completed: number;
  failed: number;
  pending: number;
  hasProcessor: boolean;
}

/**
 * Phase 4 — dependency-free in-memory job queue (STOP #3: Redis unavailable).
 * Jobs are scheduled on the microtask queue by default, or executed inline when
 * `sync` is requested (used by tests and by request paths that must confirm
 * completion). The public surface matches a BullMQ-style enqueue/register so it
 * can be swapped for a Redis-backed queue in production without call-site churn.
 *
 * TODO(prod): replace with BullMQ + Redis and a Bull Board dashboard.
 */
@Injectable()
export class QueueService {
  private readonly handlers = new Map<string, JobHandler>();
  private readonly stats = new Map<string, Omit<QueueStat, 'queue' | 'hasProcessor'>>();

  constructor() {
    for (const name of QUEUE_NAMES) this.ensure(name);
  }

  private ensure(name: string) {
    if (!this.stats.has(name)) {
      this.stats.set(name, { enqueued: 0, completed: 0, failed: 0, pending: 0 });
    }
  }

  register<T>(name: string, handler: JobHandler<T>): void {
    this.ensure(name);
    this.handlers.set(name, handler as JobHandler);
  }

  async enqueue<T>(name: string, data: T, opts?: { sync?: boolean }): Promise<{ queued: boolean }> {
    this.ensure(name);
    const stat = this.stats.get(name)!;
    const handler = this.handlers.get(name);
    if (!handler) {
      metrics.queueJobsTotal.inc({ queue: name, status: 'rejected' });
      return { queued: false };
    }
    stat.enqueued += 1;
    stat.pending += 1;

    const run = async () => {
      try {
        await handler(data);
        stat.completed += 1;
        metrics.queueJobsTotal.inc({ queue: name, status: 'completed' });
      } catch {
        stat.failed += 1;
        metrics.queueJobsTotal.inc({ queue: name, status: 'failed' });
      } finally {
        stat.pending -= 1;
      }
    };

    if (opts?.sync) {
      await run();
    } else {
      queueMicrotask(() => {
        void run();
      });
    }
    return { queued: true };
  }

  getStats(): QueueStat[] {
    return QUEUE_NAMES.map((name) => {
      const s = this.stats.get(name)!;
      return { queue: name, ...s, hasProcessor: this.handlers.has(name) };
    });
  }
}
