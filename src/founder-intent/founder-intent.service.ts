import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { CapitalService } from '../capital/capital.service';
import { WorkspaceService } from '../workspace/workspace.service';
import {
  FounderIntentCompileDto,
  FounderIntentHistoryQueryDto,
  FounderIntentSimulateDto,
  FounderIntentValidateDto,
  IntentPriorityDto,
} from './dto/founder-intent.dto';

type MutationAuditContext = {
  actorId: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

type ValidationIssue = {
  code: string;
  message: string;
  field: string;
  severity: 'ERROR' | 'WARNING';
};

type PlatformSnapshot = {
  projects: Array<{ id: string }>;
  agents: Array<{ id: string }>;
  memories: Array<{ id: string }>;
  sources: Array<{ id: string }>;
  evaluations: Array<{ id: string }>;
  capitalSummary: {
    allocationCount: number;
  };
};

type CompiledFounderIntent = {
  id: string;
  workspaceId: string;
  normalizedIntent: Record<string, unknown>;
  executionDirectives: Array<Record<string, unknown>>;
  affectedWorkspaces: string[];
  affectedProjects: string[];
  requiredAgents: string[];
  requiredMemories: string[];
  requiredSources: string[];
  evaluationRequirements: string[];
  executionGraph: Record<string, unknown>;
  confidenceScore: number;
  createdAt: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const FOUNDER_INTENT_RETENTION_DAYS = 365;

@Injectable()
export class FounderIntentService {
  private readonly memoryFallback = new Map<string, CompiledFounderIntent>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workspaceService: WorkspaceService,
    private readonly capitalService: CapitalService,
  ) {}

  private canUseDatabase() {
    return typeof this.prisma.isConnected !== 'function' || this.prisma.isConnected();
  }

  private normalizeStringArray(values: string[] = []) {
    return Array.from(
      new Set(
        values
          .filter((value) => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
  }

  private normalizePriorities(priorities: IntentPriorityDto[] = []) {
    return priorities
      .map((priority) => ({
        area: priority.area.trim(),
        weight: Number(priority.weight),
        rationale: priority.rationale?.trim(),
      }))
      .filter((priority) => priority.area.length > 0)
      .sort((left, right) => right.weight - left.weight);
  }

  private normalizeInput(
    payload: FounderIntentCompileDto | FounderIntentValidateDto | FounderIntentSimulateDto,
  ) {
    return {
      objective: payload.objective.trim(),
      constraints: this.normalizeStringArray(payload.constraints),
      priorities: this.normalizePriorities(payload.priorities),
      strategicContext: this.normalizeStringArray(payload.strategicContext),
      governanceContext: this.normalizeStringArray(payload.governanceContext),
      workspaceId: payload.workspaceId,
    };
  }

  private assertWorkspaceScope(authWorkspaceId: string, payloadWorkspaceId: string) {
    if (authWorkspaceId !== payloadWorkspaceId) {
      throw new ForbiddenException('workspaceId must match authenticated workspace scope');
    }
  }

  private async fetchPlatformSnapshot(
    workspaceId: string,
    actorId: string,
  ): Promise<PlatformSnapshot> {
    const [projects, agents, memories, sources, evaluations, capitalSummary] = await Promise.all([
      this.workspaceService.listProjects(workspaceId, {
        page: 1,
        pageSize: 25,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
      this.workspaceService.listAgents(workspaceId, {
        page: 1,
        pageSize: 25,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
      this.workspaceService.listMemory(workspaceId, actorId, {
        page: 1,
        pageSize: 25,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
      this.workspaceService.listSources(workspaceId, {
        page: 1,
        pageSize: 25,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
      this.workspaceService.listEvaluations(workspaceId, {
        page: 1,
        pageSize: 25,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      }),
      this.capitalService.getReports(workspaceId),
    ]);

    return {
      projects: Array.isArray(projects) ? projects : [],
      agents: Array.isArray(agents) ? agents : [],
      memories: Array.isArray(memories) ? memories : [],
      sources: Array.isArray(sources) ? sources : [],
      evaluations: Array.isArray(evaluations) ? evaluations : [],
      capitalSummary: {
        allocationCount: Number((capitalSummary as any)?.allocationCount ?? 0),
      },
    };
  }

  private extractConstraintSubject(constraint: string) {
    const normalized = constraint
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .trim();
    const withoutModality = normalized
      .replace(/^must\s+not\s+/i, '')
      .replace(/^must\s+/i, '')
      .trim();
    return withoutModality.replace(/\s+/g, ' ');
  }

  private buildValidation(
    normalized: ReturnType<FounderIntentService['normalizeInput']>,
    snapshot: PlatformSnapshot,
  ) {
    const errors: ValidationIssue[] = [];
    const warnings: ValidationIssue[] = [];

    if (!normalized.objective) {
      errors.push({
        code: 'MISSING_OBJECTIVE',
        message: 'Objective is required.',
        field: 'objective',
        severity: 'ERROR',
      });
    }

    const mustSet = new Set<string>();
    const mustNotSet = new Set<string>();
    for (const constraint of normalized.constraints) {
      const subject = this.extractConstraintSubject(constraint);
      if (!subject) {
        continue;
      }
      if (constraint.toLowerCase().includes('must not')) {
        mustNotSet.add(subject);
      } else if (constraint.toLowerCase().startsWith('must')) {
        mustSet.add(subject);
      }
    }

    const contradictorySubjects = Array.from(mustSet).filter((subject) => mustNotSet.has(subject));
    for (const subject of contradictorySubjects) {
      errors.push({
        code: 'CONTRADICTORY_CONSTRAINT',
        message: `Constraint subject is both required and prohibited: ${subject}`,
        field: 'constraints',
        severity: 'ERROR',
      });
    }

    const priorityMap = new Map<string, number>();
    for (const priority of normalized.priorities) {
      const key = priority.area.toLowerCase();
      if (priorityMap.has(key) && priorityMap.get(key) !== priority.weight) {
        errors.push({
          code: 'CONFLICTING_PRIORITIES',
          message: `Priority area has conflicting weights: ${priority.area}`,
          field: 'priorities',
          severity: 'ERROR',
        });
      }
      priorityMap.set(key, priority.weight);
    }

    if (normalized.priorities.length === 0) {
      warnings.push({
        code: 'MISSING_PRIORITIES',
        message: 'No priorities were provided; directive quality may degrade.',
        field: 'priorities',
        severity: 'WARNING',
      });
    }

    if (snapshot.agents.length === 0) {
      warnings.push({
        code: 'MISSING_AGENTS',
        message: 'No active agents available in workspace for planned execution.',
        field: 'dependencies',
        severity: 'WARNING',
      });
    }

    if (snapshot.memories.length === 0 && snapshot.sources.length === 0) {
      warnings.push({
        code: 'MISSING_KNOWLEDGE_DEPENDENCIES',
        message: 'Knowledge dependencies are limited (no memory and no sources detected).',
        field: 'dependencies',
        severity: 'WARNING',
      });
    }

    if (
      normalized.objective &&
      normalized.priorities.length > 0 &&
      snapshot.projects.length === 0 &&
      snapshot.agents.length === 0
    ) {
      errors.push({
        code: 'IMPOSSIBLE_EXECUTION_GRAPH',
        message: 'Execution graph cannot be realized without projects or agents.',
        field: 'executionGraph',
        severity: 'ERROR',
      });
    }

    if (snapshot.capitalSummary.allocationCount === 0) {
      warnings.push({
        code: 'MISSING_CAPITAL_DEPENDENCY',
        message: 'No capital allocation records detected for the workspace.',
        field: 'dependencies',
        severity: 'WARNING',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      dependencies: {
        projects: snapshot.projects.length,
        agents: snapshot.agents.length,
        memories: snapshot.memories.length,
        sources: snapshot.sources.length,
        evaluations: snapshot.evaluations.length,
        capitalAllocations: snapshot.capitalSummary.allocationCount,
      },
    };
  }

  private buildExecutionDirectives(
    normalized: ReturnType<FounderIntentService['normalizeInput']>,
    snapshot: PlatformSnapshot,
  ) {
    if (normalized.priorities.length === 0) {
      return [
        {
          directive: 'Establish baseline execution lane',
          objective: normalized.objective,
          priorityWeight: 50,
          requiredAgentCount: Math.max(snapshot.agents.length, 1),
        },
      ];
    }

    return normalized.priorities.map((priority, index) => ({
      directive: `Execute ${priority.area} workstream`,
      order: index + 1,
      priorityWeight: priority.weight,
      rationale: priority.rationale ?? 'Derived from founder intent priorities.',
      requiredAgentCount: Math.max(
        1,
        Math.min(snapshot.agents.length, Math.ceil(priority.weight / 30)),
      ),
    }));
  }

  private buildExecutionGraph(
    normalized: ReturnType<FounderIntentService['normalizeInput']>,
    directives: Array<Record<string, unknown>>,
    snapshot: PlatformSnapshot,
  ) {
    return {
      nodes: [
        { stage: 'Founder Intent', value: normalized.objective },
        {
          stage: 'Strategic Objective',
          value:
            normalized.strategicContext.join(' | ') || 'Strategic context inferred from objective',
        },
        { stage: 'Execution Tasks', value: directives.map((directive) => directive.directive) },
        { stage: 'Required Agents', value: snapshot.agents.map((agent) => agent.id).slice(0, 10) },
        {
          stage: 'Required Knowledge',
          value: {
            memories: snapshot.memories.map((memory) => memory.id).slice(0, 10),
            sources: snapshot.sources.map((source) => source.id).slice(0, 10),
          },
        },
        {
          stage: 'Required Capital',
          value: { allocationCount: snapshot.capitalSummary.allocationCount },
        },
        {
          stage: 'Expected Outcomes',
          value: normalized.priorities.map((priority) => `${priority.area} improved`),
        },
        {
          stage: 'Success Criteria',
          value: [
            'Directive sequence is dependency-complete',
            'Workspace scope and governance constraints preserved',
            'Evaluation checkpoints are explicitly defined',
          ],
        },
      ],
      edges: [
        ['Founder Intent', 'Strategic Objective'],
        ['Strategic Objective', 'Execution Tasks'],
        ['Execution Tasks', 'Required Agents'],
        ['Required Agents', 'Required Knowledge'],
        ['Required Knowledge', 'Required Capital'],
        ['Required Capital', 'Expected Outcomes'],
        ['Expected Outcomes', 'Success Criteria'],
      ],
    };
  }

  private calculateConfidenceScore(validation: {
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    dependencies: {
      projects: number;
      agents: number;
      memories: number;
      sources: number;
      evaluations: number;
      capitalAllocations: number;
    };
  }) {
    const dependencySignals =
      Number(validation.dependencies.projects > 0) +
      Number(validation.dependencies.agents > 0) +
      Number(validation.dependencies.memories > 0) +
      Number(validation.dependencies.sources > 0) +
      Number(validation.dependencies.evaluations > 0) +
      Number(validation.dependencies.capitalAllocations > 0);

    const score =
      0.65 +
      dependencySignals * 0.05 -
      validation.errors.length * 0.2 -
      validation.warnings.length * 0.05;

    return Math.max(0, Math.min(1, Number(score.toFixed(2))));
  }

  private async logFailure(
    action: string,
    workspaceId: string,
    context: MutationAuditContext,
    error: unknown,
    metadata?: Record<string, unknown>,
  ) {
    await this.audit.log({
      actorId: context.actorId,
      action,
      resourceType: 'FounderIntent',
      workspaceId,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent,
      status: 'FAILED',
      success: false,
      metadata: {
        ...(metadata ?? {}),
        error: String((error as any)?.message ?? error),
      },
    });
  }

  async compile(
    workspaceId: string,
    actorId: string,
    payload: FounderIntentCompileDto,
    context: MutationAuditContext,
  ) {
    this.assertWorkspaceScope(workspaceId, payload.workspaceId);

    const normalized = this.normalizeInput(payload);

    try {
      const snapshot = await this.fetchPlatformSnapshot(workspaceId, actorId);
      const validation = this.buildValidation(normalized, snapshot);

      if (!validation.valid) {
        throw new BadRequestException({
          message: 'Founder intent compilation failed validation',
          validation,
        });
      }

      const directives = this.buildExecutionDirectives(normalized, snapshot);
      const executionGraph = this.buildExecutionGraph(normalized, directives, snapshot);
      const confidenceScore = this.calculateConfidenceScore(validation);

      const compiled: CompiledFounderIntent = {
        id: '',
        workspaceId,
        normalizedIntent: normalized,
        executionDirectives: directives,
        affectedWorkspaces: [workspaceId],
        affectedProjects: snapshot.projects.map((item) => item.id),
        requiredAgents: snapshot.agents.map((item) => item.id),
        requiredMemories: snapshot.memories.map((item) => item.id),
        requiredSources: snapshot.sources.map((item) => item.id),
        evaluationRequirements: [
          'Dependency order validated before execution',
          'Workspace isolation enforced for all tasks',
          ...normalized.governanceContext.map((contextItem) => `Governance: ${contextItem}`),
        ],
        executionGraph,
        confidenceScore,
        createdAt: new Date().toISOString(),
      };

      if (this.canUseDatabase()) {
        const created = await this.prisma.memoryEntry.create({
          data: {
            title: `Founder Intent: ${normalized.objective.slice(0, 80)}`,
            content: JSON.stringify(compiled),
            category: 'FOUNDER_INTENT',
            classification: 'INSTITUTIONAL',
            accessScope: 'WORKSPACE',
            lifecycleStatus: 'ACTIVE',
            retentionDays: FOUNDER_INTENT_RETENTION_DAYS,
            expiresAt: new Date(Date.now() + FOUNDER_INTENT_RETENTION_DAYS * 24 * 60 * 60 * 1000),
            tags: ['founder-intent', 'compile'],
            workspaceId,
            ownerId: actorId,
          },
        });
        compiled.id = created.id;
        compiled.createdAt = created.createdAt.toISOString();
      } else {
        const id = crypto.randomUUID();
        compiled.id = id;
        this.memoryFallback.set(id, compiled);
      }

      await this.audit.log({
        actorId,
        action: 'FOUNDER_INTENT_COMPILED',
        resourceType: 'FounderIntent',
        resourceId: compiled.id,
        workspaceId,
        before: null,
        after: {
          objective: normalized.objective,
          confidenceScore: compiled.confidenceScore,
          directiveCount: compiled.executionDirectives.length,
        },
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return compiled;
    } catch (error) {
      await this.logFailure('FOUNDER_INTENT_COMPILED', workspaceId, context, error, {
        objective: normalized.objective,
      });
      throw error;
    }
  }

  async validate(
    workspaceId: string,
    actorId: string,
    payload: FounderIntentValidateDto,
    context: MutationAuditContext,
  ) {
    this.assertWorkspaceScope(workspaceId, payload.workspaceId);
    const normalized = this.normalizeInput(payload);

    try {
      const snapshot = await this.fetchPlatformSnapshot(workspaceId, actorId);
      const validation = this.buildValidation(normalized, snapshot);

      await this.audit.log({
        actorId,
        action: 'FOUNDER_INTENT_VALIDATED',
        resourceType: 'FounderIntent',
        workspaceId,
        before: null,
        after: {
          valid: validation.valid,
          errorCount: validation.errors.length,
          warningCount: validation.warnings.length,
        },
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return {
        workspaceId,
        ...validation,
      };
    } catch (error) {
      await this.logFailure('FOUNDER_INTENT_VALIDATED', workspaceId, context, error, {
        objective: normalized.objective,
      });
      throw error;
    }
  }

  async simulate(
    workspaceId: string,
    actorId: string,
    payload: FounderIntentSimulateDto,
    context: MutationAuditContext,
  ) {
    this.assertWorkspaceScope(workspaceId, payload.workspaceId);
    const normalized = this.normalizeInput(payload);

    try {
      const snapshot = await this.fetchPlatformSnapshot(workspaceId, actorId);
      const validation = this.buildValidation(normalized, snapshot);
      const directives = this.buildExecutionDirectives(normalized, snapshot);
      const executionGraph = this.buildExecutionGraph(normalized, directives, snapshot);

      const dependencyOrder = [
        'strategic objective normalization',
        'project and agent assignment',
        'knowledge dependency validation',
        'capital readiness check',
        'execution launch gating',
      ];

      const risks = [
        ...validation.errors.map((errorItem) => `${errorItem.code}: ${errorItem.message}`),
        ...validation.warnings.map((warningItem) => `${warningItem.code}: ${warningItem.message}`),
      ];

      const simulation = {
        workspaceId,
        executionSequence: executionGraph.nodes.map((node: any, index: number) => ({
          stage: index + 1,
          name: node.stage,
          payload: node.value,
        })),
        dependencyOrder,
        estimatedExecutionStages: [
          'Stage 1: Intent normalization',
          'Stage 2: Dependency reconciliation',
          'Stage 3: Agent and knowledge routing',
          'Stage 4: Capital and governance checks',
          'Stage 5: Execution handoff',
        ],
        affectedModules: [
          'workspace',
          'capital',
          'provider',
          'tool',
          'intelligence',
          'evidence',
          'sovereignty',
        ],
        executionRisks: risks.length > 0 ? risks : ['No critical execution risks detected.'],
      };

      await this.audit.log({
        actorId,
        action: 'FOUNDER_INTENT_SIMULATED',
        resourceType: 'FounderIntent',
        workspaceId,
        before: null,
        after: {
          stageCount: simulation.executionSequence.length,
          riskCount: simulation.executionRisks.length,
          directiveCount: directives.length,
        },
        requestId: context.requestId,
        ip: context.ip,
        userAgent: context.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return simulation;
    } catch (error) {
      await this.logFailure('FOUNDER_INTENT_SIMULATED', workspaceId, context, error, {
        objective: normalized.objective,
      });
      throw error;
    }
  }

  async history(workspaceId: string, actorId: string, query?: FounderIntentHistoryQueryDto) {
    const page = Number(query?.page ?? 1);
    const pageSize = Math.min(Number(query?.pageSize ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const sortOrder = query?.sortOrder === 'asc' ? 'asc' : 'desc';
    const skip = (page - 1) * pageSize;

    if (this.canUseDatabase()) {
      const entries = await this.prisma.memoryEntry.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          category: 'FOUNDER_INTENT',
          AND: [{ OR: [{ accessScope: 'WORKSPACE' }, { ownerId: actorId }] }],
        },
        orderBy: { createdAt: sortOrder },
        skip,
        take: pageSize,
      });

      return entries.map((entry) => {
        let parsed: any = {};
        try {
          parsed = JSON.parse(entry.content);
        } catch {
          parsed = {};
        }

        return {
          id: entry.id,
          objective: parsed?.normalizedIntent?.objective ?? entry.title,
          confidenceScore: Number(parsed?.confidenceScore ?? 0),
          createdAt: entry.createdAt.toISOString(),
        };
      });
    }

    const all = Array.from(this.memoryFallback.values())
      .filter((entry) => entry.workspaceId === workspaceId)
      .sort((left, right) =>
        sortOrder === 'asc'
          ? new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
          : new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      );

    return all.slice(skip, skip + pageSize).map((entry) => ({
      id: entry.id,
      objective: String(entry.normalizedIntent.objective || ''),
      confidenceScore: entry.confidenceScore,
      createdAt: entry.createdAt,
    }));
  }

  async getById(workspaceId: string, actorId: string, id: string) {
    if (this.canUseDatabase()) {
      const entry = await this.prisma.memoryEntry.findFirst({
        where: {
          id,
          workspaceId,
          deletedAt: null,
          category: 'FOUNDER_INTENT',
          AND: [{ OR: [{ accessScope: 'WORKSPACE' }, { ownerId: actorId }] }],
        },
      });

      if (!entry) {
        throw new NotFoundException('Founder intent record not found');
      }

      try {
        const parsed = JSON.parse(entry.content);
        return {
          ...parsed,
          id: entry.id,
          workspaceId,
          createdAt: entry.createdAt.toISOString(),
        };
      } catch {
        throw new BadRequestException('Founder intent payload could not be parsed');
      }
    }

    const fallback = this.memoryFallback.get(id);
    if (!fallback || fallback.workspaceId !== workspaceId) {
      throw new NotFoundException('Founder intent record not found');
    }
    return fallback;
  }
}
