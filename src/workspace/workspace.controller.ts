import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { WorkspaceService } from './workspace.service';
import { getRequestAuditContext } from '../common/audit-context.util';

@ApiTags('Workspace')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WorkspaceController {
  constructor(private readonly svc: WorkspaceService) {}

  @Get('workspace/home')
  @ApiOperation({ summary: 'Get workspace home snapshot' })
  async home(@Req() req: any) {
    return this.svc.getHome(req.user.workspaceId);
  }

  @Get('projects')
  @ApiOperation({ summary: 'List projects' })
  async projects(@Req() req: any, @Query() query: any) {
    return this.svc.listProjects(req.user.workspaceId, query);
  }

  @Post('projects')
  @ApiOperation({ summary: 'Create project' })
  async createProject(@Req() req: any, @Body() body: any) {
    return this.svc.createProject(req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('projects/:id')
  @ApiOperation({ summary: 'Get project details' })
  async projectDetails(@Param('id') id: string, @Req() req: any) {
    return this.svc.getProjectDetails(id, req.user.workspaceId);
  }

  @Put('projects/:id')
  @ApiOperation({ summary: 'Update project' })
  async updateProject(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.svc.updateProject(id, req.user.workspaceId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Delete('projects/:id')
  @ApiOperation({ summary: 'Delete project' })
  async deleteProject(@Param('id') id: string, @Req() req: any) {
    return this.svc.deleteProject(id, req.user.workspaceId, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('knowledge/assets')
  @ApiOperation({ summary: 'List knowledge assets' })
  async knowledge(@Req() req: any, @Query() query: any) {
    return this.svc.listKnowledgeAssets(req.user.workspaceId, query);
  }

  @Post('knowledge/assets')
  @ApiOperation({ summary: 'Create knowledge asset' })
  async createKnowledge(@Req() req: any, @Body() body: any) {
    return this.svc.createKnowledgeAsset(req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('knowledge/assets/:id')
  @ApiOperation({ summary: 'Get knowledge asset details' })
  async knowledgeDetails(@Param('id') id: string, @Req() req: any) {
    return this.svc.getKnowledgeAssetDetails(id, req.user.workspaceId);
  }

  @Put('knowledge/assets/:id')
  @ApiOperation({ summary: 'Update knowledge asset' })
  async updateKnowledge(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.svc.updateKnowledgeAsset(id, req.user.workspaceId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Delete('knowledge/assets/:id')
  @ApiOperation({ summary: 'Delete knowledge asset' })
  async deleteKnowledge(@Param('id') id: string, @Req() req: any) {
    return this.svc.deleteKnowledgeAsset(id, req.user.workspaceId, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('sources')
  @ApiOperation({ summary: 'List sources and provenance records' })
  async sources(@Req() req: any, @Query() query: any) {
    return this.svc.listSources(req.user.workspaceId, query);
  }

  @Post('sources')
  @ApiOperation({ summary: 'Create source/provenance record' })
  async createSource(@Req() req: any, @Body() body: any) {
    return this.svc.createSource(req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('sources/:id')
  @ApiOperation({ summary: 'Get source/provenance record details' })
  async sourceDetails(@Param('id') id: string, @Req() req: any) {
    return this.svc.getSourceDetails(id, req.user.workspaceId);
  }

  @Put('sources/:id')
  @ApiOperation({ summary: 'Update source/provenance record' })
  async updateSource(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.svc.updateSource(id, req.user.workspaceId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Delete('sources/:id')
  @ApiOperation({ summary: 'Delete source/provenance record' })
  async deleteSource(@Param('id') id: string, @Req() req: any) {
    return this.svc.deleteSource(id, req.user.workspaceId, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('agents')
  @ApiOperation({ summary: 'List agents' })
  async agents(@Req() req: any, @Query() query: any) {
    return this.svc.listAgents(req.user.workspaceId, query);
  }

  @Post('agents')
  @ApiOperation({ summary: 'Create agent' })
  async createAgent(@Req() req: any, @Body() body: any) {
    return this.svc.createAgent(req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Put('agents/:id')
  @ApiOperation({ summary: 'Update agent' })
  async updateAgent(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.svc.updateAgent(id, req.user.workspaceId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Delete('agents/:id')
  @ApiOperation({ summary: 'Delete agent' })
  async deleteAgent(@Param('id') id: string, @Req() req: any) {
    return this.svc.deleteAgent(id, req.user.workspaceId, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('memory')
  @ApiOperation({ summary: 'List memory entries' })
  async memory(@Req() req: any, @Query() query: any) {
    return this.svc.listMemory(req.user.workspaceId, query);
  }

  @Post('memory')
  @ApiOperation({ summary: 'Create memory entry' })
  async createMemory(@Req() req: any, @Body() body: any) {
    return this.svc.createMemory(req.user.workspaceId, req.user.userId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Put('memory/:id')
  @ApiOperation({ summary: 'Update memory entry' })
  async updateMemory(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.svc.updateMemory(id, req.user.workspaceId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Delete('memory/:id')
  @ApiOperation({ summary: 'Delete memory entry' })
  async deleteMemory(@Param('id') id: string, @Req() req: any) {
    return this.svc.deleteMemory(id, req.user.workspaceId, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('models')
  @ApiOperation({ summary: 'List available models by provider' })
  async models(@Req() req: any, @Query() query: any) {
    return this.svc.listModels(req.user.workspaceId, query);
  }

  @Post('models')
  @ApiOperation({ summary: 'Create model entry on provider' })
  async createModel(@Req() req: any, @Body() body: any) {
    return this.svc.createModel(req.user.workspaceId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('models/:id')
  @ApiOperation({ summary: 'Get model entry details' })
  async modelDetails(@Param('id') id: string, @Req() req: any) {
    return this.svc.getModelDetails(id, req.user.workspaceId);
  }

  @Put('models/:id')
  @ApiOperation({ summary: 'Rename/update model entry on provider' })
  async updateModel(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.svc.updateModel(id, req.user.workspaceId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Delete('models/:id')
  @ApiOperation({ summary: 'Delete model entry from provider' })
  async deleteModel(@Param('id') id: string, @Req() req: any) {
    return this.svc.deleteModel(id, req.user.workspaceId, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('evaluations')
  @ApiOperation({ summary: 'List provider evaluations' })
  async evaluations(@Req() req: any, @Query() query: any) {
    return this.svc.listEvaluations(req.user.workspaceId, query);
  }

  @Post('evaluations')
  @ApiOperation({ summary: 'Create provider evaluation' })
  async createEvaluation(@Req() req: any, @Body() body: any) {
    return this.svc.createEvaluation(req.user.workspaceId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('evaluations/:id')
  @ApiOperation({ summary: 'Get provider evaluation details' })
  async evaluationDetails(@Param('id') id: string, @Req() req: any) {
    return this.svc.getEvaluationDetails(id, req.user.workspaceId);
  }

  @Put('evaluations/:id')
  @ApiOperation({ summary: 'Update provider evaluation' })
  async updateEvaluation(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.svc.updateEvaluation(id, req.user.workspaceId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Delete('evaluations/:id')
  @ApiOperation({ summary: 'Delete provider evaluation' })
  async deleteEvaluation(@Param('id') id: string, @Req() req: any) {
    return this.svc.deleteEvaluation(id, req.user.workspaceId, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }

  @Get('reports')
  @ApiOperation({ summary: 'Get workspace report snapshot' })
  async reports(@Req() req: any) {
    return this.svc.getReports(req.user.workspaceId);
  }

  @Get('reports/governance')
  @ApiOperation({ summary: 'List governance report records' })
  async reportGovernance(@Req() req: any, @Query() query: any) {
    return this.svc.listReportGovernance(req.user.workspaceId, query);
  }

  @Get('reports/capital')
  @ApiOperation({ summary: 'List capital report records' })
  async reportCapital(@Req() req: any, @Query() query: any) {
    return this.svc.listReportCapital(req.user.workspaceId, query);
  }

  @Get('monitoring')
  @ApiOperation({ summary: 'Get workspace monitoring snapshot' })
  async monitoring(@Req() req: any) {
    return this.svc.getMonitoring(req.user.workspaceId);
  }

  @Get('monitoring/audit')
  @ApiOperation({ summary: 'List monitoring audit entries' })
  async monitoringAudit(@Req() req: any, @Query() query: any) {
    return this.svc.listMonitoringAudit(req.user.workspaceId, query);
  }

  @Get('monitoring/audit/:id')
  @ApiOperation({ summary: 'Get monitoring audit entry details' })
  async monitoringAuditDetails(@Req() req: any, @Param('id') id: string) {
    return this.svc.getMonitoringAuditById(req.user.workspaceId, id);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get workspace/user settings snapshot' })
  async settings(@Req() req: any) {
    return this.svc.getSettings(req.user.userId, req.user.workspaceId);
  }

  @Put('settings')
  @ApiOperation({ summary: 'Update workspace/user settings snapshot' })
  async updateSettings(@Req() req: any, @Body() body: any) {
    return this.svc.updateSettings(req.user.userId, req.user.workspaceId, body, {
      actorId: req.user.userId,
      ...getRequestAuditContext(req),
    });
  }
}
