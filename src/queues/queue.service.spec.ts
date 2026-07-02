import { QueueService } from './queue.service';
import { QUEUES } from './queues.constants';

describe('QueueService', () => {
  it('initializes stats for every queue', () => {
    const q = new QueueService();
    const stats = q.getStats();
    expect(stats).toHaveLength(Object.keys(QUEUES).length);
    expect(stats.every((s) => s.enqueued === 0)).toBe(true);
  });

  it('runs a registered handler synchronously and records completion', async () => {
    const q = new QueueService();
    const handler = jest.fn().mockResolvedValue(undefined);
    q.register(QUEUES.connectorSync, handler);
    const result = await q.enqueue(QUEUES.connectorSync, { workspaceId: 'ws-1' }, { sync: true });
    expect(result.queued).toBe(true);
    expect(handler).toHaveBeenCalledWith({ workspaceId: 'ws-1' });
    const stat = q.getStats().find((s) => s.queue === QUEUES.connectorSync)!;
    expect(stat.completed).toBe(1);
    expect(stat.pending).toBe(0);
  });

  it('records failures when a handler throws', async () => {
    const q = new QueueService();
    q.register(QUEUES.ficEnforcement, () => {
      throw new Error('boom');
    });
    await q.enqueue(QUEUES.ficEnforcement, {}, { sync: true });
    const stat = q.getStats().find((s) => s.queue === QUEUES.ficEnforcement)!;
    expect(stat.failed).toBe(1);
  });

  it('returns queued=false when no processor is registered', async () => {
    const q = new QueueService();
    const result = await q.enqueue(QUEUES.aiConsensus, {}, { sync: true });
    expect(result.queued).toBe(false);
  });

  it('reports processor presence', () => {
    const q = new QueueService();
    q.register(QUEUES.auditLog, jest.fn());
    const stat = q.getStats().find((s) => s.queue === QUEUES.auditLog)!;
    expect(stat.hasProcessor).toBe(true);
  });

  it('schedules async work when sync is not requested', async () => {
    const q = new QueueService();
    const handler = jest.fn().mockResolvedValue(undefined);
    q.register(QUEUES.iurgBinding, handler);
    const result = await q.enqueue(QUEUES.iurgBinding, {});
    expect(result.queued).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(handler).toHaveBeenCalled();
  });

  it('increments enqueued count', async () => {
    const q = new QueueService();
    q.register(QUEUES.connectorSync, jest.fn());
    await q.enqueue(QUEUES.connectorSync, {}, { sync: true });
    await q.enqueue(QUEUES.connectorSync, {}, { sync: true });
    const stat = q.getStats().find((s) => s.queue === QUEUES.connectorSync)!;
    expect(stat.enqueued).toBe(2);
  });
});
