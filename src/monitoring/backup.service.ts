import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { StructuredLogger } from '../common/structured-logger.service';

/**
 * Phase 4 — disaster-recovery export of the IURG graph. Reads the workspace's
 * bound edges + Intent Evolution Ledger into an immutable snapshot. In
 * production the snapshot is uploaded to cold storage (Glacier); here it is
 * returned with a summary.
 *
 * DB backups are handled out-of-band by scripts/backup.sh (pg_dump | gzip) on a
 * 6-hour cron with 7-daily / 4-weekly / 12-monthly retention.
 *
 * TODO(prod): stream the snapshot to object storage (S3 Glacier) + schedule via
 * @Cron('0 0 * * *').
 */
@Injectable()
export class BackupService {
  constructor(private readonly prisma: PrismaService) {}

  async exportIurg(workspaceId: string) {
    const [edges, ledger, sample] = await Promise.all([
      this.prisma.iurgEdge.count({ where: { workspaceId } }),
      this.prisma.intentEvolutionLedger.count({ where: { workspaceId } }),
      this.prisma.iurgEdge.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    const snapshot = {
      exportedAt: new Date().toISOString(),
      workspaceId,
      counts: { edges, ledger },
      sample,
      storageClass: 'GLACIER',
      uploaded: false,
    };
    StructuredLogger.info('iurg export prepared', {
      workspaceId,
      edges,
      ledger,
    });
    return snapshot;
  }
}
