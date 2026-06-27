import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ToolService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    workspaceId: string,
    query?: {
      search?: string;
      status?: string;
      category?: string;
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

    return this.prisma.toolProfile.findMany({
      where: {
        workspaceId,
        ...(query?.status && { status: query.status as any }),
        ...(query?.category && { category: query.category as any }),
        ...(query?.search && {
          OR: [
            { toolName: { contains: query.search, mode: 'insensitive' } },
            { toolId: { contains: query.search, mode: 'insensitive' } },
          ],
        }),
      },
      orderBy: { [sortBy]: sortOrder } as any,
      skip,
      take: pageSize,
    });
  }

  async create(workspaceId: string, data: any) {
    return this.prisma.toolProfile.create({
      data: {
        toolId: data.toolId,
        toolName: data.toolName,
        category: (data.category as any) || 'ANALYTICS',
        status: (data.status as any) || 'ACTIVE',
        capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
        costPerCall: data.costPerCall ?? 0,
        totalCapital: data.totalCapital ?? 0,
        workspaceId,
      },
    });
  }

  async update(workspaceId: string, id: string, data: any) {
    const existing = await this.prisma.toolProfile.findFirst({ where: { id, workspaceId } });
    if (!existing) {
      throw new NotFoundException('Tool profile not found');
    }

    return this.prisma.toolProfile.update({
      where: { id: existing.id },
      data: {
        ...(data.toolName !== undefined && { toolName: data.toolName }),
        ...(data.category !== undefined && { category: data.category as any }),
        ...(data.status !== undefined && { status: data.status as any }),
        ...(data.capabilities !== undefined && {
          capabilities: Array.isArray(data.capabilities) ? data.capabilities : [],
        }),
        ...(data.costPerCall !== undefined && { costPerCall: data.costPerCall }),
        ...(data.totalCapital !== undefined && { totalCapital: data.totalCapital }),
      },
    });
  }

  async remove(workspaceId: string, id: string) {
    const existing = await this.prisma.toolProfile.findFirst({ where: { id, workspaceId } });
    if (!existing) {
      throw new NotFoundException('Tool profile not found');
    }

    await this.prisma.toolProfile.delete({ where: { id: existing.id } });
    return { success: true, id: existing.id };
  }
}
