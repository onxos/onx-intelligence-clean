import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(data: {
    action: string;
    resource: string;
    resourceId?: string;
    actorId: string;
    workspaceId?: string;
    oldValue?: string;
    newValue?: string;
    ipAddress?: string;
  }) {
    return this.prisma.auditLog.create({ data });
  }

  async findByActor(actorId: string) {
    return this.prisma.auditLog.findMany({
      where: { actorId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
