/**
 * ONX AI Agent — Controller
 * POST /agent/execute — main endpoint
 */

import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AiAgentService } from './ai-agent.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RequirePermissions, RbacGuard } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

class ExecuteCommandDto {
  command: string;
  workspaceId: string;
}

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AiAgentController {
  constructor(private readonly agentService: AiAgentService) {}

  @Post('execute')
  @RequirePermissions(Permission.AI_CHAT)
  @UseGuards(RbacGuard)
  async execute(@Body() dto: ExecuteCommandDto, @Req() req: any) {
    const result = await this.agentService.executeCommand(
      dto.command,
      req.user.id,
      dto.workspaceId,
    );
    return result;
  }

  @Get('history')
  @RequirePermissions(Permission.AI_CHAT)
  @UseGuards(RbacGuard)
  async history(
    @Query('workspaceId') workspaceId: string,
    @Query('limit') limit: string,
    @Req() req: any,
  ) {
    return this.agentService.getCommandHistory(
      req.user.id,
      workspaceId,
      parseInt(limit ?? '20', 10),
    );
  }
}
