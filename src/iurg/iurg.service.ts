import { Injectable, NotFoundException } from '@nestjs/common';
import { IurgEdgeType, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { FOUNDER_INTENT_CORPUS } from '../intent-compiler/fic-enforcement.constants';
import {
  DECISION_TO_EVENT_TYPE,
  DECISION_TO_NODE_TYPE,
  IurgNodeType,
  constraintKind,
  constraintTitle,
  sourceIntentsForConstraint,
} from './iurg.constants';
import { IurgQueryDto } from './dto/iurg.dto';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

export interface FicConflictSummary {
  classId: string;
  name?: string;
}

export interface FicBindInput {
  workspaceId: string;
  actorId: string;
  decision: 'APPROVED' | 'REJECTED' | 'CONFLICT' | 'OVERRIDE';
  reason?: string;
  decisionContext?: string;
  applicableIntentIds: string[];
  applicableConstraintIds: string[];
  executionBlocks: string[];
  hardViolations: string[];
  requiredGates: string[];
  softFlags: string[];
  activeOverrides: string[];
  conflicts: FicConflictSummary[];
  playbooks: string[];
  domains: string[];
  traceId?: string | null;
  sourceCheckId?: string | null;
  evidenceRef?: string | null;
}

type EdgeSeed = {
  edgeType: IurgEdgeType;
  fromNodeType: string;
  fromNodeId: string;
  fromNodeRef?: string | null;
  toNodeType: string;
  toNodeId: string;
  toNodeRef?: string | null;
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const INTENT_CORPUS_BY_REF = new Map(FOUNDER_INTENT_CORPUS.map((i) => [i.intentId, i]));

@Injectable()
export class IurgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ----------------------------------------------------------------------
  // Binding — every FIC event -> node + full edge set + ledger entry
  // ----------------------------------------------------------------------

  async bindFicEvent(input: FicBindInput, ctx?: MutationAuditContext) {
    const nodeType = DECISION_TO_NODE_TYPE[input.decision];
    const eventType = DECISION_TO_EVENT_TYPE[input.decision];

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Materialize the event object node.
      const node = await this.createEventNode(tx, nodeType, eventType, input);

      // 2. Materialize the intent + constraint registry nodes referenced.
      const focusConstraints = this.focusConstraints(input);
      const sourceIntentRefs = focusConstraints.flatMap((c) => sourceIntentsForConstraint(c));
      const intentRefs = this.dedupe([...input.applicableIntentIds, ...sourceIntentRefs]);
      const intentNodes = await this.ensureIntentNodes(tx, input.workspaceId, intentRefs);
      const constraintNodes = await this.ensureConstraintNodes(
        tx,
        input.workspaceId,
        focusConstraints,
      );

      // 3. Assemble the full edge set for this decision.
      const seeds = this.buildEdgeSeeds(input, nodeType, node, intentNodes, constraintNodes);
      const edges = await this.createEdges(tx, input.workspaceId, seeds, node.id, eventType);

      // 4. Write the Intent Evolution Ledger entry.
      const ledger = await this.appendLedger(tx, {
        workspaceId: input.workspaceId,
        eventType,
        decision: input.decision,
        intentId: input.applicableIntentIds[0] ?? null,
        constraintId: focusConstraints[0] ?? null,
        nodeType,
        nodeId: node.id,
        traceId: input.traceId ?? null,
        summary: `${nodeType} object for ${input.decision} check${
          input.reason ? `: ${input.reason}` : ''
        }`,
        payload: {
          playbooks: input.playbooks,
          domains: input.domains,
          executionBlocks: input.executionBlocks,
          hardViolations: input.hardViolations,
          requiredGates: input.requiredGates,
          activeOverrides: input.activeOverrides,
        },
      });

      return { node, edges, ledger, edgeCount: edges.length };
    });

    await this.recordAudit(
      `IURG_${nodeType}_BOUND`,
      `Iurg${this.pascal(nodeType)}Object`,
      result.node.id,
      ctx ?? { actorId: input.actorId },
      input.workspaceId,
      input.actorId,
      { decision: input.decision, edgeCount: result.edgeCount, ledgerId: result.ledger.ledgerId },
      true,
    );

    return result;
  }

  /** Bind a constitutional Review event: Review object + Intent --reviewed_under--> Review. */
  async bindReviewEvent(params: {
    workspaceId: string;
    actorId: string;
    intentRef: string;
    decision?: string;
    result?: string;
    traceId?: string | null;
  }) {
    const bound = await this.prisma.$transaction(async (tx) => {
      const review = await tx.iurgReviewObject.create({
        data: {
          iurgId: this.iurgId(),
          workspaceId: params.workspaceId,
          actorId: params.actorId,
          intentId: params.intentRef,
          decision: params.decision ?? null,
          result: params.result ?? null,
          traceId: params.traceId ?? null,
        },
      });
      const [intentNode] = await this.ensureIntentNodesList(tx, params.workspaceId, [
        params.intentRef,
      ]);
      const edges = await this.createEdges(
        tx,
        params.workspaceId,
        [
          {
            edgeType: 'REVIEWED_UNDER',
            fromNodeType: 'INTENT',
            fromNodeId: intentNode.id,
            fromNodeRef: params.intentRef,
            toNodeType: 'REVIEW',
            toNodeId: review.id,
            toNodeRef: review.iurgId,
          },
        ],
        review.id,
        'review',
      );
      const ledger = await this.appendLedger(tx, {
        workspaceId: params.workspaceId,
        eventType: 'review',
        decision: params.decision ?? null,
        intentId: params.intentRef,
        constraintId: null,
        nodeType: 'REVIEW',
        nodeId: review.id,
        traceId: params.traceId ?? null,
        summary: `REVIEW object for ${params.intentRef}${
          params.decision ? ` (${params.decision})` : ''
        }`,
        payload: null,
      });
      return { node: review, edges, ledger };
    });
    return bound;
  }

  /**
   * Bind an Amendment event: Amendment object + old Intent --amended_by--> Amendment
   * and new version --supersedes--> old version.
   */
  async bindAmendmentEvent(params: {
    workspaceId: string;
    actorId: string;
    intentRef: string;
    fromVersion: number;
    toVersion: number;
    traceId?: string | null;
  }) {
    const bound = await this.prisma.$transaction(async (tx) => {
      const amendment = await tx.iurgAmendmentObject.create({
        data: {
          iurgId: this.iurgId(),
          workspaceId: params.workspaceId,
          actorId: params.actorId,
          intentId: params.intentRef,
          fromVersion: params.fromVersion,
          toVersion: params.toVersion,
          result: `v${params.fromVersion}->v${params.toVersion}`,
          traceId: params.traceId ?? null,
        },
      });
      const [intentNode] = await this.ensureIntentNodesList(tx, params.workspaceId, [
        params.intentRef,
      ]);
      const edges = await this.createEdges(
        tx,
        params.workspaceId,
        [
          {
            edgeType: 'AMENDED_BY',
            fromNodeType: 'INTENT',
            fromNodeId: intentNode.id,
            fromNodeRef: params.intentRef,
            toNodeType: 'AMENDMENT',
            toNodeId: amendment.id,
            toNodeRef: amendment.iurgId,
          },
          {
            edgeType: 'SUPERSEDES',
            fromNodeType: 'INTENT',
            fromNodeId: intentNode.id,
            fromNodeRef: `${params.intentRef}#v${params.toVersion}`,
            toNodeType: 'INTENT',
            toNodeId: intentNode.id,
            toNodeRef: `${params.intentRef}#v${params.fromVersion}`,
          },
        ],
        amendment.id,
        'amendment',
      );
      const ledger = await this.appendLedger(tx, {
        workspaceId: params.workspaceId,
        eventType: 'amendment',
        decision: null,
        intentId: params.intentRef,
        constraintId: null,
        nodeType: 'AMENDMENT',
        nodeId: amendment.id,
        traceId: params.traceId ?? null,
        summary: `AMENDMENT object for ${params.intentRef} (v${params.fromVersion} -> v${params.toVersion})`,
        payload: null,
      });
      return { node: amendment, edges, ledger };
    });
    return bound;
  }

  // ----------------------------------------------------------------------
  // Edge-set assembly
  // ----------------------------------------------------------------------

  private focusConstraints(input: FicBindInput): string[] {
    switch (input.decision) {
      case 'REJECTED':
        return this.dedupe([...input.executionBlocks, ...input.hardViolations]);
      case 'CONFLICT':
        return this.dedupe([...input.requiredGates]);
      case 'OVERRIDE':
        return this.dedupe([...input.activeOverrides]);
      case 'APPROVED':
      default:
        return this.dedupe(input.applicableConstraintIds);
    }
  }

  private buildEdgeSeeds(
    input: FicBindInput,
    nodeType: IurgNodeType,
    node: { id: string; iurgId: string },
    intentNodes: Map<string, { id: string }>,
    constraintNodes: Map<string, { id: string }>,
  ): EdgeSeed[] {
    const seeds: EdgeSeed[] = [];
    const focus = this.focusConstraints(input);
    const nodeRef = node.iurgId;

    const relationForFocus: IurgEdgeType = nodeType === 'VIOLATION' ? 'VIOLATED_BY' : 'ENFORCED_BY';

    // Constraint --enforced_by|violated_by--> event object, and derived_from -> source intents.
    for (const c of focus) {
      const cNode = constraintNodes.get(c);
      if (cNode) {
        seeds.push({
          edgeType: relationForFocus,
          fromNodeType: 'CONSTRAINT',
          fromNodeId: cNode.id,
          fromNodeRef: c,
          toNodeType: nodeType,
          toNodeId: node.id,
          toNodeRef: nodeRef,
        });
        for (const intentRef of sourceIntentsForConstraint(c)) {
          const iNode = intentNodes.get(intentRef);
          if (iNode) {
            seeds.push({
              edgeType: 'DERIVED_FROM',
              fromNodeType: 'CONSTRAINT',
              fromNodeId: cNode.id,
              fromNodeRef: c,
              toNodeType: 'INTENT',
              toNodeId: iNode.id,
              toNodeRef: intentRef,
            });
            if (nodeType === 'VIOLATION') {
              seeds.push({
                edgeType: 'VIOLATED_BY',
                fromNodeType: 'INTENT',
                fromNodeId: iNode.id,
                fromNodeRef: intentRef,
                toNodeType: nodeType,
                toNodeId: node.id,
                toNodeRef: nodeRef,
              });
            }
          }
        }
      }
    }

    // conflicts_with — chain the applicable intents for a CONFLICT event.
    if (nodeType === 'CONFLICT') {
      const refs = input.applicableIntentIds;
      for (let i = 0; i + 1 < refs.length; i += 1) {
        const a = intentNodes.get(refs[i]);
        const b = intentNodes.get(refs[i + 1]);
        if (a && b) {
          seeds.push({
            edgeType: 'CONFLICTS_WITH',
            fromNodeType: 'INTENT',
            fromNodeId: a.id,
            fromNodeRef: refs[i],
            toNodeType: 'INTENT',
            toNodeId: b.id,
            toNodeRef: refs[i + 1],
          });
        }
      }
    }

    // realized_as — understanding (intent) realized as the decision (APPROVED/OVERRIDE).
    if (nodeType === 'ENFORCEMENT' || nodeType === 'OVERRIDE') {
      for (const intentRef of input.applicableIntentIds) {
        const iNode = intentNodes.get(intentRef);
        if (iNode) {
          seeds.push({
            edgeType: 'REALIZED_AS',
            fromNodeType: 'INTENT',
            fromNodeId: iNode.id,
            fromNodeRef: intentRef,
            toNodeType: 'DECISION',
            toNodeId: input.sourceCheckId ?? node.id,
            toNodeRef: input.sourceCheckId ?? nodeRef,
          });
        }
      }
      // validated_by — the judgment (event object) validated by evidence.
      seeds.push({
        edgeType: 'VALIDATED_BY',
        fromNodeType: nodeType,
        fromNodeId: node.id,
        fromNodeRef: nodeRef,
        toNodeType: 'EVIDENCE',
        toNodeId: input.evidenceRef ?? input.sourceCheckId ?? node.id,
        toNodeRef: input.evidenceRef ?? input.traceId ?? input.sourceCheckId ?? nodeRef,
      });
    }

    // constrains — the event object constrains each affected playbook.
    for (const playbook of input.playbooks) {
      seeds.push({
        edgeType: 'CONSTRAINS',
        fromNodeType: nodeType,
        fromNodeId: node.id,
        fromNodeRef: nodeRef,
        toNodeType: 'PLAYBOOK',
        toNodeId: playbook,
        toNodeRef: playbook,
      });
    }

    return seeds;
  }

  // ----------------------------------------------------------------------
  // Node + edge + ledger primitives
  // ----------------------------------------------------------------------

  private async createEventNode(
    tx: Prisma.TransactionClient,
    nodeType: IurgNodeType,
    eventType: string,
    input: FicBindInput,
  ) {
    const common = {
      iurgId: this.iurgId(),
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      eventType,
      intentId: input.applicableIntentIds[0] ?? null,
      constraintId: this.focusConstraints(input)[0] ?? null,
      targetProposal: input.decisionContext ?? null,
      result: input.reason ?? null,
      decision: input.decision,
      traceId: input.traceId ?? null,
      sourceCheckId: input.sourceCheckId ?? null,
      playbooks: input.playbooks,
      domains: input.domains,
    };

    switch (nodeType) {
      case 'ENFORCEMENT':
        return tx.iurgEnforcementObject.create({ data: common });
      case 'VIOLATION':
        return tx.iurgViolationObject.create({
          data: { ...common, blockedIds: this.focusConstraints(input) },
        });
      case 'CONFLICT':
        return tx.iurgConflictObject.create({
          data: { ...common, conflictClasses: input.conflicts.map((c) => c.classId) },
        });
      case 'OVERRIDE':
        return tx.iurgOverrideObject.create({
          data: { ...common, overrideRules: input.activeOverrides },
        });
      default:
        return tx.iurgEnforcementObject.create({ data: common });
    }
  }

  private async ensureIntentNodes(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    refs: string[],
  ): Promise<Map<string, { id: string }>> {
    const nodes = await this.ensureIntentNodesList(tx, workspaceId, refs);
    return new Map(refs.map((ref, idx) => [ref, nodes[idx]]));
  }

  private async ensureIntentNodesList(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    refs: string[],
  ) {
    const out: Array<{ id: string; iurgId: string }> = [];
    for (const ref of refs) {
      const meta = INTENT_CORPUS_BY_REF.get(ref);
      const node = await tx.iurgIntentObject.upsert({
        where: { workspaceId_intentRef: { workspaceId, intentRef: ref } },
        create: {
          iurgId: this.iurgId(),
          workspaceId,
          intentRef: ref,
          title: meta?.statement ?? null,
          category: meta?.category ?? null,
          affectedDomains: meta?.affectedDomains ?? [],
        },
        update: {},
      });
      out.push(node);
    }
    return out;
  }

  private async ensureConstraintNodes(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    refs: string[],
  ): Promise<Map<string, { id: string }>> {
    const map = new Map<string, { id: string }>();
    for (const ref of refs) {
      const node = await tx.iurgConstraintObject.upsert({
        where: { workspaceId_constraintRef: { workspaceId, constraintRef: ref } },
        create: {
          iurgId: this.iurgId(),
          workspaceId,
          constraintRef: ref,
          kind: constraintKind(ref) ?? null,
          title: constraintTitle(ref) ?? null,
          sourceIntentRefs: sourceIntentsForConstraint(ref),
        },
        update: {},
      });
      map.set(ref, node);
    }
    return map;
  }

  private async createEdges(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    seeds: EdgeSeed[],
    sourceEventId: string,
    sourceEventType: string,
  ) {
    if (seeds.length === 0) {
      return [] as EdgeSeed[];
    }
    const data = seeds.map((s) => ({
      edgeId: `EDGE-${crypto.randomUUID()}`,
      workspaceId,
      edgeType: s.edgeType,
      fromNodeType: s.fromNodeType,
      fromNodeId: s.fromNodeId,
      fromNodeRef: s.fromNodeRef ?? null,
      toNodeType: s.toNodeType,
      toNodeId: s.toNodeId,
      toNodeRef: s.toNodeRef ?? null,
      sourceEventId,
      sourceEventType,
    }));
    await tx.iurgEdge.createMany({ data });
    return data;
  }

  private async appendLedger(
    tx: Prisma.TransactionClient,
    entry: {
      workspaceId: string;
      eventType: string;
      decision: string | null;
      intentId: string | null;
      constraintId: string | null;
      nodeType: string;
      nodeId: string;
      traceId: string | null;
      summary: string;
      payload: Record<string, unknown> | null;
    },
  ) {
    const sequence =
      (await tx.intentEvolutionLedger.count({
        where: { workspaceId: entry.workspaceId },
      })) + 1;
    const ledgerId = `IEL-${new Date().getUTCFullYear()}-${String(sequence).padStart(4, '0')}`;
    return tx.intentEvolutionLedger.create({
      data: {
        ledgerId,
        workspaceId: entry.workspaceId,
        sequence,
        eventType: entry.eventType,
        decision: entry.decision,
        intentId: entry.intentId,
        constraintId: entry.constraintId,
        nodeType: entry.nodeType,
        nodeId: entry.nodeId,
        traceId: entry.traceId,
        summary: entry.summary,
        payload: (entry.payload ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  // ----------------------------------------------------------------------
  // Reads
  // ----------------------------------------------------------------------

  private pageArgs(query?: { page?: number; pageSize?: number }) {
    const pageSize = Math.min(Number(query?.pageSize) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const page = Math.max(Number(query?.page) || 1, 1);
    return { pageSize, page, skip: (page - 1) * pageSize };
  }

  async listIntents(workspaceId: string, query?: { page?: number; pageSize?: number }) {
    const { pageSize, page, skip } = this.pageArgs(query);
    const [total, items] = await Promise.all([
      this.prisma.iurgIntentObject.count({ where: { workspaceId } }),
      this.prisma.iurgIntentObject.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async getIntent(id: string, workspaceId: string) {
    const node = await this.prisma.iurgIntentObject.findFirst({
      where: { workspaceId, OR: [{ id }, { iurgId: id }, { intentRef: id }] },
    });
    if (!node) {
      throw new NotFoundException('IURG intent object not found');
    }
    const edges = await this.edgesForNode(workspaceId, node.id, node.intentRef);
    return { ...node, edges };
  }

  async listConstraints(workspaceId: string, query?: { page?: number; pageSize?: number }) {
    const { pageSize, page, skip } = this.pageArgs(query);
    const [total, items] = await Promise.all([
      this.prisma.iurgConstraintObject.count({ where: { workspaceId } }),
      this.prisma.iurgConstraintObject.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async listEnforcements(workspaceId: string, query?: { page?: number; pageSize?: number }) {
    const { pageSize, page, skip } = this.pageArgs(query);
    const [total, items] = await Promise.all([
      this.prisma.iurgEnforcementObject.count({ where: { workspaceId } }),
      this.prisma.iurgEnforcementObject.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async listViolations(workspaceId: string, query?: { page?: number; pageSize?: number }) {
    const { pageSize, page, skip } = this.pageArgs(query);
    const [total, items] = await Promise.all([
      this.prisma.iurgViolationObject.count({ where: { workspaceId } }),
      this.prisma.iurgViolationObject.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async listConflicts(workspaceId: string, query?: { page?: number; pageSize?: number }) {
    const { pageSize, page, skip } = this.pageArgs(query);
    const [total, items] = await Promise.all([
      this.prisma.iurgConflictObject.count({ where: { workspaceId } }),
      this.prisma.iurgConflictObject.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async listOverrides(workspaceId: string, query?: { page?: number; pageSize?: number }) {
    const { pageSize, page, skip } = this.pageArgs(query);
    const [total, items] = await Promise.all([
      this.prisma.iurgOverrideObject.count({ where: { workspaceId } }),
      this.prisma.iurgOverrideObject.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async getEdgesForNode(nodeId: string, workspaceId: string) {
    const edges = await this.edgesForNode(workspaceId, nodeId, nodeId);
    return { nodeId, total: edges.length, edges };
  }

  /**
   * Create a single typed IURG edge between two nodes (by ref). Used by external
   * transformation pipelines (e.g. IW-29 Perception->Understanding) that link
   * their own entities into the graph without materialising FIC node rows.
   */
  async createLink(
    workspaceId: string,
    edgeType: IurgEdgeType,
    from: { type: string; id: string; ref?: string | null },
    to: { type: string; id: string; ref?: string | null },
    sourceEventType = 'TRANSFORM',
  ) {
    const [edge] = await this.createEdges(
      this.prisma,
      workspaceId,
      [
        {
          edgeType,
          fromNodeType: from.type,
          fromNodeId: from.id,
          fromNodeRef: from.ref ?? null,
          toNodeType: to.type,
          toNodeId: to.id,
          toNodeRef: to.ref ?? null,
        },
      ],
      from.id,
      sourceEventType,
    );
    return edge;
  }

  /**
   * Resolve the IURG event node that a FIC check produced (bindFicEvent stores
   * sourceCheckId on the enforcement/violation/conflict/override object). Used by
   * the USFIP perception bus to link a perception record to its IURG node.
   */
  async findNodeBySourceCheck(workspaceId: string, checkId: string) {
    const sourced: Array<[string, string]> = [
      ['ENFORCEMENT', 'iurgEnforcementObject'],
      ['VIOLATION', 'iurgViolationObject'],
      ['CONFLICT', 'iurgConflictObject'],
      ['OVERRIDE', 'iurgOverrideObject'],
    ];
    for (const [nodeType, accessor] of sourced) {
      const model = (this.prisma as any)[accessor];
      if (!model?.findFirst) {
        continue;
      }
      const row = await model.findFirst({ where: { workspaceId, sourceCheckId: checkId } });
      if (row) {
        return { nodeType, id: row.id as string, iurgId: row.iurgId as string };
      }
    }
    return null;
  }

  private async edgesForNode(workspaceId: string, nodeId: string, nodeRef?: string) {
    const refClauses: Prisma.IurgEdgeWhereInput[] = [{ fromNodeId: nodeId }, { toNodeId: nodeId }];
    if (nodeRef) {
      refClauses.push({ fromNodeRef: nodeRef }, { toNodeRef: nodeRef });
    }
    return this.prisma.iurgEdge.findMany({
      where: { workspaceId, OR: refClauses },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ----------------------------------------------------------------------
  // Query — by intent_id, constraint_id, event_type, timestamp range
  // ----------------------------------------------------------------------

  async query(workspaceId: string, dto: IurgQueryDto) {
    const createdAt =
      dto.from || dto.to
        ? {
            ...(dto.from ? { gte: new Date(dto.from) } : {}),
            ...(dto.to ? { lte: new Date(dto.to) } : {}),
          }
        : undefined;

    const base: Record<string, unknown> = { workspaceId };
    if (dto.intentId) {
      base.intentId = dto.intentId;
    }
    if (dto.constraintId) {
      base.constraintId = dto.constraintId;
    }
    if (createdAt) {
      base.createdAt = createdAt;
    }

    const wanted = dto.eventType ? [dto.eventType] : [...EVENT_TABLES.keys()];
    const nodes: Array<Record<string, unknown> & { nodeType: string }> = [];
    for (const eventType of wanted) {
      const accessor = EVENT_TABLES.get(eventType);
      if (!accessor) {
        continue;
      }
      const where = this.scopeWhere(base, eventType);
      const rows = await (this.prisma as any)[accessor].findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: MAX_PAGE_SIZE,
      });
      for (const row of rows) {
        nodes.push({ ...row, nodeType: eventType.toUpperCase() });
      }
    }

    // Include registry nodes when a specific ref was requested.
    if (dto.intentId) {
      const intentNode = await this.prisma.iurgIntentObject.findFirst({
        where: { workspaceId, intentRef: dto.intentId },
      });
      if (intentNode) {
        nodes.push({ ...intentNode, nodeType: 'INTENT' });
      }
    }
    if (dto.constraintId) {
      const constraintNode = await this.prisma.iurgConstraintObject.findFirst({
        where: { workspaceId, constraintRef: dto.constraintId },
      });
      if (constraintNode) {
        nodes.push({ ...constraintNode, nodeType: 'CONSTRAINT' });
      }
    }

    const nodeIds = nodes.map((n) => n.id as string).filter(Boolean);
    const edges =
      nodeIds.length > 0
        ? await this.prisma.iurgEdge.findMany({
            where: {
              workspaceId,
              OR: [{ fromNodeId: { in: nodeIds } }, { toNodeId: { in: nodeIds } }],
            },
            orderBy: { createdAt: 'asc' },
            take: MAX_PAGE_SIZE * 4,
          })
        : [];

    return { total: nodes.length, nodes, edges };
  }

  /** Some event tables (review/amendment) lack constraintId — drop that filter for them. */
  private scopeWhere(base: Record<string, unknown>, eventType: string) {
    if ((eventType === 'review' || eventType === 'amendment') && 'constraintId' in base) {
      const { constraintId, ...rest } = base;
      void constraintId;
      return rest;
    }
    return base;
  }

  // ----------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------

  private dedupe(values: string[]): string[] {
    return Array.from(new Set(values.filter((v) => !!v)));
  }

  private iurgId(): string {
    return `IURG-${crypto.randomUUID()}`;
  }

  private pascal(nodeType: string): string {
    return nodeType.charAt(0).toUpperCase() + nodeType.slice(1).toLowerCase();
  }

  private async recordAudit(
    action: string,
    resourceType: string,
    resourceId: string | undefined,
    ctx: MutationAuditContext | undefined,
    workspaceId: string,
    actorId: string,
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
      before: null,
      after,
      requestId: ctx?.requestId,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      status: success ? 'SUCCESS' : 'FAILED',
      success,
      metadata,
    });
  }
}

/** event_type -> Prisma model accessor for query fan-out. */
const EVENT_TABLES = new Map<string, string>([
  ['enforcement', 'iurgEnforcementObject'],
  ['violation', 'iurgViolationObject'],
  ['conflict', 'iurgConflictObject'],
  ['override', 'iurgOverrideObject'],
  ['review', 'iurgReviewObject'],
  ['amendment', 'iurgAmendmentObject'],
]);
