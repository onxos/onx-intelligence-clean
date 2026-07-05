import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { IntelligenceObjectType } from '@prisma/client';
import { computeQualityIndices, clamp01 } from './intelligence-metrics.util';

export interface JobStatus {
  lastRunAt: Date | null;
  lastDurationMs: number | null;
  lastResult: string | null;
  runCount: number;
  errorCount: number;
}

const REINFORCEMENT_INTERVAL_MS = 60_000;
const PROMOTION_INTERVAL_MS = 5 * 60_000;
const LEARNING_BATCH_INTERVAL_MS = 15 * 60_000;
const SHADOW_EVALUATION_INTERVAL_MS = 30 * 60_000;
const CAPITAL_RECALC_INTERVAL_MS = 60 * 60_000;
const MEASUREMENT_INTERVAL_MS = 60 * 60_000;
const HEALTH_CHECK_INTERVAL_MS = 30_000;

const STALE_OBJECT_DAYS = 30;
const DAILY_DECAY_RATE = 0.005; // 0.5% per day
const SHADOW_GRADUATE_DAYS = 14;
const SHADOW_REJECT_DAYS = 30;

/** DIKW promotion chain: SIGNAL -> PATTERN -> UNDERSTANDING -> JUDGMENT -> WISDOM */
const PROMOTION_TRIGGERS: Partial<
  Record<
    IntelligenceObjectType,
    { minAmanah: number; minReinforcements: number; toType: IntelligenceObjectType }
  >
> = {
  SIGNAL: { minAmanah: 0.5, minReinforcements: 2, toType: 'PATTERN' },
  PATTERN: { minAmanah: 0.65, minReinforcements: 4, toType: 'UNDERSTANDING' },
  UNDERSTANDING: { minAmanah: 0.75, minReinforcements: 8, toType: 'JUDGMENT' },
  JUDGMENT: { minAmanah: 0.85, minReinforcements: 15, toType: 'WISDOM' },
};

const SCHEDULER_ACTOR_ID = 'system-scheduler';

/**
 * Autonomous background intelligence engine. Every job reads real rows via
 * Prisma and derives its outcome deterministically from stored evidence —
 * nothing here is randomized or fabricated (FAILURE_POLICY §5).
 */
