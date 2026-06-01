import { Body, Controller, Get, Header, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
@Roles(UserRole.CLIENT_ADMIN)
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  get() { return this.service.get(); }

  @Put()
  update(@Body() patch: any) { return this.service.update(patch); }

  @Post('biometric/test')
  testBiometric(@Body() dto: { ipAddress: string; port: number; password?: string; mockMode?: boolean }) {
    return this.service.testBiometric(dto.ipAddress, dto.port ?? 4370, dto.password ?? '', dto.mockMode ?? true);
  }

  @Get('backup')
  @Header('Content-Type', 'application/json')
  @Header('Content-Disposition', 'attachment; filename="lms-backup.json"')
  async backup() {
    return this.service.backupBundle();
  }
}
