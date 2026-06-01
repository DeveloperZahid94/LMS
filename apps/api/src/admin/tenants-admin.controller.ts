import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { CreateTenantDto, TenantsAdminService } from './tenants-admin.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

class SetStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED', 'TRIAL', 'CANCELLED'])
  status!: 'ACTIVE' | 'SUSPENDED' | 'TRIAL' | 'CANCELLED';
}

@ApiTags('admin/tenants')
@ApiBearerAuth()
@Controller('admin/tenants')
@Roles(UserRole.SUPER_ADMIN)
export class TenantsAdminController {
  constructor(private readonly service: TenantsAdminService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.service.create(dto);
  }

  @Put(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.service.setStatus(id, dto.status);
  }
}
