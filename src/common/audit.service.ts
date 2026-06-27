import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import * as crypto from 'crypto';

export type AuditEventInput = {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  workspaceId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  status?: 'SUCCESS' | 'FAILED';
  success?: boolean;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(event: AuditEventInput) {
    if (!this.prisma.isConnected()) {
      return null;
    }

    const status = event.status ?? (event.success === false ? 'FAILED' : 'SUCCESS');
    const success = event.success ?? status !== 'FAILED';

    try {
      return await this.prisma.auditLog.create({
        data: {
          eventId: crypto.randomUUID(),
          timestamp: new Date(),
          actorId: event.actorId,
          resourceType: event.resourceType,
          resource: event.resourceType,
          resourceId: event.resourceId,
          action: event.action,
          workspaceId: event.workspaceId,
          before: event.before as any,
          after: event.after as any,
          oldValue: event.before ? JSON.stringify(event.before) : undefined,
          newValue: event.after ? JSON.stringify(event.after) : undefined,
          requestId: event.requestId,
          ipAddress: event.ip,
          userAgent: event.userAgent,
          status,
          success,
          metadata: (event.metadata ?? {}) as any,
        },
      });
    } catch {
      return null;
    }
  }

  async findByActor(actorId: string) {
    return this.prisma.auditLog.findMany({
      where: { actorId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
