import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueNames } from './redis.config';

@Injectable()
export class QueueService {
  constructor(
    @InjectQueue(QueueNames.FIC_ENFORCEMENT) private readonly q1: Queue,
    @InjectQueue(QueueNames.CONNECTOR_SYNC) private readonly q2: Queue,
    @InjectQueue(QueueNames.AI_CONSENSUS) private readonly q3: Queue,
    @InjectQueue(QueueNames.AUDIT_LOG) private readonly q4: Queue,
    @InjectQueue(QueueNames.NOTIFICATION) private readonly q5: Queue,
    @InjectQueue(QueueNames.REPORT) private readonly q6: Queue,
    @InjectQueue(QueueNames.REMINDER) private readonly q7: Queue,
  ) {}

  addFic(d: unknown) {
    return this.q1.add('job', d);
  }

  addConnector(c: string, d: unknown) {
    return this.q2.add(c, d);
  }

  addAi(d: unknown) {
    return this.q3.add('job', d);
  }

  addAudit(d: unknown) {
    return this.q4.add('job', d);
  }

  addNotify(t: string, d: unknown) {
    return this.q5.add(t, d);
  }

  addReport(id: string, d: unknown) {
    return this.q6.add(id, d);
  }

  addReminder(id: string, d: unknown) {
    return this.q7.add(id, d);
  }
}
