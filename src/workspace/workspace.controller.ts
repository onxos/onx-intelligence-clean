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
    return this.svc.createProject(req.user.workspaceId, req.user.userId, body);
  }

  @Get('projects/:id')
  @ApiOperation({ summary: 'Get project details' })
  async projectDetails(@Param('id') id: string, @Req() req: any) {
    return this.svc.getProjectDetails(id, req.user.workspaceId);
  }

  @Put('projects/:id')
  @ApiOperation({ summary: 'Update project' })
  async updateProject(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.svc.updateProject(id, req.user.workspaceId, body);
  }

  @Delete('projects/:id')
  @ApiOperation({ summary: 'Delete project' })
  async deleteProject(@Param('id') id: string, @Req() req: any) {
    return this.svc.deleteProject(id, req.user.workspaceId);
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
  @ApiOperation({ summary: 'List agents' })
  async agents(@Req() req: any, @Query() query: any) {
    return this.svc.listAgents(req.user.workspaceId, query);
  }

  @Post('agents')
  @ApiOperation({ summary: 'Create agent' })
  async createAgent(@Req() req: any, @Body() body: any) {
    return this.svc.createAgent(req.user.workspaceId, req.user.userId, body);
  }

  @Put('agents/:id')
  @ApiOperation({ summary: 'Update agent' })
  async updateAgent(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.svc.updateAgent(id, req.user.workspaceId, body);
  }

  @Delete('agents/:id')
  @ApiOperation({ summary: 'Delete agent' })
  async deleteAgent(@Param('id') id: string, @Req() req: any) {
    return this.svc.deleteAgent(id, req.user.workspaceId);
  }

  @Get('memory')
  @ApiOperation({ summary: 'List memory entries' })
  async memory(@Req() req: any, @Query() query: any) {
    return this.svc.listMemory(req.user.workspaceId, query);
  }

  @Post('memory')
  @ApiOperation({ summary: 'Create memory entry' })
  async createMemory(@Req() req: any, @Body() body: any) {
    return this.svc.createMemory(req.user.workspaceId, req.user.userId, body);
  }

  @Put('memory/:id')
  @ApiOperation({ summary: 'Update memory entry' })
  async updateMemory(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.svc.updateMemory(id, req.user.workspaceId, body);
  }

  @Delete('memory/:id')
  @ApiOperation({ summary: 'Delete memory entry' })
  async deleteMemory(@Param('id') id: string, @Req() req: any) {
    return this.svc.deleteMemory(id, req.user.workspaceId);
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

  @Put('settings')
  @ApiOperation({ summary: 'Update workspace/user settings snapshot' })
  async updateSettings(@Req() req: any, @Body() body: any) {
    return this.svc.updateSettings(req.user.userId, req.user.workspaceId, body);
  }
}
