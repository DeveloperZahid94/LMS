import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SqlBackupService } from '../backup/sql-backup.service';
import { EmailService } from '../email/email.service';

/**
 * Daily cron: for every tenant that has automatic backups enabled, generate a
 * restorable .sql dump of their data and email it to them as an attachment.
 * Weekly schedules only fire on Mondays. Per-tenant failures never abort the run.
 */
@Injectable()
export class AutoBackupJob {
  private readonly logger = new Logger(AutoBackupJob.name);

  constructor(
    private prisma: PrismaService,
    private backup: SqlBackupService,
    private email: EmailService,
  ) {}

  async run() {
    const settings = await this.prisma.$queryRaw<Array<{ tenantId: string; data: any }>>`
      SELECT "tenantId", data FROM tenant_settings
    `;
    const isMonday = new Date().getDay() === 1;

    let sent = 0;
    let skipped = 0;
    const errors: Array<{ tenantId: string; error: string }> = [];

    for (const row of settings) {
      const backupCfg = row?.data?.backup ?? {};
      if (!backupCfg.autoEnabled) { skipped++; continue; }
      if (backupCfg.frequency === 'weekly' && !isMonday) { skipped++; continue; }

      try {
        const tenant = await this.prisma.tenant.findUnique({ where: { id: row.tenantId } });
        if (!tenant?.email) { skipped++; continue; }

        const sql = await this.backup.dumpTenant(row.tenantId);
        const stamp = new Date().toISOString().slice(0, 10);
        const res = await this.email.send({
          tenantId: row.tenantId,
          to: tenant.email,
          subject: `${tenant.name} — data backup (${stamp})`,
          html: `<p>Hi,</p><p>Attached is your automatic LMS data backup for <strong>${tenant.name}</strong>, generated on ${stamp}.</p>
                 <p>It's a restorable SQL file. Keep it somewhere safe. To restore, load it into a database that already has the LMS schema:</p>
                 <pre>psql "&lt;your-database-url&gt;" -f lms-backup-${stamp}.sql</pre>
                 <p>— LMS Platform</p>`,
          attachments: [{
            filename: `lms-backup-${stamp}.sql`,
            content: Buffer.from(sql, 'utf-8').toString('base64'),
            contentType: 'application/sql',
          }],
        });
        if (res.ok) sent++;
        else { skipped++; errors.push({ tenantId: row.tenantId, error: res.error ?? 'email not sent' }); }
      } catch (err) {
        errors.push({ tenantId: row.tenantId, error: (err as Error).message });
      }
    }

    this.logger.log(`Auto-backup: sent=${sent} skipped=${skipped} errors=${errors.length}`);
    return { ok: true, sent, skipped, errors };
  }
}
