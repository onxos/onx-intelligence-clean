import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    workspaceId: string,
    ownerId: string,
    query?: {
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    },
  ) {
    const pageSize = Number(query?.pageSize || 50);
    const page = Number(query?.page || 1);
    const skip = (page - 1) * pageSize;
    const sortBy = query?.sortBy || 'createdAt';
    const sortOrder = query?.sortOrder || 'desc';

    return this.prisma.evidenceRecord.findMany({
      where: {
        workspaceId,
        ownerId,
        ...(query?.search && {
          OR: [
            { intent: { contains: query.search, mode: 'insensitive' } },
            { judgment: { contains: query.search, mode: 'insensitive' } },
            { outcome: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { [sortBy]: sortOrder } as any,
      take: pageSize,
      skip,
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

  async update(
    id: string,
    workspaceId: string,
    ownerId: string,
    data: {
      intent?: string;
      confidence?: number;
      judgment?: string;
      outcome?: string;
      learning?: string;
    },
  ) {
    const existing = await this.prisma.evidenceRecord.findFirst({
      where: { id, workspaceId, ownerId },
    });
    if (!existing) {
      throw new NotFoundException('Evidence record not found');
    }

    return this.prisma.evidenceRecord.update({
      where: { id: existing.id },
      data: {
        ...(data.intent !== undefined && { intent: data.intent }),
        ...(data.confidence !== undefined && { confidence: data.confidence }),
        ...(data.judgment !== undefined && { judgment: data.judgment }),
        ...(data.outcome !== undefined && { outcome: data.outcome }),
        ...(data.learning !== undefined && { learning: data.learning }),
      },
    });
  }

  async remove(id: string, workspaceId: string, ownerId: string) {
    const existing = await this.prisma.evidenceRecord.findFirst({
      where: { id, workspaceId, ownerId },
    });
    if (!existing) {
      throw new NotFoundException('Evidence record not found');
    }

    await this.prisma.evidenceRecord.delete({ where: { id: existing.id } });
    return { success: true, id: existing.id };
  }
}
