import { Controller, ForbiddenException, Get, Headers } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DueAlertsJob } from './due-alerts.job';
import { DueRemindersJob } from './due-reminders.job';
import { AutoBackupJob } from './auto-backup.job';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Vercel cron triggers these endpoints over HTTP and includes a header
 * `Authorization: Bearer <CRON_SECRET>` (set in vercel.json + dashboard).
 * Endpoints are @Public (no JWT) but require the secret to execute.
 */
@ApiTags('cron')
@Controller('cron')
@Public()
export class CronController {
  constructor(
    private dueAlerts: DueAlertsJob,
    private dueReminders: DueRemindersJob,
    private autoBackup: AutoBackupJob,
    private prisma: PrismaService,
  ) {}

  /**
   * Public DB health check — pings Postgres with an 8s cap and returns the
   * actual error text. Lets us diagnose connectivity (e.g. on Vercel) without
   * needing function logs. Safe to keep; exposes no data.
   */
  /** Reports the deployed commit so we can confirm WHICH build is live. */
  @Public()
  @Get('version')
  version() {
    return {
      build: 'db-resilient-1',
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
      hasDatabaseUrl: !!process.env.DATABASE_URL,
    };
  }

  @Public()
  @Get('health')
  async health() {
    const started = Date.now();
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error('DB ping timed out after 8s')), 8000)),
      ]);
      return { ok: true, db: 'reachable', ms: Date.now() - started, hasDatabaseUrl: !!process.env.DATABASE_URL };
    } catch (e: any) {
      return { ok: false, db: 'unreachable', ms: Date.now() - started, hasDatabaseUrl: !!process.env.DATABASE_URL, error: e?.message ?? String(e) };
    }
  }

  @Get('due-alerts')
  async runDueAlerts(@Headers('authorization') auth?: string) {
    this.assertCron(auth);
    return this.dueAlerts.run();
  }

  /** Automatic upcoming-payment email reminders (14/7/3/1 days before due). */
  @Get('due-reminders')
  async runDueReminders(@Headers('authorization') auth?: string) {
    this.assertCron(auth);
    return this.dueReminders.run();
  }

  @Get('attendance-rollover')
  attendanceRollover(@Headers('authorization') auth?: string) {
    this.assertCron(auth);
    // Placeholder: close out yesterday's still-open attendance, etc.
    return { ok: true };
  }

  /** Daily: email a restorable .sql backup to every tenant that enabled auto-backup. */
  @Get('auto-backup')
  async runAutoBackup(@Headers('authorization') auth?: string) {
    this.assertCron(auth);
    return this.autoBackup.run();
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
