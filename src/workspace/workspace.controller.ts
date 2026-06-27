import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { WorkspaceService } from './workspace.service';

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
  @ApiOperation({ summary: 'List projects (pending backend domain model)' })
  async projects() {
    return this.svc.listProjects();
  }

  @Get('projects/:id')
  @ApiOperation({ summary: 'Get project details (pending backend domain model)' })
  async projectDetails(@Param('id') id: string) {
    return this.svc.getProjectDetails(id);
  }

  @Get('knowledge/assets')
  @ApiOperation({ summary: 'List knowledge assets' })
  async knowledge(@Req() req: any) {
    return this.svc.listKnowledgeAssets(req.user.workspaceId);
  }

  @Get('sources')
  @ApiOperation({ summary: 'List sources and provenance records' })
  async sources(@Req() req: any) {
    return this.svc.listSources(req.user.workspaceId);
  }

  @Get('agents')
  @ApiOperation({ summary: 'List agents (pending backend domain model)' })
  async agents() {
    return this.svc.listAgents();
  }

  @Get('models')
  @ApiOperation({ summary: 'List available models by provider' })
  async models(@Req() req: any) {
    return this.svc.listModels(req.user.workspaceId);
  }

  @Get('evaluations')
  @ApiOperation({ summary: 'List provider evaluations' })
  async evaluations(@Req() req: any) {
    return this.svc.listEvaluations(req.user.workspaceId);
  }

  @Get('reports')
  @ApiOperation({ summary: 'Get workspace report snapshot' })
  async reports(@Req() req: any) {
    return this.svc.getReports(req.user.workspaceId);
  }

  @Get('monitoring')
  @ApiOperation({ summary: 'Get workspace monitoring snapshot' })
  async monitoring(@Req() req: any) {
    return this.svc.getMonitoring(req.user.workspaceId);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get workspace/user settings snapshot' })
  async settings(@Req() req: any) {
    return this.svc.getSettings(req.user.userId, req.user.workspaceId);
  }
}
