import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { CreateLabOrderDto, ListLabOrdersQueryDto, UpdateLabOrderStatusDto } from './lab-order.dto';

@Injectable()
export class LabOrderService {
  constructor(private readonly prisma: PrismaService) {}

  create(workspaceId: string, userId: string, dto: CreateLabOrderDto) {
    return this.prisma.labOrder.create({
      data: {
        patientId: dto.patientId,
        workspaceId,
        orderType: dto.orderType,
        testCodes: dto.testCodes,
        priority: dto.priority ?? 'ROUTINE',
        status: 'PENDING',
        requestedBy: dto.requestedBy ?? userId,
        notes: dto.notes,
      },
    });
  }

  list(workspaceId: string, query: ListLabOrdersQueryDto) {
    return this.prisma.labOrder.findMany({
      where: {
        workspaceId,
        ...(query.patientId ? { patientId: query.patientId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(workspaceId: string, id: string) {
    const order = await this.prisma.labOrder.findFirst({
      where: { id, workspaceId },
    });

    if (!order) {
      throw new NotFoundException(`Lab order not found: ${id}`);
    }

    return order;
  }

  async updateStatus(workspaceId: string, id: string, dto: UpdateLabOrderStatusDto) {
    const existing = await this.getById(workspaceId, id);

    return this.prisma.labOrder.update({
      where: { id: existing.id },
      data: {
        status: dto.status,
        collectedAt: dto.status === 'COLLECTED' ? existing.collectedAt ?? new Date() : existing.collectedAt,
        completedAt: dto.status === 'COMPLETED' ? new Date() : existing.completedAt,
      },
    });
  }

  async cancel(workspaceId: string, id: string) {
    const existing = await this.getById(workspaceId, id);

    return this.prisma.labOrder.update({
      where: { id: existing.id },
      data: {
        status: 'CANCELLED',
      },
    });
  }
}
