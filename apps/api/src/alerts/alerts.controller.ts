import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

@ApiTags('alerts')
@ApiBearerAuth()
@Controller('alerts')
@Roles(UserRole.STAFF)
export class AlertsController {
  constructor(private readonly service: AlertsService) {}

  @Get()
  list(
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.list({ branchId, search, dateFrom, dateTo });
  }
}
