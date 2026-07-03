import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';
import { CreateLabQualityControlDto, ListLabQualityControlQueryDto } from './quality-control.dto';

@Injectable()
export class QualityControlService {
  constructor(private readonly prisma: PrismaService) {}

  create(workspaceId: string, dto: CreateLabQualityControlDto) {
    return this.prisma.labQualityControl.create({
      data: {
        workspaceId,
        testCode: dto.testCode,
        controlName: dto.controlName,
        expectedValue: dto.expectedValue,
        actualValue: dto.actualValue,
        status: dto.status ?? 'PASS',
        reviewedBy: dto.reviewedBy,
      },
    });
  }

  list(workspaceId: string, query: ListLabQualityControlQueryDto) {
    return this.prisma.labQualityControl.findMany({
      where: {
        workspaceId,
        ...(query.testCode ? { testCode: query.testCode } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async stats(workspaceId: string) {
    const [total, pass, fail, warning] = await Promise.all([
      this.prisma.labQualityControl.count({ where: { workspaceId } }),
      this.prisma.labQualityControl.count({ where: { workspaceId, status: 'PASS' } }),
      this.prisma.labQualityControl.count({ where: { workspaceId, status: 'FAIL' } }),
      this.prisma.labQualityControl.count({ where: { workspaceId, status: 'WARNING' } }),
    ]);

    return {
      total,
      pass,
      fail,
      warning,
    };
  }
}