@Injectable()
export class IntelligenceSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(IntelligenceSchedulerService.name);

  private readonly status: Record<string, JobStatus> = {
    reinforcement: this.emptyStatus(),
    promotion: this.emptyStatus(),
    learningBatch: this.emptyStatus(),
    shadowEvaluation: this.emptyStatus(),
    capitalRecalculation: this.emptyStatus(),
    measurement: this.emptyStatus(),
    healthCheck: this.emptyStatus(),
  };

  private healthy = true;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.logger.log('Autonomous intelligence engine started (7 background jobs armed)');
  }

  private emptyStatus(): JobStatus {
    return { lastRunAt: null, lastDurationMs: null, lastResult: null, runCount: 0, errorCount: 0 };
  }

  private async record(job: keyof typeof this.status, fn: () => Promise<string>) {
    const start = Date.now();
    const entry = this.status[job];
    try {
      const result = await fn();
      entry.lastResult = result;
      entry.runCount += 1;
    } catch (error: any) {
      entry.errorCount += 1;
      entry.lastResult = `ERROR: ${String(error?.message || error)}`;
      this.logger.error(`[${job}] ${entry.lastResult}`);
    } finally {
      entry.lastRunAt = new Date();
      entry.lastDurationMs = Date.now() - start;
    }
  }

  /** Public status snapshot consumed by the dashboard's SchedulerStatus widget. */
  getStatus() {
    return {
      isRunning: true,
      healthy: this.healthy,
      jobs: this.status,
    };
  }

  // ─── Reinforcement Loop (every 60s) ──────────────────────────────────
  @Interval(REINFORCEMENT_INTERVAL_MS)
  async runReinforcement() {
    await this.record('reinforcement', async () => {
      const candidates = await this.prisma.intelligenceObject.findMany({
        where: { state: 'ACTIVE', objectType: { in: ['SIGNAL', 'PATTERN'] } },
        orderBy: { updatedAt: 'asc' },
        take: 10,
      });

      let reinforced = 0;
      for (const obj of candidates) {
        const latestEvidence = await this.prisma.evidenceRecord.findFirst({
          where: { intelligenceObjectId: obj.id },
          orderBy: { createdAt: 'desc' },
        });
        if (!latestEvidence) continue; // no real evidence yet — nothing to reinforce from

        const impact = latestEvidence.confidence - 0.5;
        const strengthGain = impact > 0.15 ? 0.05 : impact > 0 ? 0.02 : -0.03;
        const newAmanah = clamp01(Math.min(1, Math.max(0.1, obj.amanahScore + strengthGain)));
        const newConfidence = clamp01((obj.confidenceScore + latestEvidence.confidence) / 2);

        await this.prisma.intelligenceObject.update({
          where: { id: obj.id },
          data: { amanahScore: newAmanah, confidenceScore: newConfidence },
        });

        await this.prisma.provenanceRecord.create({
          data: {
            action: 'AUTO_REINFORCE',
            resource: 'IntelligenceObject',
            resourceId: obj.id,
            actorId: SCHEDULER_ACTOR_ID,
            workspaceId: obj.workspaceId,
            oldValue: obj.amanahScore.toFixed(4),
            newValue: newAmanah.toFixed(4),
          },
        });
        reinforced++;
      }

      if (reinforced > 0) {
        await this.audit.log({
          action: 'SCHEDULER_REINFORCEMENT',
          resourceType: 'IntelligenceObject',
          actorId: SCHEDULER_ACTOR_ID,
          after: { reinforced },
          status: 'SUCCESS',
          success: true,
        });
      }
      return `reinforced=${reinforced}/${candidates.length}`;
    });
  }

  // ─── Promotion Checks (every 5 min) ──────────────────────────────────
  @Interval(PROMOTION_INTERVAL_MS)
  async runPromotionChecks() {
    await this.record('promotion', async () => {
      const eligibleTypes = Object.keys(PROMOTION_TRIGGERS) as IntelligenceObjectType[];
      const candidates = await this.prisma.intelligenceObject.findMany({
        where: { state: 'ACTIVE', objectType: { in: eligibleTypes } },
        take: 20,
      });

      let promoted = 0;
      for (const obj of candidates) {
        const trigger = PROMOTION_TRIGGERS[obj.objectType];
        if (!trigger || obj.amanahScore < trigger.minAmanah) continue;

        const reinforcementCount = await this.prisma.provenanceRecord.count({
          where: { resourceId: obj.id, action: 'AUTO_REINFORCE' },
        });
        if (reinforcementCount < trigger.minReinforcements) continue;

        await this.prisma.intelligenceObject.update({
          where: { id: obj.id },
          data: { objectType: trigger.toType },
        });

        if (trigger.toType === 'WISDOM') {
          await this.prisma.capitalRecord.create({
            data: {
              type: 'AUTO_PROMOTION',
              amount: 10,
              category: obj.capitalCategory ?? 'KNOWLEDGE',
              workspaceId: obj.workspaceId,
              ownerId: obj.ownerId,
              sourceObjectId: obj.id,
            },
          });
        }

        await this.prisma.provenanceRecord.create({
          data: {
            action: 'AUTO_PROMOTION',
            resource: 'IntelligenceObject',
            resourceId: obj.id,
            actorId: SCHEDULER_ACTOR_ID,
            workspaceId: obj.workspaceId,
            oldValue: obj.objectType,
            newValue: trigger.toType,
          },
        });

        await this.audit.log({
          action: 'SCHEDULER_PROMOTION',
          resourceType: 'IntelligenceObject',
          resourceId: obj.id,
          actorId: SCHEDULER_ACTOR_ID,
          workspaceId: obj.workspaceId,
          before: { objectType: obj.objectType },
          after: { objectType: trigger.toType, reinforcementCount },
          status: 'SUCCESS',
          success: true,
        });
        promoted++;
      }
      return `promoted=${promoted}/${candidates.length}`;
    });
  }

  // ─── Learning Batch / Decay (every 15 min) ───────────────────────────
  @Interval(LEARNING_BATCH_INTERVAL_MS)
  async runLearningBatch() {
    await this.record('learningBatch', async () => {
      const staleCutoff = new Date(Date.now() - STALE_OBJECT_DAYS * 24 * 60 * 60 * 1000);
      const staleObjects = await this.prisma.intelligenceObject.findMany({
        where: { state: 'ACTIVE', updatedAt: { lt: staleCutoff } },
        take: 50,
      });

      let decayed = 0;
      for (const obj of staleObjects) {
        const daysOld = Math.floor((Date.now() - obj.updatedAt.getTime()) / (1000 * 60 * 60 * 24));
        const newAmanah = clamp01(
          Math.max(0.1, obj.amanahScore * (1 - DAILY_DECAY_RATE) ** daysOld),
        );
        const dormant = newAmanah < 0.3;

        await this.prisma.intelligenceObject.update({
          where: { id: obj.id },
          data: { amanahScore: newAmanah, ...(dormant ? { state: 'DORMANT' } : {}) },
        });

        await this.prisma.provenanceRecord.create({
          data: {
            action: dormant ? 'AUTO_DECAY_DORMANT' : 'AUTO_DECAY',
            resource: 'IntelligenceObject',
            resourceId: obj.id,
            actorId: SCHEDULER_ACTOR_ID,
            workspaceId: obj.workspaceId,
            oldValue: obj.amanahScore.toFixed(4),
            newValue: newAmanah.toFixed(4),
          },
        });
        decayed++;
      }
      return `decayed=${decayed}/${staleObjects.length}`;
    });
  }

  // ─── Shadow Evaluation (every 30 min) ────────────────────────────────
  @Interval(SHADOW_EVALUATION_INTERVAL_MS)
  async runShadowEvaluation() {
    await this.record('shadowEvaluation', async () => {
      const shadowObjects = await this.prisma.intelligenceObject.findMany({
        where: { shadowStatus: 'INTERNAL', state: 'ACTIVE' },
        take: 20,
      });

      let graduated = 0;
      let rejected = 0;
      for (const obj of shadowObjects) {
        const daysInShadow = (Date.now() - obj.createdAt.getTime()) / (1000 * 60 * 60 * 24);

        if (daysInShadow >= SHADOW_GRADUATE_DAYS && obj.amanahScore >= 0.6) {
          await this.prisma.intelligenceObject.update({
            where: { id: obj.id },
            data: { shadowStatus: 'EXTERNAL' },
          });
          await this.prisma.provenanceRecord.create({
            data: {
              action: 'SHADOW_GRADUATED',
              resource: 'IntelligenceObject',
              resourceId: obj.id,
              actorId: SCHEDULER_ACTOR_ID,
              workspaceId: obj.workspaceId,
              oldValue: 'INTERNAL',
              newValue: 'EXTERNAL',
            },
          });
          graduated++;
        } else if (daysInShadow >= SHADOW_REJECT_DAYS || obj.amanahScore < 0.3) {
          await this.prisma.intelligenceObject.update({
            where: { id: obj.id },
            data: { state: 'ARCHIVED' },
          });
          await this.prisma.provenanceRecord.create({
            data: {
              action: 'SHADOW_REJECTED',
              resource: 'IntelligenceObject',
              resourceId: obj.id,
              actorId: SCHEDULER_ACTOR_ID,
              workspaceId: obj.workspaceId,
              oldValue: 'ACTIVE',
              newValue: 'ARCHIVED',
            },
          });
          rejected++;
        }
      }
      return `graduated=${graduated} rejected=${rejected} scanned=${shadowObjects.length}`;
    });
  }

  // ─── Capital Recalculation (every 60 min): Intelligence Capital Index ─
  @Interval(CAPITAL_RECALC_INTERVAL_MS)
  async runCapitalRecalculation() {
    await this.record('capitalRecalculation', async () => {
      const workspaces = await this.prisma.workspace.findMany({ select: { id: true } });
      let workspacesMeasured = 0;

      for (const ws of workspaces) {
        const objects = await this.prisma.intelligenceObject.findMany({
          where: { workspaceId: ws.id, state: { not: 'ARCHIVED' } },
        });
        if (objects.length === 0) continue;

        const indices = computeQualityIndices(objects);

        await this.prisma.provenanceRecord.create({
          data: {
            action: 'ICI_MEASUREMENT',
            resource: 'WorkspaceMetrics',
            resourceId: null,
            actorId: SCHEDULER_ACTOR_ID,
            workspaceId: ws.id,
            newValue: JSON.stringify({ ici: indices.ici, objectCount: indices.objectCount }),
          },
        });
        workspacesMeasured++;
      }
      return `workspacesMeasured=${workspacesMeasured}/${workspaces.length}`;
    });
  }

  // ─── Measurement (every 60 min): Institutional Risk Score + progress ─
  @Interval(MEASUREMENT_INTERVAL_MS)
  async runMeasurement() {
    await this.record('measurement', async () => {
      const workspaces = await this.prisma.workspace.findMany({ select: { id: true } });
      let workspacesMeasured = 0;

      for (const ws of workspaces) {
        const objects = await this.prisma.intelligenceObject.findMany({
          where: { workspaceId: ws.id, state: { not: 'ARCHIVED' } },
        });
        if (objects.length === 0) continue;

        const indices = computeQualityIndices(objects);

        await this.prisma.provenanceRecord.create({
          data: {
            action: 'IRS_MEASUREMENT',
            resource: 'WorkspaceMetrics',
            resourceId: null,
            actorId: SCHEDULER_ACTOR_ID,
            workspaceId: ws.id,
            newValue: JSON.stringify({ irs: indices.irs, progressState: indices.progressState }),
          },
        });
        workspacesMeasured++;
      }
      return `workspacesMeasured=${workspacesMeasured}/${workspaces.length}`;
    });
  }

  // ─── Health Check (every 30s) ─────────────────────────────────────────
  @Interval(HEALTH_CHECK_INTERVAL_MS)
  async runHealthCheck() {
    await this.record('healthCheck', async () => {
      const objectCount = await this.prisma.intelligenceObject.count();
      const lastDecision = await this.prisma.governanceDecision.findFirst({
        orderBy: { createdAt: 'desc' },
      });

      this.healthy = objectCount >= 0 && (!lastDecision || lastDecision.outcome !== 'BLOCKED');
      if (!this.healthy) {
        this.logger.warn(
          `HEALTH WARNING: objects=${objectCount}, lastDecision=${lastDecision?.outcome}`,
        );
      }
      return `healthy=${this.healthy} objects=${objectCount}`;
    });
  }
}
