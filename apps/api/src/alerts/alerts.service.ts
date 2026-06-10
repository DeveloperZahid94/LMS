import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { EmailService } from '../email/email.service';
import { WHATSAPP_SERVICE, WhatsAppService } from '../integrations/whatsapp.service';
import { SMS_SERVICE, SmsService } from '../integrations/sms.service';

const DUE_SOON_DAYS = 7;
const EXPIRING_SOON_DAYS = 7;

export type NotifyChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';
export interface NotifyRecipient { studentId: string; message: string; subject?: string }

@Injectable()
export class AlertsService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
    private email: EmailService,
    @Inject(WHATSAPP_SERVICE) private whatsapp: WhatsAppService,
    @Inject(SMS_SERVICE) private sms: SmsService,
  ) {}

  /**
   * Send a reminder to one or many students over the chosen channel.
   * Contact details (email / phone) are read server-side from the student
   * record — the client only sends the studentId + message text. Returns a
   * per-channel summary so the UI can report how many actually went out.
   */
  async notify(dto: { channel: NotifyChannel; recipients: NotifyRecipient[] }) {
    const tenantId = this.tenantCtx.tenantId;
    const channel = dto.channel;
    const recipients = dto.recipients ?? [];
    if (!recipients.length) throw new BadRequestException('No recipients to notify');
    if (!['EMAIL', 'SMS', 'WHATSAPP'].includes(channel)) throw new BadRequestException('Invalid channel');

    const ids = [...new Set(recipients.map((r) => r.studentId))];
    const students = await this.prisma.student.findMany({
      where: { id: { in: ids }, tenantId },
      select: { id: true, fullName: true, phone: true, email: true },
    });
    const byId = new Map(students.map((s) => [s.id, s]));

    // MSG91 credentials live in the tenant's SMS settings (Settings → SMS).
    let smsCfg: { apiKey?: string; senderId?: string } = {};
    if (channel === 'SMS') {
      const rows = await this.prisma.$queryRaw<Array<{ sms: any }>>`
        SELECT data->'sms' AS sms FROM tenant_settings WHERE "tenantId" = ${tenantId} LIMIT 1
      `;
      smsCfg = rows[0]?.sms ?? {};
    }

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const r of recipients) {
      const stu = byId.get(r.studentId);
      if (!stu) { failed++; continue; }
      const body = (r.message ?? '').trim();
      if (!body) { failed++; continue; }
      try {
        if (channel === 'EMAIL') {
          if (!stu.email) { failed++; errors.push(`${stu.fullName}: no email on file`); continue; }
          const res = await this.email.send({
            tenantId,
            to: stu.email,
            subject: r.subject?.trim() || 'Reminder',
            html: `<p style="font-family:sans-serif;font-size:14px;line-height:1.6;white-space:pre-wrap">${escapeHtml(body)}</p>`,
          });
          if (res.ok) sent++; else { failed++; if (res.error) errors.push(`${stu.fullName}: ${res.error}`); }
        } else if (channel === 'WHATSAPP') {
          if (!stu.phone) { failed++; errors.push(`${stu.fullName}: no phone`); continue; }
          const res = await this.whatsapp.send({ to: stu.phone, body });
          if (res.status === 'failed') { failed++; errors.push(`${stu.fullName}: WhatsApp send failed`); } else sent++;
        } else {
          if (!stu.phone) { failed++; errors.push(`${stu.fullName}: no phone`); continue; }
          const res = await this.sms.send({ to: stu.phone, body, apiKey: smsCfg.apiKey, senderId: smsCfg.senderId });
          if (res.status === 'failed') { failed++; if (res.error) errors.push(`${stu.fullName}: ${res.error}`); } else sent++;
        }
      } catch (e: any) {
        failed++;
        errors.push(`${stu.fullName}: ${e?.message ?? 'send failed'}`);
      }
    }

    return { channel, total: recipients.length, sent, failed, errors: errors.slice(0, 10) };
  }

  /**
   * Returns three buckets of alerts the staff should act on:
   *  - overdue        — active allocations whose nextDueDate is in the past
   *  - dueSoon        — active allocations whose nextDueDate is within 7 days
   *  - expiringSoon   — students whose membership `expiresAt` is within 7 days
   * Each item carries a `summary` text and enough refs for navigation.
   */
  async list(opts: { branchId?: string; search?: string; dateFrom?: string; dateTo?: string } = {}) {
    const tenantId = this.tenantCtx.tenantId;
    const now = new Date();
    const todayStart = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z');

    // Date range overrides default 7-day windows when provided.
    const customFrom = opts.dateFrom ? new Date(opts.dateFrom + 'T00:00:00.000Z') : null;
    const customTo = opts.dateTo ? new Date(opts.dateTo + 'T23:59:59.999Z') : null;

    const defaultDueSoonEnd = new Date(todayStart);
    defaultDueSoonEnd.setUTCDate(defaultDueSoonEnd.getUTCDate() + DUE_SOON_DAYS);
    const defaultExpiringEnd = new Date(todayStart);
    defaultExpiringEnd.setUTCDate(defaultExpiringEnd.getUTCDate() + EXPIRING_SOON_DAYS);

    // Overdue: nextDueDate in the past. If a range is given, intersect.
    const overdueWhere: any = { lt: todayStart };
    if (customFrom) overdueWhere.gte = customFrom;
    if (customTo && customTo < todayStart) overdueWhere.lt = customTo;

    // DueSoon: forward-looking. dateTo overrides 7-day cap; dateFrom overrides today.
    const dueSoonWhere: any = {
      gte: customFrom && customFrom > todayStart ? customFrom : todayStart,
      lt: customTo ?? defaultDueSoonEnd,
    };

    // Expiring: same shape as dueSoon but on student.expiresAt.
    const expiringWhere: any = {
      gte: customFrom && customFrom > todayStart ? customFrom : todayStart,
      lt: customTo ?? defaultExpiringEnd,
    };

    const branchFilter = opts.branchId ? { seat: { branchId: opts.branchId } } : {};

    const [overdueRows, dueSoonRows, expiringRows, balanceRows] = await Promise.all([
      this.prisma.seatAssignment.findMany({
        where: {
          tenantId,
          status: { in: ['TEMPORARY', 'CONFIRMED'] },
          nextDueDate: overdueWhere,
          ...branchFilter,
        },
        include: {
          seat:    { select: { id: true, code: true, type: true, branchId: true } },
          student: { select: { id: true, code: true, fullName: true, phone: true } },
        },
        orderBy: { nextDueDate: 'asc' },
      }),
      this.prisma.seatAssignment.findMany({
        where: {
          tenantId,
          status: { in: ['TEMPORARY', 'CONFIRMED'] },
          nextDueDate: dueSoonWhere,
          ...branchFilter,
        },
        include: {
          seat:    { select: { id: true, code: true, type: true, branchId: true } },
          student: { select: { id: true, code: true, fullName: true, phone: true } },
        },
        orderBy: { nextDueDate: 'asc' },
      }),
      this.prisma.student.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          expiresAt: expiringWhere,
          ...(opts.branchId ? { branchId: opts.branchId } : {}),
        },
        select: {
          id: true, code: true, fullName: true, phone: true, expiresAt: true,
          branchId: true, examTarget: true,
        },
        orderBy: { expiresAt: 'asc' },
      }),
      this.prisma.student.findMany({
        where: {
          tenantId,
          outstandingBalance: { gt: 0 },
          ...(opts.branchId ? { branchId: opts.branchId } : {}),
        },
        select: { id: true, code: true, fullName: true, phone: true, outstandingBalance: true },
        orderBy: { outstandingBalance: 'desc' },
      }),
    ]);

    const overdue = overdueRows.map((a) => {
      const days = Math.floor((todayStart.getTime() - new Date(a.nextDueDate!).getTime()) / 86400000);
      return {
        id: a.id,
        kind: 'OVERDUE' as const,
        student: a.student,
        seat: a.seat,
        shift: a.shift,
        nextDueDate: a.nextDueDate,
        daysPast: days,
        monthlyRate: a.monthlyRate,
        summary: `${a.student.fullName} (${a.student.code}) — payment overdue by ${days} day${days === 1 ? '' : 's'} on seat ${a.seat.code}`,
      };
    });

    const dueSoon = dueSoonRows.map((a) => {
      const days = Math.floor((new Date(a.nextDueDate!).getTime() - todayStart.getTime()) / 86400000);
      return {
        id: a.id,
        kind: 'DUE_SOON' as const,
        student: a.student,
        seat: a.seat,
        shift: a.shift,
        nextDueDate: a.nextDueDate,
        daysUntil: days,
        monthlyRate: a.monthlyRate,
        summary: `${a.student.fullName} (${a.student.code}) — installment due in ${days} day${days === 1 ? '' : 's'} on seat ${a.seat.code}`,
      };
    });

    const expiringSoon = expiringRows.map((s) => {
      const days = Math.floor((new Date(s.expiresAt!).getTime() - todayStart.getTime()) / 86400000);
      return {
        id: s.id,
        kind: 'EXPIRING' as const,
        student: { id: s.id, code: s.code, fullName: s.fullName, phone: s.phone },
        expiresAt: s.expiresAt,
        daysUntil: days,
        summary: `${s.fullName} (${s.code}) — membership expires in ${days} day${days === 1 ? '' : 's'}`,
      };
    });

    const balanceDue = balanceRows.map((s) => {
      const amount = Number((s as any).outstandingBalance ?? 0);
      return {
        id: s.id,
        kind: 'BALANCE' as const,
        student: { id: s.id, code: s.code, fullName: s.fullName, phone: s.phone },
        amount,
        summary: `${s.fullName} (${s.code}) — ₹${amount.toLocaleString('en-IN')} balance due`,
      };
    });

    // Optional text search across summaries.
    const q = opts.search?.trim().toLowerCase();
    const filt = <T extends { summary: string }>(arr: T[]) =>
      !q ? arr : arr.filter((x) => x.summary.toLowerCase().includes(q));

    return {
      overdue:      filt(overdue),
      dueSoon:      filt(dueSoon),
      expiringSoon: filt(expiringSoon),
      balanceDue:   filt(balanceDue),
      counts: {
        overdue: overdue.length,
        dueSoon: dueSoon.length,
        expiringSoon: expiringSoon.length,
        balanceDue: balanceDue.length,
        total: overdue.length + dueSoon.length + expiringSoon.length + balanceDue.length,
      },
    };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
