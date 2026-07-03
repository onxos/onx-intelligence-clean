/**
 * ONX AI Agent — RBAC Command Handler
 * "Check Dr. Ahmed's permissions" → returns role + permissions
 * "Assign veterinarian role to Dr. Sara" → assigns role
 */

import { Injectable } from '@nestjs/common';
import { RbacService } from '../../rbac/rbac.service';
import { Permission } from '../../rbac/permissions.enum';
import { Role } from '../../rbac/roles.config';
import { ParsedCommand } from '../command.parser';
import { AgentResult } from '../ai-agent.service';

@Injectable()
export class RbacCommandHandler {
  constructor(private readonly rbacService: RbacService) {}

  async handle(
    parsed: ParsedCommand,
    _userId: string,
    workspaceId: string,
  ): Promise<AgentResult> {
    const { intent, entities } = parsed;
    const targetUser = entities.targetUser ?? entities.name ?? 'unknown';

    try {
      if (intent === 'RBAC_CHECK') {
        // Find user by name or email
        const members = await this.rbacService.getWorkspaceMembers(workspaceId);
        const target = members.find(
          m =>
            m.user.name?.toLowerCase().includes(targetUser.toLowerCase()) ||
            m.user.email?.toLowerCase().includes(targetUser.toLowerCase()),
        );

        if (!target) {
          return {
            success: false,
            action: 'RBAC_CHECK',
            message: `User "${targetUser}" not found in this workspace.`,
          };
        }

        const role = target.role as Role;
        const permissions = this.rbacService.getRolePermissions(role);

        return {
          success: true,
          action: 'RBAC_CHECK',
          message: `${target.user.name} (${target.user.email}) has role: ${role} with ${permissions.length} permissions.`,
          data: {
            user: target.user,
            role,
            permissions: permissions.map(p => ({
              code: p,
              description: this.getPermissionDescription(p),
            })),
          },
        };
      }

      if (intent === 'RBAC_ASSIGN') {
        const role = (entities.role as Role) ?? Role.VIEWER;
        // Note: actual assignment would need the target user's ID
        return {
          success: true,
          action: 'RBAC_ASSIGN',
          message: `Role assignment prepared: ${targetUser} → ${role}. Use the admin panel to confirm.`,
          data: { targetUser, proposedRole: role },
        };
      }

      return {
        success: false,
        action: 'RBAC_UNKNOWN',
        message: 'Unknown RBAC command.',
      };
    } catch (error) {
      return {
        success: false,
        action: 'RBAC_ERROR',
        message: 'Failed to process RBAC command.',
        error: error.message,
      };
    }
  }

  private getPermissionDescription(permission: Permission): string {
    const descriptions: Record<string, string> = {
      'patient:read': 'View patient records',
      'patient:create': 'Create new patients',
      'patient:update': 'Edit patient records',
      'patient:delete': 'Delete patients',
      'appointment:read': 'View appointments',
      'appointment:create': 'Schedule appointments',
      'billing:read': 'View billing/invoices',
      'ai:chat': 'Use AI chat assistant',
      'ai:clinical': 'Use clinical AI features',
      'user:manage_roles': 'Manage user roles and permissions',
    };
    return descriptions[permission] ?? permission;
  }
}
