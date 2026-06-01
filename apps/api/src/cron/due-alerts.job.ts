import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { WHATSAPP_SERVICE, WhatsAppService } from '../integrations/whatsapp.service';
import { FeatureKey } from '@lms/shared';

@Injectable()
export class DueAlertsJob {
  private readonly logger = new Logger(DueAlertsJob.name);

  constructor(
    private prisma: PrismaService,
    private featureFlags: FeatureFlagsService,
    @Inject(WHATSAPP_SERVICE) private whatsapp: WhatsAppService,
  ) {}

  /** Notifies students whose plan ends within the next 3 days. */
  async run() {
    const horizon = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    const enrollments = await this.prisma.studentPlanEnrollment.findMany({
      where: { status: 'ACTIVE', endDate: { lte: horizon } },
      include: { student: true, plan: true },
    });

    let sent = 0;
    for (const enr of enrollments) {
      const waEnabled = await this.featureFlags.isEnabled(enr.tenantId, FeatureKey.WHATSAPP);
      if (!waEnabled) continue;
      await this.whatsapp.send({
        to: enr.student.phone,
        body: `Hi ${enr.student.fullName}, your ${enr.plan.name} plan ends on ${enr.endDate.toDateString()}. Please renew to avoid interruption.`,
      });
      await this.prisma.notification.create({
        data: {
          tenantId: enr.tenantId,
          type: 'PLAN_EXPIRY',
          channel: 'WHATSAPP',
          recipient: enr.student.phone,
          body: `Plan expiry reminder for enrollment ${enr.id}`,
          status: 'SENT',
          sentAt: new Date(),
        },
      });
      sent++;
    }
    this.logger.log(`Due alerts cron: ${sent} reminders sent (${enrollments.length} candidates)`);
    return { candidates: enrollments.length, sent };
  }
}
