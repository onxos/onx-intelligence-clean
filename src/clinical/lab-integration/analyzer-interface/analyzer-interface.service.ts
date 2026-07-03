import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma.service';

type AnalyzerRecord = {
  id: string;
  status: 'online' | 'offline';
  lastSyncAt: string;
};

type AnalyzerImportResult = {
  testCode: string;
  testName: string;
  value: string;
  unit: string;
  referenceRange: string;
  status?: string;
  notes?: string;
};

type AnalyzerImportDto = {
  analyzerId?: string;
  orderId: string;
  patientId: string;
  results: AnalyzerImportResult[];
};

@Injectable()
export class AnalyzerInterfaceService {
  private readonly analyzers = new Map<string, AnalyzerRecord>();

  constructor(private readonly prisma: PrismaService) {}

  async importFromAnalyzer(workspaceId: string, dto: AnalyzerImportDto) {
    const analyzerId = dto.analyzerId ?? 'default-analyzer';
    const now = new Date().toISOString();

    const created = await this.prisma.$transaction(
      dto.results.map((entry) =>
        this.prisma.labResult.create({
          data: {
            orderId: dto.orderId,
            patientId: dto.patientId,
            workspaceId,
            testCode: entry.testCode,
            testName: entry.testName,
            value: entry.value,
            unit: entry.unit,
            referenceRange: entry.referenceRange,
            status: entry.status ?? 'PENDING',
            notes: entry.notes,
          },
        }),
      ),
    );

    this.analyzers.set(analyzerId, {
      id: analyzerId,
      status: 'online',
      lastSyncAt: now,
    });

    return {
      analyzerId,
      imported: created.length,
      resultIds: created.map((entry) => entry.id),
      syncedAt: now,
    };
  }

  status() {
    return {
      connected: this.analyzers.size,
      analyzers: [...this.analyzers.values()],
    };
  }

  sync(id: string) {
    const now = new Date().toISOString();
    const existing = this.analyzers.get(id);

    this.analyzers.set(id, {
      id,
      status: existing?.status ?? 'online',
      lastSyncAt: now,
    });

    return {
      id,
      syncedAt: now,
      status: 'ok',
    };
  }
}
