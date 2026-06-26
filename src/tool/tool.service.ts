import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ToolService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(workspaceId: string) {
    return this.prisma.toolProfile.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
