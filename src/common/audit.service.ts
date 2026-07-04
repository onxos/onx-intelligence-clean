import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(event: any) {
    // Filter only fields that exist in Prisma AuditLog model
    const data: any = {
      action: event.action || event.resourceType || 'UNKNOWN',
      resource: event.resource || event.resourceType || '',
      resourceId: event.resourceId || null,
      actorId: event.actorId || 'system',
      workspaceId: event.workspaceId || null,
      oldValue: event.oldValue || event.before || null,
      newValue: event.newValue || event.after || null,
      ipAddress: event.ipAddress || event.userAgent || null,
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
