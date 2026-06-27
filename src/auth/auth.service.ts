import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { execSync } from 'node:child_process';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(data: {
    email: string;
    password: string;
    name: string;
    roleId?: string;
    workspaceId?: string;
    tenantId?: string;
  }) {
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

    return this.signToken(user.id, user.email, user.workspaceId, user.tenantId);
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.signToken(user.id, user.email, user.workspaceId, user.tenantId);
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: true } } },
    });
  }

  async revokeUserSessions(userId: string) {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count };
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
        execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
        execSync('npx prisma migrate deploy', { stdio: 'inherit' });
        return this.resolveDefaults(input, false);
      }
      throw error;
    }
  }

  private signToken(userId: string, email: string, workspaceId: string, tenantId: string) {
    return this.jwt.sign({ sub: userId, email, workspaceId, tenantId });
  }
}
