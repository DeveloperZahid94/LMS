import { Body, Controller, Get, Header, Post, Put, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { SettingsService } from './settings.service';
import { SqlBackupService } from '../backup/sql-backup.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@lms/shared';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
@Roles(UserRole.CLIENT_ADMIN)
export class SettingsController {
  constructor(
    private readonly service: SettingsService,
    private readonly sqlBackup: SqlBackupService,
    private readonly tenantCtx: TenantContextService,
  ) {}

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

  /** Restorable SQL dump of THIS tenant's data only. */
  @Get('backup.sql')
  async backupSql(@Res() res: Response) {
    const sql = await this.sqlBackup.dumpTenant(this.tenantCtx.tenantId);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lms-backup-${stamp}.sql"`);
    res.send(sql);
  }
}
