import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditAdminService, AuditQuery } from './audit-admin.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

@ApiTags('admin/audit-logs')
@ApiBearerAuth()
@Controller('admin/audit-logs')
@Roles(UserRole.SUPER_ADMIN)
export class AuditAdminController {
  constructor(private readonly service: AuditAdminService) {}

  @Get()
  list(@Query() query: AuditQuery) {
    return this.service.list(query);
  }
}
