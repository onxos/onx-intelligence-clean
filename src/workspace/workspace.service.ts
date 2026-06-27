import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async getHome(workspaceId: string) {
    const [
      intelligenceCount,
      evidenceCount,
      providerCount,
      toolCount,
      recentIntelligence,
      recentEvidence,
    ] = await Promise.all([
      this.prisma.intelligenceObject.count({ where: { workspaceId } }),
      this.prisma.evidenceRecord.count({ where: { workspaceId } }),
      this.prisma.providerProfile.count({ where: { workspaceId } }),
      this.prisma.toolProfile.count({ where: { workspaceId } }),
      this.prisma.intelligenceObject.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.evidenceRecord.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    return {
      workspace: {
        intelligenceCount,
        evidenceCount,
        providerCount,
        toolCount,
      },
      recentIntelligence,
      recentEvidence,
    };
  }

  listProjects() {
    return {
      pending: true,
      message: 'Projects backend model is pending in production API.',
      items: [],
    };
  }

  getProjectDetails(projectId: string) {
    return {
      pending: true,
      projectId,
      message: 'Project details backend endpoint is pending in production API.',
    };
  }

  async listKnowledgeAssets(workspaceId: string) {
    const items = await this.prisma.intelligenceObject.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return { pending: false, items };
  }

  async listSources(workspaceId: string) {
    const items = await this.prisma.provenanceRecord.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return { pending: false, items };
  }

  listAgents() {
    return {
      pending: true,
      message: 'Agents registry backend endpoint is pending in production API.',
      items: [],
    };
  }

  async listModels(workspaceId: string) {
    const providers = await this.prisma.providerProfile.findMany({
      where: { workspaceId },
      orderBy: { priority: 'asc' },
      select: {
        providerId: true,
        providerName: true,
        models: true,
        status: true,
      },
    });

    const items = providers.flatMap((provider) =>
      provider.models.map((model) => ({
        model,
        providerId: provider.providerId,
        providerName: provider.providerName,
        providerStatus: provider.status,
      })),
    );

    return { pending: false, items };
  }

  async listEvaluations(workspaceId: string) {
    const items = await this.prisma.providerEvaluation.findMany({
      where: {
        provider: {
          workspaceId,
        },
      },
      include: {
        provider: {
          select: {
            providerId: true,
            providerName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return { pending: false, items };
  }

  async getReports(workspaceId: string) {
    const [intelligenceCount, evidenceCount, governanceCount, totalCapital] = await Promise.all([
      this.prisma.intelligenceObject.count({ where: { workspaceId } }),
      this.prisma.evidenceRecord.count({ where: { workspaceId } }),
      this.prisma.governanceDecision.count({ where: { workspaceId } }),
      this.prisma.capitalRecord.aggregate({
        where: { workspaceId },
        _sum: { amount: true },
      }),
    ]);

    return {
      pending: false,
      snapshot: {
        intelligenceCount,
        evidenceCount,
        governanceCount,
        totalCapital: totalCapital._sum.amount || 0,
      },
    };
  }

  async getMonitoring(workspaceId: string) {
    const [auditCount, recentAudit, evidenceCount] = await Promise.all([
      this.prisma.auditLog.count({ where: { workspaceId } }),
      this.prisma.auditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.evidenceRecord.count({ where: { workspaceId } }),
    ]);

    return {
      pending: false,
      status: 'ok',
      metrics: {
        auditCount,
        evidenceCount,
      },
      recentAudit,
    };
  }

  async getSettings(userId: string, workspaceId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, workspaceId },
      include: {
        role: true,
        workspace: true,
        tenant: true,
      },
    });

    return {
      pending: false,
      user,
    };
  }
}
