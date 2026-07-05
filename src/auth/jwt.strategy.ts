import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';

function resolveJwtSecret(config: ConfigService) {
  const configuredSecret = config.get<string>('JWT_SECRET');
  if (configuredSecret) {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }

  return 'default-secret';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: resolveJwtSecret(config),
    });
  }

  async validate(payload: any) {
    const userId = payload.sub;
    const workspaceId = payload.workspaceId;

    let role: string | undefined;
    if (userId && workspaceId && this.prisma.isConnected()) {
      const membership = await this.prisma.workspaceMember.findFirst({
        where: { userId, workspaceId },
      });
      role = membership?.role;
    }

    return {
      userId,
      email: payload.email,
      workspaceId,
      tenantId: payload.tenantId,
      role,
    };
  }
}
