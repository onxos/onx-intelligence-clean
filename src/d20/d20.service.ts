import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { EvidenceService } from '../evidence/evidence.service';
import {
  buildDependencyGraph,
  evaluateBuild,
  evaluateDeployment,
  validateDependencies,
  validateImplementation,
  verifyCompatibility,
  type CompatibilityEntry,
  type DependencyEdge,
  type UnitRef,
} from './d20-engine';
import {
  BUILD_STAGES,
  D20_ACTIONS,
  D20_CONSTITUTIONAL_REF,
  DEFAULT_PAGE_SIZE,
  DEPLOYMENT_ENVIRONMENTS,
  IMPLEMENTATION_UNIT_KINDS,
  IMPLEMENTATION_UNIT_STATUSES,
  MAX_PAGE_SIZE,
  REUSED_MODULES,
} from './d20.constants';
import {
  CreateBuildProfileDto,
  CreateDeploymentProfileDto,
  DeclareBoundaryDto,
  DeclareDependencyDto,
  ListProfilesQueryDto,
  ListUnitsQueryDto,
  OverrideUnitDto,
  RegisterPackageDto,
  RegisterUnitDto,
} from './dto/d20.dto';

type MutationAuditContext = {
  actorId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

function jsonify(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function clampPage(size?: number): number {
  if (!size || size < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(size, MAX_PAGE_SIZE);
}

@Injectable()
export class D20Service {
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

  private async writeHistory(
    tx: Prisma.TransactionClient,
    subject: { subjectType: string; subjectId: string; workspaceId: string },
    eventType: string,
    actorId: string,
    data?: {
      referenceId?: string | null;
      referenceType?: string | null;
      constitutionalRef?: string | null;
      notes?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await tx.implementationHistory.create({
      data: {
        workspaceId: subject.workspaceId,
        subjectType: subject.subjectType,
        subjectId: subject.subjectId,
        eventType,
        referenceId: data?.referenceId ?? null,
        referenceType: data?.referenceType ?? null,
        constitutionalRef: data?.constitutionalRef ?? null,
        notes: data?.notes ?? null,
        actorId,
        metadata: jsonify(data?.metadata),
      },
    });
  }

  private async loadUnitOrThrow(id: string, workspaceId: string) {
    const unit = await this.prisma.implementationUnit.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!unit) throw new NotFoundException('Implementation unit not found');
    return unit;
  }

  private async resolveUnitBySlug(slug: string, workspaceId: string) {
    const unit = await this.prisma.implementationUnit.findFirst({
      where: { workspaceId, slug, deletedAt: null },
    });
    if (!unit) throw new BadRequestException(`Unknown implementation unit: ${slug}`);
    return unit;
  }

  private async loadUnitsAndEdges(workspaceId: string) {
    const [units, dependencies] = await Promise.all([
      this.prisma.implementationUnit.findMany({ where: { workspaceId, deletedAt: null } }),
      this.prisma.implementationDependency.findMany({ where: { workspaceId } }),
    ]);
    const unitRefs: UnitRef[] = units.map((u) => ({ id: u.id, name: u.name, kind: u.kind }));
    const edges: DependencyEdge[] = dependencies.map((d) => ({
      fromUnitId: d.fromUnitId,
      toUnitId: d.toUnitId,
      kind: d.kind,
      required: d.required,
      satisfied: d.satisfied,
    }));
    return { units, dependencies, unitRefs, edges };
  }

  private async gatherCompatibility(workspaceId: string): Promise<CompatibilityEntry[]> {
    const builds = await this.prisma.buildProfile.findMany({
      where: { workspaceId, deletedAt: null },
      select: { compatibility: true },
    });
    const entries: CompatibilityEntry[] = [];
    for (const b of builds) {
      const list = Array.isArray(b.compatibility) ? (b.compatibility as unknown[]) : [];
      for (const raw of list) {
        const e = raw as Partial<CompatibilityEntry>;
        if (e && typeof e.module === 'string' && typeof e.level === 'string') {
          entries.push({ module: e.module, level: e.level as CompatibilityEntry['level'] });
        }
      }
    }
    return entries;
  }

  // ----------------------------------------------------------------------
  // Part A — implementation registry
  // ----------------------------------------------------------------------

  async registerUnit(
    workspaceId: string,
    userId: string,
    dto: RegisterUnitDto,
    ctx?: MutationAuditContext,
  ) {
    if (!dto.name?.trim() || !dto.slug?.trim()) {
      throw new BadRequestException('name and slug are required');
    }
    const existing = await this.prisma.implementationUnit.findFirst({
      where: { workspaceId, slug: dto.slug.trim(), deletedAt: null },
    });
    if (existing) throw new BadRequestException('An implementation unit with that slug exists');

    let packageId: string | null = null;
    if (dto.packageSlug?.trim()) {
      const pkg = await this.prisma.implementationPackage.findFirst({
        where: { workspaceId, slug: dto.packageSlug.trim(), deletedAt: null },
      });
      if (!pkg) throw new BadRequestException(`Unknown package: ${dto.packageSlug}`);
      packageId = pkg.id;
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const unit = await tx.implementationUnit.create({
        data: {
          workspaceId,
          ownerId: userId,
          name: dto.name.trim(),
          slug: dto.slug.trim(),
          kind: dto.kind,
          status: 'DECLARED',
          executionScope: dto.executionScope.trim(),
          ownership: dto.ownership.trim(),
          runtimeBoundary: dto.runtimeBoundary?.trim() || null,
          buildBoundary: dto.buildBoundary?.trim() || null,
          deploymentBoundary: dto.deploymentBoundary?.trim() || null,
          packageId,
          constitutionalRef: D20_CONSTITUTIONAL_REF.UNIT,
          metadata: jsonify(dto.metadata),
        },
      });
      if (packageId) {
        await tx.implementationPackage.update({
          where: { id: packageId },
          data: { unitCount: { increment: 1 } },
        });
      }
      await this.writeHistory(
        tx,
        { subjectType: 'IMPLEMENTATION_UNIT', subjectId: unit.id, workspaceId },
        'UNIT_REGISTERED',
        userId,
        { constitutionalRef: D20_CONSTITUTIONAL_REF.UNIT, notes: `${dto.kind} unit registered` },
      );
      return unit;
    });

    await this.recordAudit(
      D20_ACTIONS.REGISTER_UNIT,
      'ImplementationUnit',
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, slug: created.slug, kind: created.kind },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `d20:unit:${created.id}`, ctx);
    return created;
  }

  async registerPackage(
    workspaceId: string,
    userId: string,
    dto: RegisterPackageDto,
    ctx?: MutationAuditContext,
  ) {
    if (!dto.name?.trim() || !dto.slug?.trim()) {
      throw new BadRequestException('name and slug are required');
    }
    const existing = await this.prisma.implementationPackage.findFirst({
      where: { workspaceId, slug: dto.slug.trim(), deletedAt: null },
    });
    if (existing) throw new BadRequestException('An implementation package with that slug exists');

    const created = await this.prisma.$transaction(async (tx) => {
      const pkg = await tx.implementationPackage.create({
        data: {
          workspaceId,
          ownerId: userId,
          name: dto.name.trim(),
          slug: dto.slug.trim(),
          description: dto.description?.trim() || null,
          status: 'DECLARED',
          constitutionalRef: D20_CONSTITUTIONAL_REF.PACKAGE,
          metadata: jsonify(dto.metadata),
        },
      });
      await this.writeHistory(
        tx,
        { subjectType: 'IMPLEMENTATION_PACKAGE', subjectId: pkg.id, workspaceId },
        'PACKAGE_REGISTERED',
        userId,
        { constitutionalRef: D20_CONSTITUTIONAL_REF.PACKAGE, notes: 'package registered' },
      );
      return pkg;
    });

    await this.recordAudit(
      D20_ACTIONS.REGISTER_PACKAGE,
      'ImplementationPackage',
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, slug: created.slug },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `d20:package:${created.id}`, ctx);
    return created;
  }

  async declareDependency(
    workspaceId: string,
    userId: string,
    dto: DeclareDependencyDto,
    ctx?: MutationAuditContext,
  ) {
    const from = await this.resolveUnitBySlug(dto.fromSlug, workspaceId);
    const to = await this.resolveUnitBySlug(dto.toSlug, workspaceId);
    if (from.id === to.id) {
      throw new BadRequestException('A unit cannot depend on itself');
    }
    if (from.overridden) {
      throw new BadRequestException('Source unit is overridden and immutable');
    }
    const kind = dto.kind ?? 'REQUIRED';
    const duplicate = await this.prisma.implementationDependency.findFirst({
      where: { fromUnitId: from.id, toUnitId: to.id, kind },
    });
    if (duplicate) throw new BadRequestException('That dependency already exists');

    // Cycle detection with the new edge included.
    const { unitRefs, edges } = await this.loadUnitsAndEdges(workspaceId);
    const withNew: DependencyEdge[] = [
      ...edges,
      {
        fromUnitId: from.id,
        toUnitId: to.id,
        kind,
        required: dto.required ?? true,
        satisfied: dto.satisfied ?? true,
      },
    ];
    const graph = buildDependencyGraph(unitRefs, withNew);

    const created = await this.prisma.$transaction(async (tx) => {
      const dep = await tx.implementationDependency.create({
        data: {
          workspaceId,
          fromUnitId: from.id,
          toUnitId: to.id,
          kind,
          required: dto.required ?? true,
          satisfied: dto.satisfied ?? true,
          cyclic: graph.cyclic,
          notes: dto.notes?.trim() || null,
          actorId: userId,
        },
      });
      await tx.implementationUnit.update({
        where: { id: from.id },
        data: { dependencyCount: { increment: 1 } },
      });
      await this.writeHistory(
        tx,
        { subjectType: 'IMPLEMENTATION_UNIT', subjectId: from.id, workspaceId },
        'DEPENDENCY_DECLARED',
        userId,
        {
          referenceId: dep.id,
          referenceType: 'ImplementationDependency',
          constitutionalRef: D20_CONSTITUTIONAL_REF.DEPENDENCY,
          notes: `${from.slug} -> ${to.slug} (${kind}${graph.cyclic ? ', cyclic' : ''})`,
        },
      );
      return dep;
    });

    await this.recordAudit(
      D20_ACTIONS.DECLARE_DEPENDENCY,
      'ImplementationDependency',
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, fromUnitId: from.id, toUnitId: to.id, cyclic: graph.cyclic },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `d20:dependency:${created.id}`, ctx);
    return { ...created, cyclic: graph.cyclic };
  }

  async declareBoundary(
    workspaceId: string,
    userId: string,
    unitId: string,
    dto: DeclareBoundaryDto,
    ctx?: MutationAuditContext,
  ) {
    const unit = await this.loadUnitOrThrow(unitId, workspaceId);
    if (unit.overridden) {
      throw new BadRequestException('Implementation unit is overridden and immutable');
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const boundary = await tx.implementationBoundary.create({
        data: {
          workspaceId,
          unitId: unit.id,
          kind: dto.kind,
          scope: dto.scope.trim(),
          allowed: dto.allowed ?? true,
          description: dto.description?.trim() || null,
          constitutionalRef: D20_CONSTITUTIONAL_REF.BOUNDARY,
          actorId: userId,
        },
      });
      await tx.implementationUnit.update({
        where: { id: unit.id },
        data: { boundaryCount: { increment: 1 } },
      });
      await this.writeHistory(
        tx,
        { subjectType: 'IMPLEMENTATION_UNIT', subjectId: unit.id, workspaceId },
        'BOUNDARY_DECLARED',
        userId,
        {
          referenceId: boundary.id,
          referenceType: 'ImplementationBoundary',
          constitutionalRef: D20_CONSTITUTIONAL_REF.BOUNDARY,
          notes: `${dto.kind} boundary`,
        },
      );
      return boundary;
    });

    await this.recordAudit(
      D20_ACTIONS.DECLARE_BOUNDARY,
      'ImplementationBoundary',
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, unitId: unit.id, kind: created.kind },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `d20:boundary:${created.id}`, ctx);
    return created;
  }

  async listUnits(workspaceId: string, query: ListUnitsQueryDto) {
    const take = clampPage(query.pageSize);
    const where: Prisma.ImplementationUnitWhereInput = {
      workspaceId,
      deletedAt: null,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const items = await this.prisma.implementationUnit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > take;
    const page = hasMore ? items.slice(0, take) : items;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  async getUnit(workspaceId: string, id: string) {
    const unit = await this.loadUnitOrThrow(id, workspaceId);
    const [boundaries, dependenciesOut, dependenciesIn] = await Promise.all([
      this.prisma.implementationBoundary.findMany({
        where: { unitId: id, workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.implementationDependency.findMany({
        where: { fromUnitId: id, workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.implementationDependency.findMany({
        where: { toUnitId: id, workspaceId },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return { unit, boundaries, dependenciesOut, dependenciesIn };
  }

  // ----------------------------------------------------------------------
  // Part B / D — dependency graph
  // ----------------------------------------------------------------------

  async dependencyGraph(workspaceId: string) {
    const { units, unitRefs, edges } = await this.loadUnitsAndEdges(workspaceId);
    const graph = buildDependencyGraph(unitRefs, edges);
    const validation = validateDependencies(unitRefs, edges);
    return {
      units: units.map((u) => ({ id: u.id, slug: u.slug, name: u.name, kind: u.kind })),
      graph,
      validation,
    };
  }

  // ----------------------------------------------------------------------
  // Part C — build architecture
  // ----------------------------------------------------------------------

  async createBuildProfile(
    workspaceId: string,
    userId: string,
    dto: CreateBuildProfileDto,
    ctx?: MutationAuditContext,
  ) {
    if (!dto.name?.trim() || !dto.profile?.trim()) {
      throw new BadRequestException('name and profile are required');
    }
    let packageRef: string | null = null;
    if (dto.packageSlug?.trim()) {
      const pkg = await this.prisma.implementationPackage.findFirst({
        where: { workspaceId, slug: dto.packageSlug.trim(), deletedAt: null },
      });
      if (!pkg) throw new BadRequestException(`Unknown package: ${dto.packageSlug}`);
      packageRef = pkg.packageId;
    }

    const { unitRefs, edges } = await this.loadUnitsAndEdges(workspaceId);
    const dependency = validateDependencies(unitRefs, edges);
    const compatibility = verifyCompatibility(
      (dto.compatibility ?? []).map((c) => ({ module: c.module, level: c.level, note: c.note })),
    );
    const evaluation = evaluateBuild({
      stages: dto.stages,
      artifacts: dto.artifacts,
      dependency,
      compatibility,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const build = await tx.buildProfile.create({
        data: {
          workspaceId,
          ownerId: userId,
          name: dto.name.trim(),
          profile: dto.profile.trim(),
          packageRef,
          status: evaluation.status,
          valid: evaluation.valid,
          stages: jsonify(evaluation.stages),
          artifacts: jsonify(dto.artifacts ?? []),
          compatibility: jsonify(dto.compatibility ?? []),
          buildMetadata: jsonify(dto.buildMetadata),
          issues: jsonify(evaluation.issues),
          constitutionalRef: D20_CONSTITUTIONAL_REF.BUILD,
          metadata: jsonify(dto.metadata),
        },
      });
      await tx.implementationEvidence.create({
        data: {
          workspaceId,
          subjectType: 'BUILD_PROFILE',
          subjectId: build.id,
          evidenceType: 'BUILD_EVALUATION',
          summary: evaluation.valid ? 'Build profile validated' : 'Build profile failed validation',
          confidence: evaluation.valid ? 1 : 0,
          payload: jsonify({ evaluation, compatibility, dependencyValid: dependency.valid }),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { subjectType: 'BUILD_PROFILE', subjectId: build.id, workspaceId },
        'BUILD_CREATED',
        userId,
        {
          constitutionalRef: D20_CONSTITUTIONAL_REF.BUILD,
          notes: `${evaluation.status} (${evaluation.issues.length} issues)`,
        },
      );
      return build;
    });

    await this.recordAudit(
      D20_ACTIONS.CREATE_BUILD,
      'BuildProfile',
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, status: created.status, valid: created.valid },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `d20:build:${created.id}`, ctx);
    return { ...created, evaluation };
  }

  async validateBuild(workspaceId: string, userId: string, id: string, ctx?: MutationAuditContext) {
    const build = await this.prisma.buildProfile.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!build) throw new NotFoundException('Build profile not found');
    if (build.overridden)
      throw new BadRequestException('Build profile is overridden and immutable');

    const { unitRefs, edges } = await this.loadUnitsAndEdges(workspaceId);
    const dependency = validateDependencies(unitRefs, edges);
    const declared = Array.isArray(build.compatibility)
      ? (build.compatibility as unknown[]).map((c) => c as CompatibilityEntry)
      : [];
    const compatibility = verifyCompatibility(declared);
    const stages = Array.isArray(build.stages) ? (build.stages as string[]) : undefined;
    const artifacts = Array.isArray(build.artifacts) ? (build.artifacts as string[]) : undefined;
    const evaluation = evaluateBuild({ stages, artifacts, dependency, compatibility });

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.buildProfile.update({
        where: { id: build.id },
        data: {
          status: evaluation.valid ? 'VALIDATED' : 'FAILED',
          valid: evaluation.valid,
          issues: jsonify(evaluation.issues),
          version: { increment: 1 },
        },
      });
      await tx.implementationEvidence.create({
        data: {
          workspaceId,
          subjectType: 'BUILD_PROFILE',
          subjectId: build.id,
          evidenceType: 'BUILD_VALIDATION',
          summary: evaluation.valid ? 'Build validated' : 'Build validation failed',
          confidence: evaluation.valid ? 1 : 0,
          payload: jsonify({ evaluation, compatibility }),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { subjectType: 'BUILD_PROFILE', subjectId: build.id, workspaceId },
        'BUILD_VALIDATED',
        userId,
        { constitutionalRef: D20_CONSTITUTIONAL_REF.BUILD, notes: next.status },
      );
      return next;
    });

    await this.recordAudit(
      D20_ACTIONS.VALIDATE_BUILD,
      'BuildProfile',
      updated.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: updated.id, valid: updated.valid },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `d20:build:validate:${updated.id}`, ctx);
    return { ...updated, evaluation };
  }

  async listBuilds(workspaceId: string, query: ListProfilesQueryDto) {
    const take = clampPage(query.pageSize);
    const items = await this.prisma.buildProfile.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > take;
    const page = hasMore ? items.slice(0, take) : items;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  // ----------------------------------------------------------------------
  // Part E — deployment governance
  // ----------------------------------------------------------------------

  async createDeploymentProfile(
    workspaceId: string,
    userId: string,
    dto: CreateDeploymentProfileDto,
    ctx?: MutationAuditContext,
  ) {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');

    let buildValid = true;
    if (dto.buildProfileRef?.trim()) {
      const build = await this.prisma.buildProfile.findFirst({
        where: { workspaceId, buildProfileId: dto.buildProfileRef.trim(), deletedAt: null },
      });
      if (!build) throw new BadRequestException(`Unknown build profile: ${dto.buildProfileRef}`);
      buildValid = build.valid;
    }

    const { unitRefs, edges } = await this.loadUnitsAndEdges(workspaceId);
    const dependency = validateDependencies(unitRefs, edges);
    const rollbackMetadataPresent = Boolean(
      dto.rollbackMetadata && Object.keys(dto.rollbackMetadata).length,
    );
    const evaluation = evaluateDeployment({
      environment: dto.environment,
      buildValid,
      dependencyValid: dependency.valid,
      rollbackMetadataPresent,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const deployment = await tx.deploymentProfile.create({
        data: {
          workspaceId,
          ownerId: userId,
          name: dto.name.trim(),
          environment: dto.environment,
          buildProfileRef: dto.buildProfileRef?.trim() || null,
          status: evaluation.status,
          valid: evaluation.valid,
          rollbackReady: evaluation.rollbackReady,
          rollbackMetadata: jsonify(dto.rollbackMetadata),
          validationIssues: jsonify(evaluation.issues),
          constitutionalRef: D20_CONSTITUTIONAL_REF.DEPLOYMENT,
          metadata: jsonify(dto.metadata),
        },
      });
      await tx.implementationEvidence.create({
        data: {
          workspaceId,
          subjectType: 'DEPLOYMENT_PROFILE',
          subjectId: deployment.id,
          evidenceType: 'DEPLOYMENT_EVALUATION',
          summary: evaluation.valid ? 'Deployment profile validated' : 'Deployment profile failed',
          confidence: evaluation.valid ? 1 : 0,
          payload: jsonify({ evaluation, dependencyValid: dependency.valid, buildValid }),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { subjectType: 'DEPLOYMENT_PROFILE', subjectId: deployment.id, workspaceId },
        'DEPLOYMENT_CREATED',
        userId,
        {
          constitutionalRef: D20_CONSTITUTIONAL_REF.DEPLOYMENT,
          notes: `${dto.environment}:${evaluation.status}`,
        },
      );
      return deployment;
    });

    await this.recordAudit(
      D20_ACTIONS.CREATE_DEPLOYMENT,
      'DeploymentProfile',
      created.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: created.id, environment: created.environment, valid: created.valid },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `d20:deployment:${created.id}`, ctx);
    return { ...created, evaluation };
  }

  async validateDeployment(
    workspaceId: string,
    userId: string,
    id: string,
    ctx?: MutationAuditContext,
  ) {
    const deployment = await this.prisma.deploymentProfile.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!deployment) throw new NotFoundException('Deployment profile not found');
    if (deployment.overridden) {
      throw new BadRequestException('Deployment profile is overridden and immutable');
    }

    let buildValid = true;
    if (deployment.buildProfileRef) {
      const build = await this.prisma.buildProfile.findFirst({
        where: { workspaceId, buildProfileId: deployment.buildProfileRef, deletedAt: null },
      });
      buildValid = build?.valid ?? false;
    }
    const { unitRefs, edges } = await this.loadUnitsAndEdges(workspaceId);
    const dependency = validateDependencies(unitRefs, edges);
    const rollbackMetadataPresent = Boolean(
      deployment.rollbackMetadata &&
      typeof deployment.rollbackMetadata === 'object' &&
      Object.keys(deployment.rollbackMetadata as Record<string, unknown>).length,
    );
    const evaluation = evaluateDeployment({
      environment: deployment.environment,
      buildValid,
      dependencyValid: dependency.valid,
      rollbackMetadataPresent,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.deploymentProfile.update({
        where: { id: deployment.id },
        data: {
          status: evaluation.valid ? 'VALIDATED' : 'FAILED',
          valid: evaluation.valid,
          rollbackReady: evaluation.rollbackReady,
          validationIssues: jsonify(evaluation.issues),
          version: { increment: 1 },
        },
      });
      await tx.implementationEvidence.create({
        data: {
          workspaceId,
          subjectType: 'DEPLOYMENT_PROFILE',
          subjectId: deployment.id,
          evidenceType: 'DEPLOYMENT_VALIDATION',
          summary: evaluation.valid ? 'Deployment validated' : 'Deployment validation failed',
          confidence: evaluation.valid ? 1 : 0,
          payload: jsonify({ evaluation }),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { subjectType: 'DEPLOYMENT_PROFILE', subjectId: deployment.id, workspaceId },
        'DEPLOYMENT_VALIDATED',
        userId,
        { constitutionalRef: D20_CONSTITUTIONAL_REF.DEPLOYMENT, notes: next.status },
      );
      return next;
    });

    await this.recordAudit(
      D20_ACTIONS.VALIDATE_DEPLOYMENT,
      'DeploymentProfile',
      updated.id,
      ctx,
      workspaceId,
      userId,
      null,
      { id: updated.id, valid: updated.valid, rollbackReady: updated.rollbackReady },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `d20:deployment:validate:${updated.id}`, ctx);
    return { ...updated, evaluation };
  }

  async listDeployments(workspaceId: string, query: ListProfilesQueryDto) {
    const take = clampPage(query.pageSize);
    const items = await this.prisma.deploymentProfile.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > take;
    const page = hasMore ? items.slice(0, take) : items;
    return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
  }

  // ----------------------------------------------------------------------
  // Compatibility report + aggregate validation
  // ----------------------------------------------------------------------

  async compatibilityReport(workspaceId: string) {
    const entries = await this.gatherCompatibility(workspaceId);
    const report = verifyCompatibility(entries);
    return { report, entries, reusedModules: [...REUSED_MODULES] };
  }

  async validateImplementation(workspaceId: string, userId: string, ctx?: MutationAuditContext) {
    const { units, unitRefs, edges } = await this.loadUnitsAndEdges(workspaceId);
    const [boundaryCount, compatibilityEntries] = await Promise.all([
      this.prisma.implementationBoundary.count({ where: { workspaceId } }),
      this.gatherCompatibility(workspaceId),
    ]);
    const dependency = validateDependencies(unitRefs, edges);
    const compatibility = verifyCompatibility(compatibilityEntries);
    const result = validateImplementation({
      unitCount: units.length,
      boundaryCount,
      dependency,
      compatibility,
      hasConstitutionalRef: true,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.implementationEvidence.create({
        data: {
          workspaceId,
          subjectType: 'IMPLEMENTATION',
          subjectId: workspaceId,
          evidenceType: 'IMPLEMENTATION_VALIDATION',
          summary: result.valid ? 'Implementation validated' : 'Implementation validation failed',
          confidence: result.valid ? 1 : 0,
          payload: jsonify({ result, dependency, compatibility }),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { subjectType: 'IMPLEMENTATION', subjectId: workspaceId, workspaceId },
        'IMPLEMENTATION_VALIDATED',
        userId,
        {
          constitutionalRef: D20_CONSTITUTIONAL_REF.VALIDATION,
          notes: result.valid ? 'valid' : result.issues.join('; '),
        },
      );
    });

    await this.recordAudit(
      D20_ACTIONS.VALIDATE,
      'Implementation',
      workspaceId,
      ctx,
      workspaceId,
      userId,
      null,
      { valid: result.valid },
      true,
    );
    await this.recordEvidence(workspaceId, userId, `d20:validate:${workspaceId}`, ctx);
    return { validation: result, dependency, compatibility };
  }

  // ----------------------------------------------------------------------
  // Part E — founder override (immutable)
  // ----------------------------------------------------------------------

  async override(
    workspaceId: string,
    userId: string,
    unitId: string,
    dto: OverrideUnitDto,
    ctx?: MutationAuditContext,
  ) {
    const unit = await this.loadUnitOrThrow(unitId, workspaceId);
    if (!dto.directive?.trim()) throw new BadRequestException('directive is required');

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.implementationUnit.update({
        where: { id: unit.id },
        data: { overridden: true, status: 'OVERRIDDEN' },
      });
      await tx.implementationEvidence.create({
        data: {
          workspaceId,
          subjectType: 'IMPLEMENTATION_UNIT',
          subjectId: unit.id,
          evidenceType: 'FOUNDER_OVERRIDE',
          summary: dto.directive.trim(),
          confidence: 1,
          payload: jsonify({ directive: dto.directive.trim(), reason: dto.reason }),
          actorId: userId,
        },
      });
      await this.writeHistory(
        tx,
        { subjectType: 'IMPLEMENTATION_UNIT', subjectId: unit.id, workspaceId },
        'FOUNDER_OVERRIDE',
        userId,
        {
          constitutionalRef:
            dto.constitutionalRef?.trim() || D20_CONSTITUTIONAL_REF.FOUNDER_AUTHORITY,
          notes: dto.directive.trim(),
        },
      );
      return next;
    });

    await this.recordAudit(
      D20_ACTIONS.OVERRIDE,
      'ImplementationUnit',
      updated.id,
      ctx,
      workspaceId,
      userId,
      { status: unit.status },
      { status: 'OVERRIDDEN', overridden: true, immutable: true },
      true,
    );
    await this.recordEvidence(workspaceId, unit.ownerId, `d20:override:${unit.id}`, ctx);
    return updated;
  }

  // ----------------------------------------------------------------------
  // Dashboard
  // ----------------------------------------------------------------------

  async dashboard(workspaceId: string) {
    const [
      units,
      packages,
      dependencies,
      boundaries,
      builds,
      deployments,
      validatedBuilds,
      validatedDeployments,
    ] = await Promise.all([
      this.prisma.implementationUnit.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.implementationPackage.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.implementationDependency.count({ where: { workspaceId } }),
      this.prisma.implementationBoundary.count({ where: { workspaceId } }),
      this.prisma.buildProfile.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.deploymentProfile.count({ where: { workspaceId, deletedAt: null } }),
      this.prisma.buildProfile.count({ where: { workspaceId, deletedAt: null, valid: true } }),
      this.prisma.deploymentProfile.count({
        where: { workspaceId, deletedAt: null, valid: true },
      }),
    ]);

    const byKindRaw = await this.prisma.implementationUnit.groupBy({
      by: ['kind'],
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
    });
    const byKind = byKindRaw.map((row) => ({ kind: row.kind, count: row._count._all }));

    const byStatusRaw = await this.prisma.implementationUnit.groupBy({
      by: ['status'],
      where: { workspaceId, deletedAt: null },
      _count: { _all: true },
    });
    const byStatus = byStatusRaw.map((row) => ({ status: row.status, count: row._count._all }));

    return {
      registry: { units, packages, dependencies, boundaries },
      builds: { total: builds, valid: validatedBuilds },
      deployments: { total: deployments, valid: validatedDeployments },
      byKind,
      byStatus,
      supportedKinds: [...IMPLEMENTATION_UNIT_KINDS],
      unitStatuses: [...IMPLEMENTATION_UNIT_STATUSES],
      buildStages: [...BUILD_STAGES],
      environments: [...DEPLOYMENT_ENVIRONMENTS],
      reusedModules: [...REUSED_MODULES],
    };
  }
}
