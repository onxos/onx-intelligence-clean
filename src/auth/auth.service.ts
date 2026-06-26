import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
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

  private async resolveDefaults(input: {
    roleId?: string;
    workspaceId?: string;
    tenantId?: string;
  }) {
    const [role, workspace, tenant] = await Promise.all([
      input.roleId
        ? Promise.resolve({ id: input.roleId })
        : this.prisma.role.findFirst({
            where: { name: 'USER' },
            select: { id: true },
          }),
      input.workspaceId
        ? Promise.resolve({ id: input.workspaceId })
        : this.prisma.workspace.findFirst({ select: { id: true } }),
      input.tenantId
        ? Promise.resolve({ id: input.tenantId })
        : this.prisma.tenant.findFirst({ select: { id: true } }),
    ]);

    if (!role) throw new UnauthorizedException('No USER role found');
    if (!workspace) throw new UnauthorizedException('No workspace found');
    if (!tenant) throw new UnauthorizedException('No tenant found');

    return {
      roleId: role.id,
      workspaceId: workspace.id,
      tenantId: tenant.id,
    };
  }

  private signToken(
    userId: string,
    email: string,
    workspaceId: string,
    tenantId: string,
  ) {
    return this.jwt.sign({ sub: userId, email, workspaceId, tenantId });
  }
}
