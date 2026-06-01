import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from './feature-flag.decorator';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureKey, UserRole, JwtPayload } from '@lms/shared';

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private featureFlags: FeatureFlagsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<FeatureKey>(FEATURE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const user = ctx.switchToHttp().getRequest().user as JwtPayload | undefined;
    if (!user) throw new ForbiddenException('Authentication required');
    if (user.role === UserRole.SUPER_ADMIN) return true;
    if (!user.tenantId) throw new ForbiddenException('Tenant context missing');

    const enabled = await this.featureFlags.isEnabled(user.tenantId, required);
    if (!enabled) throw new ForbiddenException(`Feature disabled: ${required}`);
    return true;
  }
}
