import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { RAZORPAY_SERVICE, RazorpayService } from '../integrations/razorpay.service';
import { WHATSAPP_SERVICE, WhatsAppService } from '../integrations/whatsapp.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { SeatAssignmentsService } from '../seat-assignments/seat-assignments.service';
import { CreatePaymentDto, RazorpayCreateOrderDto, RazorpayVerifyDto } from './dto/payment.dto';
import { FeatureKey, PaymentStatus, PaymentMethod } from '@lms/shared';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private tenantCtx: TenantContextService,
    private audit: AuditService,
    private featureFlags: FeatureFlagsService,
    private seatAssignments: SeatAssignmentsService,
    @Inject(RAZORPAY_SERVICE) private razorpay: RazorpayService,
    @Inject(WHATSAPP_SERVICE) private whatsapp: WhatsAppService,
  ) {}

  list(
    branchId?: string,
    status?: PaymentStatus,
    opts: { dateFrom?: string; dateTo?: string; limit?: number } = {},
  ) {
    const tenantId = this.tenantCtx.tenantId;
    const where: any = { tenantId };
    if (branchId) where.branchId = branchId;
    if (status) where.status = status;
    if (opts.dateFrom || opts.dateTo) {
      // Filter on the effective payment date — paidAt when present, else createdAt.
      // Prisma can't express that in a single column, so we OR the two ranges.
      const range: any = {};
      if (opts.dateFrom) range.gte = new Date(opts.dateFrom);
      if (opts.dateTo) {
        const to = new Date(opts.dateTo);
        to.setHours(23, 59, 59, 999);
        range.lte = to;
      }
      where.OR = [
        { paidAt: range },
        { paidAt: null, createdAt: range },
      ];
    }
    return this.prisma.payment.findMany({
      where,
      include: {
        student: { select: { id: true, code: true, fullName: true, phone: true, email: true } },
        branch:  { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(opts.limit ?? 200, 5000),
    });
  }

  async recordManual(dto: CreatePaymentDto) {
    const tenantId = this.tenantCtx.tenantId;
    await this.assertStudentInTenant(dto.studentId, tenantId);

    const payment = await this.prisma.payment.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        studentId: dto.studentId,
        enrollmentId: dto.enrollmentId ?? null,
        amount: dto.amount,
        method: dto.method,
        status: PaymentStatus.PAID,
        paidAt: new Date(),
        notes: dto.notes ?? null,
      },
    });

    if (dto.nextDueDate) {
      await this.prisma.seatAssignment.updateMany({
        where: {
          tenantId,
          studentId: dto.studentId,
          status: { in: ['TEMPORARY', 'CONFIRMED'] },
        },
        data: { nextDueDate: new Date(dto.nextDueDate) },
      });
    }

    await this.notifyReceipt(payment.id);
    await this.seatAssignments.maybePromoteAfterPayment(tenantId, dto.studentId);
    await this.audit.record({
      tenantId,
      userId: this.tenantCtx.userId,
      action: 'CREATE_PAYMENT',
      entity: 'payments',
      entityId: payment.id,
      diff: { after: payment },
    });
    return payment;
  }

  async createRazorpayOrder(dto: RazorpayCreateOrderDto) {
    const tenantId = this.tenantCtx.tenantId;
    const enabled = await this.featureFlags.isEnabled(tenantId, FeatureKey.PAYMENT_GATEWAY);
    if (!enabled) throw new BadRequestException('Payment gateway is disabled for this tenant');

    await this.assertStudentInTenant(dto.studentId, tenantId);

    // Pre-create a PENDING payment row to anchor the Razorpay order to.
    const pending = await this.prisma.payment.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        studentId: dto.studentId,
        enrollmentId: dto.enrollmentId ?? null,
        amount: dto.amount,
        method: PaymentMethod.RAZORPAY,
        status: PaymentStatus.PENDING,
      },
    });

    const order = await this.razorpay.createOrder(dto.amount * 100, 'INR', pending.id);
    await this.prisma.payment.update({
      where: { id: pending.id },
      data: { razorpayOrderId: order.orderId },
    });
    return { paymentId: pending.id, ...order };
  }

  async verifyRazorpay(dto: RazorpayVerifyDto) {
    const tenantId = this.tenantCtx.tenantId;
    const payment = await this.prisma.payment.findFirst({
      where: { id: dto.paymentId, tenantId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.razorpayOrderId !== dto.razorpayOrderId) {
      throw new BadRequestException('Order mismatch');
    }
    const ok = this.razorpay.verifySignature(
      dto.razorpayOrderId, dto.razorpayPaymentId, dto.razorpaySignature,
    );
    if (!ok) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      throw new BadRequestException('Invalid signature');
    }
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.PAID,
        razorpayPaymentId: dto.razorpayPaymentId,
        razorpaySignature: dto.razorpaySignature,
        paidAt: new Date(),
      },
    });
    await this.notifyReceipt(updated.id);
    await this.seatAssignments.maybePromoteAfterPayment(tenantId, updated.studentId);
    return updated;
  }

  private async assertStudentInTenant(studentId: string, tenantId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
    });
    if (!student) throw new BadRequestException('Student not found in this tenant');
  }

  private async notifyReceipt(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { student: true },
    });
    if (!payment) return;
    const waEnabled = await this.featureFlags.isEnabled(payment.tenantId, FeatureKey.WHATSAPP);
    if (!waEnabled) return;
    await this.whatsapp.send({
      to: payment.student.phone,
      body: `Hi ${payment.student.fullName}, we received your payment of ₹${payment.amount}. Thank you!`,
    });
  }
}
