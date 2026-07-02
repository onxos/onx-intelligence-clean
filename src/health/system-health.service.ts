import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

/** The 9 IW subsystems tracked by the D20 Systemic Health Monitor. */
export const HEALTH_SYSTEMS = [
  'fic',
  'iurg',
  'sech',
  'usfip',
  'decision',
  'sfis',
  'understanding',
  'judgment',
  'continuity',
] as const;

export type HealthSystem = (typeof HEALTH_SYSTEMS)[number];

type Counter = (prisma: PrismaService, workspaceId: string) => Promise<number>;

const SYSTEM_COUNTERS: Record<HealthSystem, Counter> = {
  fic: (p, w) => p.ficEnforcementCheck.count({ where: { workspaceId: w } }),
  iurg: (p, w) => p.iurgEdge.count({ where: { workspaceId: w } }),
  sech: (p, w) => p.sechRoute.count({ where: { workspaceId: w } }),
  usfip: (p, w) => p.usfipPerceptionRecord.count({ where: { workspaceId: w } }),
  decision: (p, w) => p.decisionRun.count({ where: { workspaceId: w } }),
  sfis: (p, w) => p.sfisScanRecord.count({ where: { workspaceId: w } }),
  understanding: (p, w) => p.understandingObject.count({ where: { workspaceId: w } }),
  judgment: (p, w) => p.judgmentObject.count({ where: { workspaceId: w } }),
  continuity: (p, w) => p.continuityAudit.count({ where: { workspaceId: w } }),
};

@Injectable()
export class SystemHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listSystemNames() {
    return { total: HEALTH_SYSTEMS.length, systems: HEALTH_SYSTEMS };
  }

  /** Probe every subsystem, persist a SystemHealth record per system, never crash. */
  async check(workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    const results = [];
    for (const system of HEALTH_SYSTEMS) {
      const started = Date.now();
      let status = 'healthy';
      let count: number | null = null;
      let message: string | null = null;
      try {
        count = await SYSTEM_COUNTERS[system](this.prisma, workspaceId);
      } catch (error: any) {
        status = 'failing';
        message = error?.message ?? 'probe failed';
      }
      const responseMs = Date.now() - started;
      const record = await this.prisma.systemHealth.create({
        data: {
          workspaceId,
          system,
          status,
          lastCheck: new Date(),
          responseMs,
          errorRate: status === 'healthy' ? 0 : 1,
          details: { count, message } as unknown as Prisma.InputJsonValue,
        },
      });
      results.push(record);
    }

    const failing = results.filter((r) => r.status !== 'healthy').length;
    const overall =
      failing === 0 ? 'healthy' : failing >= HEALTH_SYSTEMS.length ? 'critical' : 'degraded';

    await this.audit.log({
      action: `SYSTEM_HEALTH_${overall.toUpperCase()}`,
      resourceType: 'SystemHealth',
      resourceId: workspaceId,
      actorId: ctx?.actorId ?? userId,
      workspaceId,
      before: null,
      after: { overall, failing, checked: results.length } as Prisma.JsonObject,
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      status: 'SUCCESS',
      success: true,
    });

    return { overall, failing, checked: results.length, systems: results };
  }

  /** Latest health record per system (best-effort, never throws on a single system). */
  async report(workspaceId: string) {
    const systems = [];
    let failing = 0;
    for (const system of HEALTH_SYSTEMS) {
      let latest = null;
      try {
        latest = await this.prisma.systemHealth.findFirst({
          where: { workspaceId, system },
          orderBy: { createdAt: 'desc' },
        });
      } catch {
        latest = null;
      }
      const status = latest?.status ?? 'unknown';
      if (status !== 'healthy') {
        failing += 1;
      }
      systems.push({ system, status, latest });
    }
    const overall =
      failing === 0 ? 'healthy' : failing >= HEALTH_SYSTEMS.length ? 'critical' : 'degraded';
    return { overall, failing, total: HEALTH_SYSTEMS.length, systems };
  }

  async getSystem(workspaceId: string, system: string) {
    if (!HEALTH_SYSTEMS.includes(system as HealthSystem)) {
      throw new NotFoundException(`Unknown system "${system}"`);
    }
    const history = await this.prisma.systemHealth.findMany({
      where: { workspaceId, system },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    if (history.length === 0) {
      return { system, status: 'unknown', history: [] };
    }
    return { system, status: history[0].status, latest: history[0], history };
  }
}
