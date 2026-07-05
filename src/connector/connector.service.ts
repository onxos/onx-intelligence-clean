import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ConnectorConfig, Prisma } from '@prisma/client';

@Injectable()
export class ConnectorService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.ConnectorConfigCreateInput): Promise<ConnectorConfig> {
    return this.prisma.connectorConfig.create({ data });
  }

  async findAll(workspaceId: string): Promise<ConnectorConfig[]> {
    return this.prisma.connectorConfig.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string, workspaceId: string): Promise<ConnectorConfig> {
    const c = await this.prisma.connectorConfig.findFirst({ where: { id, workspaceId } });
    if (!c) throw new NotFoundException('Connector not found');
    return c;
  }

  async findByType(workspaceId: string, type: string): Promise<ConnectorConfig[]> {
    return this.prisma.connectorConfig.findMany({ where: { workspaceId, type: type as any } });
  }

  async update(id: string, workspaceId: string, data: Prisma.ConnectorConfigUpdateInput): Promise<ConnectorConfig> {
    await this.findOne(id, workspaceId);
    return this.prisma.connectorConfig.update({ where: { id }, data });
  }

  async remove(id: string, workspaceId: string): Promise<ConnectorConfig> {
    await this.findOne(id, workspaceId);
    return this.prisma.connectorConfig.delete({ where: { id } });
  }

  async activate(id: string, workspaceId: string): Promise<ConnectorConfig> {
    return this.prisma.connectorConfig.update({ where: { id }, data: { isActive: true, lastError: null, lastErrorAt: null } });
  }

  async deactivate(id: string, workspaceId: string): Promise<ConnectorConfig> {
    return this.prisma.connectorConfig.update({ where: { id }, data: { isActive: false } });
  }

  async logEvent(workspaceId: string, connectorId: string, direction: string, action: string, status: string, payload?: any, error?: string, durationMs?: number) {
    return this.prisma.connectorLog.create({
      data: { workspaceId, connectorId, direction, action, status, payload: payload || {}, error, durationMs },
    });
  }

  async getLogs(workspaceId: string, connectorId: string, limit: number = 50) {
    return this.prisma.connectorLog.findMany({
      where: { workspaceId, connectorId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getActiveConnector(workspaceId: string, type: string, provider: string): Promise<ConnectorConfig | null> {
    return this.prisma.connectorConfig.findFirst({
      where: { workspaceId, type: type as any, provider, isActive: true },
    });
  }
}
