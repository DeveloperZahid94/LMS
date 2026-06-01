import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@Roles(UserRole.STAFF)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary')
  summary(@Query('branchId') branchId?: string) {
    return this.service.summary(branchId);
  }
}
