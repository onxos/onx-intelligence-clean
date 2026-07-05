import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(event: any) {
    // Filter only fields that exist in Prisma AuditLog model
    const data: any = {
      eventId: event.eventId || randomUUID(),
      action: event.action || event.resourceType || 'UNKNOWN',
      resource: event.resource || event.resourceType || '',
      resourceType: event.resourceType || event.resource || 'UNKNOWN',
      resourceId: event.resourceId || null,
      actorId: event.actorId || 'system',
      workspaceId: event.workspaceId || null,
      oldValue: event.oldValue || event.before || null,
      newValue: event.newValue || event.after || null,
      ipAddress: event.ipAddress || event.userAgent || null,
      status: event.status || 'SUCCESS',
      success: event.success ?? true,
      metadata: event.metadata || {},
    };
    return this.prisma.auditLog.create({ data });
  }

  async findByActor(actorId: string) {
    return this.prisma.auditLog.findMany({
      where: { actorId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
