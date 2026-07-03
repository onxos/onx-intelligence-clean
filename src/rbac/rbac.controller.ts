import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Permission } from './permissions.enum';
import { RbacGuard, RequirePermissions } from './rbac.guard';
import { RbacService } from './rbac.service';
import { WorkspaceRole, isWorkspaceRole } from './roles.config';

@Controller('rbac')
@UseGuards(JwtAuthGuard)
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('permissions')
  listPermissions() {
    return { permissions: this.rbac.listPermissions() };
  }

  @Get('roles')
  listRoles() {
    return { roles: this.rbac.listRoles() };
  }

  @Post('check')
  async check(
    @Req() req: { user: { userId: string; workspaceId: string } },
    @Body() body: { permissions?: Permission[] },
  ) {
    const permissions = Array.isArray(body?.permissions) ? body.permissions : [];

    const allowed = await this.rbac.checkPermissions(
      { userId: req.user.userId, workspaceId: req.user.workspaceId },
      permissions,
    );

    return { allowed, permissions };
  }

  @Post('suggest-role')
  suggestRole(@Body() body: { permission?: Permission }) {
    if (!body?.permission || !Object.values(Permission).includes(body.permission)) {
      throw new BadRequestException('A valid permission is required');
    }

    return {
      permission: body.permission,
      suggestedRoles: this.rbac.suggestRolesForPermission(body.permission),
    };
  }

  @Post('assign-role')
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions(Permission.USER_MANAGE_ROLES)
  async assignRole(
    @Req() req: { user: { userId: string; workspaceId: string } },
    @Body() body: { targetUserId?: string; role?: string },
  ) {
    if (!body?.targetUserId) {
      throw new BadRequestException('targetUserId is required');
    }
    if (!body?.role || !isWorkspaceRole(body.role)) {
      throw new BadRequestException('role must be one of OWNER, ADMIN, MANAGER, ANALYST, CONTRIBUTOR, VIEWER');
    }

    const member = await this.rbac.assignRole({
      workspaceId: req.user.workspaceId,
      targetUserId: body.targetUserId,
      role: body.role as WorkspaceRole,
      assignedBy: req.user.userId,
    });

    return {
      member,
      message: 'Role assigned successfully',
    };
  }
}
