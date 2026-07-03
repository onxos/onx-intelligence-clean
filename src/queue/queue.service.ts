/**
 * ONX Queue Service
 * Unified interface for adding jobs to all queues
 */

import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueNames } from './redis.config';

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(QueueNames.FIC_ENFORCEMENT) private ficQueue: Queue,
    @InjectQueue(QueueNames.CONNECTOR_SYNC) private connectorQueue: Queue,
    @InjectQueue(QueueNames.AI_CONSENSUS) private aiQueue: Queue,
    @InjectQueue(QueueNames.AUDIT_LOG) private auditQueue: Queue,
    @InjectQueue(QueueNames.NOTIFICATION) private notificationQueue: Queue,
    @InjectQueue(QueueNames.REPORT_GENERATION) private reportQueue: Queue,
    @InjectQueue(QueueNames.REMINDER_SEND) private reminderQueue: Queue,
  ) {}

  async addFicEnforcement(data: any, opts?: any) {
    return this.ficQueue.add('enforce', data, opts);
  }

  async addConnectorSync(connector: string, data: any, opts?: any) {
    return this.connectorQueue.add(`sync-${connector}`, data, opts);
  }

  async addAiConsensus(data: any, opts?: any) {
    return this.aiQueue.add('consensus', data, opts);
  }

  async addAuditLog(data: any, opts?: any) {
    return this.auditQueue.add('log', data, opts);
  }

  async addNotification(type: string, data: any, opts?: any) {
    return this.notificationQueue.add(`notify-${type}`, data, opts);
  }

  async addReportGeneration(reportId: string, data: any, opts?: any) {
    return this.reportQueue.add(`report-${reportId}`, data, opts);
  }

  async addReminderSend(reminderId: string, data: any, opts?: any) {
    return this.reminderQueue.add(`reminder-${reminderId}`, data, {
      ...opts,
      delay: data.scheduledDate ? new Date(data.scheduledDate).getTime() - Date.now() : 0,
    });
  }

  /**
   * Get queue health status
   */
  async getHealth() {
    const queues = [
      { name: 'fic-enforcement', queue: this.ficQueue },
      { name: 'connector-sync', queue: this.connectorQueue },
      { name: 'ai-consensus', queue: this.aiQueue },
      { name: 'audit-log', queue: this.auditQueue },
      { name: 'notification', queue: this.notificationQueue },
      { name: 'report-generation', queue: this.reportQueue },
      { name: 'reminder-send', queue: this.reminderQueue },
    ];

    const results = await Promise.all(
      queues.map(async ({ name, queue }) => {
        const [waiting, active, completed, failed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
        ]);
        return { name, waiting, active, completed, failed, healthy: failed < 100 };
      }),
    );

    return results;
  }
}
