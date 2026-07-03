/**
 * ONX RBAC — Controller
 * API endpoints for role and permission management
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RbacService } from './rbac.service';
import { RbacGuard, RequirePermissions } from './rbac.guard';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Permission } from './permissions.enum';
import { Role } from './roles.config';

class AssignRoleDto {
  userId: string;
  workspaceId: string;
  role: Role;
}

class SuggestRoleDto {
  jobFunction: string;
}

@Controller('rbac')
@UseGuards(JwtAuthGuard)
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  @Get('roles')
  @RequirePermissions(Permission.USER_READ)
  @UseGuards(RbacGuard)
  getAllRoles() {
    return this.rbacService.getAllRoles();
  }

  @Get('roles/suggest')
  @RequirePermissions(Permission.USER_READ)
  @UseGuards(RbacGuard)
  suggestRole(@Query('job') jobFunction: string) {
    return this.rbacService.suggestRole(jobFunction);
  }

  @Post('roles/assign')
  @RequirePermissions(Permission.USER_MANAGE_ROLES)
  @UseGuards(RbacGuard)
  assignRole(@Body() dto: AssignRoleDto, @Body('assignedBy') assignedBy: string) {
    return this.rbacService.assignRole(dto.userId, dto.workspaceId, dto.role, assignedBy);
  }

  @Get('workspaces/:workspaceId/members')
  @RequirePermissions(Permission.USER_READ)
  @UseGuards(RbacGuard)
  getWorkspaceMembers(@Param('workspaceId') workspaceId: string) {
    return this.rbacService.getWorkspaceMembers(workspaceId);
  }

  @Delete('workspaces/:workspaceId/members/:userId')
  @RequirePermissions(Permission.USER_DELETE)
  @UseGuards(RbacGuard)
  removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
  ) {
    return this.rbacService.removeMember(userId, workspaceId);
  }
}
