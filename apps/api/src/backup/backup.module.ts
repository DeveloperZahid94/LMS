import { Global, Module } from '@nestjs/common';
import { SqlBackupService } from './sql-backup.service';
import { BackupAdminController } from './backup-admin.controller';

/**
 * SQL backup generation. Global so SettingsController (tenant dump) and the cron
 * job can inject SqlBackupService; the controller here serves the SuperAdmin
 * full-database dump.
 */
@Global()
@Module({
  controllers: [BackupAdminController],
  providers: [SqlBackupService],
  exports: [SqlBackupService],
})
export class BackupModule {}
