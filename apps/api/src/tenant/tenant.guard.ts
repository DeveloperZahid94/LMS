import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { JwtPayload, UserRole } from '@lms/shared';

/**
 * Ensures any authenticated request has either a tenantId on the JWT,
 * or is a SuperAdmin (who may operate cross-tenant). Public endpoints skip.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user as JwtPayload | undefined;
    if (!user) return false;
    if (user.role === UserRole.SUPER_ADMIN) return true;
    return Boolean(user.tenantId);
  }
}
