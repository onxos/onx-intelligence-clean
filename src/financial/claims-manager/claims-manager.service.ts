import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { CreateClaimDto, ListClaimsQueryDto, UpdateClaimStatusDto } from './claims-manager.dto';

@Injectable()
export class ClaimsManagerService {
  constructor(private readonly prisma: PrismaService) {}

  create(workspaceId: string, dto: CreateClaimDto) {
    const claimNumber = `CLM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
    return this.prisma.insuranceClaim.create({
      data: {
        workspaceId,
        patientId: dto.patientId,
        invoiceId: dto.invoiceId,
        claimNumber,
        provider: dto.provider,
        policyNumber: dto.policyNumber,
        status: 'PENDING',
        amountClaimed: new Prisma.Decimal(dto.amountClaimed.toFixed(2)),
        amountApproved: new Prisma.Decimal('0.00'),
        notes: dto.notes,
      },
    });
  }

  list(workspaceId: string, query: ListClaimsQueryDto) {
    return this.prisma.insuranceClaim.findMany({
      where: {
        workspaceId,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(workspaceId: string, id: string) {
    const claim = await this.prisma.insuranceClaim.findFirst({ where: { id, workspaceId } });
    if (!claim) {
      throw new NotFoundException(`Insurance claim not found: ${id}`);
    }
    return claim;
  }

  async updateStatus(workspaceId: string, id: string, dto: UpdateClaimStatusDto) {
    await this.getById(workspaceId, id);
    return this.prisma.insuranceClaim.update({
      where: { id },
      data: {
        status: dto.status,
        amountApproved:
          dto.amountApproved !== undefined
            ? new Prisma.Decimal(dto.amountApproved.toFixed(2))
            : undefined,
        submittedAt: dto.status === 'SUBMITTED' ? new Date() : undefined,
        resolvedAt:
          dto.status === 'APPROVED' || dto.status === 'DENIED' ? new Date() : undefined,
        notes: dto.notes,
      },
    });
  }

  async appeal(workspaceId: string, id: string) {
    await this.getById(workspaceId, id);
    return this.prisma.insuranceClaim.update({
      where: { id },
      data: {
        status: 'APPEALED',
        notes: 'Appeal submitted',
      },
    });
  }
}
