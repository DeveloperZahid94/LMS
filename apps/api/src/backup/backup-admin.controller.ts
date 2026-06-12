import { Controller, Get, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UserRole } from '@lms/shared';
import { SqlBackupService } from './sql-backup.service';
import { Roles } from '../auth/decorators/roles.decorator';

/** SuperAdmin-only full-database SQL backup. */
@ApiTags('admin/backup')
@ApiBearerAuth()
@Controller('admin/backup')
@Roles(UserRole.SUPER_ADMIN)
export class BackupAdminController {
  constructor(private readonly backup: SqlBackupService) {}

  @Get('sql')
  async fullSql(@Res() res: Response) {
    const sql = await this.backup.dumpFull();
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lms-full-backup-${stamp}.sql"`);
    res.send(sql);
  }
}
