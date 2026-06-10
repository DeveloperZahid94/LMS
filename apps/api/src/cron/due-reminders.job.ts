import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { SMS_SERVICE, SmsService } from '../integrations/sms.service';

interface ReminderItem {
  tenantId: string;
  assignmentId: string;
  kind: 'SEAT' | 'PG';
  label: string;
  dueDate: Date;
  rate: number | null;
  student: { id: string; fullName: string; email: string | null; phone: string | null };
}

/**
 * Automatic upcoming-payment email reminders.
 *
 * Runs daily (Vercel cron). For every active seat/PG allocation whose next
 * installment falls in {14, 7, 3, 1} days, it emails the student a reminder —
 * once per lead-day bucket (deduped via the Notification table). Emails only go
 * out for tenants whose email provider is configured and students who have an
 * email on file; everything else is skipped quietly.
 */
@Injectable()
export class DueRemindersJob {
  private readonly logger = new Logger(DueRemindersJob.name);

  /** Days before the due date at which to send a reminder. */
  private static readonly LEAD_DAYS = [14, 7, 3, 1];

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    @Inject(SMS_SERVICE) private sms: SmsService,
  ) {}

  async run() {
    const db = this.prisma as any;
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const maxLead = Math.max(...DueRemindersJob.LEAD_DAYS);
    const horizon = new Date(today);
    horizon.setUTCDate(horizon.getUTCDate() + maxLead);

    const [seats, pgs] = await Promise.all([
      this.prisma.seatAssignment.findMany({
        where: { status: { in: ['TEMPORARY', 'CONFIRMED'] }, nextDueDate: { gte: today, lte: horizon } },
        include: { student: { select: { id: true, fullName: true, email: true, phone: true } }, seat: { select: { code: true } } },
      }),
      db.pgRoomAssignment.findMany({
        where: { status: 'ACTIVE', nextDueDate: { gte: today, lte: horizon } },
        include: { student: { select: { id: true, fullName: true, email: true, phone: true } }, room: { select: { roomNumber: true } } },
      }),
    ]);

    const items: ReminderItem[] = [
      ...seats.map((a) => ({
        tenantId: a.tenantId, assignmentId: a.id, kind: 'SEAT' as const,
        label: `seat ${a.seat.code}`, dueDate: a.nextDueDate!, rate: a.monthlyRate ? Number(a.monthlyRate) : null,
        student: a.student,
      })),
      ...pgs.map((a: any) => ({
        tenantId: a.tenantId, assignmentId: a.id, kind: 'PG' as const,
        label: `PG room ${a.room.roomNumber} (bed ${a.bedNumber})`, dueDate: a.nextDueDate, rate: a.monthlyRate ? Number(a.monthlyRate) : null,
        student: a.student,
      })),
    ];

    // Per-tenant MSG91 credentials (Settings → SMS), loaded once.
    const smsCfgByTenant = new Map<string, { apiKey?: string; senderId?: string }>();
    const cfgRows = await this.prisma.$queryRaw<Array<{ tenantId: string; sms: any }>>`
      SELECT "tenantId", data->'sms' AS sms FROM tenant_settings
    `.catch(() => [] as Array<{ tenantId: string; sms: any }>);
    for (const r of cfgRows) smsCfgByTenant.set(r.tenantId, r.sms ?? {});

    let emailSent = 0;
    let smsSent = 0;
    let skipped = 0;
    let candidates = 0;

    for (const it of items) {
      const daysUntil = Math.floor((new Date(it.dueDate).getTime() - today.getTime()) / 86400000);
      if (!DueRemindersJob.LEAD_DAYS.includes(daysUntil)) continue;
      candidates++;

      const dueISO = new Date(it.dueDate).toISOString().slice(0, 10);
      const dueStr = new Date(it.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const rateStr = it.rate ? `₹${it.rate.toLocaleString('en-IN')} ` : '';
      const subject = `Payment reminder — due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;
      const text = `Dear ${it.student.fullName}, your ${rateStr}payment for ${it.label} is due on ${dueStr} (in ${daysUntil} day${daysUntil === 1 ? '' : 's'}). Kindly pay on time to avoid interruption.`;

      // ----- EMAIL -----
      if (it.student.email) {
        const ok = await this.dispatch(it, daysUntil, dueISO, 'EMAIL', it.student.email, async () => {
          const res = await this.email.send({
            tenantId: it.tenantId, to: it.student.email!, subject,
            html: `<p style="font-family:sans-serif;font-size:14px;line-height:1.6">${escapeHtml(text)}</p>`,
          });
          return res.ok;
        }, subject, text);
        if (ok === 'sent') emailSent++; else if (ok === 'failed') skipped++;
      }

      // ----- SMS (MSG91) -----
      const smsCfg = smsCfgByTenant.get(it.tenantId);
      if (it.student.phone && smsCfg?.apiKey && smsCfg?.senderId) {
        const ok = await this.dispatch(it, daysUntil, dueISO, 'SMS', it.student.phone, async () => {
          const res = await this.sms.send({ to: it.student.phone!, body: text, apiKey: smsCfg.apiKey, senderId: smsCfg.senderId });
          return res.status !== 'failed';
        }, subject, text);
        if (ok === 'sent') smsSent++; else if (ok === 'failed') skipped++;
      }
    }

    this.logger.log(`Due reminders: ${emailSent} email, ${smsSent} sms sent; ${skipped} failed/skipped (${candidates} in lead window of ${items.length} upcoming)`);
    return { upcoming: items.length, candidates, emailSent, smsSent, skipped };
  }

  /**
   * Send one reminder on one channel, deduped per (allocation, due-date, lead,
   * channel). Returns 'dup' if already sent, 'sent'/'failed' otherwise.
   */
  private async dispatch(
    it: ReminderItem,
    daysUntil: number,
    dueISO: string,
    channel: 'EMAIL' | 'SMS',
    recipient: string,
    sendFn: () => Promise<boolean>,
    subject: string,
    text: string,
  ): Promise<'sent' | 'failed' | 'dup'> {
    const dedupeKey = `DUE_${channel}:${it.assignmentId}:${dueISO}:${daysUntil}`;
    const existing = await this.prisma.notification.findFirst({
      where: { tenantId: it.tenantId, metadata: { path: ['dedupeKey'], equals: dedupeKey } },
      select: { id: true },
    });
    if (existing) return 'dup';

    let ok = false;
    try { ok = await sendFn(); } catch { ok = false; }

    await this.prisma.notification.create({
      data: {
        tenantId: it.tenantId,
        type: 'DUE_ALERT',
        channel,
        recipient,
        subject,
        body: text,
        status: ok ? 'SENT' : 'FAILED',
        sentAt: ok ? new Date() : null,
        metadata: { dedupeKey, assignmentId: it.assignmentId, kind: it.kind, daysUntil, dueDate: dueISO },
      },
    });
    return ok ? 'sent' : 'failed';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
