/**
 * ONX RBAC — Service
 * Provides permission checking and role management APIs
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Permission } from './permissions.enum';
import { Role, RolePermissions } from './roles.config';

export interface UserRoleAssignment {
  userId: string;
  role: Role;
  workspaceId: string;
  assignedBy: string;
  permissions?: Permission[];
}

export interface PermissionCheckResult {
  allowed: boolean;
  permission: Permission;
  role: Role;
}

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if a user has a specific permission
   */
  async hasPermission(
    userId: string,
    permission: Permission,
    workspaceId?: string,
  ): Promise<boolean> {
    const assignment = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
    });

    if (!assignment) return false;

    const role = assignment.role as Role;
    const permissions = RolePermissions[role] ?? [];
    return permissions.includes(permission);
  }

  /**
   * Check multiple permissions at once
   */
  async hasPermissions(
    userId: string,
    permissions: Permission[],
    workspaceId?: string,
  ): Promise<PermissionCheckResult[]> {
    const assignment = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
    });

    if (!assignment) {
      return permissions.map(p => ({ allowed: false, permission: p, role: Role.VIEWER }));
    }

    const role = assignment.role as Role;
    const rolePerms = RolePermissions[role] ?? [];

    return permissions.map(p => ({
      allowed: rolePerms.includes(p),
      permission: p,
      role,
    }));
  }

  /**
   * Assign a role to a user in a workspace
   */
  async assignRole(
    userId: string,
    workspaceId: string,
    role: Role,
    assignedBy: string,
  ): Promise<void> {
    await this.prisma.workspaceMember.upsert({
      where: {
        workspaceId_userId: { workspaceId, userId },
      },
      update: { role },
      create: { workspaceId, userId, role, assignedBy },
    });
  }

  /**
   * Get role permissions
   */
  getRolePermissions(role: Role): Permission[] {
    return RolePermissions[role] ?? [];
  }

  /**
   * Get all available roles with their permissions
   */
  getAllRoles(): { role: Role; permissions: Permission[] }[] {
    return Object.values(Role).map(role => ({
      role,
      permissions: RolePermissions[role] ?? [],
    }));
  }

  /**
   * Suggest role based on job function
   */
  suggestRole(jobFunction: string): { role: Role; confidence: number; reason: string }[] {
    const normalized = jobFunction.toLowerCase().trim();

    const suggestions: Record<string, { role: Role; confidence: number; reason: string }[]> = {
      'veterinarian': [{ role: Role.VETERINARIAN, confidence: 0.95, reason: 'Full clinical access with prescription and diagnosis capabilities' }],
      'vet': [{ role: Role.VETERINARIAN, confidence: 0.95, reason: 'Full clinical access with prescription and diagnosis capabilities' }],
      'doctor': [{ role: Role.VETERINARIAN, confidence: 0.90, reason: 'Clinical role with patient and prescription access' }],
      'technician': [{ role: Role.TECHNICIAN, confidence: 0.95, reason: 'Lab and technical operations, limited clinical access' }],
      'tech': [{ role: Role.TECHNICIAN, confidence: 0.90, reason: 'Technical role with lab result access' }],
      'receptionist': [{ role: Role.RECEPTIONIST, confidence: 0.95, reason: 'Front desk with scheduling and billing access' }],
      'reception': [{ role: Role.RECEPTIONIST, confidence: 0.95, reason: 'Front desk with scheduling and billing access' }],
      'admin': [{ role: Role.ADMIN, confidence: 0.95, reason: 'Full administrative access to all system features' }],
      'administrator': [{ role: Role.ADMIN, confidence: 0.95, reason: 'Full administrative access to all system features' }],
      'manager': [{ role: Role.ADMIN, confidence: 0.85, reason: 'Management role suggesting administrative access' }],
      'owner': [{ role: Role.FOUNDER, confidence: 0.95, reason: 'Practice owner with full system access' }],
      'founder': [{ role: Role.FOUNDER, confidence: 0.95, reason: 'Full sovereign access to all features' }],
      'viewer': [{ role: Role.VIEWER, confidence: 0.95, reason: 'Read-only access to basic features' }],
      'assistant': [{ role: Role.RECEPTIONIST, confidence: 0.80, reason: 'Support role with scheduling and patient access' }],
    };

    const direct = suggestions[normalized];
    if (direct) return direct;

    // Partial matching
    for (const [key, value] of Object.entries(suggestions)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return [{ ...value[0], confidence: value[0].confidence * 0.8 }];
      }
    }

    // Default
    return [{ role: Role.VIEWER, confidence: 0.5, reason: 'Unrecognized role, defaulting to viewer access' }];
  }

  /**
   * Get workspace members with roles
   */
  async getWorkspaceMembers(workspaceId: string) {
    return this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
  }

  /**
   * Remove user from workspace
   */
  async removeMember(userId: string, workspaceId: string): Promise<void> {
    await this.prisma.workspaceMember.deleteMany({
      where: { userId, workspaceId },
    });
  }
}
