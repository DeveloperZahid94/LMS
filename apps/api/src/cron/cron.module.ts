import { Module } from '@nestjs/common';
import { CronController } from './cron.controller';
import { DueAlertsJob } from './due-alerts.job';
import { DueRemindersJob } from './due-reminders.job';
import { AutoBackupJob } from './auto-backup.job';

@Module({
  controllers: [CronController],
  providers: [DueAlertsJob, DueRemindersJob, AutoBackupJob],
})
export class CronModule {}
