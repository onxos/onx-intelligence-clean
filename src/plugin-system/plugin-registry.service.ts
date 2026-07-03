import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { PluginManifest } from './plugin.interface';

@Injectable()
export class PluginRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async register(m: PluginManifest) {
    return this.prisma.plugin.upsert({
      where: { id: m.id },
      update: {
        name: m.name,
        version: m.version,
        type: m.type,
        status: 'PENDING_CONFIG',
        config: {} as Prisma.InputJsonValue,
        manifest: m as unknown as Prisma.InputJsonValue,
      },
      create: {
        id: m.id,
        name: m.name,
        version: m.version,
        type: m.type,
        status: 'PENDING_CONFIG',
        config: {} as Prisma.InputJsonValue,
        manifest: m as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async activate(id: string, config: Record<string, unknown>) {
    return this.prisma.plugin.update({
      where: { id },
      data: { config: config as Prisma.InputJsonValue, status: 'ACTIVE' },
    });
  }

  async deactivate(id: string) {
    return this.prisma.plugin.update({ where: { id }, data: { status: 'INACTIVE' } });
  }

  async list(type?: string) {
    return this.prisma.plugin.findMany({ where: type ? { type } : undefined });
  }

  async unregister(id: string) {
    return this.prisma.plugin.delete({ where: { id } });
  }
}
