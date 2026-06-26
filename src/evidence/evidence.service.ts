import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(workspaceId: string) {
    return this.prisma.evidenceRecord.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async create(data: {
    intent: string;
    confidence?: number;
    ownerId: string;
    workspaceId: string;
  }) {
    return this.prisma.evidenceRecord.create({
      data: {
        intent: data.intent,
        confidence: data.confidence || 0,
        ownerId: data.ownerId,
        workspaceId: data.workspaceId,
        providerCandidates: [],
        toolCandidates: [],
      },
    });
  }
}
