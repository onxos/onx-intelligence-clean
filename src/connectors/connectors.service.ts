import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { PerceptionService } from '../perception/perception.service';
import {
  CONNECTOR_DOMAIN,
  CONNECTOR_SOURCE_TYPE,
  CONNECTOR_TIER,
  ConnectorType,
  LOG_STATUS,
  isConnector,
  providerAllowed,
} from './connectors.constants';
import { ConfigureConnectorDto, ConnectorLogQueryDto } from './dto/connector.dto';
import { ConnectorIngestInput, ConnectorIngestResult, JsonRecord } from './connectors.types';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Connector orchestrator. Owns configuration, the immutable ConnectorLog trail,
 * and the single ingestion path every connector shares: log → USFIP bus
 * (HC-12) → (bus runs SECH pre_judgment + IURG binding) → update log.
 */
@Injectable()
export class ConnectorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly perception: PerceptionService,
  ) {}

  assertConnector(connector: string): ConnectorType {
    if (!isConnector(connector)) {
      throw new BadRequestException(`Unknown connector: ${connector}`);
    }
    return connector;
  }

  // ----------------------------------------------------------------------
  // Configuration
  // ----------------------------------------------------------------------

  async configure(
    workspaceId: string,
    connector: ConnectorType,
    dto: ConfigureConnectorDto,
    ctx?: MutationAuditContext,
  ) {
    if (!providerAllowed(connector, dto.provider)) {
      throw new BadRequestException(`Provider ${dto.provider} is not valid for ${connector}`);
    }
    const config = await this.prisma.connectorConfig.upsert({
      where: {
        workspaceId_connector_provider: {
          workspaceId,
          connector,
          provider: dto.provider.toLowerCase(),
        },
      },
      update: {
        isActive: dto.isActive ?? undefined,
        credentials: (dto.credentials ?? undefined) as Prisma.InputJsonValue | undefined,
        settings: (dto.settings ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      create: {
        workspaceId,
        connector,
        provider: dto.provider.toLowerCase(),
        isActive: dto.isActive ?? false,
        credentials: (dto.credentials ?? {}) as Prisma.InputJsonValue,
        settings: (dto.settings ?? {}) as Prisma.InputJsonValue,
      },
    });
    await this.recordAudit('CONNECTOR_CONFIGURED', connector, config.id, workspaceId, ctx);
    return this.redact(config);
  }

  async listConfigs(workspaceId: string) {
    const configs = await this.prisma.connectorConfig.findMany({
      where: { workspaceId },
      orderBy: { connector: 'asc' },
    });
    return configs.map((c) => this.redact(c));
  }

  async status(workspaceId: string, connector: ConnectorType) {
    const [configs, lastLog, total, failed] = await Promise.all([
      this.prisma.connectorConfig.findMany({ where: { workspaceId, connector } }),
      this.prisma.connectorLog.findFirst({
        where: { workspaceId, connector },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.connectorLog.count({ where: { workspaceId, connector } }),
      this.prisma.connectorLog.count({
        where: { workspaceId, connector, status: LOG_STATUS.FAILED },
      }),
    ]);
    const active = configs.some((c) => c.isActive);
    return {
      connector,
      active,
      configured: configs.length > 0,
      providers: configs.map((c) => ({ provider: c.provider, isActive: c.isActive })),
      health: failed > 0 ? 'degraded' : active ? 'healthy' : 'idle',
      totalEvents: total,
      failedEvents: failed,
      lastEventAt: lastLog?.createdAt ?? null,
      lastError: configs.find((c) => c.lastError)?.lastError ?? null,
    };
  }

  async listLogs(workspaceId: string, connector: ConnectorType, query: ConnectorLogQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
    const where: Prisma.ConnectorLogWhereInput = {
      workspaceId,
      connector,
      ...(query.status ? { status: query.status } : {}),
      ...(query.provider ? { provider: query.provider.toLowerCase() } : {}),
    };
    const [total, items] = await Promise.all([
      this.prisma.connectorLog.count({ where }),
      this.prisma.connectorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async stats(workspaceId: string, connector: ConnectorType) {
    const grouped = await this.prisma.connectorLog.groupBy({
      by: ['status'],
      where: { workspaceId, connector },
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const g of grouped) {
      byStatus[g.status] = g._count._all;
      total += g._count._all;
    }
    return {
      connector,
      total,
      byStatus,
      tier: CONNECTOR_TIER[connector],
      domain: CONNECTOR_DOMAIN[connector],
    };
  }

  // ----------------------------------------------------------------------
  // Shared ingestion path (used by every connector service)
  // ----------------------------------------------------------------------

  async ingest(
    input: ConnectorIngestInput,
    ctx?: MutationAuditContext,
  ): Promise<ConnectorIngestResult> {
    const log = await this.prisma.connectorLog.create({
      data: {
        workspaceId: input.workspaceId,
        connector: input.connector,
        provider: input.provider.toLowerCase(),
        eventType: input.eventType,
        externalId: input.externalId ?? input.perception.sourceId ?? null,
        rawPayload: (input.perception.payload ?? {}) as Prisma.InputJsonValue,
        status: LOG_STATUS.PENDING,
      },
    });

    if (input.filteredReason) {
      await this.prisma.connectorLog.update({
        where: { id: log.id },
        data: { status: LOG_STATUS.FILTERED, errorMessage: input.filteredReason },
      });
      await this.recordAudit('CONNECTOR_FILTERED', input.connector, log.id, input.workspaceId, ctx);
      return { logId: log.id, status: LOG_STATUS.FILTERED, usfipRecordId: null };
    }

    try {
      const busPayload: JsonRecord = {
        ...input.perception.payload,
        ...(input.perception.subject ? { subject: input.perception.subject } : {}),
        ...(input.perception.summary ? { summary: input.perception.summary } : {}),
        ...(input.perception.signals ? { signals: input.perception.signals } : {}),
        ...(input.perception.playbooks ? { playbooks: input.perception.playbooks } : {}),
      };

      const record = (await this.perception.ingest(
        input.workspaceId,
        input.requesterId,
        {
          sourceType: CONNECTOR_SOURCE_TYPE[input.connector],
          sourceId: input.perception.sourceId,
          rawPayload: busPayload as Record<string, unknown>,
          proposedDomain: input.perception.domain ?? CONNECTOR_DOMAIN[input.connector],
          proposedTier: input.perception.tier ?? CONNECTOR_TIER[input.connector],
        },
        ctx,
      )) as { id?: string; recordId?: string; status?: string };

      const usfipRecordId = record.recordId ?? record.id ?? null;
      await this.prisma.connectorLog.update({
        where: { id: log.id },
        data: { status: LOG_STATUS.PROCESSED, usfipRecordId },
      });
      await this.recordAudit('CONNECTOR_INGESTED', input.connector, log.id, input.workspaceId, ctx);
      return {
        logId: log.id,
        status: LOG_STATUS.PROCESSED,
        usfipRecordId,
        perceptionStatus: record.status,
      };
    } catch (err) {
      const message = (err as Error)?.message ?? 'ingestion failed';
      await this.prisma.connectorLog.update({
        where: { id: log.id },
        data: { status: LOG_STATUS.FAILED, errorMessage: message },
      });
      await this.recordAudit(
        'CONNECTOR_FAILED',
        input.connector,
        log.id,
        input.workspaceId,
        ctx,
        false,
      );
      return { logId: log.id, status: LOG_STATUS.FAILED, usfipRecordId: null };
    }
  }

  /** Resolve the workspace for an unauthenticated webhook. */
  async resolveWebhookWorkspace(
    connector: ConnectorType,
    opts: { accountRef?: string; workspaceId?: string },
  ): Promise<string> {
    const active = await this.prisma.connectorConfig.findMany({
      where: { connector, isActive: true },
    });
    if (opts.accountRef) {
      const byAccount = active.find((c) => {
        const settings = (c.settings ?? {}) as JsonRecord;
        return String(settings.account ?? settings.accountId ?? '') === opts.accountRef;
      });
      if (byAccount) return byAccount.workspaceId;
    }
    if (opts.workspaceId) {
      const match = active.find((c) => c.workspaceId === opts.workspaceId);
      if (match) return match.workspaceId;
    }
    throw new BadRequestException(`No active ${connector} connector matches this webhook`);
  }

  async markSync(workspaceId: string, connector: ConnectorType, provider: string, error?: string) {
    await this.prisma.connectorConfig.updateMany({
      where: { workspaceId, connector, provider: provider.toLowerCase() },
      data: { lastSyncAt: new Date(), lastError: error ?? null },
    });
  }

  private redact(config: { credentials?: unknown; [k: string]: unknown }) {
    const hasCreds =
      config.credentials && typeof config.credentials === 'object'
        ? Object.keys(config.credentials as JsonRecord).length > 0
        : false;
    return { ...config, credentials: hasCreds ? { configured: true } : null };
  }

  private async recordAudit(
    action: string,
    connector: string,
    resourceId: string,
    workspaceId: string,
    ctx: MutationAuditContext | undefined,
    success = true,
  ) {
    await this.audit.log({
      action,
      resourceType: 'Connector',
      resourceId,
      actorId: ctx?.actorId ?? `system-${connector}`,
      workspaceId,
      before: null,
      after: { connector, resourceId },
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      success,
    });
  }
}
