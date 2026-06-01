import { Controller, ForbiddenException, Get, Headers } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DueAlertsJob } from './due-alerts.job';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Vercel cron triggers these endpoints over HTTP and includes a header
 * `Authorization: Bearer <CRON_SECRET>` (set in vercel.json + dashboard).
 * Endpoints are @Public (no JWT) but require the secret to execute.
 */
@ApiTags('cron')
@Controller('cron')
@Public()
export class CronController {
  constructor(private dueAlerts: DueAlertsJob) {}

  @Get('due-alerts')
  async runDueAlerts(@Headers('authorization') auth?: string) {
    this.assertCron(auth);
    return this.dueAlerts.run();
  }

  @Get('attendance-rollover')
  attendanceRollover(@Headers('authorization') auth?: string) {
    this.assertCron(auth);
    // Placeholder: close out yesterday's still-open attendance, etc.
    return { ok: true };
  }

  private assertCron(auth?: string) {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      // In dev, allow unguarded so you can hit /api/cron/* in a browser.
      if (process.env.NODE_ENV !== 'production') return;
      throw new ForbiddenException('CRON_SECRET not configured');
    }
    if (auth !== `Bearer ${expected}`) throw new ForbiddenException('Invalid cron auth');
  }
}
