import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Permission } from './permissions.enum';
import { ROLE_ORDER, ROLE_PERMISSIONS, WorkspaceRole, isWorkspaceRole } from './roles.config';

type UserScope = {
  userId: string;
  workspaceId: string;
};

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  private workspaceMemberDelegate() {
    return (this.prisma as unknown as {
      workspaceMember: {
        findUnique: (args: {
          where: { workspaceId_userId: { workspaceId: string; userId: string } };
          select: { role: true };
        }) => Promise<{ role: string } | null>;
        upsert: (args: {
          where: { workspaceId_userId: { workspaceId: string; userId: string } };
          update: { role: WorkspaceRole; assignedBy?: string };
          create: {
            workspaceId: string;
            userId: string;
            role: WorkspaceRole;
            assignedBy?: string;
          };
        }) => Promise<unknown>;
      };
    }).workspaceMember;
  }

  listPermissions(): Permission[] {
    return Object.values(Permission);
  }

  listRoles() {
    return ROLE_ORDER.map((role) => ({
      role,
      permissions: ROLE_PERMISSIONS[role],
    }));
  }

  permissionsForRole(role: WorkspaceRole): Permission[] {
    return ROLE_PERMISSIONS[role] ?? [];
  }

  async getUserRole(scope: UserScope): Promise<WorkspaceRole> {
    const member = await this.workspaceMemberDelegate().findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: scope.workspaceId,
          userId: scope.userId,
        },
      },
      select: { role: true },
    });

    if (member?.role && isWorkspaceRole(member.role)) {
      return member.role;
    }

    // Fallback for existing tenants that have not assigned membership yet.
    return WorkspaceRole.VIEWER;
  }

  async getUserPermissions(scope: UserScope): Promise<Permission[]> {
    const role = await this.getUserRole(scope);
    return this.permissionsForRole(role);
  }

  async hasPermission(scope: UserScope, permission: Permission): Promise<boolean> {
    const permissions = await this.getUserPermissions(scope);
    return permissions.includes(permission);
  }

  async checkPermissions(scope: UserScope, permissions: Permission[]): Promise<boolean> {
    if (permissions.length === 0) {
      return true;
    }
    const userPermissions = await this.getUserPermissions(scope);
    return permissions.every((permission) => userPermissions.includes(permission));
  }

  async assertPermissions(scope: UserScope, permissions: Permission[]): Promise<void> {
    const hasAll = await this.checkPermissions(scope, permissions);
    if (!hasAll) {
      throw new ForbiddenException('Insufficient permissions for this action');
    }
  }

  async assignRole(input: {
    workspaceId: string;
    targetUserId: string;
    role: WorkspaceRole;
    assignedBy?: string;
  }) {
    return this.workspaceMemberDelegate().upsert({
      where: {
        workspaceId_userId: {
          workspaceId: input.workspaceId,
          userId: input.targetUserId,
        },
      },
      update: {
        role: input.role,
        assignedBy: input.assignedBy,
      },
      create: {
        workspaceId: input.workspaceId,
        userId: input.targetUserId,
        role: input.role,
        assignedBy: input.assignedBy,
      },
    });
  }

  suggestRolesForPermission(permission: Permission): WorkspaceRole[] {
    return ROLE_ORDER.filter((role) => ROLE_PERMISSIONS[role].includes(permission));
  }
}
