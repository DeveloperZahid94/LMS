import { Module } from '@nestjs/common';
import { CronController } from './cron.controller';
import { DueAlertsJob } from './due-alerts.job';

@Module({
  controllers: [CronController],
  providers: [DueAlertsJob],
})
export class CronModule {}
