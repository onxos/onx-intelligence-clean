import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { AiCoreService } from '../../../ai-core/ai-core.service';
import { PrismaService } from '../../../common/prisma.service';
import { CreateLabResultDto, ListLabResultsQueryDto, ReviewLabResultDto } from './result-management.dto';

@Injectable()
export class ResultManagementService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly aiCore?: AiCoreService,
  ) {}

  create(workspaceId: string, dto: CreateLabResultDto) {
    return this.prisma.labResult.create({
      data: {
        orderId: dto.orderId,
        patientId: dto.patientId,
        workspaceId,
        testCode: dto.testCode,
        testName: dto.testName,
        value: dto.value,
        unit: dto.unit,
        referenceRange: dto.referenceRange,
        status: dto.status ?? 'PENDING',
        notes: dto.notes,
      },
    });
  }

  list(workspaceId: string, query: ListLabResultsQueryDto) {
    return this.prisma.labResult.findMany({
      where: {
        workspaceId,
        ...(query.patientId ? { patientId: query.patientId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(workspaceId: string, id: string) {
    const result = await this.prisma.labResult.findFirst({
      where: { id, workspaceId },
    });

    if (!result) {
      throw new NotFoundException(`Lab result not found: ${id}`);
    }

    return result;
  }

  async review(workspaceId: string, id: string, reviewerUserId: string, dto: ReviewLabResultDto) {
    const existing = await this.getById(workspaceId, id);

    return this.prisma.labResult.update({
      where: { id: existing.id },
      data: {
        status: dto.status ?? existing.status,
        reviewedBy: dto.reviewedBy ?? reviewerUserId,
        reviewedAt: new Date(),
        notes: dto.notes ?? existing.notes,
      },
    });
  }

  async interpret(workspaceId: string, userId: string, id: string) {
    const result = await this.getById(workspaceId, id);

    if (!this.aiCore) {
      return {
        result,
        interpretation: {
          status: 'fallback',
          summary: `Result ${result.testCode} is ${result.status} with value ${result.value} ${result.unit}.`,
        },
      };
    }

    const ai = await this.aiCore.clinicalDiagnosis(workspaceId, userId, {
      symptoms: [
        `Lab test: ${result.testName} (${result.testCode})`,
        `Value: ${result.value} ${result.unit}`,
        `Reference: ${result.referenceRange}`,
        `Status: ${result.status}`,
      ],
      history: result.notes ?? undefined,
    });

    return { result, interpretation: ai };
  }
}
