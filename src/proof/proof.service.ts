import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProofExecutionStatus, StressExecutionStatus } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import {
  CertifyProofDto,
  CreateProofScenarioDto,
  CreateProofSessionDto,
  CreateStressCampaignDto,
  CreateStressScenarioDto,
  DetectContradictionsDto,
  GateSignalsDto,
  InjectFailureDto,
  ProofListQueryDto,
  RunProofDto,
  RunStressDto,
  StreamQueryDto,
  UpdateProofSessionDto,
} from './dto/proof.dto';
import {
  aggregateCertification,
  computeResilienceScore,
  detectContradictions as engineDetectContradictions,
  evaluateAllGates,
  evaluateGate,
  meetsResilienceThreshold,
  simulateInjection,
  stressOutcome,
  type ContradictionCandidate,
  type GateResult,
  type GateSignals,
  type InjectionResult,
} from './proof-engine';
import {
  CERTIFICATION_GATES,
  FAILURE_INJECTION_TYPES,
  severityForOutcome,
} from './proof.constants';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const DEFAULT_STREAM_LIMIT = 50;
const MAX_STREAM_LIMIT = 200;

function jsonify(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

@Injectable()
export class ProofService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly evidence: EvidenceService,
  ) {}

  // ----------------------------------------------------------------------
  // Shared helpers
  // ----------------------------------------------------------------------

  private async recordAudit(
    action: string,
    resourceType: string,
    resourceId: string | undefined,
    ctx: MutationAuditContext | undefined,
    workspaceId: string,
    actorId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    success: boolean,
    metadata?: Record<string, unknown>,
  ) {
    await this.audit.log({
      action,
      resourceType,
      resourceId,
      actorId: ctx?.actorId ?? actorId,
      workspaceId,
      before,
      after,
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      status: success ? 'SUCCESS' : 'FAILED',
      success,
      metadata,
    });
  }

  private async recordEvidence(
    workspaceId: string,
    ownerId: string,
    intent: string,
    ctx: MutationAuditContext | undefined,
  ) {
    try {
      await this.evidence.create({ intent, confidence: 1, ownerId, workspaceId }, ctx);
    } catch {
      // Evidence is governance-supporting; never block the primary mutation.
    }
  }

  private async loadProofSessionOrThrow(id: string, workspaceId: string) {
    const session = await this.prisma.proofSession.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!session) {
      throw new NotFoundException('Proof session not found');
    }
    return session;
  }

  private async loadStressCampaignOrThrow(id: string, workspaceId: string) {
    const campaign = await this.prisma.stressCampaign.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!campaign) {
      throw new NotFoundException('Stress campaign not found');
    }
    return campaign;
  }

  private overlaySignals(base: GateSignals, override?: GateSignalsDto): GateSignals {
    if (!override) {
      return base;
    }
    const out: GateSignals = { ...base };
    for (const [key, value] of Object.entries(override)) {
      if (value !== undefined && value !== null) {
        (out as Record<string, number>)[key] = Number(value);
      }
    }
    return out;
  }

  /**
   * Gather observed signals from the live constitutional domains. Violation
   * counts default to zero unless explicitly asserted via the override DTO —
   * a violation is a disproof supplied by the caller or a failure injection.
   */
  private async gatherSignals(
    workspaceId: string,
    override?: GateSignalsDto,
  ): Promise<GateSignals> {
    const [
      knowledgeObjects,
      memoryEntries,
      runtimeSessions,
      exchangeTransactions,
      capitalAllocations,
      measurements,
      governancePolicies,
      auditRecords,
      evidenceRecords,
    ] = await Promise.all([
      this.prisma.intelligenceObject.count({ where: { workspaceId } }),
      this.prisma.memoryEntry.count({ where: { workspaceId } }),
      this.prisma.runtimeSession.count({ where: { workspaceId } }),
      this.prisma.exchangeTransaction.count({ where: { workspaceId } }),
      this.prisma.capitalAllocation.count({ where: { workspaceId } }),
      this.prisma.measurementRecord.count({ where: { workspaceId } }),
      this.prisma.exchangePolicy.count({ where: { workspaceId } }),
      this.prisma.auditLog.count({ where: { workspaceId } }),
      this.prisma.evidenceRecord.count({ where: { workspaceId } }),
    ]);
    const base: GateSignals = {
      knowledgeObjects,
      knowledgeViolations: 0,
      memoryEntries,
      memoryViolations: 0,
      runtimeSessions,
      runtimeViolations: 0,
      exchangeTransactions,
      exchangeViolations: 0,
      capitalAllocations,
      capitalViolations: 0,
      measurements,
      measurementViolations: 0,
      governancePolicies,
      governanceViolations: 0,
      auditRecords,
      auditViolations: 0,
      evidenceRecords,
      evidenceViolations: 0,
      securityControls: auditRecords,
      securityViolations: 0,
    };
    return this.overlaySignals(base, override);
  }

  // ----------------------------------------------------------------------
  // Part A — proof sessions
  // ----------------------------------------------------------------------

  async createSession(
    workspaceId: string,
    userId: string,
    dto: CreateProofSessionDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!dto.name?.trim()) {
        throw new BadRequestException('name is required');
      }
      const ownerId = dto.ownerId?.trim() || userId;
      const created = await this.prisma.$transaction(async (tx) => {
        const session = await tx.proofSession.create({
          data: {
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            workspaceId,
            ownerId,
            state: 'OPEN',
            scope: dto.scope?.trim() || null,
            targetDomain: dto.targetDomain?.trim() || null,
            eventSeq: 1,
            metadata: jsonify(dto.metadata),
          },
        });
        await tx.proofHistory.create({
          data: {
            sessionId: session.id,
            workspaceId,
            eventType: 'PROOF_SESSION_CREATED',
            referenceId: session.id,
            notes: 'Proof session created',
            actorId: ownerId,
          },
        });
        return session;
      });

      await this.recordAudit(
        'PROOF_SESSION_CREATED',
        'ProofSession',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: created.id, name: created.name, state: created.state },
        true,
      );
      await this.recordEvidence(
        workspaceId,
        ownerId,
        `Proof session established: ${created.name}`,
        ctx,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'PROOF_SESSION_CREATED',
        'ProofSession',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async listSessions(workspaceId: string, query?: ProofListQueryDto) {
    const page = Math.max(1, Number(query?.page) || 1);
    const pageSize = Math.min(
      Math.max(1, Number(query?.pageSize) || DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const search = query?.search?.trim();
    const where: Prisma.ProofSessionWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query?.state && { state: query.state as Prisma.ProofSessionWhereInput['state'] }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.proofSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.proofSession.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getSession(id: string, workspaceId: string) {
    const session = await this.loadProofSessionOrThrow(id, workspaceId);
    const [scenarios, executions, certifications, findings] = await Promise.all([
      this.prisma.proofScenario.findMany({
        where: { sessionId: session.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.proofExecution.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.proofCertification.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'desc' },
        take: CERTIFICATION_GATES.length,
      }),
      this.prisma.proofFinding.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return { ...session, scenarios, executions, certifications, findings };
  }

  async updateSession(
    id: string,
    workspaceId: string,
    userId: string,
    dto: UpdateProofSessionDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadProofSessionOrThrow(id, workspaceId);
    try {
      const updated = await this.prisma.proofSession.update({
        where: { id: session.id },
        data: {
          name: dto.name?.trim() || undefined,
          description: dto.description?.trim() ?? undefined,
          metadata: dto.metadata ? jsonify(dto.metadata) : undefined,
        },
      });
      await this.recordAudit(
        'PROOF_SESSION_UPDATED',
        'ProofSession',
        session.id,
        ctx,
        workspaceId,
        userId,
        { name: session.name, description: session.description },
        { name: updated.name, description: updated.description },
        true,
      );
      return updated;
    } catch (error) {
      await this.recordAudit(
        'PROOF_SESSION_UPDATED',
        'ProofSession',
        session.id,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async removeSession(id: string, workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    const session = await this.loadProofSessionOrThrow(id, workspaceId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.proofSession.update({
        where: { id: session.id },
        data: { state: 'ARCHIVED', status: 'ARCHIVED', deletedAt: new Date() },
      });
      await tx.proofHistory.create({
        data: {
          sessionId: session.id,
          workspaceId,
          eventType: 'PROOF_SESSION_ARCHIVED',
          referenceId: session.id,
          notes: 'Proof session archived',
          actorId: userId,
        },
      });
      return result;
    });
    await this.recordAudit(
      'PROOF_SESSION_ARCHIVED',
      'ProofSession',
      session.id,
      ctx,
      workspaceId,
      userId,
      { state: session.state },
      { state: updated.state },
      true,
    );
    return { id: session.id, archived: true };
  }

  // ----------------------------------------------------------------------
  // Part F — proof scenarios
  // ----------------------------------------------------------------------

  async createScenario(
    sessionId: string,
    workspaceId: string,
    userId: string,
    dto: CreateProofScenarioDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadProofSessionOrThrow(sessionId, workspaceId);
    try {
      if (!dto.name?.trim()) {
        throw new BadRequestException('name is required');
      }
      const created = await this.prisma.$transaction(async (tx) => {
        const seq = session.scenarioSeq + 1;
        const scenario = await tx.proofScenario.create({
          data: {
            sessionId: session.id,
            workspaceId,
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            group: dto.group,
            gate: dto.gate ?? null,
            version: seq,
            definition: jsonify(dto.definition),
            expectation: jsonify(dto.expectation),
            repeatable: dto.repeatable ?? true,
            actorId: userId,
            metadata: jsonify(dto.metadata),
          },
        });
        await tx.proofSession.update({
          where: { id: session.id },
          data: { scenarioSeq: seq },
        });
        await tx.proofHistory.create({
          data: {
            sessionId: session.id,
            workspaceId,
            eventType: 'PROOF_SCENARIO_CREATED',
            referenceId: scenario.id,
            notes: `Scenario created: ${scenario.name}`,
            actorId: userId,
          },
        });
        return scenario;
      });
      await this.recordAudit(
        'PROOF_SCENARIO_CREATED',
        'ProofScenario',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: created.id, name: created.name, group: created.group },
        true,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'PROOF_SCENARIO_CREATED',
        'ProofScenario',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async listScenarios(sessionId: string, workspaceId: string) {
    await this.loadProofSessionOrThrow(sessionId, workspaceId);
    return this.prisma.proofScenario.findMany({
      where: { sessionId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ----------------------------------------------------------------------
  // Part C + G — run proof / certify
  // ----------------------------------------------------------------------

  private async persistGateArtifacts(
    tx: Prisma.TransactionClient,
    sessionId: string,
    executionId: string,
    workspaceId: string,
    userId: string,
    gateResults: GateResult[],
    evidenceType: string,
  ) {
    for (const gr of gateResults) {
      await tx.proofResult.create({
        data: {
          executionId,
          sessionId,
          workspaceId,
          gate: gr.gate,
          outcome: gr.outcome,
          score: gr.score,
          expected: 'no violations',
          actual: gr.detail,
          detail: gr.detail,
          actorId: userId,
          metadata: jsonify({ observed: gr.observed, violations: gr.violations }),
        },
      });
      await tx.proofEvidence.create({
        data: {
          sessionId,
          executionId,
          workspaceId,
          evidenceType,
          referenceId: gr.gate,
          referenceType: 'CertificationGate',
          summary: gr.detail,
          payload: jsonify({
            gate: gr.gate,
            outcome: gr.outcome,
            score: gr.score,
            constitutionalRefs: gr.constitutionalRefs,
          }),
          actorId: userId,
        },
      });
      if (gr.outcome !== 'PASS') {
        await tx.proofFinding.create({
          data: {
            sessionId,
            executionId,
            workspaceId,
            severity: severityForOutcome(gr.outcome),
            gate: gr.gate,
            title: `${gr.gate} gate ${gr.outcome}`,
            detail: gr.detail,
            recommendation: `Remediate ${gr.violations} violation(s) governing ${gr.gate}`,
            constitutionalRefs: jsonify(gr.constitutionalRefs),
            actorId: userId,
          },
        });
      }
    }
  }

  async runProof(
    sessionId: string,
    workspaceId: string,
    userId: string,
    dto: RunProofDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadProofSessionOrThrow(sessionId, workspaceId);
    try {
      const signals = await this.gatherSignals(workspaceId, dto.signals);
      const gateResults = dto.gate ? [evaluateGate(dto.gate, signals)] : evaluateAllGates(signals);
      const summary = aggregateCertification(gateResults);
      const startedAt = Date.now();
      const status: ProofExecutionStatus = summary.passed ? 'PASSED' : 'FAILED';

      const result = await this.prisma.$transaction(async (tx) => {
        const execution = await tx.proofExecution.create({
          data: {
            sessionId: session.id,
            scenarioId: dto.scenarioId ?? null,
            workspaceId,
            gate: dto.gate ?? null,
            status,
            outcome: summary.outcome,
            score: summary.score,
            durationMs: Date.now() - startedAt,
            detail: `Proof run: ${summary.gatesPassed}/${summary.gatesTotal} gates passed`,
            actorId: userId,
            completedAt: new Date(),
            metadata: jsonify(dto.metadata),
          },
        });
        await this.persistGateArtifacts(
          tx,
          session.id,
          execution.id,
          workspaceId,
          userId,
          gateResults,
          'GATE_RESULT',
        );
        await tx.proofHistory.create({
          data: {
            sessionId: session.id,
            executionId: execution.id,
            workspaceId,
            eventType: 'PROOF_RUN',
            referenceId: execution.id,
            notes: `Proof executed with outcome ${summary.outcome}`,
            actorId: userId,
          },
        });
        const updatedSession = await tx.proofSession.update({
          where: { id: session.id },
          data: { state: 'ACTIVE', eventSeq: session.eventSeq + 1 },
        });
        return { execution, session: updatedSession };
      });

      await this.recordAudit(
        'PROOF_RUN',
        'ProofExecution',
        result.execution.id,
        ctx,
        workspaceId,
        userId,
        null,
        { outcome: summary.outcome, score: summary.score, gate: dto.gate ?? 'ALL' },
        true,
      );
      await this.recordEvidence(
        workspaceId,
        session.ownerId,
        `Proof executed for session ${session.name}: ${summary.outcome}`,
        ctx,
      );
      return { execution: result.execution, results: gateResults, summary };
    } catch (error) {
      await this.recordAudit(
        'PROOF_RUN',
        'ProofExecution',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async certify(
    sessionId: string,
    workspaceId: string,
    userId: string,
    dto: CertifyProofDto,
    ctx?: MutationAuditContext,
  ) {
    const session = await this.loadProofSessionOrThrow(sessionId, workspaceId);
    try {
      const signals = await this.gatherSignals(workspaceId, dto.signals);
      const gateResults = evaluateAllGates(signals);
      const summary = aggregateCertification(gateResults);
      const startedAt = Date.now();
      const status: ProofExecutionStatus = summary.passed ? 'PASSED' : 'FAILED';

      const result = await this.prisma.$transaction(async (tx) => {
        const execution = await tx.proofExecution.create({
          data: {
            sessionId: session.id,
            workspaceId,
            status,
            outcome: summary.outcome,
            score: summary.score,
            durationMs: Date.now() - startedAt,
            detail: `Certification: ${summary.outcome}`,
            actorId: userId,
            completedAt: new Date(),
            metadata: jsonify(dto.metadata),
          },
        });
        await this.persistGateArtifacts(
          tx,
          session.id,
          execution.id,
          workspaceId,
          userId,
          gateResults,
          'CERTIFICATION_GATE',
        );
        const certifications = [];
        for (const gr of gateResults) {
          const cert = await tx.proofCertification.create({
            data: {
              sessionId: session.id,
              workspaceId,
              gate: gr.gate,
              outcome: gr.outcome,
              score: gr.score,
              summary: gr.detail,
              evidenceRef: execution.id,
              actorId: userId,
              metadata: jsonify({ constitutionalRefs: gr.constitutionalRefs }),
            },
          });
          certifications.push(cert);
        }
        await tx.proofHistory.create({
          data: {
            sessionId: session.id,
            executionId: execution.id,
            workspaceId,
            eventType: 'PROOF_CERTIFIED',
            referenceId: execution.id,
            notes: `Certification ${summary.outcome} (score ${summary.score})`,
            actorId: userId,
          },
        });
        const updatedSession = await tx.proofSession.update({
          where: { id: session.id },
          data: {
            state: summary.passed ? 'CERTIFIED' : 'FAILED',
            certificationOutcome: summary.outcome,
            certificationScore: summary.score,
            eventSeq: session.eventSeq + 1,
          },
        });
        return { execution, certifications, session: updatedSession };
      });

      await this.recordAudit(
        'PROOF_CERTIFIED',
        'ProofSession',
        session.id,
        ctx,
        workspaceId,
        userId,
        { state: session.state },
        {
          state: result.session.state,
          outcome: summary.outcome,
          score: summary.score,
        },
        true,
      );
      await this.recordEvidence(
        workspaceId,
        session.ownerId,
        `Proof session certified: ${session.name} → ${summary.outcome}`,
        ctx,
      );
      return {
        session: result.session,
        certifications: result.certifications,
        results: gateResults,
        summary,
      };
    } catch (error) {
      await this.recordAudit(
        'PROOF_CERTIFIED',
        'ProofSession',
        session.id,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  // ----------------------------------------------------------------------
  // Proof reporting endpoints
  // ----------------------------------------------------------------------

  async listFindings(sessionId: string, workspaceId: string, query?: StreamQueryDto) {
    await this.loadProofSessionOrThrow(sessionId, workspaceId);
    const take = Math.min(
      Math.max(1, Number(query?.limit) || DEFAULT_STREAM_LIMIT),
      MAX_STREAM_LIMIT,
    );
    return this.prisma.proofFinding.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async listCertifications(sessionId: string, workspaceId: string) {
    await this.loadProofSessionOrThrow(sessionId, workspaceId);
    return this.prisma.proofCertification.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async certificationReport(sessionId: string, workspaceId: string) {
    const session = await this.loadProofSessionOrThrow(sessionId, workspaceId);
    const certifications = await this.prisma.proofCertification.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
    const latestByGate = new Map<string, (typeof certifications)[number]>();
    for (const cert of certifications) {
      if (!latestByGate.has(cert.gate)) {
        latestByGate.set(cert.gate, cert);
      }
    }
    const gates = CERTIFICATION_GATES.map((gate) => {
      const cert = latestByGate.get(gate);
      return {
        gate,
        outcome: cert?.outcome ?? null,
        score: cert?.score ?? null,
        certified: Boolean(cert),
        certificationId: cert?.certificationId ?? null,
      };
    });
    const [findingsTotal, unresolvedFindings] = await Promise.all([
      this.prisma.proofFinding.count({ where: { sessionId } }),
      this.prisma.proofFinding.count({ where: { sessionId, resolved: false } }),
    ]);
    return {
      session: {
        id: session.id,
        proofSessionId: session.proofSessionId,
        name: session.name,
        state: session.state,
        certificationOutcome: session.certificationOutcome,
        certificationScore: session.certificationScore,
      },
      gates,
      gatesCertified: gates.filter((g) => g.certified).length,
      gatesTotal: CERTIFICATION_GATES.length,
      findingsTotal,
      unresolvedFindings,
    };
  }

  async listHistory(sessionId: string, workspaceId: string, query?: StreamQueryDto) {
    await this.loadProofSessionOrThrow(sessionId, workspaceId);
    const take = Math.min(
      Math.max(1, Number(query?.limit) || DEFAULT_STREAM_LIMIT),
      MAX_STREAM_LIMIT,
    );
    return this.prisma.proofHistory.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async listEvidence(sessionId: string, workspaceId: string, query?: StreamQueryDto) {
    await this.loadProofSessionOrThrow(sessionId, workspaceId);
    const take = Math.min(
      Math.max(1, Number(query?.limit) || DEFAULT_STREAM_LIMIT),
      MAX_STREAM_LIMIT,
    );
    return this.prisma.proofEvidence.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async getExecution(executionId: string, workspaceId: string) {
    const execution = await this.prisma.proofExecution.findFirst({
      where: { id: executionId, workspaceId },
      include: { results: true, findings: true, evidence: true },
    });
    if (!execution) {
      throw new NotFoundException('Proof execution not found');
    }
    return execution;
  }

  async proofDashboard(workspaceId: string) {
    const [sessions, certified, executions, findings, contradictions, certifications] =
      await Promise.all([
        this.prisma.proofSession.count({ where: { workspaceId, deletedAt: null } }),
        this.prisma.proofSession.count({
          where: { workspaceId, deletedAt: null, state: 'CERTIFIED' },
        }),
        this.prisma.proofExecution.count({ where: { workspaceId } }),
        this.prisma.proofFinding.groupBy({
          by: ['severity'],
          where: { workspaceId },
          _count: { _all: true },
        }),
        this.prisma.contradiction.count({ where: { workspaceId, resolved: false } }),
        this.prisma.proofCertification.groupBy({
          by: ['outcome'],
          where: { workspaceId },
          _count: { _all: true },
        }),
      ]);
    return {
      sessions,
      certifiedSessions: certified,
      executions,
      openContradictions: contradictions,
      findingsBySeverity: findings.map((f) => ({
        severity: f.severity,
        count: f._count._all,
      })),
      certificationsByOutcome: certifications.map((c) => ({
        outcome: c.outcome,
        count: c._count._all,
      })),
      gates: CERTIFICATION_GATES,
    };
  }

  // ----------------------------------------------------------------------
  // Part E — contradiction engine
  // ----------------------------------------------------------------------

  async detectContradictions(
    workspaceId: string,
    userId: string,
    dto: DetectContradictionsDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!dto.candidates?.length) {
        throw new BadRequestException('candidates are required');
      }
      const candidates: ContradictionCandidate[] = dto.candidates.map((c) => ({
        type: c.type,
        leftReferenceId: c.leftReferenceId ?? null,
        leftReferenceType: c.leftReferenceType ?? null,
        leftValue: c.leftValue,
        rightReferenceId: c.rightReferenceId ?? null,
        rightReferenceType: c.rightReferenceType ?? null,
        rightValue: c.rightValue,
      }));
      const detected = engineDetectContradictions(candidates);
      const persisted = await this.prisma.$transaction(async (tx) => {
        const rows = [];
        for (const d of detected) {
          const row = await tx.contradiction.create({
            data: {
              workspaceId,
              sessionId: dto.sessionId ?? null,
              type: d.type,
              severity: d.severity,
              impact: d.impact,
              recommendedAction: d.recommendedAction,
              constitutionalRefs: jsonify(d.constitutionalRefs),
              leftReferenceId: d.leftReferenceId,
              leftReferenceType: d.leftReferenceType,
              rightReferenceId: d.rightReferenceId,
              rightReferenceType: d.rightReferenceType,
              detail: d.detail,
              actorId: userId,
              metadata: jsonify(dto.metadata),
            },
          });
          rows.push(row);
        }
        return rows;
      });

      await this.recordAudit(
        'CONTRADICTIONS_DETECTED',
        'Contradiction',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        { evaluated: dto.candidates.length, detected: persisted.length },
        true,
      );
      await this.recordEvidence(
        workspaceId,
        userId,
        `Contradiction sweep: ${persisted.length}/${dto.candidates.length} contradictions detected`,
        ctx,
      );
      return {
        detected: persisted,
        count: persisted.length,
        evaluated: dto.candidates.length,
      };
    } catch (error) {
      await this.recordAudit(
        'CONTRADICTIONS_DETECTED',
        'Contradiction',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async listContradictions(workspaceId: string, query?: StreamQueryDto) {
    const take = Math.min(
      Math.max(1, Number(query?.limit) || DEFAULT_STREAM_LIMIT),
      MAX_STREAM_LIMIT,
    );
    return this.prisma.contradiction.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // ----------------------------------------------------------------------
  // Part B — stress campaigns
  // ----------------------------------------------------------------------

  async createCampaign(
    workspaceId: string,
    userId: string,
    dto: CreateStressCampaignDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!dto.name?.trim()) {
        throw new BadRequestException('name is required');
      }
      const ownerId = dto.ownerId?.trim() || userId;
      const created = await this.prisma.$transaction(async (tx) => {
        const campaign = await tx.stressCampaign.create({
          data: {
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            workspaceId,
            ownerId,
            state: 'OPEN',
            group: dto.group ?? null,
            targetDomain: dto.targetDomain?.trim() || null,
            eventSeq: 1,
            metadata: jsonify(dto.metadata),
          },
        });
        await tx.stressHistory.create({
          data: {
            campaignId: campaign.id,
            workspaceId,
            eventType: 'STRESS_CAMPAIGN_CREATED',
            referenceId: campaign.id,
            notes: 'Stress campaign created',
            actorId: ownerId,
          },
        });
        return campaign;
      });
      await this.recordAudit(
        'STRESS_CAMPAIGN_CREATED',
        'StressCampaign',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: created.id, name: created.name, state: created.state },
        true,
      );
      await this.recordEvidence(
        workspaceId,
        ownerId,
        `Stress campaign established: ${created.name}`,
        ctx,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'STRESS_CAMPAIGN_CREATED',
        'StressCampaign',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async listCampaigns(workspaceId: string, query?: ProofListQueryDto) {
    const page = Math.max(1, Number(query?.page) || 1);
    const pageSize = Math.min(
      Math.max(1, Number(query?.pageSize) || DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const search = query?.search?.trim();
    const where: Prisma.StressCampaignWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query?.state && { state: query.state as Prisma.StressCampaignWhereInput['state'] }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await Promise.all([
      this.prisma.stressCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stressCampaign.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getCampaign(id: string, workspaceId: string) {
    const campaign = await this.loadStressCampaignOrThrow(id, workspaceId);
    const [scenarios, executions, injections] = await Promise.all([
      this.prisma.stressScenario.findMany({
        where: { campaignId: campaign.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stressExecution.findMany({
        where: { campaignId: campaign.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.failureInjection.findMany({
        where: { campaignId: campaign.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    return { ...campaign, scenarios, executions, injections };
  }

  async removeCampaign(
    id: string,
    workspaceId: string,
    userId: string,
    ctx?: MutationAuditContext,
  ) {
    const campaign = await this.loadStressCampaignOrThrow(id, workspaceId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.stressCampaign.update({
        where: { id: campaign.id },
        data: { state: 'ARCHIVED', status: 'ARCHIVED', deletedAt: new Date() },
      });
      await tx.stressHistory.create({
        data: {
          campaignId: campaign.id,
          workspaceId,
          eventType: 'STRESS_CAMPAIGN_ARCHIVED',
          referenceId: campaign.id,
          notes: 'Stress campaign archived',
          actorId: userId,
        },
      });
      return result;
    });
    await this.recordAudit(
      'STRESS_CAMPAIGN_ARCHIVED',
      'StressCampaign',
      campaign.id,
      ctx,
      workspaceId,
      userId,
      { state: campaign.state },
      { state: updated.state },
      true,
    );
    return { id: campaign.id, archived: true };
  }

  async createStressScenario(
    campaignId: string,
    workspaceId: string,
    userId: string,
    dto: CreateStressScenarioDto,
    ctx?: MutationAuditContext,
  ) {
    const campaign = await this.loadStressCampaignOrThrow(campaignId, workspaceId);
    try {
      if (!dto.name?.trim()) {
        throw new BadRequestException('name is required');
      }
      const created = await this.prisma.$transaction(async (tx) => {
        const seq = campaign.scenarioSeq + 1;
        const scenario = await tx.stressScenario.create({
          data: {
            campaignId: campaign.id,
            workspaceId,
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
            group: dto.group,
            injectionType: dto.injectionType ?? null,
            version: seq,
            definition: jsonify(dto.definition),
            repeatable: dto.repeatable ?? true,
            actorId: userId,
            metadata: jsonify(dto.metadata),
          },
        });
        await tx.stressCampaign.update({
          where: { id: campaign.id },
          data: { scenarioSeq: seq },
        });
        await tx.stressHistory.create({
          data: {
            campaignId: campaign.id,
            workspaceId,
            eventType: 'STRESS_SCENARIO_CREATED',
            referenceId: scenario.id,
            notes: `Scenario created: ${scenario.name}`,
            actorId: userId,
          },
        });
        return scenario;
      });
      await this.recordAudit(
        'STRESS_SCENARIO_CREATED',
        'StressScenario',
        created.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: created.id, name: created.name, group: created.group },
        true,
      );
      return created;
    } catch (error) {
      await this.recordAudit(
        'STRESS_SCENARIO_CREATED',
        'StressScenario',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async listStressScenarios(campaignId: string, workspaceId: string) {
    await this.loadStressCampaignOrThrow(campaignId, workspaceId);
    return this.prisma.stressScenario.findMany({
      where: { campaignId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ----------------------------------------------------------------------
  // Part D — run stress / inject failure
  // ----------------------------------------------------------------------

  private recoveryStatusFor(result: InjectionResult): 'RECOVERED' | 'PARTIAL' | 'FAILED' {
    if (result.recovered) {
      return 'RECOVERED';
    }
    if (result.contained) {
      return 'PARTIAL';
    }
    return 'FAILED';
  }

  private injectionScore(result: InjectionResult): number {
    if (result.recovered) {
      return 1;
    }
    if (result.contained) {
      return 0.5;
    }
    if (result.detected) {
      return 0.25;
    }
    return 0;
  }

  async runStress(
    campaignId: string,
    workspaceId: string,
    userId: string,
    dto: RunStressDto,
    ctx?: MutationAuditContext,
  ) {
    const campaign = await this.loadStressCampaignOrThrow(campaignId, workspaceId);
    try {
      const specs: InjectFailureDto[] = dto.injections?.length
        ? dto.injections
        : FAILURE_INJECTION_TYPES.map((injectionType) => ({ injectionType }));
      const runs = specs.map((spec) => ({
        spec,
        result: simulateInjection(spec.injectionType, spec.defenses ?? {}),
      }));
      const results = runs.map((r) => r.result);
      const resilience = computeResilienceScore(results);
      const outcome = stressOutcome(results);
      const recoveredCount = results.filter((r) => r.recovered).length;
      const startedAt = Date.now();
      const status: StressExecutionStatus = meetsResilienceThreshold(resilience)
        ? 'PASSED'
        : outcome === 'CRITICAL'
          ? 'FAILED'
          : 'DEGRADED';

      const persisted = await this.prisma.$transaction(async (tx) => {
        const execution = await tx.stressExecution.create({
          data: {
            campaignId: campaign.id,
            scenarioId: dto.scenarioId ?? null,
            workspaceId,
            status,
            outcome,
            resilienceScore: resilience,
            injectionsCount: results.length,
            recoveredCount,
            durationMs: Date.now() - startedAt,
            detail: `Stress run: ${recoveredCount}/${results.length} recovered`,
            actorId: userId,
            completedAt: new Date(),
            metadata: jsonify(dto.metadata),
          },
        });
        for (const { spec, result } of runs) {
          const injection = await tx.failureInjection.create({
            data: {
              executionId: execution.id,
              campaignId: campaign.id,
              workspaceId,
              injectionType: result.injectionType,
              status: result.status,
              targetReferenceId: spec.targetReferenceId ?? null,
              targetReferenceType: spec.targetReferenceType ?? null,
              detected: result.detected,
              contained: result.contained,
              recovered: result.recovered,
              detail: result.detail,
              actorId: userId,
              resolvedAt: new Date(),
            },
          });
          await tx.recoveryEvidence.create({
            data: {
              executionId: execution.id,
              injectionId: injection.id,
              campaignId: campaign.id,
              workspaceId,
              status: this.recoveryStatusFor(result),
              strategy: `${result.gate} recovery`,
              detail: result.detail,
              actorId: userId,
            },
          });
          await tx.stressResult.create({
            data: {
              executionId: execution.id,
              campaignId: campaign.id,
              workspaceId,
              dimension: result.gate,
              outcome: result.outcome,
              score: this.injectionScore(result),
              detail: result.detail,
              actorId: userId,
            },
          });
          await tx.stressEvidence.create({
            data: {
              campaignId: campaign.id,
              executionId: execution.id,
              workspaceId,
              evidenceType: 'INJECTION_RESULT',
              referenceId: injection.id,
              referenceType: 'FailureInjection',
              summary: result.detail,
              payload: jsonify({
                injectionType: result.injectionType,
                status: result.status,
                outcome: result.outcome,
              }),
              actorId: userId,
            },
          });
        }
        await tx.stressHistory.create({
          data: {
            campaignId: campaign.id,
            executionId: execution.id,
            workspaceId,
            eventType: 'STRESS_RUN',
            referenceId: execution.id,
            notes: `Stress executed: resilience ${resilience}`,
            actorId: userId,
          },
        });
        const updatedCampaign = await tx.stressCampaign.update({
          where: { id: campaign.id },
          data: {
            state: status === 'PASSED' ? 'COMPLETED' : status === 'FAILED' ? 'FAILED' : 'RUNNING',
            resilienceScore: resilience,
            eventSeq: campaign.eventSeq + 1,
          },
        });
        return { execution, campaign: updatedCampaign };
      });

      await this.recordAudit(
        'STRESS_RUN',
        'StressExecution',
        persisted.execution.id,
        ctx,
        workspaceId,
        userId,
        null,
        { outcome, resilienceScore: resilience, injections: results.length },
        true,
      );
      await this.recordEvidence(
        workspaceId,
        campaign.ownerId,
        `Stress executed for campaign ${campaign.name}: resilience ${resilience}`,
        ctx,
      );
      return {
        execution: persisted.execution,
        results,
        resilienceScore: resilience,
        outcome,
        recoveredCount,
      };
    } catch (error) {
      await this.recordAudit(
        'STRESS_RUN',
        'StressExecution',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async injectFailure(
    campaignId: string,
    workspaceId: string,
    userId: string,
    dto: InjectFailureDto,
    ctx?: MutationAuditContext,
  ) {
    const campaign = await this.loadStressCampaignOrThrow(campaignId, workspaceId);
    try {
      const result = simulateInjection(dto.injectionType, dto.defenses ?? {});
      const status: StressExecutionStatus = result.recovered
        ? 'PASSED'
        : result.contained
          ? 'DEGRADED'
          : 'FAILED';
      const persisted = await this.prisma.$transaction(async (tx) => {
        const execution = await tx.stressExecution.create({
          data: {
            campaignId: campaign.id,
            workspaceId,
            status,
            outcome: result.outcome,
            resilienceScore: this.injectionScore(result),
            injectionsCount: 1,
            recoveredCount: result.recovered ? 1 : 0,
            detail: `Single injection: ${result.injectionType}`,
            actorId: userId,
            completedAt: new Date(),
            metadata: jsonify(dto.metadata),
          },
        });
        const injection = await tx.failureInjection.create({
          data: {
            executionId: execution.id,
            campaignId: campaign.id,
            workspaceId,
            injectionType: result.injectionType,
            status: result.status,
            targetReferenceId: dto.targetReferenceId ?? null,
            targetReferenceType: dto.targetReferenceType ?? null,
            detected: result.detected,
            contained: result.contained,
            recovered: result.recovered,
            detail: result.detail,
            actorId: userId,
            resolvedAt: new Date(),
          },
        });
        const recovery = await tx.recoveryEvidence.create({
          data: {
            executionId: execution.id,
            injectionId: injection.id,
            campaignId: campaign.id,
            workspaceId,
            status: this.recoveryStatusFor(result),
            strategy: `${result.gate} recovery`,
            detail: result.detail,
            actorId: userId,
          },
        });
        await tx.stressResult.create({
          data: {
            executionId: execution.id,
            campaignId: campaign.id,
            workspaceId,
            dimension: result.gate,
            outcome: result.outcome,
            score: this.injectionScore(result),
            detail: result.detail,
            actorId: userId,
          },
        });
        await tx.stressEvidence.create({
          data: {
            campaignId: campaign.id,
            executionId: execution.id,
            workspaceId,
            evidenceType: 'FAILURE_INJECTION',
            referenceId: injection.id,
            referenceType: 'FailureInjection',
            summary: result.detail,
            payload: jsonify({
              injectionType: result.injectionType,
              status: result.status,
              outcome: result.outcome,
            }),
            actorId: userId,
          },
        });
        await tx.stressHistory.create({
          data: {
            campaignId: campaign.id,
            executionId: execution.id,
            workspaceId,
            eventType: 'FAILURE_INJECTED',
            referenceId: injection.id,
            notes: `Injected ${result.injectionType} → ${result.status}`,
            actorId: userId,
          },
        });
        await tx.stressCampaign.update({
          where: { id: campaign.id },
          data: { eventSeq: campaign.eventSeq + 1 },
        });
        return { execution, injection, recovery };
      });

      await this.recordAudit(
        'FAILURE_INJECTED',
        'FailureInjection',
        persisted.injection.id,
        ctx,
        workspaceId,
        userId,
        null,
        {
          injectionType: result.injectionType,
          status: result.status,
          outcome: result.outcome,
        },
        true,
      );
      await this.recordEvidence(
        workspaceId,
        campaign.ownerId,
        `Failure injected into ${campaign.name}: ${result.injectionType} → ${result.status}`,
        ctx,
      );
      return {
        injection: persisted.injection,
        execution: persisted.execution,
        recovery: persisted.recovery,
        result,
      };
    } catch (error) {
      await this.recordAudit(
        'FAILURE_INJECTED',
        'FailureInjection',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String((error as Error)?.message ?? error) },
      );
      throw error;
    }
  }

  async listStressHistory(campaignId: string, workspaceId: string, query?: StreamQueryDto) {
    await this.loadStressCampaignOrThrow(campaignId, workspaceId);
    const take = Math.min(
      Math.max(1, Number(query?.limit) || DEFAULT_STREAM_LIMIT),
      MAX_STREAM_LIMIT,
    );
    return this.prisma.stressHistory.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async listStressEvidence(campaignId: string, workspaceId: string, query?: StreamQueryDto) {
    await this.loadStressCampaignOrThrow(campaignId, workspaceId);
    const take = Math.min(
      Math.max(1, Number(query?.limit) || DEFAULT_STREAM_LIMIT),
      MAX_STREAM_LIMIT,
    );
    return this.prisma.stressEvidence.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async stressDashboard(workspaceId: string) {
    const [campaigns, completed, executions, injections, recoveries, agg] = await Promise.all([
      this.prisma.stressCampaign.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.stressCampaign.count({
        where: { workspaceId, deletedAt: null, state: 'COMPLETED' },
      }),
      this.prisma.stressExecution.count({ where: { workspaceId } }),
      this.prisma.failureInjection.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.recoveryEvidence.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.stressCampaign.aggregate({
        where: { workspaceId, deletedAt: null },
        _avg: { resilienceScore: true },
      }),
    ]);
    return {
      campaigns,
      completedCampaigns: completed,
      executions,
      injectionsByStatus: injections.map((i) => ({ status: i.status, count: i._count._all })),
      recoveriesByStatus: recoveries.map((r) => ({ status: r.status, count: r._count._all })),
      averageResilience: agg._avg.resilienceScore ?? 0,
      injectionTypes: FAILURE_INJECTION_TYPES,
    };
  }
}
