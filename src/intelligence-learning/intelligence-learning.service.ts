import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CapitalizationStatus,
  EvolutionType,
  LearningEventType,
  LearningStateType,
  PatternType,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import {
  isValidLearningTransition,
  LEARNING_TRANSITIONS,
  meetsCapitalizationConditions,
} from './intelligence-learning.constants';
import {
  CapitalizeLearningDto,
  CreateLearningDto,
  LearningListQueryDto,
  LearningTransitionDto,
  PatternListQueryDto,
  RecordEvolutionDto,
  RegisterPatternDto,
  ReinforceLearningDto,
  UpdateLearningDto,
} from './dto/intelligence-learning.dto';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class IntelligenceLearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertScore(value: number | undefined, field: string) {
    if (value === undefined) {
      return;
    }
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
      throw new BadRequestException(`${field} must be a number between 0 and 1`);
    }
  }

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

  // ----------------------------------------------------------------------
  // Learning States
  // ----------------------------------------------------------------------

  async createLearning(
    workspaceId: string,
    userId: string,
    dto: CreateLearningDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!dto.title?.trim()) {
        throw new BadRequestException('title is required');
      }
      this.assertScore(dto.confidence, 'confidence');

      const learning = await this.prisma.$transaction(async (tx) => {
        const created = await tx.learningState.create({
          data: {
            title: dto.title,
            summary: dto.summary,
            objectId: dto.objectId,
            state: LearningStateType.OBSERVED,
            confidence: dto.confidence ?? 0.5,
            metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
            workspaceId,
            createdById: userId,
          },
        });
        await tx.learningEvent.create({
          data: {
            learningId: created.id,
            eventType: LearningEventType.OBSERVATION,
            fromState: null,
            toState: LearningStateType.OBSERVED,
            actorId: userId,
            workspaceId,
            notes: 'Learning observed',
          },
        });
        return created;
      });

      await this.recordAudit(
        'LEARNING_STATE_CREATED',
        'LearningState',
        learning.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: learning.id, state: learning.state },
        true,
      );

      return learning;
    } catch (error: any) {
      await this.recordAudit(
        'LEARNING_STATE_CREATED',
        'LearningState',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error) },
      );
      throw error;
    }
  }

  async listLearnings(workspaceId: string, query: LearningListQueryDto = {}) {
    const pageSize = Number(query.pageSize ?? 20);
    const page = Number(query.page ?? 1);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.LearningStateWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.state && { state: query.state }),
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { summary: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.learningState.findMany({
        where,
        take: pageSize,
        skip: (page - 1) * pageSize,
        orderBy: { [sortBy]: sortOrder } as Prisma.LearningStateOrderByWithRelationInput,
      }),
      this.prisma.learningState.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getLearning(id: string, workspaceId: string) {
    const learning = await this.prisma.learningState.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!learning) {
      throw new NotFoundException('Learning state not found');
    }
    return learning;
  }

  async updateLearning(
    id: string,
    workspaceId: string,
    userId: string,
    dto: UpdateLearningDto,
    ctx?: MutationAuditContext,
  ) {
    let existing: Awaited<ReturnType<IntelligenceLearningService['getLearning']>> | null = null;
    try {
      if (dto.title !== undefined && !dto.title.trim()) {
        throw new BadRequestException('title cannot be empty');
      }
      this.assertScore(dto.confidence, 'confidence');

      existing = await this.getLearning(id, workspaceId);

      const updated = await this.prisma.learningState.update({
        where: { id: existing.id },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.summary !== undefined && { summary: dto.summary }),
          ...(dto.confidence !== undefined && { confidence: dto.confidence }),
          ...(dto.metadata !== undefined && { metadata: dto.metadata as Prisma.InputJsonValue }),
        },
      });

      await this.recordAudit(
        'LEARNING_STATE_UPDATED',
        'LearningState',
        updated.id,
        ctx,
        workspaceId,
        userId,
        { title: existing.title, confidence: existing.confidence },
        { title: updated.title, confidence: updated.confidence },
        true,
      );

      return updated;
    } catch (error: any) {
      await this.recordAudit(
        'LEARNING_STATE_UPDATED',
        'LearningState',
        existing?.id ?? id,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error) },
      );
      throw error;
    }
  }

  async removeLearning(
    id: string,
    workspaceId: string,
    userId: string,
    ctx?: MutationAuditContext,
  ) {
    let existing: Awaited<ReturnType<IntelligenceLearningService['getLearning']>> | null = null;
    try {
      existing = await this.getLearning(id, workspaceId);
      const removed = await this.prisma.learningState.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await this.recordAudit(
        'LEARNING_STATE_DELETED',
        'LearningState',
        removed.id,
        ctx,
        workspaceId,
        userId,
        { deletedAt: null },
        { deletedAt: removed.deletedAt },
        true,
      );

      return { success: true, id: removed.id };
    } catch (error: any) {
      await this.recordAudit(
        'LEARNING_STATE_DELETED',
        'LearningState',
        existing?.id ?? id,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error) },
      );
      throw error;
    }
  }

  async restoreLearning(
    id: string,
    workspaceId: string,
    userId: string,
    ctx?: MutationAuditContext,
  ) {
    try {
      const existing = await this.prisma.learningState.findFirst({
        where: { id, workspaceId, deletedAt: { not: null } },
      });
      if (!existing) {
        throw new NotFoundException('Soft-deleted learning state not found');
      }

      const restored = await this.prisma.learningState.update({
        where: { id: existing.id },
        data: { deletedAt: null },
      });

      await this.recordAudit(
        'LEARNING_STATE_RESTORED',
        'LearningState',
        restored.id,
        ctx,
        workspaceId,
        userId,
        { deletedAt: existing.deletedAt },
        { deletedAt: null },
        true,
      );

      return restored;
    } catch (error: any) {
      await this.recordAudit(
        'LEARNING_STATE_RESTORED',
        'LearningState',
        id,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error) },
      );
      throw error;
    }
  }

  async transitionLearning(
    id: string,
    workspaceId: string,
    userId: string,
    dto: LearningTransitionDto,
    ctx?: MutationAuditContext,
  ) {
    let existing: Awaited<ReturnType<IntelligenceLearningService['getLearning']>> | null = null;
    try {
      existing = await this.getLearning(id, workspaceId);
      const from = existing.state;
      const to = dto.toState;

      if (!isValidLearningTransition(from, to)) {
        throw new BadRequestException(
          `Invalid learning transition from ${from} to ${to}. Allowed: ${
            LEARNING_TRANSITIONS[from]?.join(', ') || 'none'
          }`,
        );
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        const next = await tx.learningState.update({
          where: { id: existing!.id },
          data: {
            state: to,
            ...(to === LearningStateType.CAPITALIZED && { capitalized: true }),
          },
        });
        await tx.learningEvent.create({
          data: {
            learningId: next.id,
            eventType: LearningEventType.STATE_TRANSITION,
            fromState: from,
            toState: to,
            actorId: userId,
            workspaceId,
            notes: dto.notes,
          },
        });
        return next;
      });

      await this.recordAudit(
        'LEARNING_STATE_TRANSITIONED',
        'LearningState',
        updated.id,
        ctx,
        workspaceId,
        userId,
        { state: from },
        { state: to },
        true,
        { notes: dto.notes },
      );

      // Capitalization trigger evaluation after a state change.
      const capitalization = await this.maybeCapitalize(updated.id, workspaceId, userId, ctx);

      return { ...updated, capitalization };
    } catch (error: any) {
      await this.recordAudit(
        'LEARNING_STATE_TRANSITIONED',
        'LearningState',
        existing?.id ?? id,
        ctx,
        workspaceId,
        userId,
        existing ? { state: existing.state } : null,
        null,
        false,
        { error: String(error?.message ?? error), attemptedState: dto.toState },
      );
      throw error;
    }
  }

  async listLearningEvents(id: string, workspaceId: string) {
    await this.getLearning(id, workspaceId);
    return this.prisma.learningEvent.findMany({
      where: { learningId: id, workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async reinforceLearning(
    id: string,
    workspaceId: string,
    userId: string,
    dto: ReinforceLearningDto,
    ctx?: MutationAuditContext,
  ) {
    const existing = await this.getLearning(id, workspaceId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.learningState.update({
        where: { id: existing.id },
        data: {
          reinforcementCount: { increment: 1 },
          confidence: Math.min(1, Number((existing.confidence + 0.05).toFixed(4))),
        },
      });
      await tx.learningEvent.create({
        data: {
          learningId: next.id,
          eventType: LearningEventType.REINFORCEMENT,
          actorId: userId,
          workspaceId,
          notes: dto.notes ?? 'Reinforcement observed',
        },
      });
      return next;
    });

    await this.recordAudit(
      'LEARNING_REINFORCED',
      'LearningState',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { reinforcementCount: existing.reinforcementCount },
      { reinforcementCount: updated.reinforcementCount },
      true,
    );

    const capitalization = await this.maybeCapitalize(updated.id, workspaceId, userId, ctx);
    return { ...updated, capitalization };
  }

  async contradictLearning(
    id: string,
    workspaceId: string,
    userId: string,
    dto: ReinforceLearningDto,
    ctx?: MutationAuditContext,
  ) {
    const existing = await this.getLearning(id, workspaceId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.learningState.update({
        where: { id: existing.id },
        data: {
          contradictionCount: { increment: 1 },
          confidence: Math.max(0, Number((existing.confidence - 0.1).toFixed(4))),
        },
      });
      await tx.learningEvent.create({
        data: {
          learningId: next.id,
          eventType: LearningEventType.CONTRADICTION,
          actorId: userId,
          workspaceId,
          notes: dto.notes ?? 'Contradiction observed',
        },
      });
      return next;
    });

    await this.recordAudit(
      'LEARNING_CONTRADICTED',
      'LearningState',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { contradictionCount: existing.contradictionCount },
      { contradictionCount: updated.contradictionCount },
      true,
    );

    return updated;
  }

  // ----------------------------------------------------------------------
  // Pattern Engine
  // ----------------------------------------------------------------------

  async registerPattern(
    workspaceId: string,
    userId: string,
    dto: RegisterPatternDto,
    ctx?: MutationAuditContext,
  ) {
    try {
      if (!dto.label?.trim()) {
        throw new BadRequestException('label is required');
      }
      this.assertScore(dto.strength, 'strength');

      const pattern = await this.prisma.pattern.create({
        data: {
          patternType: dto.patternType,
          label: dto.label,
          description: dto.description,
          strength: dto.strength ?? 0.5,
          occurrences: dto.memberObjectIds?.length || 1,
          memberObjectIds: dto.memberObjectIds ?? [],
          metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          workspaceId,
          createdById: userId,
        },
      });

      await this.recordAudit(
        'PATTERN_REGISTERED',
        'Pattern',
        pattern.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: pattern.id, patternType: pattern.patternType },
        true,
      );

      return pattern;
    } catch (error: any) {
      await this.recordAudit(
        'PATTERN_REGISTERED',
        'Pattern',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error) },
      );
      throw error;
    }
  }

  async listPatterns(workspaceId: string, query: PatternListQueryDto = {}) {
    const pageSize = Number(query.pageSize ?? 20);
    const page = Number(query.page ?? 1);
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.PatternWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.patternType && { patternType: query.patternType }),
    };

    const [items, total] = await Promise.all([
      this.prisma.pattern.findMany({
        where,
        take: pageSize,
        skip: (page - 1) * pageSize,
        orderBy: { [sortBy]: sortOrder } as Prisma.PatternOrderByWithRelationInput,
      }),
      this.prisma.pattern.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async getPattern(id: string, workspaceId: string) {
    const pattern = await this.prisma.pattern.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!pattern) {
      throw new NotFoundException('Pattern not found');
    }
    return pattern;
  }

  /**
   * Deterministic repetition pattern discovery: learning units sharing the
   * same originating object are grouped into REPETITION patterns.
   */
  async discoverPatterns(workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    const learnings = await this.prisma.learningState.findMany({
      where: { workspaceId, deletedAt: null, objectId: { not: null } },
      orderBy: { createdAt: 'asc' },
    });

    const groups = new Map<string, typeof learnings>();
    for (const learning of learnings) {
      const key = learning.objectId as string;
      const bucket = groups.get(key) ?? [];
      bucket.push(learning);
      groups.set(key, bucket);
    }

    const discovered: Array<{ id: string; patternType: PatternType; occurrences: number }> = [];
    for (const [objectId, bucket] of groups.entries()) {
      if (bucket.length < 2) {
        continue;
      }
      const contradictions = bucket.reduce((sum, l) => sum + l.contradictionCount, 0);
      const patternType: PatternType =
        contradictions > 0 ? PatternType.CONTRADICTION : PatternType.REPETITION;
      const strength = Math.min(1, Number((bucket.length / (bucket.length + 1)).toFixed(4)));

      const pattern = await this.prisma.pattern.create({
        data: {
          patternType,
          label: `Auto-discovered ${patternType} for object ${objectId}`,
          description: `Detected across ${bucket.length} learning units`,
          strength,
          occurrences: bucket.length,
          memberObjectIds: [objectId],
          metadata: {
            learningIds: bucket.map((l) => l.id),
            contradictions,
          } as Prisma.InputJsonValue,
          workspaceId,
          createdById: userId,
        },
      });
      discovered.push({
        id: pattern.id,
        patternType: pattern.patternType,
        occurrences: pattern.occurrences,
      });
    }

    await this.recordAudit(
      'PATTERN_DISCOVERED',
      'Pattern',
      undefined,
      ctx,
      workspaceId,
      userId,
      null,
      { discovered: discovered.length },
      true,
      { patternIds: discovered.map((d) => d.id) },
    );

    return { discovered: discovered.length, patterns: discovered };
  }

  // ----------------------------------------------------------------------
  // Knowledge Evolution
  // ----------------------------------------------------------------------

  async recordEvolution(
    learningId: string,
    workspaceId: string,
    userId: string,
    dto: RecordEvolutionDto,
    ctx?: MutationAuditContext,
  ) {
    let learning: Awaited<ReturnType<IntelligenceLearningService['getLearning']>> | null = null;
    try {
      learning = await this.getLearning(learningId, workspaceId);

      const result = await this.prisma.$transaction(async (tx) => {
        const evolution = await tx.knowledgeEvolution.create({
          data: {
            learningId: learning!.id,
            evolutionType: dto.evolutionType,
            reason: dto.reason,
            before: (dto.before ?? {}) as Prisma.InputJsonValue,
            after: (dto.after ?? {}) as Prisma.InputJsonValue,
            actorId: userId,
            workspaceId,
            createdById: userId,
          },
        });

        // Superseding and retirement deprecate the learning unit.
        if (
          (dto.evolutionType === EvolutionType.SUPERSEDING ||
            dto.evolutionType === EvolutionType.RETIREMENT) &&
          learning!.state !== LearningStateType.DEPRECATED
        ) {
          await tx.learningState.update({
            where: { id: learning!.id },
            data: { state: LearningStateType.DEPRECATED },
          });
          await tx.learningEvent.create({
            data: {
              learningId: learning!.id,
              eventType: LearningEventType.STATE_TRANSITION,
              fromState: learning!.state,
              toState: LearningStateType.DEPRECATED,
              actorId: userId,
              workspaceId,
              notes: `Deprecated via ${dto.evolutionType}`,
            },
          });
        }

        return evolution;
      });

      await this.recordAudit(
        'KNOWLEDGE_EVOLUTION_RECORDED',
        'KnowledgeEvolution',
        result.id,
        ctx,
        workspaceId,
        userId,
        null,
        { id: result.id, evolutionType: result.evolutionType },
        true,
      );

      return result;
    } catch (error: any) {
      await this.recordAudit(
        'KNOWLEDGE_EVOLUTION_RECORDED',
        'KnowledgeEvolution',
        undefined,
        ctx,
        workspaceId,
        userId,
        null,
        null,
        false,
        { error: String(error?.message ?? error), learningId },
      );
      throw error;
    }
  }

  async listEvolution(learningId: string, workspaceId: string) {
    await this.getLearning(learningId, workspaceId);
    return this.prisma.knowledgeEvolution.findMany({
      where: { learningId, workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ----------------------------------------------------------------------
  // Capitalization Trigger
  // ----------------------------------------------------------------------

  /**
   * Generates a capitalization event when a learning unit satisfies the D12
   * capitalization conditions and has not yet been capitalized.
   */
  private async maybeCapitalize(
    learningId: string,
    workspaceId: string,
    userId: string,
    ctx?: MutationAuditContext,
  ) {
    const learning = await this.prisma.learningState.findFirst({
      where: { id: learningId, workspaceId, deletedAt: null },
    });
    if (!learning || learning.capitalized) {
      return null;
    }
    if (
      !meetsCapitalizationConditions({
        state: learning.state,
        confidence: learning.confidence,
        reinforcementCount: learning.reinforcementCount,
      })
    ) {
      return null;
    }

    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.capitalizationEvent.create({
        data: {
          learningId: learning.id,
          objectId: learning.objectId,
          triggerReason: 'Automatic: learning reached capitalization conditions',
          capitalValue: Number((learning.confidence * 100).toFixed(2)),
          status: CapitalizationStatus.TRIGGERED,
          actorId: userId,
          workspaceId,
          createdById: userId,
        },
      });
      await tx.learningState.update({
        where: { id: learning.id },
        data: {
          capitalized: true,
          ...(learning.state !== LearningStateType.CAPITALIZED && {
            state: LearningStateType.CAPITALIZED,
          }),
        },
      });
      return created;
    });

    await this.recordAudit(
      'CAPITALIZATION_TRIGGERED',
      'CapitalizationEvent',
      event.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: event.id, learningId: event.learningId, capitalValue: event.capitalValue },
      true,
      { automatic: true },
    );

    return event;
  }

  async capitalizeLearning(
    learningId: string,
    workspaceId: string,
    userId: string,
    dto: CapitalizeLearningDto,
    ctx?: MutationAuditContext,
  ) {
    const learning = await this.getLearning(learningId, workspaceId);

    // Try automatic trigger first (handles condition-met case + audit).
    const auto = await this.maybeCapitalize(learningId, workspaceId, userId, ctx);
    if (auto) {
      return auto;
    }

    if (learning.capitalized) {
      throw new BadRequestException('learning unit is already capitalized');
    }

    if (
      !meetsCapitalizationConditions({
        state: learning.state,
        confidence: learning.confidence,
        reinforcementCount: learning.reinforcementCount,
      }) &&
      !dto.triggerReason
    ) {
      throw new BadRequestException(
        'learning unit does not meet capitalization conditions; provide triggerReason to force',
      );
    }

    const event = await this.prisma.$transaction(async (tx) => {
      const created = await tx.capitalizationEvent.create({
        data: {
          learningId: learning.id,
          objectId: learning.objectId,
          triggerReason: dto.triggerReason ?? 'Manual capitalization',
          capitalValue: dto.capitalValue ?? Number((learning.confidence * 100).toFixed(2)),
          capitalCategory: dto.capitalCategory,
          status: CapitalizationStatus.TRIGGERED,
          actorId: userId,
          workspaceId,
          createdById: userId,
        },
      });
      await tx.learningState.update({
        where: { id: learning.id },
        data: {
          capitalized: true,
          ...(learning.state !== LearningStateType.CAPITALIZED && {
            state: LearningStateType.CAPITALIZED,
          }),
        },
      });
      return created;
    });

    await this.recordAudit(
      'CAPITALIZATION_TRIGGERED',
      'CapitalizationEvent',
      event.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: event.id, learningId: event.learningId, capitalValue: event.capitalValue },
      true,
      { automatic: false },
    );

    return event;
  }

  async listCapitalizationEvents(learningId: string, workspaceId: string) {
    await this.getLearning(learningId, workspaceId);
    return this.prisma.capitalizationEvent.findMany({
      where: { learningId, workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
