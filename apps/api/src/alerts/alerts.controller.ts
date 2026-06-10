import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AlertsService, NotifyChannel, NotifyRecipient } from './alerts.service';
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

  @Post('notify')
  notify(@Body() dto: { channel: NotifyChannel; recipients: NotifyRecipient[] }) {
    return this.service.notify(dto);
  }
}
