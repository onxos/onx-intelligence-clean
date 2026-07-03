import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from './permissions.enum';
import { RbacService } from './rbac.service';

export const RBAC_PERMISSIONS_KEY = 'rbac:permissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(RBAC_PERMISSIONS_KEY, permissions);

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions =
      this.reflector.getAllAndOverride<Permission[]>(RBAC_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<{
      user?: { userId?: string; workspaceId?: string };
    }>();

    const userId = req.user?.userId;
    const workspaceId = req.user?.workspaceId;

    if (!userId || !workspaceId) {
      throw new UnauthorizedException('Missing authenticated user context');
    }

    return this.rbac.checkPermissions({ userId, workspaceId }, requiredPermissions);
  }
}
