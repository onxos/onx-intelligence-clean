import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';

type MutationAuditContext = {
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

type SafeUserProfile = {
  id: string;
  email: string;
  name: string;
  status: string;
  roleId: string;
  workspaceId: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
  role: {
    id: string;
    name: string;
    description: string | null;
    permissions: Array<{
      id: string;
      resource: string;
      action: string;
      createdAt: Date;
    }>;
  } | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async register(data: {
    email: string;
    password: string;
    name: string;
    roleId?: string;
    workspaceId?: string;
    tenantId?: string;
  }, auditContext?: MutationAuditContext) {
    try {
      const defaults = await this.resolveDefaults({
        roleId: data.roleId,
        workspaceId: data.workspaceId,
        tenantId: data.tenantId,
      });

      const existing = await this.prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existing) {
        throw new UnauthorizedException('Email already registered');
      }

      const hash = await bcrypt.hash(data.password, 10);
      const user = await this.prisma.user.create({
        data: {
          email: data.email,
          password: hash,
          name: data.name,
          roleId: defaults.roleId,
          workspaceId: defaults.workspaceId,
          tenantId: defaults.tenantId,
        },
      });

      await this.audit.log({
        actorId: user.id,
        action: 'AUTH_REGISTERED',
        resourceType: 'User',
        resourceId: user.id,
        workspaceId: user.workspaceId,
        before: null,
        after: { id: user.id, email: user.email, status: user.status },
        requestId: auditContext?.requestId,
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return this.signToken(user.id, user.email, user.workspaceId, user.tenantId);
    } catch (error: any) {
      await this.audit.log({
        actorId: `anonymous:${data.email}`,
        action: 'AUTH_REGISTERED',
        resourceType: 'User',
        workspaceId: data.workspaceId,
        before: null,
        after: null,
        requestId: auditContext?.requestId,
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
        status: 'FAILED',
        success: false,
        metadata: { error: String(error?.message || error), email: data.email },
      });
      throw error;
    }
  }

  async login(email: string, password: string, auditContext?: MutationAuditContext) {
    let user: any = null;
    try {
      user = await this.prisma.user.findUnique({ where: { email } });
      if (!user) throw new UnauthorizedException('Invalid credentials');

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) throw new UnauthorizedException('Invalid credentials');

      await this.audit.log({
        actorId: user.id,
        action: 'AUTH_LOGGED_IN',
        resourceType: 'User',
        resourceId: user.id,
        workspaceId: user.workspaceId,
        before: null,
        after: { id: user.id, email: user.email },
        requestId: auditContext?.requestId,
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return this.signToken(user.id, user.email, user.workspaceId, user.tenantId);
    } catch (error: any) {
      await this.audit.log({
        actorId: user?.id ?? `anonymous:${email}`,
        action: 'AUTH_LOGGED_IN',
        resourceType: 'User',
        resourceId: user?.id,
        workspaceId: user?.workspaceId,
        before: null,
        after: null,
        requestId: auditContext?.requestId,
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
        status: 'FAILED',
        success: false,
        metadata: { error: String(error?.message || error), email },
      });
      throw error;
    }
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        roleId: true,
        workspaceId: true,
        tenantId: true,
        createdAt: true,
        updatedAt: true,
        role: {
          select: {
            id: true,
            name: true,
            description: true,
            permissions: {
              select: {
                id: true,
                resource: true,
                action: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    return user as SafeUserProfile | null;
  }

  async revokeUserSessions(
    userId: string,
    workspaceId?: string,
    auditContext?: MutationAuditContext,
  ) {
    try {
      const result = await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.audit.log({
        actorId: userId,
        action: 'AUTH_REVOKED',
        resourceType: 'Session',
        resourceId: userId,
        workspaceId,
        before: { revoked: 0 },
        after: { revoked: result.count },
        requestId: auditContext?.requestId,
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
        status: 'SUCCESS',
        success: true,
      });

      return { revoked: result.count };
    } catch (error: any) {
      await this.audit.log({
        actorId: userId,
        action: 'AUTH_REVOKED',
        resourceType: 'Session',
        resourceId: userId,
        workspaceId,
        before: null,
        after: null,
        requestId: auditContext?.requestId,
        ip: auditContext?.ip,
        userAgent: auditContext?.userAgent,
        status: 'FAILED',
        success: false,
        metadata: { error: String(error?.message || error) },
      });
      throw error;
    }
  }

  async getUserDevices(userId: string) {
    return this.prisma.device.findMany({ where: { userId } });
  }

  private async resolveDefaults(
    input: {
      roleId?: string;
      workspaceId?: string;
      tenantId?: string;
    },
    allowRetry = true,
  ) {
    try {
      const role = input.roleId
        ? { id: input.roleId }
        : await this.prisma.role.upsert({
            where: { name: 'USER' },
            update: {},
            create: {
              name: 'USER',
              description: 'Default user role',
            },
            select: { id: true },
          });

      const workspace = input.workspaceId
        ? { id: input.workspaceId }
        : await this.prisma.workspace.findFirst({ select: { id: true } }).then((found) => {
            if (found) {
              return found;
            }
            return this.prisma.workspace.create({
              data: {
                name: 'ONX Intelligence Workspace',
                description: 'Default production workspace',
              },
              select: { id: true },
            });
          });

      const tenant = input.tenantId
        ? { id: input.tenantId }
        : await this.prisma.tenant.findFirst({ select: { id: true } }).then((found) => {
            if (found) {
              return found;
            }
            return this.prisma.tenant.create({
              data: {
                name: 'ONX Intelligence Tenant',
              },
              select: { id: true },
            });
          });

      return {
        roleId: role.id,
        workspaceId: workspace.id,
        tenantId: tenant.id,
      };
    } catch (error: any) {
      const message = String(error?.message ?? '');
      if (allowRetry && message.includes('does not exist in the current database')) {
        await this.bootstrapLegacyAuthSchema();
        return this.resolveDefaults(input, false);
      }
      throw error;
    }
  }

  private async bootstrapLegacyAuthSchema() {
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.prisma.$executeRawUnsafe(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS workspace_id TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    `);
  }

  private signToken(userId: string, email: string, workspaceId: string, tenantId: string) {
    return this.jwt.sign({ sub: userId, email, workspaceId, tenantId });
  }
}
