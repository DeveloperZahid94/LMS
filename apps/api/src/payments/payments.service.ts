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

  async list(opts: {
    branchId?: string;
    status?: PaymentStatus;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    sortBy?: 'date' | 'amount' | 'student';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  } = {}) {
    const tenantId = this.tenantCtx.tenantId;
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(Number(opts.limit) || 25, 5000);
    const order: 'asc' | 'desc' = opts.sortOrder === 'asc' ? 'asc' : 'desc';

    const and: any[] = [{ tenantId }, { deletedAt: null }];
    if (opts.branchId) and.push({ branchId: opts.branchId });
    if (opts.status) and.push({ status: opts.status });
    if (opts.dateFrom || opts.dateTo) {
      // Effective payment date = paidAt when present, else createdAt.
      const range: any = {};
      if (opts.dateFrom) range.gte = new Date(opts.dateFrom);
      if (opts.dateTo) {
        const to = new Date(opts.dateTo);
        to.setHours(23, 59, 59, 999);
        range.lte = to;
      }
      and.push({ OR: [{ paidAt: range }, { paidAt: null, createdAt: range }] });
    }
    if (opts.search?.trim()) {
      const s = opts.search.trim();
      and.push({
        student: {
          OR: [
            { fullName: { contains: s, mode: 'insensitive' } },
            { code: { contains: s, mode: 'insensitive' } },
            { phone: { contains: s, mode: 'insensitive' } },
          ],
        },
      });
    }
    const where = { AND: and };

    const orderBy =
      opts.sortBy === 'amount' ? { amount: order } :
      opts.sortBy === 'student' ? { student: { fullName: order } } :
      { createdAt: order };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: {
          student: { select: { id: true, code: true, fullName: true, phone: true, email: true } },
          branch:  { select: { id: true, name: true, code: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    // Hydrate each row with the student's monthly fee + cycle balance (fee − this payment).
    const studentIds = [...new Set(data.map((p) => p.studentId))];
    const monthlyByStudent = new Map<string, number>();
    if (studentIds.length) {
      const [seats, pgs] = await Promise.all([
        this.prisma.seatAssignment.findMany({
          where: { tenantId, studentId: { in: studentIds }, status: { in: ['TEMPORARY', 'CONFIRMED'] } },
          select: { studentId: true, monthlyRate: true },
        }),
        this.prisma.pgRoomAssignment.findMany({
          where: { tenantId, studentId: { in: studentIds }, status: 'ACTIVE' },
          select: { studentId: true, monthlyRate: true },
        }),
      ]);
      for (const a of [...seats, ...pgs]) {
        const prev = monthlyByStudent.get(a.studentId) ?? 0;
        monthlyByStudent.set(a.studentId, prev + (a.monthlyRate ? Number(a.monthlyRate) : 0));
      }
    }
    const hydrated = data.map((p) => {
      const monthlyFee = monthlyByStudent.get(p.studentId) ?? 0;
      return { ...p, monthlyFee, balance: Math.max(0, monthlyFee - Number(p.amount)) };
    });
    return { data: hydrated, total, page, limit };
  }

  /**
   * Per-student payment summary for the detail view: full history, total paid,
   * the student's active allocations (seat + PG) and their combined monthly fee
   * so the UI can show balance and whether a payment was full or partial.
   */
  async studentSummary(studentId: string) {
    const tenantId = this.tenantCtx.tenantId;
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true, code: true, fullName: true, phone: true },
    });
    if (!student) throw new NotFoundException('Student not found in this tenant');

    const payments = await this.prisma.payment.findMany({
      where: { tenantId, studentId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, amount: true, method: true, status: true, paidAt: true, createdAt: true, notes: true },
    });
    const totalPaid = payments
      .filter((p) => p.status === PaymentStatus.PAID)
      .reduce((s, p) => s + Number(p.amount), 0);

    const [seats, pgs] = await Promise.all([
      this.prisma.seatAssignment.findMany({
        where: { tenantId, studentId, status: { in: ['TEMPORARY', 'CONFIRMED'] } },
        include: { seat: { select: { code: true } } },
      }),
      this.prisma.pgRoomAssignment.findMany({
        where: { tenantId, studentId, status: 'ACTIVE' },
        include: { room: { select: { roomNumber: true } } },
      }),
    ]);

    const allocations = [
      ...seats.map((a) => ({
        type: 'SEAT' as const,
        label: `Seat ${a.seat.code} · ${a.shift}`,
        monthlyRate: a.monthlyRate ? Number(a.monthlyRate) : 0,
        nextDueDate: a.nextDueDate,
      })),
      ...pgs.map((a) => ({
        type: 'PG' as const,
        label: `PG ${a.room.roomNumber} · Bed ${a.bedNumber}`,
        monthlyRate: a.monthlyRate ? Number(a.monthlyRate) : 0,
        nextDueDate: a.nextDueDate,
      })),
    ];
    const monthlyTotal = allocations.reduce((s, a) => s + a.monthlyRate, 0);

    return {
      student,
      payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
      totalPaid,
      monthlyTotal,
      allocations,
    };
  }

  /** Soft-delete a payment with a required reason. Kept for audit; excluded everywhere. */
  async softDelete(id: string, reason?: string) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required to delete a payment');
    const tenantId = this.tenantCtx.tenantId;
    const payment = await this.prisma.payment.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!payment) throw new NotFoundException('Payment not found');
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { deletedAt: new Date(), deletedReason: reason.trim(), deletedById: this.tenantCtx.userId ?? null },
    });
    await this.audit.record({
      tenantId,
      userId: this.tenantCtx.userId,
      action: 'DELETE_PAYMENT',
      entity: 'payments',
      entityId: payment.id,
      diff: { reason: reason.trim(), before: payment },
    });
    // Re-evaluate allocation status — removing this payment may drop the student
    // back below the 50% threshold (CONFIRMED → TEMPORARY).
    await this.seatAssignments.reconcileAfterPaymentChange(tenantId, payment.studentId);
    return { ok: true };
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
      // Return the student/branch so the client's success handler (and the row it
      // shows) has p.student.fullName — without this the modal stays stuck.
      include: {
        student: { select: { id: true, code: true, fullName: true, phone: true, email: true } },
        branch: { select: { id: true, name: true, code: true } },
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
