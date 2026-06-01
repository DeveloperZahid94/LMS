import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { FeatureFlagsService } from './feature-flags.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { UserRole, FeatureKey, JwtPayload } from '@lms/shared';

class ToggleFeatureDto {
  @IsBoolean()
  enabled!: boolean;
}

@ApiTags('feature-flags')
@ApiBearerAuth()
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(
    private readonly service: FeatureFlagsService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  // Current tenant's flags — any authenticated user can read their own tenant's flags.
  @Get('me')
  myFlags(@CurrentUser() user: JwtPayload) {
    if (!user.tenantId) return [];
    return this.service.listForTenant(user.tenantId);
  }

  // SuperAdmin-only: list / mutate flags for any tenant.
  @Roles(UserRole.SUPER_ADMIN)
  @Get('tenants/:tenantId')
  listForTenant(@Param('tenantId') tenantId: string) {
    return this.service.listForTenant(tenantId);
  }

  @Roles(UserRole.SUPER_ADMIN)
  @Put('tenants/:tenantId/:key')
  toggle(
    @Param('tenantId') tenantId: string,
    @Param('key') key: FeatureKey,
    @Body() body: ToggleFeatureDto,
  ) {
    return this.service.setForTenant(tenantId, key, body.enabled);
  }
}
