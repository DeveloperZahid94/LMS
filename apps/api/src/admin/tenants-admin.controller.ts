import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import {
  CreateTenantDto,
  EmailConfigDto,
  ResetPasswordDto,
  SetUserActiveDto,
  TestEmailDto,
  TenantsAdminService,
} from './tenants-admin.service';
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

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.service.create(dto);
  }

  @Put(':id/status')
  setStatus(@Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.service.setStatus(id, dto.status);
  }

  @Post(':id/users/:userId/reset-password')
  resetPassword(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.service.resetUserPassword(id, userId, dto.newPassword);
  }

  @Put(':id/users/:userId/active')
  setUserActive(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: SetUserActiveDto,
  ) {
    return this.service.setUserActive(id, userId, dto.isActive);
  }

  // ----- Email integration -----
  @Get(':id/email-config')
  getEmailConfig(@Param('id') id: string) {
    return this.service.getEmailConfig(id);
  }

  @Put(':id/email-config')
  saveEmailConfig(@Param('id') id: string, @Body() dto: EmailConfigDto) {
    return this.service.saveEmailConfig(id, dto);
  }

  @Post(':id/email-config/test')
  testEmail(@Param('id') id: string, @Body() dto: TestEmailDto) {
    return this.service.sendTestEmail(id, dto.to);
  }
}
