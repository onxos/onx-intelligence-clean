import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AiAgentService, AgentResult } from './ai-agent.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RbacGuard, RequirePermissions } from '../rbac/rbac.guard';
import { Permission } from '../rbac/permissions.enum';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AiAgentController {
  constructor(private readonly svc: AiAgentService) {}

  @Post('execute')
  @RequirePermissions(Permission.AI_QUERY)
  @UseGuards(RbacGuard)
  async execute(
    @Body() dto: { command: string; workspaceId: string },
    @Req() req: { user: { userId: string } },
  ): Promise<AgentResult> {
    return this.svc.executeCommand(dto.command, req.user.userId, dto.workspaceId);
  }
}
